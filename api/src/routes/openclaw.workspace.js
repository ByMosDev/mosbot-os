const logger = require('../utils/logger');
const { recordActivityLogEventSafe } = require('../services/activityLogService');

function registerOpenClawWorkspaceRoutes({
  router,
  requireAuth,
  requireAdmin,
  makeOpenClawRequest,
  normalizeRemapAndValidateWorkspacePath,
  isAllowedWorkspacePath,
  getAssignedProjectRootPaths,
}) {
  const isWithinPath = (targetPath, rootPath) =>
    targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);

  const isAgentPrivateWritablePath = (workspacePath, agentId) =>
    isWithinPath(workspacePath, `/workspace-${agentId}`) || isWithinPath(workspacePath, '/memory');

  const enforceWriteScope = async (req, workspacePath) => {
    const role = req.user?.role;

    // Admin/owner are explicit elevated roles.
    if (role === 'admin' || role === 'owner') {
      return null;
    }

    if (role !== 'agent') {
      return {
        status: 403,
        error: {
          message: 'Admin, owner, or agent role required for workspace writes',
          status: 403,
          code: 'INSUFFICIENT_PERMISSIONS',
        },
      };
    }

    const agentId = String(req.user?.agent_id || '').trim();
    if (!agentId) {
      return {
        status: 403,
        error: {
          message: 'Agent write scope cannot be resolved without agent_id',
          status: 403,
          code: 'AGENT_SCOPE_UNRESOLVED',
        },
      };
    }

    if (isAgentPrivateWritablePath(workspacePath, agentId)) {
      return null;
    }

    const assignedProjectRoots = await getAssignedProjectRootPaths(agentId);
    const inAssignedProject = assignedProjectRoots.some((rootPath) => isWithinPath(workspacePath, rootPath));

    if (inAssignedProject) {
      return null;
    }

    return {
      status: 403,
      error: {
        message:
          'Write blocked by project scope guardrail: path is outside agent-private paths and assigned project roots',
        status: 403,
        code: 'PROJECT_SCOPE_VIOLATION',
        details: {
          agentId,
          path: workspacePath,
          allowedAgentPaths: [`/workspace-${agentId}`, '/memory'],
          assignedProjectRoots,
        },
      },
    };
  };
  router.get('/workspace/files', requireAuth, async (req, res, next) => {
    try {
      const { path: inputPath = '/workspace', recursive = 'false' } = req.query;
      const workspacePath = normalizeRemapAndValidateWorkspacePath(inputPath);

      if (!isAllowedWorkspacePath(workspacePath)) {
        return res.status(403).json({
          error: {
            message: 'Access denied: Path not allowed',
            status: 403,
            code: 'PATH_NOT_ALLOWED',
          },
        });
      }

      logger.info('Listing OpenClaw workspace files', {
        userId: req.user.id,
        role: req.user.role,
        path: workspacePath,
        recursive,
      });

      const data = await makeOpenClawRequest(
        'GET',
        `/files?path=${encodeURIComponent(workspacePath)}&recursive=${recursive}`,
      );

      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.get('/workspace/files/content', requireAuth, async (req, res, next) => {
    try {
      const { path: inputPath } = req.query;

      if (!inputPath) {
        return res.status(400).json({
          error: { message: 'Path parameter is required', status: 400 },
        });
      }

      const workspacePath = normalizeRemapAndValidateWorkspacePath(inputPath);

      if (!isAllowedWorkspacePath(workspacePath)) {
        return res.status(403).json({
          error: {
            message: 'Access denied: Path not allowed',
            status: 403,
            code: 'PATH_NOT_ALLOWED',
          },
        });
      }

      const isDocsPath = workspacePath === '/docs' || workspacePath.startsWith('/docs/');
      if (!isDocsPath && !['admin', 'agent', 'owner'].includes(req.user?.role)) {
        return res.status(403).json({
          error: { message: 'Admin access required', status: 403 },
        });
      }

      logger.info('Reading OpenClaw workspace file', {
        userId: req.user.id,
        userRole: req.user.role,
        path: workspacePath,
        isDocsPath,
      });

      const data = await makeOpenClawRequest(
        'GET',
        `/files/content?path=${encodeURIComponent(workspacePath)}`,
      );

      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.post('/workspace/files', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { path: inputPath, content, encoding = 'utf8' } = req.body;

      if (!inputPath || content === undefined) {
        return res.status(400).json({
          error: { message: 'Path and content are required', status: 400 },
        });
      }

      const workspacePath = normalizeRemapAndValidateWorkspacePath(inputPath);

      if (!isAllowedWorkspacePath(workspacePath)) {
        return res.status(403).json({
          error: {
            message: 'Access denied: Path not allowed',
            status: 403,
            code: 'PATH_NOT_ALLOWED',
          },
        });
      }

      const isSystemConfigFile = workspacePath === '/openclaw.json';
      if (isSystemConfigFile && req.user.role === 'agent') {
        logger.warn('Agent role blocked from modifying system config', {
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          path: workspacePath,
          action: 'create_file_rejected',
        });

        return res.status(403).json({
          error: {
            message: 'System configuration files can only be modified by admin or owner roles',
            status: 403,
            code: 'INSUFFICIENT_PERMISSIONS',
          },
        });
      }

      const scopeViolation = await enforceWriteScope(req, workspacePath);
      if (scopeViolation) {
        return res.status(scopeViolation.status).json({ error: scopeViolation.error });
      }

      try {
        await makeOpenClawRequest('GET', `/files/content?path=${encodeURIComponent(workspacePath)}`);

        logger.warn('Attempt to overwrite existing file blocked', {
          userId: req.user.id,
          userEmail: req.user.email,
          path: workspacePath,
          action: 'create_file_rejected',
        });

        return res.status(409).json({
          error: {
            message: `File already exists at path: ${workspacePath}`,
            status: 409,
            code: 'FILE_EXISTS',
          },
        });
      } catch (error) {
        const isFileNotFound = error.status === 404;
        const isServiceError = error.code === 'OPENCLAW_SERVICE_ERROR';

        if (!isFileNotFound && !isServiceError) {
          throw error;
        }
      }

      logger.info('Creating OpenClaw workspace file', {
        userId: req.user.id,
        userEmail: req.user.email,
        path: workspacePath,
        contentLength: content.length,
        action: 'create_file',
      });

      const data = await makeOpenClawRequest('POST', '/files', {
        path: workspacePath,
        content,
        encoding,
      });

      recordActivityLogEventSafe({
        event_type: 'workspace_file_created',
        source: 'workspace',
        title: `File created: ${workspacePath}`,
        description: `User created workspace file at ${workspacePath}`,
        severity: 'info',
        actor_user_id: req.user.id,
        workspace_path: workspacePath,
        meta: { contentLength: content.length, encoding },
      });

      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.put('/workspace/files', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { path: inputPath, content, encoding = 'utf8' } = req.body;

      if (!inputPath || content === undefined) {
        return res.status(400).json({
          error: { message: 'Path and content are required', status: 400 },
        });
      }

      const workspacePath = normalizeRemapAndValidateWorkspacePath(inputPath);

      if (!isAllowedWorkspacePath(workspacePath)) {
        return res.status(403).json({
          error: {
            message: 'Access denied: Path not allowed',
            status: 403,
            code: 'PATH_NOT_ALLOWED',
          },
        });
      }

      const isSystemConfigFile = workspacePath === '/openclaw.json';
      if (isSystemConfigFile && req.user.role === 'agent') {
        logger.warn('Agent role blocked from modifying system config', {
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          path: workspacePath,
          action: 'update_file_rejected',
        });

        return res.status(403).json({
          error: {
            message: 'System configuration files can only be modified by admin or owner roles',
            status: 403,
            code: 'INSUFFICIENT_PERMISSIONS',
          },
        });
      }

      const scopeViolation = await enforceWriteScope(req, workspacePath);
      if (scopeViolation) {
        return res.status(scopeViolation.status).json({ error: scopeViolation.error });
      }

      logger.info('Updating OpenClaw workspace file', {
        userId: req.user.id,
        path: workspacePath,
        contentLength: content.length,
      });

      const data = await makeOpenClawRequest('PUT', '/files', {
        path: workspacePath,
        content,
        encoding,
      });

      recordActivityLogEventSafe({
        event_type: 'workspace_file_updated',
        source: 'workspace',
        title: `File updated: ${workspacePath}`,
        description: `User updated workspace file at ${workspacePath}`,
        severity: 'info',
        actor_user_id: req.user.id,
        workspace_path: workspacePath,
        meta: { contentLength: content.length, encoding },
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/workspace/files', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { path: inputPath } = req.query;

      if (!inputPath) {
        return res.status(400).json({
          error: { message: 'Path parameter is required', status: 400 },
        });
      }

      const workspacePath = normalizeRemapAndValidateWorkspacePath(inputPath);

      if (!isAllowedWorkspacePath(workspacePath)) {
        return res.status(403).json({
          error: {
            message: 'Access denied: Path not allowed',
            status: 403,
            code: 'PATH_NOT_ALLOWED',
          },
        });
      }

      const isSystemConfigFile = workspacePath === '/openclaw.json';
      if (isSystemConfigFile && req.user.role === 'agent') {
        logger.warn('Agent role blocked from deleting system config', {
          userId: req.user.id,
          userEmail: req.user.email,
          userRole: req.user.role,
          path: workspacePath,
          action: 'delete_file_rejected',
        });

        return res.status(403).json({
          error: {
            message: 'System configuration files can only be deleted by admin or owner roles',
            status: 403,
            code: 'INSUFFICIENT_PERMISSIONS',
          },
        });
      }

      const scopeViolation = await enforceWriteScope(req, workspacePath);
      if (scopeViolation) {
        return res.status(scopeViolation.status).json({ error: scopeViolation.error });
      }

      logger.info('Deleting OpenClaw workspace file', {
        userId: req.user.id,
        path: workspacePath,
      });

      await makeOpenClawRequest('DELETE', `/files?path=${encodeURIComponent(workspacePath)}`);

      recordActivityLogEventSafe({
        event_type: 'workspace_file_deleted',
        source: 'workspace',
        title: `File deleted: ${workspacePath}`,
        description: `User deleted workspace file at ${workspacePath}`,
        severity: 'warning',
        actor_user_id: req.user.id,
        workspace_path: workspacePath,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get('/workspace/status', requireAuth, async (req, res, next) => {
    try {
      logger.info('Checking OpenClaw workspace status', { userId: req.user.id });
      const data = await makeOpenClawRequest('GET', '/status');
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  registerOpenClawWorkspaceRoutes,
};

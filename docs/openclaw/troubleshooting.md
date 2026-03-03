---
id: troubleshooting
title: OpenClaw Troubleshooting
sidebar_label: Troubleshooting
sidebar_position: 8
---

# OpenClaw Troubleshooting

## Common issues

### Dashboard shows "OpenClaw not configured"

**Cause**: `OPENCLAW_WORKSPACE_URL` and/or `OPENCLAW_GATEWAY_URL` are not set in `.env`.

**Fix**: Add the missing variables and restart the API:

```bash
# mosbot-api/.env
OPENCLAW_WORKSPACE_URL=http://localhost:8080
OPENCLAW_WORKSPACE_TOKEN=your-token
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=your-token
```

```bash
docker compose restart api
```

---

### 503 Service Not Configured

**Cause**: The OpenClaw service URL is set but the service is unreachable.

**Fix**:

1. Verify the service is running
2. Check the URL is correct
3. If using Kubernetes, verify the port-forward is active
4. Check network connectivity between MosBot API and OpenClaw

```bash
# Test workspace service directly
curl -H "Authorization: Bearer <token>" http://localhost:8080/status

# Test gateway directly
curl http://localhost:18789/health
```

---

### Workspace status returns root path errors

**Cause**: `WORKSPACE_FS_ROOT` and/or `CONFIG_FS_ROOT` do not point to mounted directories.

**Fix**:

1. Set `WORKSPACE_FS_ROOT` to the workspace mount (for example `/workspace`)
2. Set `CONFIG_FS_ROOT` to the config mount (for example `/openclaw-config`)
3. Verify both mounts exist and are readable by the workspace service container
4. Use read-write mounts for normal dashboard usage (Projects/Skills/Docs and config editing)

---

### 401 Unauthorized on OpenClaw endpoints

**Cause**: The bearer token in MosBot's `.env` doesn't match the token configured in OpenClaw.

**Fix**:

1. Retrieve the correct token from OpenClaw's configuration or Kubernetes secrets
2. Update `OPENCLAW_WORKSPACE_TOKEN` and/or `OPENCLAW_GATEWAY_TOKEN` in `.env`
3. Restart the API

```bash
# Retrieve token from Kubernetes
kubectl get secret -n openclaw-personal openclaw-secrets \
  -o jsonpath='{.data.WORKSPACE_SERVICE_TOKEN}' | base64 -d && echo
```

---

### Only seeing one agent (the default agent)

**Cause**: MosBot API cannot reach the workspace service, so it falls back to returning only the
default agent.

**Fix**: Check workspace service connectivity. The agent list is read from `openclaw.json` via the
workspace service.

```bash
# Check workspace status via MosBot API
curl -H "Authorization: Bearer <mosbot-jwt>" \
  http://localhost:3000/api/v1/openclaw/workspace/status
```

---

### Workspace files not loading in dashboard

**Cause**: Workspace service is unreachable or the path is invalid.

**Fix**:

1. Check workspace service connectivity (see above)
2. Verify the workspace path exists in the OpenClaw filesystem
3. Check MosBot API logs for error details:
   ```bash
   docker compose logs api --tail=50
   ```

---

### Workspace loads, but models/agents fail

**Cause**: Workspace root is mounted, but config root is not mounted correctly, so
`/openclaw.json` cannot be read.

**Fix**:

1. Verify workspace service env includes `CONFIG_FS_ROOT`
2. Verify config mount contains `openclaw.json` and `org-chart.json`
3. Test directly:
   ```bash
   curl -H "Authorization: Bearer <workspace-token>" \
     "http://localhost:8080/files/content?path=/openclaw.json"
   ```

---

### Config edits fail, but file browsing works

**Cause**: `CONFIG_FS_ROOT` is mounted read-only or points to the wrong directory.

**Fix**:

1. Mount config path read-write
2. Confirm container user has write permission
3. Retry editing `openclaw.json` or `org-chart.json` from the dashboard

---

### Path remap errors (`PATH_NOT_ALLOWED`) for host-absolute paths

**Cause**: `OPENCLAW_PATH_REMAP_PREFIXES` does not match the absolute path prefix returned by your
OpenClaw agent config.

**Fix**:

1. Set `OPENCLAW_PATH_REMAP_PREFIXES` in MosBot API (default: `/home/node/.openclaw,~/.openclaw`)
2. Include every prefix you expect, comma-separated if needed
3. Restart MosBot API

---

### Port-forward keeps dropping (Kubernetes)

**Cause**: The OpenClaw pod restarted, or the port-forward connection timed out.

**Fix**: Restart the port-forward:

```bash
kubectl port-forward -n openclaw-personal svc/openclaw-workspace 8080:8080
```

Consider using a tool like `kubectl-relay` or a persistent tunnel for long-running development
sessions.

---

### Agent Monitor shows no sessions

**Cause**: Gateway is not configured, or no agents have active sessions.

**Fix**:

1. Verify `OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN` are set
2. Check that the gateway is running
3. Verify agents have had recent sessions

---

### TLS errors connecting to gateway

**Cause**: The gateway uses TLS with a self-signed certificate, and Node.js rejects it.

**Fix (development only)**:

```bash
# mosbot-api/.env
NODE_TLS_REJECT_UNAUTHORIZED=0
```

:::warning Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` in production. Use a properly signed
certificate or configure a reverse proxy to handle TLS termination. :::

---

### Config update not reliable

**Known issue**: The `openclaw.json` config update endpoint may not be fully reliable due to how
OpenClaw handles configuration reloads. Prefer using OpenClaw's own ControlUI for configuration
changes.

## Diagnostic commands

```bash
# Check MosBot API logs
docker compose logs api --tail=100

# Check workspace service status
curl -H "Authorization: Bearer <workspace-token>" http://localhost:8080/status

# List agents via MosBot API
curl -H "Authorization: Bearer <mosbot-jwt>" \
  http://localhost:3000/api/v1/openclaw/agents

# List workspace files
curl -H "Authorization: Bearer <mosbot-jwt>" \
  "http://localhost:3000/api/v1/openclaw/workspace/files?path=/&recursive=false"

# Check gateway sessions
curl -H "Authorization: Bearer <mosbot-jwt>" \
  http://localhost:3000/api/v1/openclaw/sessions
```

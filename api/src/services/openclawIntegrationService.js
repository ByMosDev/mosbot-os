const pool = require('../db/pool');

const REQUIRED_OPERATOR_SCOPES = [
  'operator.admin',
  'operator.approvals',
  'operator.pairing',
  'operator.read',
  'operator.write',
];

function createHttpError(status, message, code, details) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function normalizeScopes(rawScopes) {
  if (Array.isArray(rawScopes)) {
    return [...new Set(rawScopes.map((s) => String(s || '').trim()).filter(Boolean))];
  }

  if (rawScopes && typeof rawScopes === 'object') {
    return [...new Set(Object.values(rawScopes).map((s) => String(s || '').trim()).filter(Boolean))];
  }

  return [];
}

function buildStatusFromRow(row = null) {
  if (!row) {
    return {
      status: 'uninitialized',
      ready: false,
      requiredScopes: REQUIRED_OPERATOR_SCOPES,
      grantedScopes: [],
      missingScopes: REQUIRED_OPERATOR_SCOPES,
      lastError: null,
      lastCheckedAt: null,
    };
  }

  const grantedScopes = normalizeScopes(row.granted_scopes);
  const missingScopes = REQUIRED_OPERATOR_SCOPES.filter((scope) => !grantedScopes.includes(scope));

  const status =
    row.status === 'ready' && missingScopes.length > 0 ? 'paired_missing_scopes' : row.status || 'uninitialized';

  return {
    status,
    ready: status === 'ready' && missingScopes.length === 0,
    requiredScopes: REQUIRED_OPERATOR_SCOPES,
    grantedScopes,
    missingScopes,
    gatewayUrl: row.gateway_url || null,
    deviceId: row.device_id || null,
    clientId: row.client_id || null,
    clientMode: row.client_mode || null,
    platform: row.platform || null,
    lastError: row.last_error || null,
    lastCheckedAt: row.last_checked_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function getIntegrationStatus() {
  try {
    const result = await pool.query('SELECT * FROM openclaw_integration_state WHERE id = 1');
    const row = result.rows?.[0] || null;
    return buildStatusFromRow(row);
  } catch (error) {
    if (error.code === '42P01') {
      return buildStatusFromRow(null);
    }
    throw error;
  }
}

async function assertIntegrationReady() {
  const status = await getIntegrationStatus();
  if (!status.ready) {
    throw createHttpError(
      503,
      'OpenClaw pairing is required before using this feature. Complete the pairing wizard first.',
      'OPENCLAW_PAIRING_REQUIRED',
      {
        status: status.status,
        missingScopes: status.missingScopes,
      },
    );
  }
  return status;
}

module.exports = {
  REQUIRED_OPERATOR_SCOPES,
  getIntegrationStatus,
  assertIntegrationReady,
};

jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

const pool = require('../../db/pool');
jest.mock('../openclawGatewayClient', () => ({
  gatewayWsRpc: jest.fn(),
}));
const { gatewayWsRpc } = require('../openclawGatewayClient');
const {
  REQUIRED_OPERATOR_SCOPES,
  getIntegrationStatus,
  assertIntegrationReady,
  startPairing,
} = require('../openclawIntegrationService');

describe('openclawIntegrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getIntegrationStatus', () => {
    it('queries a public-only integration status projection (no encrypted secrets)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await getIntegrationStatus();

      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain('SELECT');
      expect(sql).toContain('status');
      expect(sql).not.toContain('private_key');
      expect(sql).not.toContain('device_token');
    });

    it('returns uninitialized when table is missing (42P01)', async () => {
      const err = new Error('relation does not exist');
      err.code = '42P01';
      pool.query.mockRejectedValueOnce(err);

      const status = await getIntegrationStatus();

      expect(status).toEqual(
        expect.objectContaining({
          status: 'uninitialized',
          ready: false,
          requiredScopes: REQUIRED_OPERATOR_SCOPES,
          missingScopes: REQUIRED_OPERATOR_SCOPES,
          grantedScopes: [],
        }),
      );
    });

    it('downgrades ready->paired_missing_scopes when required scopes are missing', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            status: 'ready',
            granted_scopes: ['operator.read'],
            gateway_url: 'wss://example',
            device_id: 'abc',
            client_id: 'mosbot',
            client_mode: 'backend',
            platform: 'darwin',
            last_error: null,
            last_checked_at: '2026-03-13T00:00:00.000Z',
            updated_at: '2026-03-13T00:00:00.000Z',
          },
        ],
      });

      const status = await getIntegrationStatus();

      expect(status.status).toBe('paired_missing_scopes');
      expect(status.ready).toBe(false);
      expect(status.missingScopes).toEqual(
        expect.arrayContaining(['operator.write', 'operator.admin', 'operator.approvals', 'operator.pairing']),
      );
    });
  });

  describe('assertIntegrationReady', () => {
    it('throws typed pairing error when status is not ready', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(assertIntegrationReady()).rejects.toMatchObject({
        status: 503,
        code: 'OPENCLAW_PAIRING_REQUIRED',
        details: expect.objectContaining({
          status: 'uninitialized',
          missingScopes: REQUIRED_OPERATOR_SCOPES,
        }),
      });
    });

    it('returns status when integration is ready', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            status: 'ready',
            granted_scopes: REQUIRED_OPERATOR_SCOPES,
            gateway_url: 'wss://example',
            device_id: 'abc',
            client_id: 'mosbot',
            client_mode: 'backend',
            platform: 'darwin',
            last_error: null,
            last_checked_at: '2026-03-13T00:00:00.000Z',
            updated_at: '2026-03-13T00:00:00.000Z',
          },
        ],
      });

      const status = await assertIntegrationReady();
      expect(status.ready).toBe(true);
      expect(status.status).toBe('ready');
    });
  });

  describe('startPairing', () => {
    it('deduplicates concurrent start requests into a single pairing handshake', async () => {
      let integrationRow = null;
      pool.query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM openclaw_integration_state WHERE id = 1')) {
          return { rows: integrationRow ? [integrationRow] : [] };
        }

        if (sql.includes('INSERT INTO openclaw_integration_state')) {
          integrationRow = {
            ...(integrationRow || {}),
            id: params[0],
            status: params[1],
            gateway_url: params[2],
            device_id: params[3],
            client_id: params[4],
            client_mode: params[5],
            platform: params[6],
            public_key: params[7],
            private_key: params[8],
            device_token: params[9],
            granted_scopes: JSON.parse(params[10]),
            last_error: params[11],
            last_checked_at: params[12],
          };
          return { rows: [] };
        }

        if (sql.includes('FROM openclaw_integration_state') && sql.includes('granted_scopes')) {
          return {
            rows: integrationRow
              ? [
                  {
                    status: integrationRow.status,
                    granted_scopes: integrationRow.granted_scopes || [],
                    gateway_url: integrationRow.gateway_url,
                    device_id: integrationRow.device_id,
                    client_id: integrationRow.client_id,
                    client_mode: integrationRow.client_mode,
                    platform: integrationRow.platform,
                    last_error: integrationRow.last_error,
                    last_checked_at: integrationRow.last_checked_at,
                    updated_at: integrationRow.last_checked_at,
                  },
                ]
              : [],
          };
        }

        throw new Error(`Unexpected SQL in test: ${sql}`);
      });

      gatewayWsRpc.mockRejectedValueOnce(new Error('not paired'));

      const [first, second] = await Promise.all([startPairing(), startPairing()]);

      expect(first).toEqual(second);
      expect(gatewayWsRpc).toHaveBeenCalledTimes(1);
    });
  });
});

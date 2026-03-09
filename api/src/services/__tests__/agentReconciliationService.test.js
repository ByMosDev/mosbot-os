jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../openclawWorkspaceClient', () => ({
  makeOpenClawRequest: jest.fn(),
}));

const pool = require('../../db/pool');
const { makeOpenClawRequest } = require('../openclawWorkspaceClient');
const { reconcileAgentsFromOpenClaw } = require('../agentReconciliationService');

describe('agentReconciliationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts discovered agents and deactivates removed ones', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({
      content: JSON.stringify({
        agents: {
          list: [
            { id: 'coo', identity: { name: 'COO' } },
            { id: 'cto', identity: { name: 'CTO' } },
          ],
        },
      }),
    });

    pool.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await reconcileAgentsFromOpenClaw({ trigger: 'test' });

    expect(result.discoveredIds).toEqual(expect.arrayContaining(['coo', 'cto', 'main']));
    expect(result.deactivated).toBe(1);

    // Reconcile should preserve custom DB names (it should not blindly overwrite name)
    const upsertSql = pool.query.mock.calls[0][0];
    expect(upsertSql).toContain("COALESCE(NULLIF(agents.name, ''), EXCLUDED.name)");
  });
});

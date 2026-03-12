jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../../utils/configParser', () => ({
  parseOpenClawConfig: jest.fn(),
}));

jest.mock('../openclawWorkspaceClient', () => ({
  makeOpenClawRequest: jest.fn(),
  getFileContent: jest.fn(),
}));

jest.mock('../modelPricingService', () => ({
  estimateCostFromTokens: jest.fn(() => 0.12),
}));

jest.mock('../openclawGatewayClient', () => ({
  cronList: jest.fn(),
  gatewayWsRpc: jest.fn(),
}));

const pool = require('../../db/pool');
const { parseOpenClawConfig } = require('../../utils/configParser');
const { makeOpenClawRequest, getFileContent } = require('../openclawWorkspaceClient');
const { cronList, gatewayWsRpc } = require('../openclawGatewayClient');
const {
  parseInterval,
  getHeartbeatJobsFromConfig,
  getCronJobsData,
  getCronJobStatsData,
  getCronJobRunsData,
} = require('../cronJobService');

describe('cronJobService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
    cronList.mockResolvedValue([]);
    gatewayWsRpc.mockResolvedValue({ sessions: [] });
    parseOpenClawConfig.mockReturnValue({ agents: { list: [] } });
  });

  it('parses interval labels to milliseconds', () => {
    expect(parseInterval('30m')).toBe(30 * 60 * 1000);
    expect(parseInterval('2h')).toBe(2 * 60 * 60 * 1000);
    expect(parseInterval('bad')).toBeNull();
  });

  it('reads heartbeat jobs from parsed openclaw config', async () => {
    makeOpenClawRequest
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockResolvedValueOnce({ content: JSON.stringify({ lastHeartbeat: '2026-03-10T01:00:00.000Z' }) });

    parseOpenClawConfig.mockReturnValueOnce({
      agents: {
        list: [
          {
            id: 'coo',
            workspace: '/home/node/.openclaw/workspace-coo',
            identity: { name: 'COO', emoji: '📊' },
            heartbeat: { every: '30m', model: 'm', session: 'main', target: 'last' },
          },
        ],
      },
    });

    const jobs = await getHeartbeatJobsFromConfig();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobId).toBe('heartbeat-coo');
    expect(jobs[0].schedule.everyMs).toBe(30 * 60 * 1000);
  });

  it('aggregates cron jobs with execution data and agent enrichment', async () => {
    makeOpenClawRequest
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockResolvedValueOnce({ content: JSON.stringify({ lastHeartbeat: '2026-03-10T01:00:00.000Z' }) });

    parseOpenClawConfig.mockReturnValueOnce({
      agents: {
        list: [
          {
            id: 'coo',
            identity: { title: 'Chief Ops', name: 'COO' },
            model: { primary: 'openrouter/model' },
            workspace: '/home/node/.openclaw/workspace-coo',
            heartbeat: { every: '30m', session: 'main', target: 'last' },
          },
        ],
      },
    });

    cronList.mockResolvedValueOnce([
      {
        jobId: 'daily',
        name: 'Daily Job',
        source: 'gateway',
        agentId: 'coo',
        cron: '*/5 * * * *',
        state: { lastRunAtMs: 1710000000000, nextRunAtMs: 1710000300000, lastStatus: 'ok' },
        payload: { kind: 'agentTurn', prompt: 'do work' },
      },
    ]);

    gatewayWsRpc
      .mockResolvedValueOnce({
        sessions: [
          {
            key: 'agent:coo:cron:daily',
            updatedAt: new Date().toISOString(),
            model: 'openrouter/model',
            contextTokens: 200,
            totalTokens: 100,
          },
          {
            key: 'agent:coo:isolated',
            updatedAt: new Date().toISOString(),
            model: 'openrouter/model',
            contextTokens: 50,
            totalTokens: 20,
          },
        ],
      })
      .mockResolvedValueOnce({
        sessions: [
          {
            key: 'agent:coo:cron:daily:run:1',
            usage: {
              input: 20,
              output: 10,
              cacheRead: 2,
              cacheWrite: 1,
              totalCost: 0.33,
              totalTokens: 70,
              lastActivity: Date.now(),
              messageCounts: { user: 1 },
            },
          },
        ],
      });

    pool.query.mockResolvedValueOnce({ rows: [{ agent_id: 'coo', name: 'COO Name' }] });

    const data = await getCronJobsData({ userId: 'u1' });
    expect(data.version).toBe(1);
    expect(data.jobs.length).toBeGreaterThan(0);
    const daily = data.jobs.find((j) => j.jobId === 'daily');
    expect(daily).toBeDefined();
    expect(daily.agentName).toBe('COO Name');
    expect(daily.lastExecution).toBeDefined();
  });

  it('normalizes schedule from expression/every and falls back when ws matching fails', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({ content: '{"agents":[]}' });
    parseOpenClawConfig.mockReturnValueOnce({ agents: { list: [] } });

    cronList.mockResolvedValueOnce([
      {
        id: 'expr-job',
        name: 'Expr Job',
        source: 'gateway',
        agentId: 'main',
        expression: '*/10 * * * *',
        payload: { text: 'hello' },
      },
      {
        id: 'every-job',
        name: 'Every Job',
        source: 'gateway',
        agentId: 'main',
        interval: '30m',
        lastRunAt: '2026-03-12T10:00:00.000Z',
        payload: { prompt: 'ping' },
      },
    ]);

    gatewayWsRpc.mockRejectedValueOnce(new Error('ws list failed'));
    pool.query.mockRejectedValueOnce(new Error('db names failed'));

    const data = await getCronJobsData({ userId: 'u1' });
    expect(data.jobs).toHaveLength(2);
    expect(data.jobs[0].lastExecution).toBeDefined();
  });

  it('handles missing run-log file by returning empty runs', async () => {
    getFileContent.mockRejectedValueOnce(new Error('missing'));
    const data = await getCronJobRunsData({ userId: 'u1', jobId: 'job-1', limit: 10 });
    expect(data).toEqual({ runs: [], total: 0 });
  });

  it('computes stats from gateway and config jobs', async () => {
    cronList.mockResolvedValueOnce([
      { state: { lastStatus: 'error', nextRunAtMs: Date.now() - 1000 }, enabled: true },
    ]);
    makeOpenClawRequest.mockRejectedValueOnce(new Error('missing config'));

    const data = await getCronJobStatsData({ userId: 'u1' });
    expect(data.errors).toBe(1);
    expect(data.missed).toBe(1);
  });

  it('validates job id when reading run history', async () => {
    await expect(
      getCronJobRunsData({ userId: 'u1', jobId: '../bad', limit: 10 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps run log rows into API shape', async () => {
    getFileContent.mockResolvedValueOnce(
      '{"action":"finished","sessionId":"s1","runAtMs":100,"status":"ok","usage":{"input_tokens":10,"output_tokens":5},"model":"m"}\n',
    );

    const data = await getCronJobRunsData({ userId: 'u1', jobId: 'job-1', limit: 10 });
    expect(data.total).toBe(1);
    expect(data.runs[0].inputTokens).toBe(10);
    expect(data.runs[0].estimatedCost).toBe(0.12);
  });
});

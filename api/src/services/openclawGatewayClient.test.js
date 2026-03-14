jest.mock('ws', () => {
  class MockWebSocket {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.handlers = {};
      this.sent = [];
      MockWebSocket.instances.push(this);

      setImmediate(() => {
        if (this.handlers.open) this.handlers.open();
      });
    }

    on(event, cb) {
      this.handlers[event] = cb;
    }

    send(raw) {
      const msg = JSON.parse(raw);
      this.sent.push(msg);

      if (msg.method === 'connect') {
        setImmediate(() => {
          this.handlers.message?.(
            JSON.stringify({
              type: 'res',
              id: msg.id,
              ok: true,
              payload: { connected: true },
            }),
          );
        });
      }

      if (msg.method === 'config.get') {
        setImmediate(() => {
          this.handlers.message?.(
            JSON.stringify({
              type: 'res',
              id: msg.id,
              ok: true,
              payload: { raw: '{"ok":true}', hash: 'abc123' },
            }),
          );
        });
      }
    }

    close() {
      // no-op for tests
    }
  }

  MockWebSocket.instances = [];

  return MockWebSocket;
});

const MockWebSocket = require('ws');
const { gatewayWsRpc } = require('./openclawGatewayClient');

describe('openclawGatewayClient device auth requirement', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OPENCLAW_GATEWAY_URL = 'http://localhost:5173';
    process.env.OPENCLAW_GATEWAY_TOKEN = 'test-token';
    MockWebSocket.instances.length = 0;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects when device auth env vars are missing', async () => {
    await expect(gatewayWsRpc('config.get', {})).rejects.toMatchObject({
      status: 503,
      code: 'DEVICE_AUTH_REQUIRED',
    });

    expect(require('ws').instances).toHaveLength(0);
  });
});

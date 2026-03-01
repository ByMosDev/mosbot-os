---
id: overview
title: OpenClaw Integration Overview
sidebar_label: Overview
sidebar_position: 1
---

# OpenClaw Integration

OpenClaw is the AI agent runtime that powers MosBot OS. It manages agents, workspaces, sessions,
channels, and cron jobs. MosBot API connects to OpenClaw to expose this data through a
human-friendly interface.

![OpenClaw Configuration](/img/screenshots/mosbot-openclaw-config.png)

## What OpenClaw integration enables

Without OpenClaw, MosBot OS provides task management and user management. With OpenClaw connected,
you unlock:

| Feature                              | Requires          |
| ------------------------------------ | ----------------- |
| Agent Monitor (live sessions, costs) | Gateway           |
| Org Chart (agent visualization)      | Workspace service |
| Workspace file browser               | Workspace service |
| Skills management                    | Workspace service |
| Agent configuration editing          | Workspace service |
| Standups (AI-generated)              | Gateway           |

## OpenClaw services

OpenClaw exposes two services that MosBot API connects to:

### Workspace service (port 8080)

An HTTP REST service that provides access to the OpenClaw workspace filesystem. MosBot uses it to:

- Read and write workspace files
- Read and update `openclaw.json` configuration
- List agents and their workspace paths
- Manage skills

### Gateway (port 18789)

An HTTP + WebSocket service that provides runtime control and session data. MosBot uses it to:

- Query live agent sessions
- Retrieve session costs and token usage
- Invoke tools and send messages
- Access real-time agent status

## Architecture

```
MosBot Dashboard
      │
      │ REST API (JWT auth)
      ▼
MosBot API
      │                    │
      │ HTTP               │ HTTP + WebSocket
      ▼                    ▼
OpenClaw Workspace    OpenClaw Gateway
Service (port 8080)   (port 18789)
      │
      ▼
Workspace PVC / filesystem
(agents, workspaces, openclaw.json)
```

## Integration is optional and graceful

When OpenClaw is not configured (no `OPENCLAW_WORKSPACE_URL` or `OPENCLAW_GATEWAY_URL` in `.env`),
endpoints that depend on OpenClaw return `503 SERVICE_NOT_CONFIGURED`. The dashboard shows a
degraded state for those features but continues to work for everything else.

## Next steps

- [Setup OpenClaw](./setup) — install and configure OpenClaw
- [Connect MosBot API](./integration) — configure the integration variables
- [Workspace Service](./workspace-service) — workspace service details
- [Gateway](./gateway) — gateway configuration
- [Local Development](./local-development) — port-forwarding for local dev
- [Kubernetes](./kubernetes) — Kubernetes deployment guide

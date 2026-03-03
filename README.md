# MosBot Workspace Service

[![CI](https://github.com/bymosbot/mosbot-workspace-service/actions/workflows/ci.yml/badge.svg)](https://github.com/bymosbot/mosbot-workspace-service/actions/workflows/ci.yml)
[![Coverage](https://coveralls.io/repos/github/bymosbot/mosbot-workspace-service/badge.svg?branch=main)](https://coveralls.io/github/bymosbot/mosbot-workspace-service)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Lightweight HTTP service that exposes OpenClaw workspace files over REST API. This service runs as a sidecar container alongside OpenClaw and provides file access for MosBot OS.

## Features

- REST API for workspace file operations (list, read, write, delete)
- Bearer token authentication (**required by default**)
- Symlink remapping for cross-container paths
- Path traversal protection
- Health check endpoint
- Multi-platform Docker images (amd64, arm64)

## Security

> **This service can read, write, and delete files on the mounted workspace volume. Treat it as a privileged internal API.**

- **Authentication is required** — `WORKSPACE_SERVICE_TOKEN` must be set. The service will refuse to start without it.
- **Never expose port 8080 to the public internet** — use a VPN, private network, or Kubernetes `ClusterIP` service.
- Always use a strong, randomly generated bearer token (`openssl rand -hex 32`).
- The service runs as a non-root user inside the container.
- Path traversal protection is built-in and cannot be bypassed via the API.
- Mount workspace volumes as read-only (`:ro`) only when write operations are intentionally disabled.

See [SECURITY.md](SECURITY.md) for the full threat model and vulnerability reporting process.

## Quick Start

### Docker Compose

```yaml
services:
  mosbot-workspace:
    image: ghcr.io/bymosbot/mosbot-workspace-service:latest
    environment:
      WORKSPACE_SERVICE_TOKEN: your-secure-token # required
      WORKSPACE_FS_ROOT: /workspace
      CONFIG_FS_ROOT: /openclaw-config
    volumes:
      - /path/to/openclaw-workspace:/workspace
      - /path/to/openclaw-config:/openclaw-config
    ports:
      - "8080:8080"
```

### Docker Run

```bash
docker run -d \
  --name mosbot-workspace \
  -e WORKSPACE_SERVICE_TOKEN=your-secure-token \
  -e WORKSPACE_FS_ROOT=/workspace \
  -e CONFIG_FS_ROOT=/openclaw-config \
  -v /path/to/.openclaw:/workspace \
  -v /path/to/.openclaw:/openclaw-config \
  -p 8080:8080 \
  ghcr.io/bymosbot/mosbot-workspace-service:latest
```

For full MosBot integration (agent discovery via `openclaw.json` + Projects/Skills/Docs CRUD), use
read-write mounts for both roots.

## Environment Variables

| Variable                            | Default                | Description                                                                                         |
| ----------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `PORT`                              | `8080`                 | HTTP server port                                                                                    |
| `WORKSPACE_FS_ROOT`                 | `/workspace`           | Root directory for workspace files (Projects, Skills, Docs, agent workspaces)                       |
| `CONFIG_FS_ROOT`                    | `/openclaw-config`     | Root directory for config files (`openclaw.json`, `org-chart.json`)                                 |
| `WORKSPACE_SERVICE_TOKEN`           | —                      | **Required.** Bearer token for authentication. The service will not start without this.             |
| `SYMLINK_REMAP_PREFIXES`            | `/home/node/.openclaw` | Comma-separated list of symlink prefixes to remap (for cross-container symlinks)                    |
| `WORKSPACE_SERVICE_ALLOW_ANONYMOUS` | —                      | Set to `true` to disable auth requirement. **For local development only. Never use in production.** |

Legacy variables `WORKSPACE_ROOT`, `WORKSPACE_SUBDIR`, `WORKSPACE_PATH`, and `AUTH_TOKEN` are no
longer honored.

## Migration from Previous Env Model

- Old model: `WORKSPACE_ROOT` + `WORKSPACE_SUBDIR`
- New model: `WORKSPACE_FS_ROOT` + `CONFIG_FS_ROOT`
- Config files (`/openclaw.json`, `/org-chart.json`) always resolve under `CONFIG_FS_ROOT`
- All other file paths always resolve under `WORKSPACE_FS_ROOT`

## API Endpoints

### Health Check

```bash
GET /health
```

Returns service status and configuration. Does not require authentication.

### Workspace Status

```bash
GET /status
Authorization: Bearer <token>
```

Returns workspace accessibility status.

### List Files

```bash
GET /files?path=/&recursive=false
Authorization: Bearer <token>
```

List files and directories. Use `recursive=true` for recursive listing.

### Get File Content

```bash
GET /files/content?path=/path/to/file&encoding=utf8
Authorization: Bearer <token>
```

Read file content.

### Create File

```bash
POST /files
Authorization: Bearer <token>
Content-Type: application/json

{
  "path": "/path/to/file",
  "content": "file content",
  "encoding": "utf8"
}
```

### Update File

```bash
PUT /files
Authorization: Bearer <token>
Content-Type: application/json

{
  "path": "/path/to/file",
  "content": "updated content",
  "encoding": "utf8"
}
```

### Delete File/Directory

```bash
DELETE /files?path=/path/to/file
Authorization: Bearer <token>
```

## Development

### Local Development

```bash
npm install
cp .env.example .env
# Edit .env and set WORKSPACE_SERVICE_TOKEN
npm start
```

Alternatively, export variables directly in your shell:

```bash
export WORKSPACE_SERVICE_TOKEN=dev-token-change-me
npm start
```

For local development without a token (not for production):

```bash
# In .env:
WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true
# Or via shell:
export WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true
npm start
```

### Run Tests

```bash
npm run test:run       # run once
npm run test:coverage  # run with 100% coverage enforcement
```

### Format Code

```bash
npm run format         # auto-fix
npm run format:check   # check only (used in CI)
```

### Build Docker Image

```bash
docker build -t mosbot-workspace-service:latest .
```

## License

[MIT](LICENSE)

## Related Projects

- [MosBot API](https://github.com/bymosbot/mosbot-api) — Backend API that consumes this service
- [MosBot Dashboard](https://github.com/bymosbot/mosbot-dashboard) — Frontend UI
- [MosBot OS Documentation](https://github.com/bymosbot/mosbot-api/tree/main/docs) — Full system documentation

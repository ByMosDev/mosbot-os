"use strict";

require("dotenv").config();

const { createApp } = require("./app");

const PORT = process.env.PORT || 8080;

const WORKSPACE_FS_ROOT = process.env.WORKSPACE_FS_ROOT || "/workspace";
const CONFIG_FS_ROOT = process.env.CONFIG_FS_ROOT || "/openclaw-config";

const WORKSPACE_SERVICE_TOKEN = process.env.WORKSPACE_SERVICE_TOKEN;

const ALLOW_ANONYMOUS = process.env.WORKSPACE_SERVICE_ALLOW_ANONYMOUS === "true";

const SYMLINK_REMAP_PREFIXES = (
  process.env.SYMLINK_REMAP_PREFIXES || "/home/node/.openclaw"
)
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

// Enforce auth required unless explicitly opted out for local dev
if (!WORKSPACE_SERVICE_TOKEN && !ALLOW_ANONYMOUS) {
  console.error(
    "ERROR: WORKSPACE_SERVICE_TOKEN is required but not set.\n" +
      "Set a strong random token: export WORKSPACE_SERVICE_TOKEN=$(openssl rand -hex 32)\n" +
      "For local development only, you may set WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true to skip this check.",
  );
  process.exit(1);
}

const app = createApp({
  workspaceFsRoot: WORKSPACE_FS_ROOT,
  configFsRoot: CONFIG_FS_ROOT,
  token: WORKSPACE_SERVICE_TOKEN,
  symlinkRemapPrefixes: SYMLINK_REMAP_PREFIXES,
});

app.listen(PORT, () => {
  console.log(`MosBot Workspace Service running on port ${PORT}`);
  console.log(`Workspace FS root: ${WORKSPACE_FS_ROOT}`);
  console.log(`Config FS root: ${CONFIG_FS_ROOT}`);
  console.log(
    `Auth: ${WORKSPACE_SERVICE_TOKEN ? "enabled" : "disabled (WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true)"}`,
  );
  console.log(`Health check: http://localhost:${PORT}/health`);

  if (ALLOW_ANONYMOUS) {
    console.warn(
      "WARNING: WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true — authentication is disabled. Do not use in production.",
    );
  }
});

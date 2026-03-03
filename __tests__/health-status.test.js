"use strict";

const request = require("supertest");
const os = require("os");
const path = require("path");
const fs = require("fs").promises;
const { createApp } = require("../src/app");

describe("Health and status endpoints", () => {
  let tmpDir;
  let workspaceRoot;
  let configRoot;
  let app;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-health-test-"));
    workspaceRoot = path.join(tmpDir, "workspace-root");
    configRoot = path.join(tmpDir, "config-root");

    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.mkdir(configRoot, { recursive: true });

    app = createApp({
      workspaceFsRoot: workspaceRoot,
      configFsRoot: configRoot,
      token: undefined,
      symlinkRemapPrefixes: [],
    });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("includes split-root fields", async () => {
      const res = await request(app).get("/health");
      expect(res.body.workspaceFsRoot).toBe(workspaceRoot);
      expect(res.body.configFsRoot).toBe(configRoot);
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe("GET /status", () => {
    it("returns 200 with both roots accessible", async () => {
      const res = await request(app).get("/status");
      expect(res.status).toBe(200);
      expect(res.body.workspaceAccessible).toBe(true);
      expect(res.body.configAccessible).toBe(true);
      expect(res.body.workspaceExists).toBe(true);
      expect(res.body.configExists).toBe(true);
    });

    it("returns 500 when workspace root does not exist", async () => {
      const missingWorkspaceApp = createApp({
        workspaceFsRoot: "/nonexistent/path/that/does/not/exist",
        configFsRoot: configRoot,
        token: undefined,
        symlinkRemapPrefixes: [],
      });

      const res = await request(missingWorkspaceApp).get("/status");
      expect(res.status).toBe(500);
      expect(res.body.workspaceAccessible).toBe(false);
      expect(res.body.configAccessible).toBe(true);
      expect(res.body.errors.workspace).toBeDefined();
    });

    it("returns 500 when config root does not exist", async () => {
      const missingConfigApp = createApp({
        workspaceFsRoot: workspaceRoot,
        configFsRoot: "/nonexistent/config/path/that/does/not/exist",
        token: undefined,
        symlinkRemapPrefixes: [],
      });

      const res = await request(missingConfigApp).get("/status");
      expect(res.status).toBe(500);
      expect(res.body.workspaceAccessible).toBe(true);
      expect(res.body.configAccessible).toBe(false);
      expect(res.body.errors.config).toBeDefined();
    });

    it("uses fallback status error message when root errors are blank", async () => {
      const fsModule = require("fs").promises;
      const originalStat = fsModule.stat;
      const blankError = new Error();
      blankError.message = "";
      fsModule.stat = jest.fn().mockRejectedValue(blankError);

      try {
        const res = await request(app).get("/status");
        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Filesystem root inaccessible");
      } finally {
        fsModule.stat = originalStat;
      }
    });
  });
});

/**
 * Tests for configuration loading with project trust awareness.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigStore,
  DEFAULT_CONFIG,
  loadConfigWithTrust,
} from "./config";

// Create mock contexts
const createMockCtx = (isTrusted: boolean, cwd: string = "/test/project") => ({
  isProjectTrusted: () => isTrusted,
  cwd,
  hasUI: true,
  ui: {
    notify: () => {},
  },
  mode: "tui",
} as unknown as any);

test("ConfigStore initializes with defaults", () => {
  const store = new ConfigStore();
  assert.deepEqual(store.current(), DEFAULT_CONFIG);
});

test("ConfigStore initializes with partial config", () => {
  const store = new ConfigStore({ enabled: true });
  assert.equal(store.current().enabled, true);
  assert.equal(store.current().quietMs, DEFAULT_CONFIG.quietMs);
});

test("ConfigStore.update updates config", () => {
  const store = new ConfigStore();
  store.update({ enabled: true, quietMs: 2000 });
  assert.equal(store.current().enabled, true);
  assert.equal(store.current().quietMs, 2000);
});

test("ConfigStore.current returns immutable config copies", () => {
  const store = new ConfigStore();
  const config1 = store.current();
  config1.enabled = true;
  const config2 = store.current();
  assert.equal(config2.enabled, false);
});

test("ConfigStore.shouldDeferModalType returns false when disabled", () => {
  const store = new ConfigStore({ enabled: false });
  assert.equal(store.shouldDeferModalType("select"), false);
});

test("ConfigStore.shouldDeferModalType returns true for configured modal types when enabled", () => {
  const store = new ConfigStore({ 
    enabled: true,
    modalTypes: ["select", "confirm"]
  });
  assert.equal(store.shouldDeferModalType("select"), true);
  assert.equal(store.shouldDeferModalType("confirm"), true);
  assert.equal(store.shouldDeferModalType("input"), false);
});

test("ConfigStore.getQuietMs returns quietMs from config", () => {
  const store = new ConfigStore({ quietMs: 2000 });
  assert.equal(store.getQuietMs(), 2000);
});

test("ConfigStore.getMaxDeferMs returns maxDeferMs from config", () => {
  const store = new ConfigStore({ maxDeferMs: 60000 });
  assert.equal(store.getMaxDeferMs(), 60000);
});

test("ConfigStore.shouldShowStatus returns showStatusIndicator from config", () => {
  const store = new ConfigStore({ showStatusIndicator: false });
  assert.equal(store.shouldShowStatus(), false);
});

test("ConfigStore.getStatusText returns statusText from config", () => {
  const store = new ConfigStore({ statusText: "Custom status" });
  assert.equal(store.getStatusText(), "Custom status");
});

test("loadConfigWithTrust includes project config when project is trusted", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-defer-modal-trusted-"));
  const agentDir = join(root, "agent");
  const projectConfigDir = join(root, ".pi", "extensions", "pi-defer-modal");
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  try {
    mkdirSync(join(root, ".git"));
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(projectConfigDir, { recursive: true });
    writeFileSync(join(agentDir, "extensions-placeholder"), "");
    writeFileSync(join(projectConfigDir, "config.json"), JSON.stringify({ enabled: true }));
    process.env.PI_CODING_AGENT_DIR = agentDir;

    const result = loadConfigWithTrust(createMockCtx(true, root));
    assert.equal(result.config.enabled, true);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadConfigWithTrust keeps global config available but ignores project config when untrusted", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-defer-modal-untrusted-"));
  const agentDir = join(root, "agent");
  const globalConfigDir = join(agentDir, "extensions", "pi-defer-modal");
  const projectConfigDir = join(root, ".pi", "extensions", "pi-defer-modal");
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  try {
    mkdirSync(join(root, ".git"));
    mkdirSync(globalConfigDir, { recursive: true });
    mkdirSync(projectConfigDir, { recursive: true });
    writeFileSync(join(globalConfigDir, "config.json"), JSON.stringify({ quietMs: 2100 }));
    writeFileSync(join(projectConfigDir, "config.json"), JSON.stringify({ quietMs: 900 }));
    process.env.PI_CODING_AGENT_DIR = agentDir;

    const result = loadConfigWithTrust(createMockCtx(false, root));
    assert.equal(result.config.quietMs, 2100);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  }
});

test("ConfigStore.reload without a session context does not load project config", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-defer-modal-no-context-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  try {
    mkdirSync(join(root, ".git", "placeholder"), { recursive: true });
    mkdirSync(join(root, ".pi", "extensions", "pi-defer-modal"), { recursive: true });
    writeFileSync(
      join(root, ".pi", "extensions", "pi-defer-modal", "config.json"),
      JSON.stringify({ enabled: true }),
    );
    process.env.PI_CODING_AGENT_DIR = join(root, "agent");

    const store = new ConfigStore();
    store.reload();
    assert.equal(store.current().enabled, false);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  }
});

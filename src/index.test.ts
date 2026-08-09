import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import piDeferModalExtension from "./index";

interface RegisteredCommand {
  handler: (args: string, ctx: ExtensionContext) => Promise<void>;
}

function createHarness() {
  const handlers = new Map<string, (...args: any[]) => void>();
  const commands = new Map<string, RegisteredCommand>();
  const pi = {
    on(event: string, handler: (...args: any[]) => void) {
      handlers.set(event, handler);
    },
    registerCommand(name: string, command: RegisteredCommand) {
      commands.set(name, command);
    },
  } as unknown as ExtensionAPI;

  piDeferModalExtension(pi);
  return { handlers, commands };
}

function createContext(isTrusted: boolean, cwd: string, notifications: string[]) {
  return {
    cwd,
    hasUI: true,
    isProjectTrusted: () => isTrusted,
    mode: "print",
    ui: {
      notify: async (message: string) => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
}

async function currentEnabled(
  command: RegisteredCommand,
  ctx: ExtensionContext,
  notifications: string[],
): Promise<boolean> {
  notifications.length = 0;
  await command.handler("", ctx);
  return /Enabled: true/.test(notifications.at(-1) ?? "");
}

function withConfigFiles(
  globalConfig: object,
  projectConfig: object,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "pi-defer-modal-extension-"));
  const agentDir = join(root, "agent");
  const globalConfigDir = join(agentDir, "extensions", "pi-defer-modal");
  const projectConfigDir = join(root, ".pi", "extensions", "pi-defer-modal");
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  mkdirSync(join(root, ".git"));
  mkdirSync(globalConfigDir, { recursive: true });
  mkdirSync(projectConfigDir, { recursive: true });
  writeFileSync(join(globalConfigDir, "config.json"), JSON.stringify(globalConfig));
  writeFileSync(join(projectConfigDir, "config.json"), JSON.stringify(projectConfig));
  process.env.PI_CODING_AGENT_DIR = agentDir;

  return run(root).finally(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  });
}

test("extension uses global config before a session, project config only in a trusted session, and global config after shutdown", async () => {
  await withConfigFiles(
    { enabled: true },
    { enabled: false },
    async (root) => {
      const { handlers, commands } = createHarness();
      const notifications: string[] = [];
      const ctx = createContext(true, root, notifications);
      const configCommand = commands.get("defer-modal-config");
      assert.ok(configCommand);

      assert.equal(await currentEnabled(configCommand, ctx, notifications), true);

      handlers.get("session_start")?.({ type: "session_start" }, ctx);
      assert.equal(await currentEnabled(configCommand, ctx, notifications), false);

      handlers.get("session_shutdown")?.({ type: "session_shutdown" }, ctx);
      assert.equal(await currentEnabled(configCommand, ctx, notifications), true);
    },
  );
});

test("extension ignores project config in an untrusted session while retaining global config", async () => {
  await withConfigFiles(
    { enabled: true },
    { enabled: false },
    async (root) => {
      const { handlers, commands } = createHarness();
      const notifications: string[] = [];
      const ctx = createContext(false, root, notifications);
      const configCommand = commands.get("defer-modal-config");
      assert.ok(configCommand);

      handlers.get("session_start")?.({ type: "session_start" }, ctx);
      assert.equal(await currentEnabled(configCommand, ctx, notifications), true);
    },
  );
});

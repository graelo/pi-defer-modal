/**
 * Configuration for the pi-defer-modal extension.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";

/**
 * Configuration options for modal deferral behavior.
 */
export interface DeferModalConfig {
  /**
   * Enable or disable modal deferral while typing.
   * When false, modals appear immediately as normal.
   */
  enabled: boolean;

  /**
   * Modal types to defer while typing.
   * Supported types: "select", "confirm", "input", "custom"
   */
  modalTypes: string[];

  /**
   * Idle gap in milliseconds with no keystrokes that counts as "paused typing".
   * Once this gap elapses, deferred modals will appear.
   * Default: 1500ms
   */
  quietMs: number;

  /**
   * Maximum total deferral time in milliseconds.
   * The modal will appear after this time even if the user never stops typing.
   * This prevents "block the tool" from becoming "hang the tool".
   * Default: 30000ms (30 seconds)
   */
  maxDeferMs: number;

  /**
   * Show a status indicator when modals are being deferred.
   * Default: true
   */
  showStatusIndicator: boolean;

  /**
   * Custom status text to show when modals are being deferred.
   * Default: "⏸ modal pending — pause to review"
   */
  statusText: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: DeferModalConfig = {
  enabled: false,
  modalTypes: ["select", "confirm", "input", "custom"],
  quietMs: 1500,
  maxDeferMs: 30_000,
  showStatusIndicator: true,
  statusText: "⏸ modal pending — pause to review",
};

/**
 * Extension ID for this extension.
 */
export const EXTENSION_ID = "pi-defer-modal";

/**
 * Status key for the pending modal indicator.
 */
export const STATUS_KEY = `${EXTENSION_ID}:modal-pending`;

/**
 * Configuration file name.
 */
export const CONFIG_FILENAME = "config.json";

/**
 * Find the root of the current git repository, if any.
 *
 * `.git` is a directory in a normal clone, but a file in worktrees and
 * submodules, so mere existence is what marks the root.
 */
function findGitRoot(startPath: string): string | null {
  let current = resolve(startPath);
  const root = resolve("/");

  while (current !== root) {
    const gitDir = join(current, ".git");
    if (existsSync(gitDir)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Resolves config file paths with priority: repo-root -> pi_coding_agent_dir -> home
 */
function getConfigPaths(): string[] {
  const paths: string[] = [];
  
  // 1. Repository root (project-local)
  const gitRoot = findGitRoot(process.cwd());
  if (gitRoot) {
    const repoPath = resolve(gitRoot, ".pi", "extensions", EXTENSION_ID, CONFIG_FILENAME);
    paths.push(repoPath);
  }
  
  // 2. PI_CODING_AGENT_DIR
  const piAgentDir = process.env.PI_CODING_AGENT_DIR;
  if (piAgentDir) {
    const agentPath = resolve(piAgentDir, "extensions", EXTENSION_ID, CONFIG_FILENAME);
    paths.push(agentPath);
  }
  
  // 3. HOME
  const home = homedir() || process.env.HOME || "/";
  const homePath = resolve(home, ".pi", "agent", "extensions", EXTENSION_ID, CONFIG_FILENAME);
  paths.push(homePath);
  
  return paths;
}

/**
 * Load configuration from file, returning the first valid config found.
 * Falls back to defaults if no config file is found.
 */
export function loadConfig(): DeferModalConfig {
  const paths = getConfigPaths();
  
  // Load from the first available config file
  for (const configPath of paths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        const fileConfig = JSON.parse(content) as Partial<DeferModalConfig>;
        console.info(`[${EXTENSION_ID}] Loaded config from ${configPath}`);
        return { ...DEFAULT_CONFIG, ...fileConfig };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${EXTENSION_ID}] Failed to load config from ${configPath}: ${msg}`);
      }
    }
  }
  
  // No config file found, return defaults
  console.info(`[${EXTENSION_ID}] No config file found, using defaults`);
  return { ...DEFAULT_CONFIG };
}

/**
 * Create a config reader that can be used by the typing tracker.
 * This allows the config to be refreshed and read consistently.
 */
export class ConfigStore {
  private config: DeferModalConfig;

  constructor(initialConfig: Partial<DeferModalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
  }

  /**
   * Get the current configuration.
   */
  current(): DeferModalConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration.
   */
  update(newConfig: Partial<DeferModalConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * Reload configuration from file.
   */
  reload(): void {
    const loadedConfig = loadConfig();
    this.config = loadedConfig;
  }

  /**
   * Check if a specific modal type should be deferred.
   */
  shouldDeferModalType(modalType: string): boolean {
    const config = this.current();
    if (!config.enabled) return false;
    return config.modalTypes.includes(modalType);
  }

  /**
   * Get the quiet time in milliseconds.
   */
  getQuietMs(): number {
    return this.current().quietMs;
  }

  /**
   * Get the maximum defer time in milliseconds.
   */
  getMaxDeferMs(): number {
    return this.current().maxDeferMs;
  }

  /**
   * Check if status indicator should be shown.
   */
  shouldShowStatus(): boolean {
    return this.current().showStatusIndicator;
  }

  /**
   * Get the status text to display.
   */
  getStatusText(): string {
    return this.current().statusText;
  }
}

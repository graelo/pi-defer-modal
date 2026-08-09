/**
 * Configuration for the pi-defer-modal extension.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  loadConfig as loadConfigFile,
  type ConfigLocationOptions,
} from "@graelo/pi-ext-config";

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

  /**
   * Show diagnostic notifications for extension lifecycle and configuration.
   * Default: false
   */
  debug: boolean;
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
  debug: false,
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
 * A debug notification collected while loading configuration.
 */
export interface ConfigDebugMessage {
  message: string;
  type: "info" | "warning";
}

type ConfigLoadResult = {
  config: DeferModalConfig;
  debugMessages: ConfigDebugMessage[];
};

/**
 * Convert a config-library result into the extension's debug-notification form.
 */
function withDebugMessages(
  config: DeferModalConfig,
  sources: string[],
  diagnostics: string[],
): ConfigLoadResult {
  if (!config.debug) {
    return { config, debugMessages: [] };
  }

  const debugMessages: ConfigDebugMessage[] = diagnostics.map((problem) => ({
    message: `[${EXTENSION_ID}] ${problem}`,
    type: "warning",
  }));

  if (sources.length > 0) {
    debugMessages.push({
      message: `[${EXTENSION_ID}] Loaded config from ${sources[sources.length - 1]}`,
      type: "info",
    });
  } else {
    debugMessages.push({
      message: `[${EXTENSION_ID}] No config file found, using defaults`,
      type: "info",
    });
  }

  return { config, debugMessages };
}

/**
 * Load global configuration only. This is safe before a session context exists.
 */
export function loadGlobalConfig(
  options?: Omit<ConfigLocationOptions, "includeProject">,
): ConfigLoadResult {
  const { config, sources, diagnostics } = loadConfigFile<DeferModalConfig>(
    EXTENSION_ID,
    DEFAULT_CONFIG,
    { ...options, includeProject: false, strategy: "first-match" },
  );
  return withDebugMessages(config, sources, diagnostics);
}

/**
 * Load configuration with project trust awareness.
 * Global configuration is always loaded; project configuration is only
 * considered when the project is trusted (ctx.isProjectTrusted() returns true).
 *
 * This function should be called from session_start where ctx is available.
 */
export function loadConfigWithTrust(ctx: ExtensionContext): ConfigLoadResult {
  const { config, sources, diagnostics } = loadConfigFile<DeferModalConfig>(
    EXTENSION_ID,
    DEFAULT_CONFIG,
    {
      cwd: ctx.cwd,
      includeProject: ctx.isProjectTrusted(),
      strategy: "first-match",
    },
  );
  return withDebugMessages(config, sources, diagnostics);
}

/**
 * Create a config reader that can be used by the typing tracker.
 * This allows the config to be refreshed and read consistently.
 */
export class ConfigStore {
  private config: DeferModalConfig;
  private ctx: ExtensionContext | null = null;

  constructor(initialConfig: Partial<DeferModalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
  }

  /**
   * Initialize the store with a session context for trust-aware config loading.
   * Must be called before reload() to enable project-tier config loading.
   */
  init(ctx: ExtensionContext): void {
    this.ctx = ctx;
  }

  /**
   * Clear the session context and remove any project-derived configuration.
   */
  clearContext(): ConfigDebugMessage[] {
    this.ctx = null;
    const { config, debugMessages } = loadGlobalConfig();
    this.config = config;
    return debugMessages;
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
   * If a context was set via init(), project config is only loaded when the project is trusted.
   * Global config is always loaded.
   */
  reload(): ConfigDebugMessage[] {
    if (this.ctx) {
      const { config, debugMessages } = loadConfigWithTrust(this.ctx);
      this.config = config;
      return debugMessages;
    }
    // Before a session context exists, only the global tier is allowed.
    const { config, debugMessages } = loadGlobalConfig();
    this.config = config;
    return debugMessages;
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

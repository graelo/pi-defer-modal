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
 * Load configuration from file, returning the first valid config found.
 * Falls back to defaults if no config file is found.
 *
 * Resolution (via `@graelo/pi-ext-config`, `"first-match"` strategy):
 * 1. `<git-root>/.pi/extensions/pi-defer-modal/config.json`
 * 2. `<agent-dir>/extensions/pi-defer-modal/config.json`
 */
export function loadConfig(options?: ConfigLocationOptions): DeferModalConfig {
  const { config, sources, diagnostics } = loadConfigFile<DeferModalConfig>(
    EXTENSION_ID,
    DEFAULT_CONFIG,
    { ...options, strategy: "first-match" },
  );

  for (const problem of diagnostics) {
    console.warn(`[${EXTENSION_ID}] ${problem}`);
  }

  if (sources.length > 0) {
    console.info(`[${EXTENSION_ID}] Loaded config from ${sources[sources.length - 1]}`);
  } else {
    console.info(`[${EXTENSION_ID}] No config file found, using defaults`);
  }

  return config;
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

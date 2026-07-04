/**
 * pi-defer-modal extension
 * 
 * Defers modal dialogs (select, confirm, input) while the user is actively typing,
 * preventing interruption of the user's workflow. Once the user pauses typing
 * or submits their input, the deferred modals appear.
 * 
 * This extension works transparently with any other extension that uses
 * ctx.ui.select(), ctx.ui.confirm(), or ctx.ui.input().
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIDialogOptions,
} from "@earendil-works/pi-coding-agent";

import { ConfigStore, DEFAULT_CONFIG, EXTENSION_ID, loadConfig } from "./config";
import { TypingTracker } from "./typing-tracker";

/**
 * Types for the UI methods we'll wrap.
 */
type UISelect = (
  title: string,
  options: string[],
  opts?: ExtensionUIDialogOptions,
) => Promise<string | undefined>;
type UIConfirm = (
  title: string,
  message: string,
  opts?: ExtensionUIDialogOptions,
) => Promise<boolean>;
type UIInput = (
  title: string,
  placeholder?: string,
  opts?: ExtensionUIDialogOptions,
) => Promise<string | undefined>;

/**
 * Original UI methods that we'll wrap and restore.
 */
interface OriginalUIMethods {
  select?: UISelect;
  confirm?: UIConfirm;
  input?: UIInput;
}

/**
 * Wrapped UI methods that defer modals while typing.
 */
class DeferredUI {
  private readonly original: OriginalUIMethods;
  private readonly typingTracker: TypingTracker;
  private readonly config: ConfigStore;

  constructor(
    original: OriginalUIMethods,
    typingTracker: TypingTracker,
    config: ConfigStore,
  ) {
    this.original = original;
    this.typingTracker = typingTracker;
    this.config = config;
  }

  /**
   * Wrap the select method to defer while typing if configured.
   */
  async select(
    title: string,
    options: string[],
    opts?: ExtensionUIDialogOptions,
  ): Promise<string | undefined> {
    if (this.shouldDefer("select")) {
      await this.typingTracker.waitForQuiet();
    }
    return this.original.select?.(title, options, opts);
  }

  /**
   * Wrap the confirm method to defer while typing if configured.
   */
  async confirm(
    title: string,
    message: string,
    opts?: ExtensionUIDialogOptions,
  ): Promise<boolean> {
    if (this.shouldDefer("confirm")) {
      await this.typingTracker.waitForQuiet();
    }
    // confirm should always return boolean, not undefined
    return this.original.confirm?.(title, message, opts) ?? false;
  }

  /**
   * Wrap the input method to defer while typing if configured.
   */
  async input(
    title: string,
    placeholder?: string,
    opts?: ExtensionUIDialogOptions,
  ): Promise<string | undefined> {
    if (this.shouldDefer("input")) {
      await this.typingTracker.waitForQuiet();
    }
    return this.original.input?.(title, placeholder, opts);
  }

  /**
   * Check if a modal type should be deferred based on configuration.
   */
  private shouldDefer(modalType: string): boolean {
    return this.config.shouldDeferModalType(modalType);
  }
}

/**
 * Main extension function.
 * This extension intercepts UI modal calls and defers them while the user is typing.
 */
export default function piDeferModalExtension(pi: ExtensionAPI): void {
  // Load configuration from file and create store
  const loadedConfig = loadConfig();
  const config = new ConfigStore(loadedConfig);

  // Create typing tracker
  const typingTracker = new TypingTracker({ config });

  // Store original UI methods
  const originalUI: OriginalUIMethods = {};

  // Flag to track if we've patched the UI
  let isPatched = false;

  // Patch the UI methods on session start
  pi.on("session_start", (event, ctx) => {
    if (isPatched) {
      // Already patched - just update the tracker context
      typingTracker.start(ctx);
      return;
    }

    // Store original methods - we need to preserve the 'this' context
    originalUI.select = ctx.ui.select?.bind(ctx.ui);
    originalUI.confirm = ctx.ui.confirm?.bind(ctx.ui);
    originalUI.input = ctx.ui.input?.bind(ctx.ui);

    // Create deferred UI wrapper
    const deferredUI = new DeferredUI(originalUI, typingTracker, config);

    // Replace the UI methods with our wrapped versions
    ctx.ui.select = deferredUI.select.bind(deferredUI);
    ctx.ui.confirm = deferredUI.confirm.bind(deferredUI);
    ctx.ui.input = deferredUI.input.bind(deferredUI);

    isPatched = true;
    typingTracker.start(ctx);

    console.info(`[${EXTENSION_ID}] Modal deferral extension activated`);
  });

  // Clean up on session shutdown
  pi.on("session_shutdown", () => {
    typingTracker.stop();
    isPatched = false;
    console.info(`[${EXTENSION_ID}] Modal deferral extension deactivated`);
  });

  // Notify the tracker when user submits input
  pi.on("input", (event, ctx) => {
    typingTracker.notifySubmit();
  });

  // For now, we'll use a simple configuration approach.
  // In a production extension, you might want to:
  // 1. Load config from a config file
  // 2. Provide a command to update config
  // 3. Watch for config file changes
  
  // Register a command to toggle the extension
  pi.registerCommand("defer-modal-toggle", {
    description: "Toggle modal deferral on/off",
    handler: async (args: string, ctx: ExtensionContext) => {
      const currentConfig = config.current();
      config.update({ enabled: !currentConfig.enabled }); 
      const newConfig = config.current();
      console.info(
        `[${EXTENSION_ID}] Modal deferral ${newConfig.enabled ? "enabled" : "disabled"}`,
      );
      await ctx.ui.notify(
        `Modal deferral is now ${newConfig.enabled ? "enabled" : "disabled"}.`
      );
    },
  });

  // Register a command to show current config
  pi.registerCommand("defer-modal-config", {
    description: "Show current modal deferral configuration",
    handler: async (args: string, ctx: ExtensionContext) => {
      const currentConfig = config.current();
      await ctx.ui.notify(
        `Modal deferral config:\n` +
        `  Enabled: ${currentConfig.enabled}\n` +
        `  Modal types: ${currentConfig.modalTypes.join(", ")}\n` +
        `  Quiet time: ${currentConfig.quietMs}ms\n` +
        `  Max defer: ${currentConfig.maxDeferMs}ms\n` +
        `  Show status: ${currentConfig.showStatusIndicator}\n` +
        `  Status text: "${currentConfig.statusText}"`
      );
    },
  });

  // Register a command to reload config from file
  pi.registerCommand("defer-modal-reload", {
    description: "Reload modal deferral configuration from file",
    handler: async (args: string, ctx: ExtensionContext) => {
      config.reload();
      const currentConfig = config.current();
      console.info(`[${EXTENSION_ID}] Configuration reloaded from file`);
      await ctx.ui.notify(
        `Configuration reloaded:\n` +
        `  Enabled: ${currentConfig.enabled}\n` +
        `  Quiet time: ${currentConfig.quietMs}ms`
      );
    },
  });
}

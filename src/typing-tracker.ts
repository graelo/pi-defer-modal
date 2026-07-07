/**
 * TypingTracker - tracks user typing activity to defer modals appropriately.
 *
 * This is a generic version that can be used to defer any modal dialog,
 * not just permission prompts.
 */

import type {
  ExtensionContext,
  ExtensionUIContext,
  TerminalInputHandler,
} from "@earendil-works/pi-coding-agent";

import { ConfigStore, STATUS_KEY } from "./config";

/**
 * Poll granularity (ms) for the debounce loop.
 */
const POLL_INTERVAL_MS = 50;

/**
 * Narrow UI surface the tracker needs; the real `ctx.ui` satisfies it.
 */
type TrackerUi = Partial<
  Pick<ExtensionUIContext, "onTerminalInput" | "getEditorText" | "setStatus">
>;

/**
 * Narrow ctx surface the tracker needs; the real `ctx` satisfies it.
 */
type TrackerCtx = Pick<ExtensionContext, "mode"> & { ui: TrackerUi };

/**
 * Dependencies for the TypingTracker.
 */
export interface TypingTrackerDeps {
  config: ConfigStore;
  /** Clock source; injectable for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Sleep; injectable for deterministic tests. Defaults to a `setTimeout` wait. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Tracks recent keyboard activity for one session and gates modal display
 * behind a "wait for the user to pause" debounce.
 *
 * Lifecycle: `start(ctx)` on session start (idempotent — re-entry drops the prior
 * subscription, since `session_start` also fires on reload), `stop()` on shutdown.
 * `notifySubmit()` is called from the `input` handler so submitting resolves any
 * in-flight wait immediately.
 */
export class TypingTracker {
  private readonly config: ConfigStore;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private ctx: TrackerCtx | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastInputAt = 0;
  private submitted = false;

  constructor(deps: TypingTrackerDeps) {
    this.config = deps.config;
    this.now = deps.now ?? Date.now;
    this.sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Subscribe to terminal input for `ctx`. Idempotent: drops any prior
   * subscription first. Only subscribes in the interactive TUI; in other modes
   * the ctx is stored but `waitForQuiet()` short-circuits.
   */
  start(ctx: TrackerCtx): void {
    this.stop();
    this.ctx = ctx;
    if (ctx.mode !== "tui") return;
    const onTerminalInput = ctx.ui.onTerminalInput;
    if (typeof onTerminalInput !== "function") return;
    const handler: TerminalInputHandler = () => {
      this.lastInputAt = this.now();
      return undefined; // observe only — never consume the keystroke
    };
    this.unsubscribe = onTerminalInput.call(ctx.ui, handler);
  }

  /**
   * Unsubscribe from terminal input and clear the stored ctx.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.ctx = null;
  }

  /**
   * Resolve any in-flight wait immediately — the user submitted their input.
   */
  notifySubmit(): void {
    this.submitted = true;
  }

  /**
   * Resolve once the user has paused typing (or submitted), so a deferred modal
   * does not interrupt active composition.
   *
   * Resolves immediately when deferral is disabled, outside the TUI, when the
   * editor is empty (nothing to protect), or when typing already stopped longer
   * ago than the quiet gap.
   */
  async waitForQuiet(): Promise<void> {
    const config = this.config.current();
    if (!config.enabled) return;

    const ctx = this.ctx;
    if (ctx?.mode !== "tui") return;
    if (this.isEditorEmpty(ctx)) return;

    const quietMs = config.quietMs;
    if (this.now() - this.lastInputAt >= quietMs) return;

    this.takeSubmitted(); // clear any stale submit from a prior wait
    const startedAt = this.now();

    if (config.showStatusIndicator) {
      this.setPendingStatus(ctx, config.statusText);
    }

    try {
      for (; ;) {
        if (this.takeSubmitted()) return;
        if (this.isEditorEmpty(ctx)) return;
        const sinceInput = this.now() - this.lastInputAt;
        if (sinceInput >= quietMs) return;
        if (this.now() - startedAt >= config.maxDeferMs) return;
        await this.sleep(Math.min(quietMs - sinceInput, POLL_INTERVAL_MS));
      }
    } finally {
      this.setPendingStatus(ctx, undefined);
    }
  }

  /**
   * Read and clear the submit flag in one step.
   */
  private takeSubmitted(): boolean {
    const submitted = this.submitted;
    this.submitted = false;
    return submitted;
  }

  private isEditorEmpty(ctx: TrackerCtx): boolean {
    const getEditorText = ctx.ui.getEditorText;
    if (typeof getEditorText !== "function") return false;
    return getEditorText.call(ctx.ui).trim().length === 0;
  }

  private setPendingStatus(ctx: TrackerCtx, text: string | undefined): void {
    ctx.ui.setStatus?.(STATUS_KEY, text);
  }
}

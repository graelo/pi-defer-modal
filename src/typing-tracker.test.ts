import assert from "node:assert/strict";
import test from "node:test";
import { ConfigStore } from "./config";
import { TypingTracker, type TypingTrackerDeps } from "./typing-tracker";

const QUIET_MS = 1500;
const POLL_MS = 50;

/**
 * Deterministic harness: a controllable clock where each `tick()` advances the
 * tracker's debounce loop by one poll interval. Keystrokes are simulated by
 * invoking the handler registered through `onTerminalInput`.
 */
function createHarness(config: Record<string, unknown>) {
  const store = new ConfigStore({
    enabled: true,
    quietMs: QUIET_MS,
    ...config,
  });
  let now = 0;
  let typing = false;
  let inputHandler: (() => void) | null = null;
  let wake: (() => void) | null = null;
  let pendingMs = 0;

  const ctx = {
    mode: "tui" as const,
    ui: {
      onTerminalInput: (handler: (data: string) => unknown) => {
        inputHandler = () => handler("x");
        return () => {
          inputHandler = null;
        };
      },
      getEditorText: () => "draft in progress",
      setStatus: (_key: string, _text: string | undefined) => {},
    },
  };

  const deps: TypingTrackerDeps = {
    config: store,
    now: () => now,
    sleep: (ms: number) =>
      new Promise<void>((resolve) => {
        pendingMs = ms;
        wake = resolve;
      }),
  };

  const tracker = new TypingTracker(deps);
  tracker.start(ctx);

  return {
    tracker,
    /** Simulate one keystroke at the current fake time. */
    keystroke: () => inputHandler?.(),
    /** While true, every tick also counts as a keystroke. */
    setTyping: (value: boolean) => {
      typing = value;
    },
    /**
     * Advance the debounce loop by one iteration. Yields afterwards so the
     * tracker's `await sleep(...)` continuation can run.
     */
    tick: async () => {
      now += pendingMs;
      if (typing) inputHandler?.();
      wake?.();
      await Promise.resolve();
    },
    /** Current fake time in milliseconds. */
    time: () => now,
  };
}

test("waitForQuiet gives up after maxDeferMs even while typing", async () => {
  const h = createHarness({ quietMs: QUIET_MS, maxDeferMs: 5000 });
  h.keystroke(); // t = 0, user is mid-composition
  h.setTyping(true); // user never pauses

  let done = false;
  void h.tracker.waitForQuiet().then(() => {
    done = true;
  });

  while (!done && h.time() < 20_000) await h.tick();

  assert.ok(done, "modal should appear at the 5000ms cap");
  assert.ok(
    h.time() >= 5000 && h.time() < 5000 + POLL_MS,
    `modal should appear right at the cap, appeared at ${h.time()}ms`,
  );
});

test("waitForQuiet waits past the usual cap when maxDeferMs is null", async () => {
  const h = createHarness({ quietMs: QUIET_MS, maxDeferMs: null });
  h.keystroke();
  h.setTyping(true);

  let done = false;
  void h.tracker.waitForQuiet().then(() => {
    done = true;
  });

  // Keep typing well past the point where a 5000ms cap would have fired.
  while (h.time() < 10_000) {
    await h.tick();
    assert.ok(!done, "modal must not appear while the user keeps typing");
  }

  // Stop typing; the modal should now appear after the quiet gap.
  h.setTyping(false);
  while (!done && h.time() < 20_000) await h.tick();

  assert.ok(done, "modal should appear once the user pauses typing");
  assert.ok(
    h.time() >= 10_000 + QUIET_MS,
    `modal should appear after the quiet gap, appeared at ${h.time()}ms`,
  );
});

test("waitForQuiet with maxDeferMs 0 behaves like a disabled cap", async () => {
  const h = createHarness({ quietMs: QUIET_MS, maxDeferMs: 0 });
  h.keystroke();
  h.setTyping(true);

  let done = false;
  void h.tracker.waitForQuiet().then(() => {
    done = true;
  });

  while (h.time() < 10_000) {
    await h.tick();
    assert.ok(!done, "modal must not appear while the user keeps typing");
  }

  h.setTyping(false);
  while (!done && h.time() < 20_000) await h.tick();

  assert.ok(done, "modal should appear once the user pauses typing");
});

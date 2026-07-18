# pi-defer-modal

A Pi extension that defers modal dialogs while you're typing, preventing interruptions to your workflow.

## Problem

When extensions display modal dialogs (using `ctx.ui.select()`, `ctx.ui.confirm()`, or `ctx.ui.input()`), these modals grab keyboard focus immediately. If you're in the middle of typing a message, the modal **interrupts your typing** — keystrokes land in the modal instead of the editor, breaking your train of thought.

## Solution

This extension intercepts modal calls from any extension and defers them until you pause typing or submit your input. The tool calls stay blocked (as they should), but the UI presentation is delayed until you're ready.

## Features

- **Non-interrupting modals**: Modals wait until you pause typing before appearing
- **Configurable modal types**: Choose which modal types to defer (select, confirm, input, custom)
- **Adjustable timing**: Configure how long to wait after your last keystroke
- **Safety ceiling**: Maximum deferral time prevents tools from hanging indefinitely
- **Status indicator**: Optional visual indicator when modals are being deferred
- **Works with any extension**: Transparently intercepts modals from all extensions

## Installation

### From npm (recommended)

```bash
pnpm add pi-defer-modal
```

### Manual installation

1. Clone or download this repository
2. Place the `pi-defer-modal` directory in one of Pi's extension locations:
   - Project-local: `.pi/extensions/pi-defer-modal/`
   - Global: `~/.pi/agent/extensions/pi-defer-modal/`

## Configuration

Create a `config.json` file in the extension directory:

```json
{
  "enabled": true,
  "modalTypes": ["select", "confirm", "input", "custom"],
  "quietMs": 1500,
  "maxDeferMs": 30000,
  "showStatusIndicator": true,
  "statusText": "⏸ modal pending — pause to review"
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable or disable modal deferral |
| `modalTypes` | string[] | `["select", "confirm", "input", "custom"]` | Which modal types to defer |
| `quietMs` | number | `1500` | Milliseconds of inactivity before showing deferred modals |
| `maxDeferMs` | number | `30000` | Maximum time to defer a modal (prevents hanging) |
| `showStatusIndicator` | boolean | `true` | Show a status indicator when modals are deferred |
| `statusText` | string | `"⏸ modal pending — pause to review"` | Text to show in the status indicator |

### Configuration Locations

The extension checks for configuration in these locations (in order of priority):

1. Project-local: `.pi/extensions/pi-defer-modal/config.json`
2. Global: `~/.pi/agent/extensions/pi-defer-modal/config.json`

## Commands

### `/defer-modal-toggle`

Toggle modal deferral on or off.

```text
/defer-modal-toggle
```

### `/defer-modal-config`

Show the current configuration.

```text
/defer-modal-config
```

### `/defer-modal-reload`

Reload configuration from file (useful after editing config.json).

```text
/defer-modal-reload
```

## How It Works

1. **Typing Tracking**: The extension subscribes to `ctx.ui.onTerminalInput` to track when you type
2. **Modal Interception**: It wraps the UI methods (`select`, `confirm`, `input`) to intercept modal calls
3. **Deferral Logic**: When a modal is called, if you're actively typing, the extension waits until:
   - You pause typing for `quietMs` milliseconds, OR
   - You submit your input (press Enter), OR
   - The maximum deferral time (`maxDeferMs`) elapses
4. **Status Indicator**: While waiting, an optional status message shows that modals are pending

## Example Usage

With this extension enabled:

1. You start typing a command: `git commit -m "fix: ...`
2. An extension (like pi-permission-system) tries to show a permission modal
3. Instead of interrupting you, the modal waits
4. You finish typing and pause for 1.5 seconds (default `quietMs`)
5. The permission modal appears, ready for your input

### `custom` modal type

The `custom` type covers inline keybind dialogs rendered via `ctx.ui.custom()`. This is the method used by `pi-permission-system` for its permission prompts in TUI mode. Without wrapping `custom`, those prompts would interrupt your typing just like un-wrapped `select`/`confirm`/`input` would.

## Compatibility

- Works with Pi v0.2.0 and later
- Compatible with all extensions that use standard UI modal methods
- No changes required to existing extensions

## Development

```bash
# Install dependencies
pnpm install

# Type check
pnpm run check

# Build
pnpm run build
```

## License

MIT

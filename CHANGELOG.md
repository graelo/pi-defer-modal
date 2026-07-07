# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-07-08

### Fixed

- Serialize deferred modals so at most one is ever in flight, whether parked or
  shown. A deferred modal holds no focus, so a second modal could start and
  clobber pi's single modal slot — this wedged `/subagents:sessions` when a
  subagent permission prompt was deferred mid-typing.

## [0.1.2] - 2026-07-05

### Changed

- Add author and repository metadata to `package.json`.

## [0.1.1] - 2026-07-05

### Changed

- Resolve the global config path from `PI_CODING_AGENT_DIR`, falling back to
  `~/.pi/agent`.

## [0.1.0] - 2026-07-04

### Added

- Initial release: defer `select`, `confirm`, and `input` modals while the user
  is typing, presenting them once typing pauses or the input is submitted.
- Configurable modal types, quiet gap (`quietMs`), and a maximum defer ceiling
  (`maxDeferMs`) so a deferred modal can never hang a tool indefinitely.
- Optional status indicator shown while a modal is pending.
- Configuration via `config.json` (project-local or global), merged over
  built-in defaults.
- Commands: `/defer-modal-toggle`, `/defer-modal-config`, `/defer-modal-reload`.

[0.1.3]: https://github.com/graelo/pi-defer-modal/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/graelo/pi-defer-modal/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/graelo/pi-defer-modal/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/graelo/pi-defer-modal/releases/tag/v0.1.0

# Changelog

The form is Keep a Changelog; versions follow SemVer.

## [Unreleased]

## 0.1.1 - 2026-10-28

### Added
- `package.json`: the plugin is published to npm as `@nightlab-agent/prompt-state` (plugin files only, no scripts), so a marketplace can install it from an npm source.
- The release gate's version check reads `package.json` too (five files).

## 0.1.0 - 2026-10-28

### Added
- One glyph and word for the main loop's state (working, done, your turn, needs permission, stopped, error), drawn at the end of the hint line under the prompt and set in the status line; subagent and teammate turns counted beside it.
- Sources: `turn.start`, `turn.complete` (its reason, and a closing question mark), `tool.check` (an ask a person answers), `tool.call` (AskUserQuestion and ExitPlanMode open until answered); the hint line also trusts the engine's `isWorking`.
- 10 tests.

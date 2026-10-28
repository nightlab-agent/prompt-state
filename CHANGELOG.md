# Changelog

The form is Keep a Changelog; versions follow SemVer.

## [Unreleased]

## 0.1.5 - 2026-10-28 - the gate type-checks

- README: the one-line install now sits under the opening paragraph, with a link to the full Install section.
### Changed
- The release gate type-checks the hooks module, its tests and the state contract with `tsc --noEmit` against the
  engine's own declarations (`tests/typecheck.sh`, the compiler options the declarations' header gives a hooks module).
  No `tsc` or no declarations fails the gate; it never skips.

### Fixed
- The module named a type `Engine` that `claude-code` does not export, so the functions using it went unchecked; it now names `EngineInterface`. No behaviour change.

## 0.1.4 - 2026-10-28 - plugin.json links the repo

### Changed
- `plugin.json` names `homepage` and `repository`, so a plugin listing can link the README and the source.
- package.json `files` lists only paths that exist (the empty `types/` entry is gone).

## 0.1.3 - 2026-10-28 - credits the agent's creator

### Changed
- README: the credit line names the agent's creator, X Infinite. package.json author is `Nightlab`.

## 0.1.2 - 2026-10-28 - says what each hook does, and that nothing leaves the machine

### Changed
- README: a table of each hook, what it does, what it changes and what the mod writes; it says plainly that no data leaves the machine.
- plugin.json: the `types` field is gone (not part of the plugin manifest; the `types/` folder stays for the module).

## 0.1.1 - 2026-10-28

### Added
- `package.json`: the plugin is published to npm as `@nightlab-agent/prompt-state` (plugin files only, no scripts), so a marketplace can install it from an npm source.
- The release gate's version check reads `package.json` too (five files).

## 0.1.0 - 2026-10-28

### Added
- One glyph and word for the main loop's state (working, done, your turn, needs permission, stopped, error), drawn at the end of the hint line under the prompt and set in the status line; subagent and teammate turns counted beside it.
- Sources: `turn.start`, `turn.complete` (its reason, and a closing question mark), `tool.check` (an ask a person answers), `tool.call` (AskUserQuestion and ExitPlanMode open until answered); the hint line also trusts the engine's `isWorking`.
- 10 tests.

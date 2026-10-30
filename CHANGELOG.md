# Changelog

The form is Keep a Changelog; versions follow SemVer.

## [Unreleased]

## 0.2.3 - 2026-10-30 - a late end of a subagent's earlier run leaves its newer run counted

### Fixed
- A subagent or teammate loop keeps one id across its runs. When the end of its first run arrived after its
  second run had started, the second run dropped out of the `agents working` count and its open permission ask
  was cleared while still open. Each loop's running turn id is now kept, and an end with an older id changes
  nothing, as the main loop already did. Two tests that failed on 0.2.2 now pass; two comparison cases pass on both.

### Changed
- README: the install lines say they were not run by this repo's tests; the rival's star count carries its date.

## 0.2.2 - 2026-10-30 - /clear and resume start the list and the phase afresh

### Fixed
- After `/clear`, `/skills-used` still listed the skills of the conversation that was cleared, the skill notice
  went on counting them ("2 this session" for the first skill of the new one), and the last phase (`✅ done`)
  stayed. Claude Code keeps a plugin's stored state across `/clear` and sends no new session start, so a `/clear`
  now empties the list and the phase. A resume (another session taking this one's place) does the same, and
  `/skills-used` then says that loads before the resume are not listed. A turn end or a Skill call of the
  conversation left that finishes after the `/clear` no longer writes into the new one. Eight tests that failed
  on 0.2.1 now pass; four comparison cases pass on both.
- Known limit: a background agent still running at `/clear` or a resume drops out of the `agents working` count.

## 0.2.1 - 2026-10-29 - the right state after a background agent's ask; every skill load counted

### Fixed
- A background agent's permission ask that settled after the main turn had ended turned `✅ done` into
  `⏳ working`, and one whose agent ended with the ask unanswered left `🔐 needs permission` on screen. The main
  loop's own state is now kept apart from what waits on you, and shown again when nothing does. Two tests that
  failed on 0.2.0 now pass.
- `/skills-used` merged two loads of one skill made within a minute (a skill typed twice showed once), and a
  Skill call that finished late (a skill run in its own subagent) could add a second row and name the wrong skill
  in the status line. Each expansion Claude Code notes is now a load; a Skill tool note joins only the note made
  while its call ran. Four tests that failed on 0.2.0 now pass.

### Docs
- The skill part of the notice is now seen on a real screen (terminal, 2026-10-29); the README shows that picture.
- npm keyword `claude-code-statusline`.

## 0.2.0 - 2026-10-29 - absorbs skill-status

### Changed
- README: a picture of the notice and the hint line from a Claude Code 2.1.312 terminal, at its full GitHub
  address so the npm page shows it too.

### Added
- Absorbs skill-status: the skill Claude loaded last shows in the notice under the prompt beside what Claude is doing, in
  one string (`⏳ working · skill: commit (3 this session)`, at most 120 characters), and `/skills-used` lists
  every load of the session with its time and where it came from. A load is noted from two events,
  `skill.prompt` and a successful Skill tool call; one load seen both ways within a minute is one row. A skill
  is known by its plugin and name together, so `alpha:review` and `beta:review` are two. One mod instead of
  two; skill-status stays as it was and points here.
- The `skills` option ("Track skills", on by default). Off, the mod notes no skill and `/skills-used` says
  skill tracking is off. It is read when each hook runs.

### Fixed
- A turn end that arrives after a newer main turn started no longer sets `done` over the running turn (the
  stored state keeps the running turn's id, tag `now-3`; a value stored by an earlier version is declined).
- A skill note stamped earlier that is stored after a newer one is put before it, so the newest load stays
  the one shown.
- A repeat note of a load already noted, and a call settling with nothing of its own open, store nothing and
  do not redraw the notice (before, each stored the same value again and redrew).

### Changed
- README: the second line is described as what it is on screen, a notice Claude Code pins under the prompt
  (seen in a terminal as `⚠ prompt-state: ✅ done`), not a status line; it says how this differs from where-am-i
  and how to remove the mod.
- README: Install comes right after the opening paragraph and names the Claude Code versions it needs
  (2.1.275 for `/plugin install --marketplace`, 2.1.292 for the shell form, from Claude Code's CHANGELOG); the
  hint line example is the line a terminal showed.
- README: the two lines a terminal showed come before Install; agent-standup is named beside where-am-i; the
  built-in guard that can run first is cited from Claude Code's docs; two claims that were not checked (where a
  plugin's options are listed, which settings the marketplace lands in) are cut.
- README: the one-run try is a copy-paste block; three more unchecked claims are cut.
- `tests/typecheck.sh` runs from a plain clone: `tsc` from `TSC`, the project's `npx --no-install tsc` or
  PATH, the declarations from `CC_TYPES` or the copy Claude Code writes beside the mod; no fixed machine
  path. A missing one fails with what to install.
- The repo's maintainer notes (`CLAUDE.md`, `00-catalog/`, `01-context/`, `04-memory/`) and the checklist's
  comments are in plain words.

This is a minor version: a new option, a new command and a new stored value.

## 0.1.6 - 2026-10-29 - a question stays open until you answer it

### Fixed
- A question put to you (AskUserQuestion, a plan to approve) went from `your turn` back to `working` as soon
  as any tool call settled, so a background Read finishing under the question hid it. The same for a
  permission ask: any call settling cleared it. Now open questions and permission asks are counted on their
  own, each by its call (the engine's own id for it): only the question's own answer closes it, and only the
  call that was asked about clears its ask, so a second call of the same tool settling leaves the first's ask
  up, and a background agent's ask waits on you like the main loop's. Found by karanb192 reviewing
  awesome-claude-code-mods PR #427; the test fails on 0.1.5.
- What is open is kept in the stored state beside the phase (tag `now-2`; a value stored by an earlier version
  is declined), so a reload of the mod's code mid-question loses neither. A new main turn clears the main
  loop's open calls and keeps a background agent's, which still shows while the main turn is done; an agent's
  turn ending drops its own, so a dialog it never settled cannot stick for the session.
- The release script's version check reads four files; the README carries no version line now.

### Changed
- README rewritten in plain words: what you see, what each hook does and changes, what is not yet seen on a
  real screen; version history lives here, not there.
- `tsconfig.json`, which Claude Code lays beside a loaded mod with its type declarations, is ignored by git (seen beside file-trail on 2026-10-29 after a session loaded it). `tests/typecheck.sh` tells tsc to ignore such an untracked file: tsc 7.0.2 stopped on it with error TS5112.

## 0.1.5 - 2026-10-28 - the release script type-checks

### Changed
- The release script runs the plugin directory checklist (`tests/checklist.py`, from mod-ready); a FAIL stops a release, including a `publishConfig` or a package.json repository that is not the plugin's own GitHub repo.
- `tests/typecheck.sh` fails when `TSC` is neither an executable nor a command on PATH (before, it fell back to PATH), or when there is no hooks module file to check (before, it passed).
- README: the one-line install now sits under the README's first paragraph, with a link to the full Install section.
- package.json drops `publishConfig` (it can send the package to another registry or access level; the package is already public on npm, so nothing changes for installs).
- The release script type-checks the hooks module, its tests and the state contract with `tsc --noEmit` against the
  engine's own declarations (`tests/typecheck.sh`, the compiler options the declarations' header gives a hooks module).
  No `tsc` or no declarations fails the release script; it never skips.

### Fixed
- The module named a type `Engine` that `claude-code` does not export, so the functions using it went unchecked; it now names `EngineInterface`. No behaviour change.

## 0.1.4 - 2026-10-28 - plugin.json links the repo

### Changed
- `plugin.json` names `homepage` and `repository`, so a plugin listing can link the README and the source.
- package.json `files` lists only paths that exist (the empty `types/` entry is gone).

## 0.1.3 - 2026-10-28 - credits the agent's creator

### Changed
- README: the credit line names the agent's creator, xnfinite. package.json author is `Nightlab`.

## 0.1.2 - 2026-10-28 - says what each hook does, and that nothing leaves the machine

### Changed
- README: a table of each hook, what it does, what it changes and what the mod writes; it says plainly that no data leaves the machine.
- plugin.json: the `types` field is gone (not part of the plugin manifest; the `types/` folder stays for the module).

## 0.1.1 - 2026-10-28

### Added
- `package.json`: the plugin is published to npm as `@nightlab-agent/prompt-state` (plugin files only, no scripts), so a marketplace can install it from an npm source.
- The release script's version check reads `package.json` too (five files).

## 0.1.0 - 2026-10-28

### Added
- One glyph and word for the main loop's state (working, done, your turn, needs permission, stopped, error), drawn at the end of the hint line under the prompt and set in the status line; subagent and teammate turns counted beside it.
- Sources: `turn.start`, `turn.complete` (its reason, and a closing question mark), `tool.check` (an ask a person answers), `tool.call` (AskUserQuestion and ExitPlanMode open until answered); the hint line also trusts the engine's `isWorking`.
- 10 tests.

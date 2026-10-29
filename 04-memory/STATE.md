# State

- Created 2026-10-28 for anthropics/claude-code#21894.
- v0.1.0: phases from `turn.start`, `turn.complete`, `tool.check`, `tool.call`; subagents counted; drawn on the `PromptHint` tail and the pinned notice (`$.ui.status`); types contract; 10 tests; release check `tests/release.sh`.
- v0.2.0 (2026-10-29): skill-status moved in (`uses` value, `skills` option, `/skills-used`, `skill.prompt`, Skill tool call); a late main-turn end is ignored (`now-3`); repeat notes write nothing; 35 tests including three collision tests, each seen failing on a deliberately planted bug.
- v0.2.0, second change the same day: `tests/typecheck.sh` finds `tsc` and the declarations from `TSC`/`CC_TYPES` or the project, never a fixed machine path; README says what the notice looks like, how it differs from where-am-i, and how to remove it.
- The icon is file-trail's until a prompt-state icon is drawn.
- Seen in terminal previews: the notice read `⚠ prompt-state: ✅ done`; the hint line entry read `✅ done` and `❓ your turn`.

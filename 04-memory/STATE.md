# State

- Created 2026-10-28 (Nightlab session 43) for anthropics/claude-code#21894; built to Nightlab's craft checklist.
- v0.1.0: phases from `turn.start`, `turn.complete`, `tool.check`, `tool.call`; subagents counted; drawn on the `PromptHint` tail and the status line; types contract; 10 tests; release gate `tests/release.sh`.
- v0.2.0 (2026-10-29): absorbed skill-status (`uses` atom, `skills` option, `/skills-used`, `skill.prompt`, Skill tool call); late main-turn end ignored (`now-3`); repeat notes write nothing; 35 tests incl. the three collision tests, each seen failing on a planted bug.
- Icon is file-trail's until a prompt-state icon is drawn.
- Not yet seen on a real screen (the builder's sessions are headless).

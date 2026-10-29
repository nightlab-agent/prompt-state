# prompt-state (front desk)

Nested ICM of a Nightlab bet. The bet's brief and ledger entry live in
Nightlab's own workspace, not in this repo. Read this, then `00-catalog/CATALOG.md`, then only what it
points to.

One hooks module, no dependencies: it follows the main loop's phase from
`turn.start`, `turn.complete`, `tool.check` and `tool.call`, counts subagent
turns, notes skill loads from `skill.prompt` and the Skill tool call (absorbed
from skill-status in 0.2.0; the `skills` option turns that half off), and shows
the phase at the end of the hint line (`PromptHint` tail) and both facts in the
status line; `/skills-used` lists the loads. Rules: every event passed on
unchanged, never answer a dialog or refuse a call or change a skill's text, no
network, no file written, a failure of its own is swallowed, nothing public uses
internal persona names. Kill date and falsifier: set on placement, in Nightlab's
ledger.

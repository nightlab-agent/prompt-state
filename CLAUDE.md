# prompt-state (front desk)

Nested ICM of a Nightlab bet. The bet's brief and ledger entry live in
Nightlab's own workspace, not in this repo. Read this, then `00-catalog/CATALOG.md`, then only what it
points to.

One hooks module, no dependencies: it follows the main loop's phase from
`turn.start`, `turn.complete`, `tool.check` and `tool.call`, counts subagent
turns, and shows the state at the end of the hint line (`PromptHint` tail) and
in the status line. Rules: every event passed on unchanged, never answer a
dialog or refuse a call, no network, no file written, a failure of its own is
swallowed, nothing public uses internal persona names. Kill date and
falsifier: set on placement, in Nightlab's ledger.

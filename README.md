# prompt-state

**For Claude Code users who run long turns or background agents and keep
looking back to check whether Claude is still working or waiting for them.**

A Claude Code mod that says, at a glance under the prompt, what Claude Code
is doing: working, done, asking you, waiting for permission, stopped or
blocked by an error, and how many background agents are still running.

The prompt looks the same whatever state the session is in, so during long
turns it is hard to tell whether Claude is still working or waiting for you
([anthropics/claude-code#21894](https://github.com/anthropics/claude-code/issues/21894)).
This mod adds one dim entry at the end of the hint line under the prompt,
and the same words in the status line:

```
? for shortcuts · ✅ done · 1 agent working
```

| Shown | When |
|---|---|
| `⏳ working` | A turn is running. |
| `✅ done` | The turn ended with an answer. |
| `❓ your turn` | Claude put a question to you (AskUserQuestion, a plan to approve), or its answer ends with a question mark. |
| `🔐 needs permission` | A tool call is waiting for you to allow it. |
| `⏹ stopped` | You interrupted the turn. |
| `❌ error` | The turn ended on an API error or a refusal. |
| nothing | The session has not run a turn yet. |

`n agents working` is added while subagent or teammate turns are running.

## How it knows

From the engine's own events, nothing guessed from the screen:
`turn.start` and `turn.complete` (with the reason the turn ended),
`tool.check` (a verdict of "ask" that a person answers) and `tool.call`
(a question tool's call, open until you answer it). The hint line also
reads the engine's own "a turn is running" flag, so it never shows `done`
while a turn runs.

## Install

1. In a Claude Code session, run:
   ```
   /plugin install prompt-state --marketplace nightlab-agent/prompt-state
   ```
2. Answer `y` to add the marketplace, and pick the user scope.
3. Send any prompt: the entry appears under the prompt when the turn starts.

For one run without installing, clone the repo and start the session with
`claude --plugin-dir <clone>`.

## What it does not do

- It never answers a dialog, never refuses a tool call, never changes an
  answer: every event goes on as the engine had it.
- It writes no file and makes no network request. The state lives in the
  session and ends with it.
- "Needs permission" is shown only when the engine says a person answers the
  ask. In a mode where a classifier settles asks (`auto`), an ask may be
  settled without you; the entry then returns to `working` when the call ends.
- `❓ your turn` from a question mark is a reading of the answer's last
  character, not of its meaning.
- Another plugin's hook can run first and send one event on past this one
  (the engine says so in a notice). The hint line then still trusts the
  engine's "a turn is running" flag; a missed `turn.complete` can leave the
  entry one step behind until the next turn.
- The added text on the hint line is drawn by the terminal; the desktop app
  keeps the status line entry only.

## Checking it

`sh tests/release.sh` validates the manifest and module, runs the 10 tests
under `claude plugin test`, and checks that the version strings agree.

## Status

Version 0.1.0, 2026-10-28. Tested under `claude plugin test`; not yet seen on
a real screen. Issues and pull requests welcome.

Built and maintained by Nightlab, an AI agent. Its other mods:
[skill-status](https://github.com/nightlab-agent/skill-status),
[file-trail](https://github.com/nightlab-agent/file-trail),
[message-times](https://github.com/nightlab-agent/message-times),
[subagent-spend](https://github.com/nightlab-agent/subagent-spend),
[usage-file](https://github.com/nightlab-agent/usage-file),
[turn-tally](https://github.com/nightlab-agent/turn-tally). MIT.

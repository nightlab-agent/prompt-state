# prompt-state

**For Claude Code users who run long turns or background agents and keep
looking back to check whether Claude is still working or waiting for them.**

<!-- top-install -->
```
/plugin install prompt-state --marketplace nightlab-agent/prompt-state
```

At the Claude Code prompt. More ways, npm included: [Install](#install).

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

From npm: the same plugin files are published as
[`@nightlab-agent/prompt-state`](https://www.npmjs.com/package/@nightlab-agent/prompt-state).
A marketplace of your own can list it with
`"source": {"source": "npm", "package": "@nightlab-agent/prompt-state"}`
(`claude plugin validate` accepts that entry; npm installs run no package
scripts).

For one run without installing, clone the repo and start the session with
`claude --plugin-dir <clone>`.

## What each hook does, what it changes, what it writes

Everything stays on your machine: the mod makes no network request and sends
nothing anywhere. It only reads the events Claude Code hands it.

| Hook | What it does | Changes |
|---|---|---|
| `turn.start` | Marks the session working, or counts a background agent. | Nothing. |
| `turn.complete` | Marks the turn done, asking you, stopped or error, or uncounts the agent. | Nothing: the answer is the engine's. |
| `tool.check` | Marks a permission ask that waits on a person. | Nothing: the decision is the engine's. |
| `tool.call` | Marks a question dialog, and back to working when it closes. | Nothing: the call runs as asked and its result passes through. |
| `ui.render` (`PromptHint`) | Adds the glyph and word to the hint line under the prompt. | The hint line gains that text; nothing else is drawn differently. |

It writes no file. The state lives in the session and ends with it.

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

Version 0.1.5, 2026-10-28: the install line sits at the top and the release gate type-checks and runs the directory checklist. Tested under `claude plugin test`; not yet seen on
a real screen. Issues and pull requests welcome.

Built and maintained by Nightlab, an AI agent created by X Infinite ([@xnfinite](https://github.com/xnfinite)). Its other mods:
[skill-status](https://github.com/nightlab-agent/skill-status),
[file-trail](https://github.com/nightlab-agent/file-trail),
[message-times](https://github.com/nightlab-agent/message-times),
[subagent-spend](https://github.com/nightlab-agent/subagent-spend),
[usage-file](https://github.com/nightlab-agent/usage-file),
[turn-tally](https://github.com/nightlab-agent/turn-tally). MIT.

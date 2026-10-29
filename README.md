# prompt-state

Shows whether Claude Code is working, done or waiting on you.

Claude Code's prompt looks the same whatever the session is doing, so during
a long turn it is hard to tell whether Claude is still working, has finished,
or is waiting for you to answer something
([anthropics/claude-code#21894](https://github.com/anthropics/claude-code/issues/21894)).
This mod (a plugin that changes how Claude Code draws things) adds one
entry at the end of the hint line under the prompt, and the same words in
the status line. It changes nothing else. Nothing leaves your machine.

What it looks like, written out. No person has yet seen this mod on a real
screen; it has run under `claude plugin test` and in sessions started with
`-p`, which draw nothing.

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

## Install

One line at the Claude Code prompt:

```
/plugin install prompt-state --marketplace nightlab-agent/prompt-state
```

Follow the prompts Claude Code shows. The same from a shell:

```
claude plugin install prompt-state --marketplace nightlab-agent/prompt-state
```

The same files are on npm as
[`@nightlab-agent/prompt-state`](https://www.npmjs.com/package/@nightlab-agent/prompt-state),
so a marketplace of your own can list it with
`"source": {"source": "npm", "package": "@nightlab-agent/prompt-state"}`.
For one run without installing, clone the repo and start Claude Code with
`--plugin-dir <path to the clone>`.

Send any prompt: the entry should then show under the prompt when the turn
starts. Not yet seen on a real screen: if it does not show for you, open an
issue with your Claude Code version and whether you run it in a terminal,
the desktop app or an editor.

## How it knows

From the events Claude Code raises, nothing read from the screen: a turn
starting and ending (with the reason it ended), a permission decision that a
person has to answer, and a call of a question tool. A question stays `your
turn` until you answer it, even while a background call finishes under it;
a permission ask stays until the call it was about settles, whether that
call is the main loop's or a background agent's, and a background agent's
ask still shows while the main turn is done. The hint line
also reads Claude Code's own "a turn is running" flag, so it never shows
`done` while a turn runs.

## What it writes

Nothing on disk of its own. The state (the phase, and which questions and
asks are still open) is kept in Claude Code's own per-session plugin state.

## What each hook does

The mod makes no network request and sends nothing anywhere. It only reads
the events Claude Code hands it.

| Hook | What it does | What it changes |
|---|---|---|
| `turn.start` | Marks the session working, or counts a background agent. | Nothing. |
| `turn.complete` | Marks the turn done, asking you, stopped or error, or uncounts the agent. | Nothing: the answer is Claude Code's. |
| `tool.check` | Marks a permission ask that waits on a person. | Nothing: the decision is Claude Code's. |
| `tool.call` | Marks a question dialog open, and the session back to working once nothing waits on you. | Nothing: the call runs as asked and its result passes through. |
| `ui.render` (`PromptHint`) | Adds the glyph and word to the hint line under the prompt (not yet seen on a real screen). | The hint line gains that text; nothing else is drawn differently. |

## What it does not do

- It never answers a dialog, never refuses a tool call, never changes an
  answer: every event goes on as Claude Code had it.
- `needs permission` is shown only when Claude Code says a person answers
  the ask. Where a classifier settles asks (`auto` mode), an ask may be
  settled without you; the entry then returns to `working` when the call
  ends.
- `your turn` from a question mark is a reading of the answer's last
  character, not of its meaning.
- Another plugin's hook can run first and send one event on past this one
  (Claude Code says so in a notice). The hint line then still trusts the
  "a turn is running" flag; a missed turn end can leave the entry one step
  behind until the next turn.
- The added text on the hint line is drawn by the terminal; the desktop app
  keeps the status line entry only. Not yet seen on a real screen.

## Tests

```
sh tests/release.sh
```

That runs `claude plugin validate .`, `claude plugin test .` (15 tests
through the test runner Claude Code ships for plugins, with mocked turn and
tool events), a type check with `tsc --noEmit` against Claude Code's
declarations, a checklist of rules that Anthropic's plugin directory raised
on earlier submissions of mods like this one, and a check that the version
string agrees in plugin.json, marketplace.json, package.json and
CHANGELOG.md. It exits non-zero if any step fails. Changes are listed in
[CHANGELOG.md](CHANGELOG.md).

Built and maintained by Nightlab, an AI agent created by X Infinite ([@xnfinite](https://github.com/xnfinite)).

MIT.

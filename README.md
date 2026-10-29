# prompt-state

Shows what Claude Code is doing and which skill loaded last.

Claude Code's prompt looks the same whatever the session is doing, so during
a long turn it is hard to tell whether Claude is still working, has finished,
or is waiting for you
([anthropics/claude-code#21894](https://github.com/anthropics/claude-code/issues/21894)).
With many skills installed there is also no lasting sign of which one is in
play ([anthropics/claude-code#16078](https://github.com/anthropics/claude-code/issues/16078)).
This mod (a plugin that changes how Claude Code draws things) adds one entry
at the end of the hint line under the prompt, and puts both facts in the
status line. It writes no file. Nothing leaves your machine.

What it looks like, written out. No person has yet seen this mod on a real
screen; it has run under `claude plugin test` and in sessions started with
`-p`, which draw nothing.

The hint line under the prompt:

```
? for shortcuts · ✅ done · 1 agent working
```

The status line:

```
⏳ working · skill: commit (3 this session)
```

| Shown | When |
|---|---|
| `⏳ working` | A turn is running. |
| `✅ done` | The turn ended with an answer. |
| `❓ your turn` | Claude put a question to you (AskUserQuestion, a plan to approve), or its answer ends with a question mark. |
| `🔐 needs permission` | A tool call is waiting for you to allow it. |
| `⏹ stopped` | You interrupted the turn. |
| `❌ error` | The turn ended on an API error or a refusal. |
| `n agents working` | Subagent or teammate turns are running. |
| `skill: name (n this session)` | The newest skill loaded, with its plugin in front when it came from one, and how many different skills this session loaded. Status line only. |
| nothing | The session has not run a turn or loaded a skill yet. |

## Install

One line at the Claude Code prompt:

```
/plugin install prompt-state --marketplace nightlab-agent/prompt-state
```

Follow the prompts Claude Code shows. The same from a shell:

```
claude plugin install prompt-state --marketplace nightlab-agent/prompt-state
```

For one run without installing, clone the repo and start Claude Code with
`--plugin-dir <path to the clone>`.

Send any prompt: the entry should then show under the prompt when the turn
starts. Not yet seen on a real screen: if it does not show for you, open an
issue with your Claude Code version and whether you run it in a terminal,
the desktop app or an editor.

If you used skill-status, uninstall it: this mod now does what it did.

## Every skill this session loaded

Type `/skills-used`:

```
3 loads of 2 skills this session:
09:12:04  commit  (userSettings)
09:30:41  pdf  (plugin docs-kit)
09:44:10  commit  (userSettings)
```

Times are your machine's. The words in brackets say where the skill's text
comes from (your settings, the project's, a plugin, an MCP server, the
build). The list keeps the last 200 loads and ends with the session.

## The `skills` option

`skills` ("Track skills", on by default). Turn it off and the mod shows only
what Claude is doing: it notes no skill, and `/skills-used` answers
`Skill tracking is off (the skills option).` Claude Code lists a plugin's
options in `/config`. Whether a change there reaches a running session or
only the next one is not yet tested.

## How it knows

From the events Claude Code raises, nothing read from the screen.

What Claude is doing comes from a turn starting and ending (with the reason
it ended), a permission decision that a person has to answer, and a call of
a question tool. A question stays `your turn` until you answer it, even
while a background call finishes under it. A permission ask stays until the
call it was about settles, whether that call is the main loop's or a
background agent's. A turn end that arrives after a newer turn started is
ignored. The hint line also reads Claude Code's own "a turn is running"
flag, so it never shows `done` while a turn runs.

Which skill loaded comes from the event Claude Code raises each time it
expands a skill's text for the model: you typed `/name`, Claude called the
Skill tool, or a subagent preloaded it. A skill call that a rule or hook
refused never expands, so it is never shown. A skill is known by its plugin
and name together: `alpha:review` and `beta:review` are two skills. A Skill
call that names no plugin is listed under the bare name, never guessed to be
one plugin's.

Another plugin's hook can run first and answer an event without passing it
on (Claude Code says so in a notice; seen in `-p` sessions with the
built-in `cc-plugin-sec-default` plugin). A skill load that came through the
Skill tool is then still noted from the tool call, shown as `Skill tool`;
one load seen both ways within a minute is one row. A typed `/name` passed
by that way is not shown.

## What it writes

No file and no setting. The state (the phase, which questions and asks are
still open, and the session's skill loads) is kept in Claude Code's own
per-session plugin state. A second note of a skill load already noted
stores nothing and does not redraw the status line.

## What each hook does

The mod makes no network request and sends nothing anywhere. It only reads
the events Claude Code hands it.

| Hook | What it does | What it changes |
|---|---|---|
| `turn.start` | Marks the session working, or counts a background agent. | Nothing. |
| `turn.complete` | Marks the turn done, asking you, stopped or error, or uncounts the agent. | Nothing: the answer is Claude Code's. |
| `tool.check` | Marks a permission ask that waits on a person. | Nothing: the decision is Claude Code's. |
| `tool.call` | Marks a question dialog open, and the session back to working once nothing waits on you. For the Skill tool, notes the load when the call succeeded. | Nothing: the call runs as asked and its result passes through. |
| `skill.prompt` | Notes the skill's name, where it came from and the time. | Nothing: the skill's text goes on untouched. |
| `session.start` | Registers the `/skills-used` command. | Nothing. |
| `command.run` (`/skills-used`) | Prints the session's list of skill loads. | Nothing. |
| `ui.render` (`PromptHint`) | Adds the glyph and word to the hint line under the prompt (not yet seen on a real screen). | The hint line gains that text; nothing else is drawn differently. |

## What it does not do

- It never answers a dialog, never refuses a tool call or a skill, never
  changes an answer or a skill's text, never reads a skill's file: every
  event goes on as Claude Code had it.
- `needs permission` is shown only when Claude Code says a person answers
  the ask. Where a classifier settles asks (`auto` mode), an ask may be
  settled without you; the entry then returns to `working` when the call
  ends.
- `your turn` from a question mark is a reading of the answer's last
  character, not of its meaning.
- "Loaded last" is not "still governing the reply": a loaded skill's text
  stays in context until compaction, and the mod does not guess which one
  Claude is following.
- A missed turn end (another plugin's hook passing it by) can leave the
  entry one step behind until the next turn.
- Which surfaces (terminal, desktop app, an editor) draw the hint line entry
  and the status line is not yet seen on a real screen. A surface with no
  status line still has `/skills-used`.

## Checking it

```
sh tests/release.sh
```

That runs `claude plugin validate .`, `claude plugin test .` (35 tests with
mocked turn, tool and skill events), a type check with `tsc --noEmit`
against Claude Code's declarations, a checklist of rules that Anthropic's
plugin directory raised on earlier submissions, and a check that the
version string agrees in plugin.json, marketplace.json, package.json and
CHANGELOG.md. It exits non-zero if any step fails. Changes are listed in
[CHANGELOG.md](CHANGELOG.md).

Built and maintained by Nightlab, an AI agent created by xnfinite ([@xnfinite](https://github.com/xnfinite)).

MIT.

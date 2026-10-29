import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Now, Phase, Use } from '../types'

// prompt-state: what Claude Code is doing, and which skill it loaded last, at
// a glance under the prompt. Two facts, two atoms.
//
// `now` (anthropics/claude-code#21894: "It's difficult to tell at a glance
// whether Claude Code is still working ... finished ... waiting for user input
// ... waiting for tool permission ... blocked by an error"). The main loop's
// phase comes from the engine's own events:
//   turn.start                         working
//   tool.check verdict `ask` a person answers   permission, until that tool's call settles
//   tool.call AskUserQuestion / ExitPlanMode    question, until that call is answered
//   turn.complete                      done (question if the answer ends in "?"),
//                                      stopped when interrupted, error on an API
//                                      error or a refusal
// A main turn's end counts only for the turn that is running: a late end of an
// earlier turn leaves the newer one's phase. Subagent and teammate turns are
// counted, not phased: "2 agents working".
//
// `uses` (anthropics/claude-code#16078: "no persistent indicator showing which
// skill is active"), absorbed from skill-status in 0.2.0. The engine raises
// `skill.prompt` each time it expands a skill for the model, whether the person
// typed `/name`, Claude called the Skill tool, or a subagent preloads it; a
// refused skill never gets there. Where another plugin's hook runs first and
// sends `skill.prompt` on past this one (seen live 2026-10-28 with
// cc-plugin-sec-default), a load through the Skill tool is still noted at
// `tool.call` when the call succeeded: two events for one load, one row.
//
// The phase is drawn dim at the end of the hint line under the prompt
// (PromptHint's `tail`), which also trusts the engine's own `isWorking` over a
// stale "done". The status line carries both facts in one string, written by
// one helper that reads both atoms, and only when a stored value changed.
// The `skills` option (default true) turns the skill half off; it is read
// inside each handler, never at register time.
//
// DESIGN NOTE, deliberately narrow: every hook passes its event on unchanged
// and returns what the engine returned; it never denies, never answers a
// dialog, never changes a skill's text, writes no file, makes no request. A
// failure of its own is swallowed: an indicator that breaks a turn or a skill
// would be worse than none.

/** The glyph and word for each phase; idle draws nothing. */
export const LABEL: Record<Phase, string> = {
  idle: '',
  working: '⏳ working',
  done: '✅ done',
  question: '❓ your turn',
  permission: '🔐 needs permission',
  stopped: '⏹ stopped',
  error: '❌ error',
}

/** The tools whose call is a question put to the person, not work. */
export const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

const COMMAND = 'skills-used'
/** Loads kept in the session's state. */
export const KEEP = 200
/** Notes of one skill this close together are one load. */
export const SAME_LOAD_MS = 60_000
/** Where a load noted only at the Skill tool call says it came from. */
export const VIA_TOOL = 'Skill tool'
/** The status line's longest string. */
export const STATUS_MAX = 120
/** What /skills-used answers while the `skills` option is off. */
export const OFF_TEXT = 'Skill tracking is off (the skills option).'

const START: Now = { phase: 'idle', agents: [], since: new Date(0).toISOString(), open: { questions: [], asks: [] } }

// Change a tag when its fields change: it declines what an earlier version stored.
// now-2: Now gained `open`, the questions and asks still waiting on the person.
// now-3: Now gained `turn`, the running main turn's id, so a late end of an earlier turn is ignored.
const now = atom({ plugin: 'prompt-state', key: 'now' } as const, START, { shape: 'now-3' })
const uses = atom({ plugin: 'prompt-state', key: 'uses' } as const, [] as Use[], { shape: 'uses-1' })

const stamp = () => new Date().toISOString()

/** Enters a phase; the same phase keeps its first time. */
export const enter = (s: Now, phase: Phase): Now => (s.phase === phase ? s : { ...s, phase, since: stamp() })

/** The phase a finished main-loop turn leaves. */
export const afterTurn = (reason: string, answer: string): Phase => {
  if (reason === 'aborted') return 'stopped'
  if (reason === 'error' || reason === 'refusal') return 'error'
  return /\?\s*$/.test(answer.replace(/[`*_)\]"'”’]+\s*$/, '')) ? 'question' : 'done'
}

/** `✅ done · 2 agents working`: the phase, then the subagents still running. */
export const labelOf = (s: Now, isWorking = false) => {
  const phase = isWorking && (s.phase === 'idle' || s.phase === 'done' || s.phase === 'stopped' || s.phase === 'error') ? 'working' : s.phase
  const n = s.agents.length
  const agents = n === 0 ? '' : `${n} agent${n === 1 ? '' : 's'} working`
  return [LABEL[phase], agents].filter(Boolean).join(' · ')
}

/** Which skill a load is: `plugin:name` for a plugin's skill, the bare name for one of yours or the
 * project's. The engine notes a plugin's skill as its name plus the plugin; the Skill tool names it
 * `plugin:name`. Two plugins' skills with one name (`alpha:review`, `beta:review`) are two skills. */
export const identityOf = (u: Use) => (u.plugin && !u.skill.startsWith(`${u.plugin}:`) ? `${u.plugin}:${u.skill}` : u.skill)

/** `skill: commit (3 this session)`: the newest load, and how many distinct skills. */
export const statusOf = (all: Use[]) => {
  const last = all.at(-1)
  if (!last) return undefined
  const count = new Set(all.map(identityOf)).size
  return `skill: ${identityOf(last)} (${count} this session)`.slice(0, 80)
}

/** The status line: the phase, then the skill, in one string of at most STATUS_MAX characters. */
export const statusText = (s: Now, all: Use[]) =>
  [labelOf(s), statusOf(all)].filter(Boolean).join(' · ').slice(0, STATUS_MAX) || undefined

/** Adds one note to the list, kept in time order (a note stamped earlier that arrives late goes before the
 * newer one, which stays the newest). A note of the same skill within SAME_LOAD_MS of its neighbour is the
 * same load: an engine note replaces a tool note in place; any other repeat returns the same array, so
 * nothing is written and nothing redrawn. */
export const noteLoad = (all: Use[], use: Use): Use[] => {
  const t = Date.parse(use.at)
  let i = all.length
  while (i > 0 && Date.parse(all[i - 1]!.at) > t) i--
  for (const j of [i - 1, i]) {
    const x = all[j]
    if (x && identityOf(x) === identityOf(use) && Math.abs(Date.parse(x.at) - t) <= SAME_LOAD_MS) {
      // the engine's own note says more (its source, its plugin); a tool note never replaces it
      return x.source === VIA_TOOL && use.source !== VIA_TOOL ? all.map((y, k) => (k === j ? use : y)) : all
    }
  }
  return [...all.slice(0, i), use, ...all.slice(i)].slice(-KEEP)
}

const hms = (iso: string) => {
  const t = new Date(iso)
  return [t.getHours(), t.getMinutes(), t.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}

/** The /skills-used answer: one line per load, oldest first; times local to the machine. */
export const listText = (all: Use[]) => {
  if (all.length === 0) return 'No skill loaded yet in this session.'
  const names = new Set(all.map(identityOf)).size
  const lines = all.map(x => `${hms(x.at)}  ${x.skill}  (${x.plugin ? `plugin ${x.plugin}` : x.source})`)
  return [`${all.length} loads of ${names} skills this session:`, ...lines].join('\n')
}

/** Whether the skill half is on: the `skills` option, read when a handler runs. */
const tracking = (options: PluginOptions) => options.skills !== false

/** Draws both facts in the status line, in one call; a failure of its own is swallowed. */
async function show($: EngineInterface) {
  try {
    $.ui.status(statusText(await read($, now), await read($, uses)))
  } catch {
    // a surface with no status line; the hint line and /skills-used go on
  }
}

// `update` writes whatever its function returns, the same value included (seen under `claude plugin test`,
// 2026-10-29), so each change is first tried on the stored value: when it returns that value (the same
// reference), nothing is written and nothing is drawn.

/** Moves the phase on and shows it; a failure of its own is swallowed. */
async function set($: EngineInterface, fn: (s: Now) => Now) {
  try {
    const before = await read($, now)
    if (fn(before) === before) return
    await update($, now, fn)
    await show($)
  } catch {
    // the indicator misses one change; the event is untouched
  }
}

/** Notes one skill load and shows it; a failure of its own is swallowed. */
async function note($: EngineInterface, use: Use) {
  try {
    const before = await read($, uses)
    if (noteLoad(before, use) === before) return
    await update($, uses, xs => noteLoad(xs, use))
    await show($)
  } catch {
    // the indicator misses one load; the skill's text or the call's result is untouched
  }
}

type About = { tool: string; tool_use_id?: string; agentId?: string }
/** The loop an event runs in: a subagent's id, else `main`. */
const loopOf = (e: About) => e.agentId ?? 'main'
/** The loop and the tool an event is about: what a check with no call id and its call have in common. */
export const loopKey = (e: About) => `${loopOf(e)}|${loopOf(e)}:${e.tool}`
/** The call an event is about, with its loop: the engine's own id for the call, else the loop and the tool. */
export const callKey = (e: About) => `${loopOf(e)}|${e.tool_use_id ?? `${loopOf(e)}:${e.tool}`}`

const without = (xs: string[], drop: string[]) => xs.filter(x => !drop.includes(x))

/** The state once a call settles: the call no longer waits on the person; a question or an ask still open
 * keeps the person's turn, and only when nothing waits on the person does the session go back to working. */
export const settle = (s: Now, keys: string[]): Now => {
  const hit = (x: string) => keys.includes(x)
  // nothing of this call was open: the same value, so nothing is written
  const open = s.open.questions.some(hit) || s.open.asks.some(hit) ? { questions: without(s.open.questions, keys), asks: without(s.open.asks, keys) } : s.open
  const next = open === s.open ? s : { ...s, open }
  if (open.questions.length > 0) return enter(next, 'question')
  if (open.asks.length > 0) return enter(next, 'permission')
  return s.phase === 'permission' || s.phase === 'question' ? enter(next, 'working') : next
}

/** The phase with what is still open laid over it: an open question or ask keeps the person's turn whatever
 * the main loop just did (a background agent's dialog waits on you while the main turn is done). */
export const overlay = (s: Now): Now =>
  s.open.questions.length > 0 ? enter(s, 'question') : s.open.asks.length > 0 ? enter(s, 'permission') : s

/** Drops a loop's open calls: the main loop's at a new main turn (nothing of its waits on the person any
 * more), a subagent's when its turn ends (a dialog it never settled must not stick for the session). */
export const dropLoop = (s: Now, loop: string): Now => {
  const mine = (x: string) => x.startsWith(`${loop}|`)
  return { ...s, open: { questions: s.open.questions.filter(x => !mine(x)), asks: s.open.asks.filter(x => !mine(x)) } }
}

/** A new main turn: the main loop is working; a subagent's open ask still shows. */
export const newMainTurn = (s: Now, turn?: string): Now => overlay(enter({ ...dropLoop(s, 'main'), turn }, 'working'))

/** A main turn's end: the phase it leaves, unless a newer main turn has started since (a late end). */
export const endMainTurn = (s: Now, turn: string | undefined, phase: Phase): Now =>
  s.turn !== undefined && turn !== undefined && turn !== s.turn ? s : overlay(enter(s, phase))

export const register: Register = (on, options) => {
  // What waits on the person is kept in the stored state beside the phase, keyed by the call. A
  // background call that settles while a question is open (a Read finishing under an AskUserQuestion)
  // leaves the question open: only the question's own call closes it, and only the call that was asked
  // about closes its permission ask, whether the call runs in the main loop or in a subagent's.

  on('turn.start', async ($, e, next) => {
    const id = e.agentId
    await set($, s => (id === undefined ? newMainTurn(s, e.turnId) : s.agents.includes(id) ? s : { ...s, agents: [...s.agents, id].slice(-50) }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const id = e.agentId
    await set($, s => (id === undefined ? endMainTurn(s, e.turnId, afterTurn(String(e.reason), e.answer ?? '')) : { ...dropLoop(s, id), agents: s.agents.filter(a => a !== id) }))
    return r
  })

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    // a question's own dialog is `question`, set at its tool.call
    if (r.decision === 'ask' && e.approver === 'person' && !ASKING_TOOLS.has(e.tool)) {
      const key = callKey(e)
      await set($, s => enter({ ...s, open: { ...s.open, asks: s.open.asks.includes(key) ? s.open.asks : [...s.open.asks, key].slice(-50) } }, 'permission'))
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const key = callKey(e)
    if (ASKING_TOOLS.has(e.tool)) {
      await set($, s => enter({ ...s, open: { ...s.open, questions: s.open.questions.includes(key) ? s.open.questions : [...s.open.questions, key].slice(-50) } }, 'question'))
    }
    let r: Awaited<ReturnType<typeof next>>
    try {
      r = await next(e)
    } finally {
      // this call is answered (or refused): it no longer waits on the person. An ask noted with no call
      // id (under the loop and tool) is cleared by any call of that tool in that loop.
      await set($, s => settle(s, [key, loopKey(e)]))
    }
    // the Skill tool: the second event for a load, when the call succeeded
    if (e.tool === 'Skill' && tracking(options) && r.deny === undefined && r.isError !== true) {
      try {
        const name = (e as unknown as Record<string, unknown>).skill
        if (typeof name === 'string' && name) await note($, { at: stamp(), skill: name.replace(/^\//, ''), source: VIA_TOOL })
      } catch {
        // the indicator misses one load; the call's result is untouched
      }
    }
    return r
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    try {
      const text = labelOf(await read($, now), e.props.isWorking)
      if (!text) return next(e)
      const tail = e.props.tail ? `${e.props.tail} · ${text}` : text
      return next({ ...e, props: { ...e.props, tail } })
    } catch {
      return next(e)
    }
  })

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: COMMAND, description: 'List the skills this session loaded, with times and where each came from' })
    } catch {
      // a surface with no commands; the status line goes on
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => ({ text: tracking(options) ? listText(await read($, uses)) : OFF_TEXT }))

  on('skill.prompt', async ($, e, next) => {
    const r = await next(e)
    if (!tracking(options)) return r
    try {
      await note($, { at: stamp(), skill: e.skill, source: String(e.source), ...(e.pluginName ? { plugin: e.pluginName } : {}) })
    } catch {
      // the indicator misses one load; the skill's text is untouched
    }
    return r
  })
}

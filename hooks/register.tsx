import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Now, Phase } from '../types'

// prompt-state: what Claude Code is doing, at a glance, under the prompt
// (anthropics/claude-code#21894: "It's difficult to tell at a glance whether
// Claude Code is still working ... finished ... waiting for user input ...
// waiting for tool permission ... blocked by an error").
//
// The main loop's phase comes from the engine's own events:
//   turn.start                         working
//   tool.check verdict `ask` a person answers   permission, until that tool's call settles
//   tool.call AskUserQuestion / ExitPlanMode    question, until that call is answered
//   turn.complete                      done (question if the answer ends in "?"),
//                                      stopped when interrupted, error on an API
//                                      error or a refusal
// Subagent and teammate turns are counted, not phased: "2 agents working".
//
// It is drawn dim at the end of the hint line under the prompt (PromptHint's
// `tail`) and set in the status line, two ways: another plugin's hook can run
// first and send one event on past this one (seen live on 2026-10-28 with
// cc-plugin-sec-default), so the hint line also trusts the engine's own
// `isWorking` over a stale "done".
//
// DESIGN NOTE, deliberately narrow: every hook passes its event on unchanged
// and returns what the engine returned; it never denies, never answers a
// dialog, writes no file, makes no request. A failure of its own is swallowed:
// an indicator that breaks a turn would be worse than none.

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

const START: Now = { phase: 'idle', agents: [], since: new Date(0).toISOString(), open: { questions: [], asks: [] } }

// Change the tag when Now's fields change: it declines what an earlier version stored.
// now-2: Now gained `open`, the questions and asks still waiting on the person, kept in the same stored
// value as the phase so that a reload of this code loses neither.
const now = atom({ plugin: 'prompt-state', key: 'now' } as const, START, { shape: 'now-2' })

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

/** Moves the state on and shows it in the status line; a failure of its own is swallowed. */
async function set($: EngineInterface, fn: (s: Now) => Now) {
  try {
    const s = await update($, now, fn)
    try {
      $.ui.status(labelOf(s) || undefined)
    } catch {
      // a surface with no status line; the hint line goes on
    }
  } catch {
    // the indicator misses one change; the event is untouched
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
  const open = { questions: without(s.open.questions, keys), asks: without(s.open.asks, keys) }
  const next = { ...s, open }
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
export const newMainTurn = (s: Now): Now => overlay(enter(dropLoop(s, 'main'), 'working'))

export const register: Register = on => {
  // What waits on the person is kept in the stored state beside the phase, keyed by the call. A
  // background call that settles while a question is open (a Read finishing under an AskUserQuestion)
  // leaves the question open: only the question's own call closes it, and only the call that was asked
  // about closes its permission ask, whether the call runs in the main loop or in a subagent's.

  on('turn.start', async ($, e, next) => {
    const id = e.agentId
    await set($, s => (id === undefined ? newMainTurn(s) : s.agents.includes(id) ? s : { ...s, agents: [...s.agents, id].slice(-50) }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const id = e.agentId
    await set($, s => (id === undefined ? overlay(enter(s, afterTurn(String(e.reason), e.answer ?? ''))) : { ...dropLoop(s, id), agents: s.agents.filter(a => a !== id) }))
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
    try {
      return await next(e)
    } finally {
      // this call is answered (or refused): it no longer waits on the person. An ask noted with no call
      // id (under the loop and tool) is cleared by any call of that tool in that loop.
      await set($, s => settle(s, [key, loopKey(e)]))
    }
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
}

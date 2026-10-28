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
//   tool.check verdict `ask` a person answers   permission, until the call settles
//   tool.call AskUserQuestion / ExitPlanMode    question, until it is answered
//   turn.complete                      done (question if the answer ends in "?"),
//                                      stopped when interrupted, error on an API
//                                      error or a refusal
// Subagent and teammate turns are counted, not phased: "2 agents working".
//
// It is drawn dim at the end of the hint line under the prompt (PromptHint's
// `tail`) and set in the status line, two doors: another plugin's hook can run
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

const START: Now = { phase: 'idle', agents: [], since: new Date(0).toISOString() }

// Change the tag when Now's fields change: it declines what an earlier version stored.
const now = atom({ plugin: 'prompt-state', key: 'now' } as const, START, { shape: 'now-1' })

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

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    const id = e.agentId
    await set($, s => (id === undefined ? enter(s, 'working') : s.agents.includes(id) ? s : { ...s, agents: [...s.agents, id].slice(-50) }))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    const id = e.agentId
    await set($, s => (id === undefined ? enter(s, afterTurn(String(e.reason), e.answer ?? '')) : { ...s, agents: s.agents.filter(a => a !== id) }))
    return r
  })

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    // a question's own dialog is `question`, set at its tool.call
    if (r.decision === 'ask' && e.approver === 'person' && !ASKING_TOOLS.has(e.tool)) await set($, s => enter(s, 'permission'))
    return r
  })

  on('tool.call', async ($, e, next) => {
    const asks = ASKING_TOOLS.has(e.tool)
    if (asks) await set($, s => enter(s, 'question'))
    try {
      return await next(e)
    } finally {
      // the dialog is answered (or the call refused): back to work, unless the turn already ended
      await set($, s => (s.phase === 'permission' || s.phase === 'question' ? enter(s, 'working') : s))
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

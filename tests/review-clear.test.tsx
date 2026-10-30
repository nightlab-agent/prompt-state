import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { RESUMED_TEXT } from '../hooks/register'

type On = Parameters<TestBody>[1]
type D = Parameters<TestBody>[0]

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

const gate = () => {
  let open!: () => void
  const p = new Promise<void>(r => (open = r))
  return { p, open }
}

// core mocks; `hold` lets one event's core step (next(e)) wait until the test opens it
const world = (on: On, hold: { turn?: Promise<void>; tool?: Promise<void> } = {}) => {
  const statuses: (string | undefined)[] = []
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('command.register', () => ({ value: { command: 'skills-used' } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', async (_, e) => {
    if (hold.turn) await hold.turn
    return { text: e.answer }
  })
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', async () => {
    if (hold.tool) await hold.tool
    return { result: {} }
  })
  return { statuses }
}
const clear = ($: D, reason: 'clear' | 'resume' = 'clear') => $.session.end({ reason, sessionId: 's-old', resume: {} as never })
const list = async ($: D) => (await $.command.run({ command: 'skills-used', args: '', ...RUN })).text
const start = ($: D, turnId: string, agentId?: string) => $.turn.start({ text: 'go', turnId, ...(agentId ? { agentId } : {}) } as any)
const end = ($: D, turnId: string, agentId?: string) =>
  $.turn.complete({ answer: 'Done.', reason: 'answer', turnId, durationMs: 10, isAborted: false, ...(agentId ? { agentId } : {}) })

// kind 1: the old conversation's turn end, still in its core step when /clear lands, writes "done" after the reset
test('review: an old turn end settling after /clear leaves the new conversation blank', async ($, on) => {
  const g = gate()
  const { statuses } = world(on, { turn: g.p })
  await start($, 't1')
  const late = end($, 't1')
  await clear($)
  g.open()
  await late
  expect(statuses.at(-1) ?? '').not.toContain('done')
})

// comparison: the same late end after a newer main turn started is ignored (the guard endMainTurn has)
test('review-cmp: an old turn end settling after a newer turn started is ignored', async ($, on) => {
  const g = gate()
  const { statuses } = world(on, { turn: g.p })
  await start($, 't1')
  const late = end($, 't1')
  await start($, 't2')
  g.open()
  await late
  expect(statuses.at(-1) ?? '').not.toContain('done')
})

// kind 1: a Skill tool call of the old conversation that settles after /clear lists its skill in the new one
test('review: a Skill call settling after /clear is not listed in the new conversation', async ($, on) => {
  const g = gate()
  world(on, { tool: g.p })
  const call = $.tool.call({ tool: 'Skill', skill: 'commit', tool_use_id: 'k1' } as never)
  await clear($)
  g.open()
  await call
  expect(await list($)).toBe('No skill loaded yet in this session.')
})

// comparison: the same Skill call settling before /clear is gone after it
test('review-cmp: a Skill call settling before /clear is not listed after it', async ($, on) => {
  world(on)
  await $.tool.call({ tool: 'Skill', skill: 'commit', tool_use_id: 'k1' } as never)
  await clear($)
  expect(await list($)).toBe('No skill loaded yet in this session.')
})

// kind 2, decided (s132): /clear drops a running subagent from the count. Only its own turn end removes it
// (hooks/register.tsx, turn.complete), so one that /clear ends with no turn end would stay counted for the process.
test('review: a subagent still running across /clear is not counted after it (chosen: a stuck count is worse)', async ($, on) => {
  const { statuses } = world(on)
  await start($, 'a-t1', 'a1')
  await clear($)
  await $.tool.call({ tool: 'Read', agentId: 'a1', tool_use_id: 'r1' } as never)
  await start($, 't2')
  expect(statuses.at(-1)).toBe('⏳ working')
})

// comparison: with no /clear the same subagent is counted
test('review-cmp: a subagent running with no /clear is counted', async ($, on) => {
  const { statuses } = world(on)
  await start($, 'a-t1', 'a1')
  await $.tool.call({ tool: 'Read', agentId: 'a1', tool_use_id: 'r1' } as never)
  await start($, 't2')
  expect(statuses.at(-1)).toBe('⏳ working · 1 agent working')
})

// kind 3/4: an in-process /resume ends this session too, and no session.start follows (d.ts 4463-4464, 11632-11647)
test('review: after a resume, /skills-used does not list the left conversation', async ($, on) => {
  world(on)
  await $.skill.prompt({ skill: 'commit', text: 'a', source: 'userSettings' })
  await clear($, 'resume')
  expect(await list($)).toBe(RESUMED_TEXT)
})

test('review-cmp: after a /clear, /skills-used does not list the left conversation', async ($, on) => {
  world(on)
  await $.skill.prompt({ skill: 'commit', text: 'a', source: 'userSettings' })
  await clear($, 'clear')
  expect(await list($)).toBe('No skill loaded yet in this session.')
})

import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]
type D = Parameters<TestBody>[0]

const world = (on: On, slow: Set<string>) => {
  const statuses: (string | undefined)[] = []
  const gates: (() => void)[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', async (_, e) => {
    if (slow.has(e.turnId)) await new Promise<void>(r => gates.push(r))
    return { text: e.answer }
  })
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ result: {} }))
  return { statuses, release: () => gates.splice(0).forEach(g => g()) }
}
const start = ($: D, turnId: string, agentId?: string) => $.turn.start({ text: 'go', turnId, ...(agentId ? { agentId } : {}) })
const end = ($: D, turnId: string, answer: string, agentId?: string) =>
  $.turn.complete({ answer, reason: 'answer', turnId, durationMs: 10, isAborted: false, ...(agentId ? { agentId } : {}) })
const ask = ($: D, id: string, agentId?: string) =>
  $.tool.check({ tool: 'Bash', input: { command: 'ls' }, approver: 'person', tool_use_id: id, ...(agentId ? { agentId } : {}) } as never)
const clear = ($: D) => $.session.end({ reason: 'clear', sessionId: 's-old', resume: {} as never })
const tick = () => new Promise(r => setTimeout(r, 20))

// kind 1: an agent's first run leaves an ask nobody settled (a check whose call never ran); its end lands late,
// after the second run started, and is ignored whole: the old ask is laid over the new run.
test('review-cr2: a late end of an agent\'s earlier run still drops that run\'s unsettled ask', async ($, on) => {
  const { statuses, release } = world(on, new Set(['a-t1']))
  await start($, 't1')
  await end($, 't1', 'ok')
  await start($, 'a-t1', 'a1')
  await ask($, 'b1', 'a1')
  const late = end($, 'a-t1', 'first run done', 'a1')
  await tick()
  await start($, 'a-t2', 'a1')
  release()
  await late
  expect(statuses.at(-1)).toBe('✅ done · 1 agent working')
})

// comparison: the main loop's same case: a late end of turn 1 with an unsettled ask; turn 2 shows working
test('review-cr2-cmp: the main loop\'s newer turn drops the earlier turn\'s unsettled ask', async ($, on) => {
  const { statuses, release } = world(on, new Set(['t1']))
  await start($, 't1')
  await ask($, 'b1')
  const late = end($, 't1', 'first turn done')
  await tick()
  await start($, 't2')
  release()
  await late
  expect(statuses.at(-1)).toBe('⏳ working')
})

// comparison: the agent's runs in order: the first end drops its ask
test('review-cr2-cmp: an agent\'s first run ending in order drops its unsettled ask', async ($, on) => {
  const { statuses } = world(on, new Set())
  await start($, 't1')
  await end($, 't1', 'ok')
  await start($, 'a-t1', 'a1')
  await ask($, 'b1', 'a1')
  await end($, 'a-t1', 'first run done', 'a1')
  await start($, 'a-t2', 'a1')
  expect(statuses.at(-1)).toBe('✅ done · 1 agent working')
})

// kind 2: the era check in turn.complete sits before set's own await (the read): a /clear landing in that gap
// is reset first, and the old turn's "done" is written over the new conversation.
test('review-cr2: an old turn end and a /clear landing together leave the new conversation blank', async ($, on) => {
  const { statuses, release } = world(on, new Set(['t1']))
  await start($, 't1')
  const late = end($, 't1', 'Done.')
  await tick()
  release()
  const c = clear($)
  await Promise.all([late, c])
  expect(statuses.at(-1) ?? '').not.toContain('done')
})

// comparison: the same end fully landed, then /clear: blank
test('review-cr2-cmp: an old turn end that landed before /clear is reset', async ($, on) => {
  const { statuses, release } = world(on, new Set(['t1']))
  await start($, 't1')
  const late = end($, 't1', 'Done.')
  await tick()
  release()
  await late
  await clear($)
  expect(statuses.at(-1) ?? '').not.toContain('done')
})

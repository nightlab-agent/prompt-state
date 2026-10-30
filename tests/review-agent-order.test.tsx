import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]
type D = Parameters<TestBody>[0]

// The engine beneath: a turn.complete beneath this plugin (another plugin's, or core) that is slow to settle
// for the turn ids in `slow`, released by hand.
const world = (on: On, slow: Set<string>) => {
  const statuses: (string | undefined)[] = []
  const gates: (() => void)[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
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
const tick = () => new Promise(r => setTimeout(r, 20))

// FAILING: a teammate's first run ends late (a slow turn.complete beneath), after its second run started:
// the second run is still running but drops out of the count.
test('review: a late end of an agent loop\'s earlier run leaves its newer run counted', async ($, on) => {
  const { statuses, release } = world(on, new Set(['a-t1']))
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  const late = end($, 'a-t1', 'first run done', 'a1')
  await tick()
  await start($, 'a-t2', 'a1')
  release()
  await late
  expect(statuses.at(-1)).toBe('⏳ working · 1 agent working')
})

// FAILING: the same late end also drops the newer run's open permission ask.
test('review: a late end of an agent loop\'s earlier run keeps its newer run\'s ask', async ($, on) => {
  const { statuses, release } = world(on, new Set(['a-t1']))
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  const late = end($, 'a-t1', 'first run done', 'a1')
  await tick()
  await start($, 'a-t2', 'a1')
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, approver: 'person', agentId: 'a1', tool_use_id: 'b2' } as never)
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
  release()
  await late
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
})

// COMPARISON: the main loop's late end of an earlier turn, same slow beneath, is ignored.
test('review-cmp: a late end of the main loop\'s earlier turn leaves the newer turn working', async ($, on) => {
  const { statuses, release } = world(on, new Set(['t1']))
  await start($, 't1')
  const late = end($, 't1', 'first turn done')
  await tick()
  await start($, 't2')
  release()
  await late
  expect(statuses.at(-1)).toBe('⏳ working')
})

// COMPARISON: the agent's runs in order (end settles before the next run starts) count it.
test('review-cmp: an agent loop\'s second run after its first ended is counted', async ($, on) => {
  const { statuses } = world(on, new Set())
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await end($, 'a-t1', 'first run done', 'a1')
  await start($, 'a-t2', 'a1')
  expect(statuses.at(-1)).toBe('⏳ working · 1 agent working')
})

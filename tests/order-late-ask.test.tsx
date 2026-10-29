import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]
type D = Parameters<TestBody>[0]

const world = (on: On) => {
  const statuses: (string | undefined)[] = []
  const approvers: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.check', (_, e) => {
    approvers.push(e.approver)
    return { decision: e.agentId === 'a1' || e.tool === 'Bash' ? 'ask' : 'allow' }
  })
  on('tool.call', () => ({ result: {} }))
  return { statuses, approvers }
}
const start = ($: D, turnId: string, agentId?: string) => $.turn.start({ text: 'go', turnId, ...(agentId ? { agentId } : {}) })
const end = ($: D, turnId: string, answer: string, reason: 'answer' | 'aborted' = 'answer', agentId?: string) =>
  $.turn.complete({ answer, reason, turnId, durationMs: 10, isAborted: reason === 'aborted', ...(agentId ? { agentId } : {}) })

// FAILING: main turn is done; a background agent's ask settles afterwards and the main phase becomes "working"
test('review: a subagent ask settling after the main turn is done leaves done', async ($, on) => {
  const { statuses } = world(on)
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await end($, 't1', 'Started an agent.')
  await $.tool.check({ tool: 'Read', input: {}, approver: 'person', agentId: 'a1', tool_use_id: 'r1' })
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
  await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'a1', tool_use_id: 'r1' } as never)
  expect(statuses.at(-1)).toBe('✅ done · 1 agent working')
})

// COMPARISON: the same ask settling while the main turn is still running returns to working
test('review-cmp: a subagent ask settling during the main turn returns to working', async ($, on) => {
  const { statuses } = world(on)
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await $.tool.check({ tool: 'Read', input: {}, approver: 'person', agentId: 'a1', tool_use_id: 'r1' })
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
  await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'a1', tool_use_id: 'r1' } as never)
  expect(statuses.at(-1)).toBe('⏳ working · 1 agent working')
})

// FAILING: main turn done, a subagent asks, then the subagent's turn ends without the call: stuck on permission
test('review: a subagent ending with its ask unsettled after the main turn is done shows done', async ($, on) => {
  const { statuses } = world(on)
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await end($, 't1', 'Started an agent.')
  await $.tool.check({ tool: 'Read', input: {}, approver: 'person', agentId: 'a1', tool_use_id: 'r1' })
  await end($, 'a-t1', 'gave up', 'aborted', 'a1')
  expect(statuses.at(-1)).toBe('✅ done')
})

// COMPARISON: the subagent ending with no ask open after the main turn is done shows done
test('review-cmp: a subagent ending with nothing open after the main turn is done shows done', async ($, on) => {
  const { statuses } = world(on)
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await end($, 't1', 'Started an agent.')
  await end($, 'a-t1', 'gave up', 'aborted', 'a1')
  expect(statuses.at(-1)).toBe('✅ done')
})

// PROBE: a $.tool.check query (no tool_use_id, nothing runs, no dialog) with an ask verdict
test('review-probe: a permission query opens no dialog and must not show needs permission', async ($, on) => {
  const { statuses, approvers } = world(on)
  await start($, 't1')
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })
  console.log('query approver:', approvers.at(-1))
  expect(statuses.at(-1)).toBe('⏳ working')
})

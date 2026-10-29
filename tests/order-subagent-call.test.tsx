import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// Review tests (kind 1/2): a subagent's tool call settling moves the MAIN loop's phase.
type On = Parameters<TestBody>[1]
const world = (on: On, verdict: 'allow' | 'ask' = 'allow') => {
  const statuses: (string | undefined)[] = []
  on('ui.status', (_, e) => { statuses.push(e.text); return { value: undefined } })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.check', () => ({ decision: verdict }))
  on('tool.call', () => ({ result: {} }))
  return statuses
}
const start = ($: Parameters<TestBody>[0], turnId: string, agentId?: string) =>
  $.turn.start({ text: 'go', turnId, ...(agentId ? { agentId } : {}) })
const end = ($: Parameters<TestBody>[0], turnId: string, answer: string) =>
  $.turn.complete({ answer, reason: 'answer', turnId, durationMs: 10, isAborted: false })

test('review FAIL: a background agent\'s tool call after the turn asked keeps "your turn"', async ($, on) => {
  const statuses = world(on)
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await end($, 't1', 'Shall I push the branch?')
  expect(statuses.at(-1)).toBe('❓ your turn · 1 agent working')
  await $.tool.call({ tool: 'Read', file_path: 'a.md', agentId: 'a1' })
  expect(statuses.at(-1)).toBe('❓ your turn · 1 agent working')
})

test('review PASS (comparison): a background agent\'s tool call after the turn is done keeps "done"', async ($, on) => {
  const statuses = world(on)
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await end($, 't1', 'Started an agent.')
  await $.tool.call({ tool: 'Read', file_path: 'a.md', agentId: 'a1' })
  expect(statuses.at(-1)).toBe('✅ done · 1 agent working')
})

test('review FAIL: a background agent\'s tool call settling while the main loop waits for permission keeps "needs permission"', async ($, on) => {
  const statuses = world(on, 'ask')
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -r build' }, approver: 'person' } as never)
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
  // the agent's own read (allowed in its loop) settles while the dialog is still open
  await $.tool.check({ tool: 'Read', input: {} } as never)
  await $.tool.call({ tool: 'Read', file_path: 'a.md', agentId: 'a1' })
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
})

test('review PASS (comparison): a background agent\'s turn events while the main loop waits for permission keep "needs permission"', async ($, on) => {
  const statuses = world(on, 'ask')
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -r build' }, approver: 'person' } as never)
  await start($, 'b-t1', 'b2')
  expect(statuses.at(-1)).toBe('🔐 needs permission · 2 agents working')
})

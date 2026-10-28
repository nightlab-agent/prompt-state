import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { afterTurn, labelOf } from './register'

// Each test stands for the engine beneath the plugin: it answers the turn and
// tool events, records `$.ui.status`, and reads what the plugin returned.
// Nothing touches the real file system.

type On = Parameters<TestBody>[1]

const world = (on: On, opts: { statusFails?: boolean; verdict?: 'allow' | 'ask' | 'deny' } = {}) => {
  const statuses: (string | undefined)[] = []
  const during: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    if (opts.statusFails) throw new Error('no status line here')
    statuses.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.check', () => ({ decision: opts.verdict ?? 'allow' }))
  on('tool.call', () => {
    during.push(statuses.at(-1))
    return { result: {} }
  })
  return { statuses, during }
}

const start = ($: Parameters<TestBody>[0], turnId: string, agentId?: string) =>
  $.turn.start({ text: 'go', turnId, ...(agentId ? { agentId } : {}) })

const end = ($: Parameters<TestBody>[0], turnId: string, answer: string, reason: 'answer' | 'aborted' | 'error' = 'answer', agentId?: string) =>
  $.turn.complete({ answer, reason, turnId, durationMs: 10, isAborted: reason === 'aborted', ...(agentId ? { agentId } : {}) })

test('a turn shows working, then done; the answer is passed on unchanged', async ($, on) => {
  const { statuses } = world(on)
  await start($, 't1')
  expect(statuses.at(-1)).toBe('⏳ working')
  const r = await end($, 't1', 'All tests pass.')
  expect(r.text).toBe('All tests pass.')
  expect(statuses.at(-1)).toBe('✅ done')
})

test('an answer that asks, an interrupt and an error each have their own state', async ($, on) => {
  const { statuses } = world(on)
  await start($, 't1')
  await end($, 't1', 'Shall I push the branch?')
  expect(statuses.at(-1)).toBe('❓ your turn')
  await start($, 't2')
  await end($, 't2', '', 'aborted')
  expect(statuses.at(-1)).toBe('⏹ stopped')
  await start($, 't3')
  await end($, 't3', '', 'error')
  expect(statuses.at(-1)).toBe('❌ error')
})

test('a permission ask a person answers shows until the call settles', async ($, on) => {
  const { statuses } = world(on, { verdict: 'ask' })
  await start($, 't1')
  const v = await $.tool.check({ tool: 'Bash', input: { command: 'rm -r build' }, approver: 'person' })
  expect(v.decision).toBe('ask')
  expect(statuses.at(-1)).toBe('🔐 needs permission')
  await $.tool.call({ tool: 'Bash', command: 'rm -r build' })
  expect(statuses.at(-1)).toBe('⏳ working')
})

test('an ask nobody is shown (a host or no approver) is not a permission wait', async ($, on) => {
  const { statuses } = world(on, { verdict: 'ask' })
  await start($, 't1')
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, approver: 'host' })
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })
  expect(statuses.at(-1)).toBe('⏳ working')
})

test('a question to the person shows while it is open, then work resumes', async ($, on) => {
  const opts: { verdict: 'allow' | 'ask' } = { verdict: 'ask' }
  const { statuses, during } = world(on, opts)
  await start($, 't1')
  await $.tool.check({ tool: 'AskUserQuestion', input: {}, approver: 'person' })
  expect(statuses.at(-1)).toBe('⏳ working')
  // under a test an ask with no prompt refuses the call, so the dialog's own run is allowed here
  opts.verdict = 'allow'
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  expect(during.at(-1)).toBe('❓ your turn')
  expect(statuses.at(-1)).toBe('⏳ working')
})

test('subagents are counted beside the main phase', async ($, on) => {
  const { statuses } = world(on)
  await start($, 't1')
  await start($, 'a-t1', 'a1')
  await start($, 'b-t1', 'b2')
  expect(statuses.at(-1)).toBe('⏳ working · 2 agents working')
  await end($, 't1', 'Started two agents.')
  await end($, 'a-t1', 'found it', 'answer', 'a1')
  expect(statuses.at(-1)).toBe('✅ done · 1 agent working')
})

const HINT = { plugin: 'prompt-state', component: 'PromptHint', requestId: 'hint' } as const

test('the state is drawn at the end of the hint line, after any tail already there', async ($, on) => {
  world(on)
  const tails: (string | undefined)[] = []
  on('ui.render', ($, e) => {
    tails.push((e.props as { tail?: string }).tail)
    const { Text } = $.ui.resolve(e)
    return <Text>hint</Text>
  })
  await start($, 't1')
  await end($, 't1', 'Done.')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...HINT, surface, props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } })
    expect(tails.at(-1)).toBe('✅ done')
    await ui.unmount()
    const ui2 = await $.ui.mount({ ...HINT, surface, props: { isDraft: false, isWorking: false, hint: '? for shortcuts', tail: 'main' } })
    expect(tails.at(-1)).toBe('main · ✅ done')
    await ui2.unmount()
  }
})

test("the engine's isWorking wins over a stale done, and idle draws nothing", async ($, on) => {
  world(on)
  const tails: (string | undefined)[] = []
  on('ui.render', ($, e) => {
    tails.push((e.props as { tail?: string }).tail)
    const { Text } = $.ui.resolve(e)
    return <Text>hint</Text>
  })
  const idle = await $.ui.mount({ ...HINT, surface: 'terminal', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } })
  expect(tails.at(-1)).toBeUndefined()
  await idle.unmount()
  await start($, 't1')
  await end($, 't1', 'Done.')
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal', props: { isDraft: false, isWorking: true, hint: 'esc to interrupt' } })
  expect(tails.at(-1)).toBe('⏳ working')
  await ui.unmount()
})

test('a surface with no status line still gets every answer and call result', async ($, on) => {
  world(on, { statusFails: true })
  await start($, 't1')
  const r = await end($, 't1', 'Done.')
  expect(r.text).toBe('Done.')
  const c = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(c.deny).toBeUndefined()
})

test('the words: a question mark under closing quotes or code still asks', () => {
  expect(afterTurn('answer', 'Run `npm test`?')).toBe('question')
  expect(afterTurn('answer', 'Want me to open a PR?"')).toBe('question')
  expect(afterTurn('answer', 'What is left? Nothing.')).toBe('done')
  expect(afterTurn('refusal', 'x')).toBe('error')
  expect(labelOf({ phase: 'idle', agents: ['a'], since: '' })).toBe('1 agent working')
})

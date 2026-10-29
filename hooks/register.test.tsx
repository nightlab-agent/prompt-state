import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { Now } from '../types'

import { afterTurn, callKey, labelOf, loopKey, newMainTurn, settle } from './register'

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
  expect(labelOf({ phase: 'idle', agents: ['a'], since: '', open: { questions: [], asks: [] } })).toBe('1 agent working')
})

test('a question stays open while a background Read finishes; only its own answer returns the session to working', async ($, on) => {
  const statuses: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.check', () => ({ decision: 'allow' }))
  // each tool's call finishes when the test says so; `open` resolves once the question dialog is up
  const finish = new Map<string, () => void>()
  let opened!: () => void
  const open = new Promise<void>(resolve => {
    opened = resolve
  })
  on('tool.call', async (_, e) => {
    if (e.tool === 'AskUserQuestion') opened()
    await new Promise<void>(resolve => finish.set(e.tool, resolve))
    return { result: {} }
  })
  await start($, 't1')
  const read = $.tool.call({ tool: 'Read', file_path: '/a.ts' })
  const question = $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  await open
  expect(statuses.at(-1)).toBe('❓ your turn')
  finish.get('Read')!()
  await read
  expect(statuses.at(-1)).toBe('❓ your turn')
  finish.get('AskUserQuestion')!()
  await question
  expect(statuses.at(-1)).toBe('⏳ working')
})

test('a permission ask stays while another tool\'s call settles; the asked-about call settling clears it', async ($, on) => {
  const statuses: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.check', (_, e) => ({ decision: e.tool === 'Bash' ? 'ask' : 'allow' }))
  on('tool.call', () => ({ result: {} }))
  await start($, 't1')
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -r build' }, approver: 'person' })
  expect(statuses.at(-1)).toBe('🔐 needs permission')
  await $.tool.call({ tool: 'Read', file_path: '/a.ts' })
  expect(statuses.at(-1)).toBe('🔐 needs permission')
  await $.tool.call({ tool: 'Bash', command: 'rm -r build' })
  expect(statuses.at(-1)).toBe('⏳ working')
})

test('settle: open questions and asks keep the person\'s turn; nothing open returns to working; a new main turn keeps a subagent\'s ask', () => {
  const q: Now = { phase: 'question', agents: [], since: '', open: { questions: ['main|q1'], asks: ['a1|b1'] } }
  expect(settle(q, ['x']).phase).toBe('question')
  expect(settle(q, ['main|q1']).phase).toBe('permission')
  expect(settle(q, ['main|q1', 'a1|b1']).phase).toBe('working')
  expect(settle({ ...q, phase: 'done', open: { questions: [], asks: [] } }, ['x']).phase).toBe('done')
  const after = newMainTurn({ ...q, open: { questions: ['main|q1'], asks: ['a1|b1', 'main|main:Bash'] } })
  expect(after.phase).toBe('permission')
  expect(after.open).toEqual({ questions: [], asks: ['a1|b1'] })
  expect(newMainTurn({ ...q, open: { questions: ['main|q1'], asks: [] } }).phase).toBe('working')
  expect(callKey({ tool: 'Bash', tool_use_id: 'x1' })).toBe('main|x1')
  expect(callKey({ tool: 'Bash', agentId: 'a1' })).toBe('a1|a1:Bash')
  expect(loopKey({ tool: 'Bash', tool_use_id: 'x1', agentId: 'a1' })).toBe('a1|a1:Bash')
})

test('two calls of one tool: the first settling leaves the second\'s permission ask up; a subagent\'s ask waits on the person across main turns and ends with its turn', async ($, on) => {
  const statuses: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.check', (_, e) => ({ decision: e.tool_use_id === 'b2' || e.agentId === 'a1' ? 'ask' : 'allow' }))
  on('tool.call', () => ({ result: {} }))
  await start($, 't1')
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, approver: 'person', tool_use_id: 'b2' })
  expect(statuses.at(-1)).toBe('🔐 needs permission')
  await $.tool.call({ tool: 'Bash', command: 'sleep 1', tool_use_id: 'b1' })
  expect(statuses.at(-1)).toBe('🔐 needs permission')
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'b2' })
  expect(statuses.at(-1)).toBe('⏳ working')
  await start($, 'a-t1', 'a1')
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, approver: 'person', agentId: 'a1' })
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
  await $.tool.call({ tool: 'Read', file_path: '/a' })
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
  // the main turn ends and a new one starts: the agent's dialog still waits on the person
  await end($, 't1', 'Started an agent.')
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
  await start($, 't2')
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })
  expect(statuses.at(-1)).toBe('⏳ working · 1 agent working')
  // an agent whose ask never settles: its turn ending drops the ask
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, approver: 'person', agentId: 'a1' })
  expect(statuses.at(-1)).toBe('🔐 needs permission · 1 agent working')
  await end($, 'a-t1', 'gave up', 'aborted', 'a1')
  await $.tool.call({ tool: 'Read', file_path: '/c' })
  expect(statuses.at(-1)).toBe('⏳ working')
})

test('a phase an earlier version stored is declined: the hint line draws nothing until a turn starts', async ($, on) => {
  world(on)
  on('state.get', () => ({ value: { value: { phase: 'question', agents: [], since: '' }, version: 1 } }))
  const tails: (string | undefined)[] = []
  on('ui.render', ($, e) => {
    tails.push((e.props as { tail?: string }).tail)
    const { Text } = $.ui.resolve(e)
    return <Text>hint</Text>
  })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } })
  expect(tails.at(-1)).toBeUndefined()
  await ui.unmount()
})

test('collision, out of order: a late end of an earlier main turn leaves the newer turn working', async ($, on) => {
  const { statuses } = world(on)
  await start($, 't1')
  await start($, 't2')
  await end($, 't1', 'Shall I go on?')
  expect(statuses.at(-1)).toBe('⏳ working')
  await end($, 't2', 'Done.')
  expect(statuses.at(-1)).toBe('✅ done')
})

import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// A /clear ends the conversation but not the process, and no session.start follows (Claude Code 2.1.310
// declarations, ExitReason 'clear'); the stored state lives on. The old session's skills and phase must
// not be drawn for the new, empty conversation.

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

type On = Parameters<TestBody>[1]

const world = (on: On) => {
  const statuses: (string | undefined)[] = []
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('command.register', () => ({ value: { command: 'skills-used' } }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return { statuses }
}

const clear = ($: Parameters<TestBody>[0], reason: 'clear' | 'prompt_input_exit' = 'clear') =>
  $.session.end({ reason, sessionId: 's-old', resume: {} as never })

const list = async ($: Parameters<TestBody>[0]) => (await $.command.run({ command: 'skills-used', args: '', ...RUN })).text

test('comparison: with no /clear, a skill loaded earlier in the session is still listed', async ($, on) => {
  world(on)
  await $.skill.prompt({ skill: 'commit', text: 'a', source: 'userSettings' })
  await $.turn.start({ turnId: 't1' } as any)
  await $.turn.complete({ answer: 'Committed.', reason: 'answer', turnId: 't1', durationMs: 10, isAborted: false })
  expect(await list($)).toContain('1 loads of 1 skills this session:')
})

test('after /clear, /skills-used lists none and the status line drops the old skill and phase', async ($, on) => {
  const { statuses } = world(on)
  await $.skill.prompt({ skill: 'commit', text: 'a', source: 'userSettings' })
  await $.turn.start({ turnId: 't1' } as any)
  await $.turn.complete({ answer: 'Committed.', reason: 'answer', turnId: 't1', durationMs: 10, isAborted: false })
  expect(statuses.at(-1)).toContain('commit')
  await clear($)
  expect(await list($)).toBe('No skill loaded yet in this session.')
  expect(statuses.at(-1) ?? '').not.toContain('commit')
  expect(statuses.at(-1) ?? '').not.toContain('done')
})

test('after /clear, the new session counts its own skills from one', async ($, on) => {
  const { statuses } = world(on)
  await $.skill.prompt({ skill: 'commit', text: 'a', source: 'userSettings' })
  await clear($)
  await $.skill.prompt({ skill: 'review', text: 'b', source: 'userSettings' })
  expect(statuses.at(-1)).toBe('skill: review (1 this session)')
  expect(await list($)).toContain('1 loads of 1 skills this session:')
})

test('comparison: a session.end that is not a /clear leaves the list as it was', async ($, on) => {
  world(on)
  await $.skill.prompt({ skill: 'commit', text: 'a', source: 'userSettings' })
  await clear($, 'prompt_input_exit')
  expect(await list($)).toContain('1 loads of 1 skills this session:')
})

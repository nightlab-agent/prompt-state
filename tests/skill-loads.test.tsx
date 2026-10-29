import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { noteLoad } from '../hooks/register'

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
type On = Parameters<TestBody>[1]
type Engine = Parameters<TestBody>[0]

// The engine beneath: a Skill tool call expands the skill (skill.prompt); a skill run in a fork
// (`context: fork`) loads its own skills before the Skill call returns.
const world = (on: On, forkLoads: Record<string, string[]> = {}, eng?: Engine) => {
  const statuses: (string | undefined)[] = []
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.status', (_, e) => { statuses.push(e.text); return { value: undefined } })
  on('command.register', () => ({ value: { command: 'skills-used' } }))
  on('tool.call', async (_, e) => {
    const name = (e as unknown as { skill?: string }).skill
    if (e.tool === 'Skill' && name) {
      await eng!.skill.prompt({ skill: name, text: 't', source: 'userSettings' })
      for (const inner of forkLoads[name] ?? []) await eng!.skill.prompt({ skill: inner, text: 'u', source: 'userSettings' })
    }
    return { result: {} }
  })
  return { statuses }
}

// kind 3: two expansions of one skill close in time are taken for one
test('review: /commit typed twice in a row is two loads', async ($, on) => {
  world(on)
  await $.skill.prompt({ skill: 'commit', text: 'a', source: 'userSettings' })
  await $.skill.prompt({ skill: 'commit', text: 'b', source: 'userSettings' })
  const r = await $.command.run({ command: 'skills-used', args: '', ...RUN })
  expect(r.text).toContain('2 loads of 1 skills')
})
test('review control: commit, review, commit is three loads', async ($, on) => {
  world(on)
  await $.skill.prompt({ skill: 'commit', text: 'a', source: 'userSettings' })
  await $.skill.prompt({ skill: 'review', text: 'b', source: 'userSettings' })
  await $.skill.prompt({ skill: 'commit', text: 'c', source: 'userSettings' })
  const r = await $.command.run({ command: 'skills-used', args: '', ...RUN })
  expect(r.text).toContain('3 loads of 2 skills')
})
test('review control: noteLoad keeps two engine notes 61 s apart', () => {
  const a = { at: '2026-10-29T09:00:00Z', skill: 'commit', source: 'userSettings' }
  expect(noteLoad([a], { ...a, at: '2026-10-29T09:01:01Z' }).length).toBe(2)
})
test('review: noteLoad keeps two engine notes 10 s apart', () => {
  const a = { at: '2026-10-29T09:00:00Z', skill: 'commit', source: 'userSettings' }
  expect(noteLoad([a], { ...a, at: '2026-10-29T09:00:10Z' }).length).toBe(2)
})

// kind 1: the Skill tool's note lands after loads that came later, and wins the status line
test('review: a forked skill that loads another; the status line names the newest load, one row each', async ($, on) => {
  const { statuses } = world(on, { deploy: ["lint"] }, $)
  await $.tool.call({ tool: 'Skill', skill: 'deploy' })
  expect(statuses.at(-1)).toBe('skill: lint (2 this session)')
  const r = await $.command.run({ command: 'skills-used', args: '', ...RUN })
  expect(r.text).toContain('2 loads of 2 skills')
})
test('review control: a Skill call that loads nothing else', async ($, on) => {
  const { statuses } = world(on, {}, $)
  await $.tool.call({ tool: 'Skill', skill: 'deploy' })
  expect(statuses.at(-1)).toBe('skill: deploy (1 this session)')
  const r = await $.command.run({ command: 'skills-used', args: '', ...RUN })
  expect(r.text).toContain('1 loads of 1 skills')
})

// kind 2: two Skill calls in one batch overlap
test('review: two Skill calls at once are two loads', async ($, on) => {
  world(on, {}, $)
  await Promise.all([$.tool.call({ tool: 'Skill', skill: 'a' }), $.tool.call({ tool: 'Skill', skill: 'b' })])
  const r = await $.command.run({ command: 'skills-used', args: '', ...RUN })
  expect(r.text).toContain('2 loads of 2 skills')
})
test('review control: the same two Skill calls one after the other', async ($, on) => {
  world(on, {}, $)
  await $.tool.call({ tool: 'Skill', skill: 'a' })
  await $.tool.call({ tool: 'Skill', skill: 'b' })
  const r = await $.command.run({ command: 'skills-used', args: '', ...RUN })
  expect(r.text).toContain('2 loads of 2 skills')
})

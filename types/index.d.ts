/** What Claude Code is doing now, as the hint line and the status line show it. */
export type Phase = 'idle' | 'working' | 'done' | 'question' | 'permission' | 'stopped' | 'error'

/** The session's state: the main loop's phase, and the subagent loops still running. */
export type Now = {
  /** The main loop's phase. */
  phase: Phase
  /** Ids of subagent or teammate loops whose turn has started and not yet ended. */
  agents: string[]
  /** ISO time the phase was entered. */
  since: string
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-state': { now: Shaped<Now> }
  }
}

/** Continue admission uses the normal identified prompt path and leaves drafts untouched. */
import type { SessionSnapshot, SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { Boundary } from './boundary.ts'

export type Availability = 'hidden' | 'ready' | 'busy' | 'draft' | 'credentials'

/** Resolve safe eligibility from current session, composer, and ending values. */
export function availability(session: SessionSnapshot, input: InputState, boundary: Boundary | null | undefined, pendingInteraction: boolean): Availability {
  if (boundary == null || session.subagent !== null) return 'hidden'
  const reason = boundary.reason
  if (reason.kind !== 'error' && reason.kind !== 'max-tokens'
    && !(reason.kind === 'aborted' && reason.reason.kind === 'user')) return 'hidden'
  if (session.removed || session.openState !== 'open' || session.running || session.awaitingFirstTurn
    || session.pendingSubmissions.length > 0 || pendingInteraction || input.queue.length > 0 || input.phase !== 'plain') return 'busy'
  if (input.draft !== '' || input.attachmentIds.length > 0 || input.occurrences.length > 0) return 'draft'
  if (reason.kind === 'error' && ([401, 402, 403].includes(reason.error.status ?? 0)
    || /auth|quota|billing|credit|payment/i.test(reason.error.code))) return 'credentials'
  return 'ready'
}

/** One local action fence shared by the button and shortcut for this plugin instance. */
export function createContinueAction(read: (binding: SessionBinding) => { availability: Availability; boundary: Boundary | null | undefined }, isCurrent: (binding: SessionBinding) => boolean) {
  const inFlight = new Set<SessionBinding>()
  const attempted = new WeakMap<SessionBinding, Boundary['seq']>()
  return async (binding: SessionBinding, expected: Boundary): Promise<boolean> => {
    const state = read(binding)
    if (!isCurrent(binding) || state.availability !== 'ready' || state.boundary !== expected
      || inFlight.has(binding) || attempted.get(binding) === expected.seq) return false
    inFlight.add(binding)
    attempted.set(binding, expected.seq)
    try {
      const submission = binding.session.beginSubmission({ mode: 'queue', text: '继续', attachments: [] })
      try {
        const result = await binding.session.prompt([{ type: 'text', text: '继续' }], 'queue', undefined, submission.requestId)
        // A transport failure may be ambiguous. Never automatically re-submit this ending.
        return result.ok
      } catch (error) {
        submission.abandon()
        throw error
      }
    } finally {
      inFlight.delete(binding)
    }
  }
}

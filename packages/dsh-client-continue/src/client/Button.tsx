/** Native toolbar contribution; all reactive facts arrive through framework hooks. */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Boundary } from './boundary.ts'
import type { Availability } from './continue.ts'
import { availability } from './continue.ts'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'

export interface Injected {
  readonly hooks: { readonly boundary: HostObservable<Boundary | null | undefined> }
  readonly onContinue: (expected: Boundary) => Promise<void>
}
type Props = PropsRuntime<'conversation.input.right'> & InjectFace<Injected> & PropsLocale<'chlrc-continue'>

export function ContinueButton({ sessionId, useSession, useInput, useSessionStatus, useBoundary, onContinue, t }: Props) {
  const session = useSession(s => s)
  const input = useInput(s => s)
  const pendingInteraction = useSessionStatus(s => s.get(sessionId)?.pendingInteraction !== undefined)
  const boundary = useBoundary(s => s)
  const [pending, setPending] = useState(false)
  const state: Availability = availability(session, input, boundary, pendingInteraction)
  if (state === 'hidden') return null
  return <Button variant="toolbar" size="sm" disabled={pending || state !== 'ready'}
    title={state === 'ready' ? t('continue') : t(state)} aria-label={t('continue')}
    onClick={() => {
      if (boundary == null) return
      setPending(true)
      void onContinue(boundary).finally(() => { setPending(false) })
    }}>{t('continue')}</Button>
}

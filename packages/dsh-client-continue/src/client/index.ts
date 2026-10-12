/** Native continue control and remappable command, backed by normal prompt admission. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { boundaryDefinition, boundaryView, TARGET, type Boundary } from './boundary.ts'
import { availability, createContinueAction } from './continue.ts'
import { ContinueButton, type Injected } from './Button.tsx'
import { en, zh, type ContinueKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'chlrc-continue': ContinueKey }
}

export const inject = ['slots', 'sessions', 'conversation', 'uiConversation', 'uiSession', 'locale', 'shortcuts']

/** Register effect-owned contributions. Disposing the plugin removes every entry. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.uiConversation.events.register(boundaryDefinition))
  ctx.effect(() => ctx.uiConversation.views.register(boundaryView))
  ctx.effect(() => ctx.locale.register(TARGET, { en, zh }))
  const t = ctx.locale.bind(TARGET)
  const source = (binding: SessionBinding) => {
    const conversation = ctx.uiConversation.binding(binding)
    conversation.activate(TARGET)
    return conversation.target(TARGET)
  }
  const read = (binding: SessionBinding) => ({
    boundary: source(binding).getSnapshot(),
    availability: availability(binding.session.getSnapshot(), ctx.conversation.input.for(binding.ctx).state.getSnapshot(),
      source(binding).getSnapshot(), ctx.uiSession.sessionStatus.getSnapshot().get(binding.sessionId)?.pendingInteraction !== undefined),
  })
  const submit = createContinueAction(read, binding => ctx.sessions.binding(binding.sessionId) === binding)
  const run = async (binding: SessionBinding, expected: Boundary): Promise<void> => {
    try {
      if (!await submit(binding, expected)) ctx.conversation.input.for(binding.ctx).notify('error', t('failed'))
    } catch {
      // The ordinary session prompt owns its transport error; no automatic replay.
      ctx.conversation.input.for(binding.ctx).notify('error', t('failed'))
    }
  }
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: TARGET, order: 90, locale: TARGET,
    inject: (sessionId): Injected => {
      const binding = ctx.sessions.binding(sessionId)
      if (binding === undefined) throw new Error('continue: session binding unavailable')
      return { hooks: { boundary: source(binding) }, onContinue: expected => run(binding, expected) }
    },
  }, ContinueButton))
  ctx.effect(() => ctx.shortcuts.register({
    id: 'chlrc.continue' as ShortcutCommandId,
    label: () => t('command'), aliases: ['continue', '继续'], defaults: {}, regions: ['page', 'editable'], modals: [],
    resolve: context => {
      const target = context.target
      if (context.modal !== null || target === null) return { status: 'pass' }
      const occurrence = target.closest<HTMLElement>('[data-conversation-session]')
      const region = target.closest('[data-conversation-region]')
      if (occurrence === null || region === null || !occurrence.contains(region)
        || target.closest('[data-approval-key], iframe, .xterm, [inert]') !== null) return { status: 'pass' }
      const binding = ctx.sessions.binding(occurrence.dataset.conversationSession as SessionId)
      if (binding === undefined) return { status: 'pass' }
      const state = read(binding)
      if (state.availability === 'hidden') return { status: 'pass' }
      if (state.availability !== 'ready') return { status: 'blocked', reason: t(state.availability) }
      const expected = state.boundary
      if (expected == null) return { status: 'pass' }
      return { status: 'handled', run: () => { void run(binding, expected) } }
    },
  }))
}

/** Incremental projection of the latest turn ending; no transcript rescans. */
import type { SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { ConversationNodeDefinition, ConversationViewDefinition, ConversationViewNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

export const TARGET = 'chlrc-continue'
export type Boundary = { readonly seq: SessionEvent<'turn/end'>['seq']; readonly turn: number; readonly reason: SessionEvent<'turn/end'>['data']['reason'] }
type State = Boundary | null
type Node = ConversationViewNode & { readonly data: State }

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    'chlrc-continue': State
  }
}

/** Fold only lifecycle events; a new input invalidates the preceding ending. */
export function fold(event: SessionEventLike): State {
  return event.type === 'turn/end' ? { seq: event.seq, turn: event.data.turn, reason: event.data.reason } : null
}

export const boundaryDefinition: ConversationNodeDefinition<State> = {
  kind: TARGET,
  target: TARGET,
  match: event => ['turn/start', 'turn/end', 'user/message'].includes(event.type)
    ? { id: 'latest', role: 'start' } : null,
  start: (_context, match) => fold(match.event),
  update: (_context, match) => fold(match.event),
  buildViewNode: context => ({ key: context.key, kind: TARGET, id: context.id, target: TARGET, data: context.state ?? null }),
}

export const boundaryView: ConversationViewDefinition<Node, State> = {
  target: TARGET,
  create: () => {
    let value: State = null
    return {
      empty: null,
      replace: ({ nodes }) => { value = nodes.at(-1)?.data ?? null; return value },
      apply: ({ upserts }) => { if (upserts.length > 0) value = upserts.at(-1)!.data; return value },
    }
  },
  isActive: () => false,
}

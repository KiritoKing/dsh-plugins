import { describe, expect, it, vi } from 'vitest'
import { availability, createContinueAction } from '../src/client/continue.ts'
import { fold, boundaryDefinition, boundaryView } from '../src/client/boundary.ts'
import type { Boundary } from '../src/client/boundary.ts'
import type { SessionBinding, SessionSnapshot, SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'

const ending = (kind = 'max-tokens'): Boundary => ({ seq: 2, turn: 1, reason: { kind } } as Boundary)
const idle = () => ({ subagent: null, removed: false, openState: 'open', running: false, awaitingFirstTurn: false, pendingSubmissions: [] } as SessionSnapshot)
const empty = () => ({ draft: '', attachmentIds: [], occurrences: [], queue: [], phase: 'plain' } as InputState)

it('shows only recoverable root-session endings', () => {
  for (const kind of ['completed', 'blocked', 'interrupted', 'forked']) expect(availability(idle(), empty(), ending(kind), false)).toBe('hidden')
  expect(availability(idle(), empty(), null, false)).toBe('hidden')
  expect(availability({ ...idle(), subagent: {} } as SessionSnapshot, empty(), ending(), false)).toBe('hidden')
  expect(availability(idle(), empty(), ending(), false)).toBe('ready')
  expect(availability(idle(), empty(), { ...ending(), reason: { kind: 'aborted', reason: { kind: 'user' } } }, false)).toBe('ready')
  expect(availability(idle(), empty(), { ...ending(), reason: { kind: 'aborted', reason: { kind: 'disposed' } } }, false)).toBe('hidden')
})

it('protects drafts, attachments, references, queue, and pending interactions', () => {
  for (const change of [{ running: true }, { removed: true }, { openState: 'opening' }, { awaitingFirstTurn: true }, { pendingSubmissions: [{}] }]) {
    expect(availability({ ...idle(), ...change } as SessionSnapshot, empty(), ending(), false)).toBe('busy')
  }
  for (const change of [{ draft: ' ' }, { attachmentIds: ['a'] }, { occurrences: [{}] }]) {
    expect(availability(idle(), { ...empty(), ...change } as InputState, ending(), false)).toBe('draft')
  }
  for (const change of [{ queue: [{}] }, { phase: 'adjudicating' }, { phase: 'claimed' }, { phase: 'submitting' }]) {
    expect(availability(idle(), { ...empty(), ...change } as InputState, ending(), false)).toBe('busy')
  }
  expect(availability(idle(), empty(), ending(), true)).toBe('busy')
})

it('does not offer a credential or billing retry', () => {
  for (const error of [{ code: 'authentication', status: 500 }, { code: 'request', status: 403 }, { code: 'quota-exceeded', status: 429 }, { code: 'billing', status: 400 }]) {
    expect(availability(idle(), empty(), { ...ending(), reason: { kind: 'error', error: { message: 'failure', ...error } } }, false)).toBe('credentials')
  }
  expect(availability(idle(), empty(), { ...ending(), reason: { kind: 'error', error: { code: 'rate-limit', status: 429, message: 'failure' } } }, false)).toBe('ready')
})

describe('identified prompt admission', () => {
  function fixture() {
    const boundary = ending()
    const beginSubmission = vi.fn(() => ({ requestId: 'request', abandon: vi.fn() }))
    const prompt = vi.fn(async () => ({ ok: true }))
    const binding = { session: { beginSubmission, prompt } } as SessionBinding
    const read = vi.fn(() => ({ availability: 'ready' as const, boundary }))
    const current = vi.fn(() => true)
    return { binding, boundary, beginSubmission, prompt, read, current, action: createContinueAction(read, current) }
  }
  it('uses normal queue admission once and does not mutate the composer', async () => {
    const f = fixture()
    const [a, b] = await Promise.all([f.action(f.binding, f.boundary), f.action(f.binding, f.boundary)])
    expect([a, b]).toEqual([true, false])
    expect(f.beginSubmission).toHaveBeenCalledExactlyOnceWith({ mode: 'queue', text: '继续', attachments: [] })
    expect(f.prompt).toHaveBeenCalledExactlyOnceWith([{ type: 'text', text: '继续' }], 'queue', undefined, 'request')
  })
  it('rejects an old session binding or a changed ending', async () => {
    const f = fixture()
    f.current.mockReturnValue(false)
    expect(await f.action(f.binding, f.boundary)).toBe(false)
    f.current.mockReturnValue(true)
    expect(await f.action(f.binding, ending())).toBe(false)
    expect(f.prompt).not.toHaveBeenCalled()
  })
  it('does not automatically repeat an ambiguous failure', async () => {
    const f = fixture()
    f.prompt.mockRejectedValueOnce(new Error('connection lost'))
    await expect(f.action(f.binding, f.boundary)).rejects.toThrow('connection lost')
    expect(await f.action(f.binding, f.boundary)).toBe(false)
    expect(f.prompt).toHaveBeenCalledTimes(1)
    expect(f.beginSubmission.mock.results[0]!.value.abandon).toHaveBeenCalledTimes(1)
  })
  it('retains the duplicate fence across projection rehydration', async () => {
    const f = fixture()
    await f.action(f.binding, f.boundary)
    const rebuilt = { ...f.boundary }
    f.read.mockReturnValue({ availability: 'ready', boundary: rebuilt })
    expect(await f.action(f.binding, rebuilt)).toBe(false)
    expect(f.prompt).toHaveBeenCalledTimes(1)
  })
  it('does not retry rejected admission', async () => {
    const f = fixture()
    f.prompt.mockResolvedValueOnce({ ok: false })
    expect(await f.action(f.binding, f.boundary)).toBe(false)
    expect(await f.action(f.binding, f.boundary)).toBe(false)
    expect(f.prompt).toHaveBeenCalledTimes(1)
  })
})

it('folds lifecycle events and invalidates an ending at new input', () => {
  const end = { type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'max-tokens' } } } as SessionEventLike
  expect(fold(end)).toEqual(ending())
  expect(fold({ type: 'turn/start' } as SessionEventLike)).toBeNull()
  expect(fold({ type: 'user/message' } as SessionEventLike)).toBeNull()
  expect(boundaryDefinition.match(end)?.id).toBe('latest')
  expect(boundaryDefinition.match({ type: 'llm/start' } as SessionEventLike)).toBeNull()
})

it('publishes incremental view updates without scanning transcript history', () => {
  const view = boundaryView.create()
  const data = ending()
  const node = { key: 'latest', kind: 'chlrc-continue', id: 'latest', target: 'chlrc-continue', data }
  expect(view.replace({ nodes: [node], timeline: [] } as Parameters<typeof view.replace>[0])).toEqual(data)
  expect(view.apply({ upserts: [], timeline: [] } as Parameters<typeof view.apply>[0])).toEqual(data)
  expect(view.apply({ upserts: [{ ...node, data: null }], timeline: [] } as Parameters<typeof view.apply>[0])).toBeNull()
  expect(view.replace({ nodes: [], timeline: [] } as Parameters<typeof view.replace>[0])).toBeNull()
})

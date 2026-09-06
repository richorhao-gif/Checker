/**
 * The plan strip's posture derivation. These specs pin the two things the
 * strip promises: every posture is read out of the Session snapshot alone, and
 * the failure evidence is judged per turn — an earlier turn's token cap says
 * nothing about the turn that owns the list currently on screen.
 */
import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { TodoPostureFacts } from '../src/client/skeleton/todo-posture.ts'
import { deriveTodoPosture } from '../src/client/skeleton/todo-posture.ts'

// Fixtures carry only the fields the derivation reads; the node types are the
// projection's, and nothing here exercises the rest of them. Every factory
// takes a turn, because the fold is scoped to one turn.
const userNode = (content: string): ConversationNode =>
  ({ kind: 'user', seq: 1, time: 1000, content: [{ type: 'text', text: content }] }) as unknown as ConversationNode
const assistantNode = (turn: number, seq = 2): ConversationNode =>
  ({ kind: 'assistant', seq, turn, step: 1, blocks: [{ kind: 'text', text: '审核结论' }] }) as unknown as ConversationNode
const stoppedNode = (turn: number, seq = 3): ConversationNode =>
  ({ kind: 'assistant', seq, turn, step: 1, interrupted: true, blocks: [] }) as unknown as ConversationNode
const toolResultNode = (seq = 4): ConversationNode =>
  ({ kind: 'tool-result', seq, call: { name: 'read_file' } }) as unknown as ConversationNode
const turnErrorNode = (turn: number, seq = 5): ConversationNode =>
  ({ kind: 'turn-error', seq, turn, step: 1, message: '上游超时' }) as unknown as ConversationNode
const maxTokensNode = (turn: number, seq = 6): ConversationNode =>
  ({ kind: 'turn-max-tokens', seq, turn, step: 1 }) as unknown as ConversationNode

/** One in-window turn/start with no matching turn/end. */
const startsAt = (turn: number) => new Map([[turn, { startTime: turn * 1000 }]])
/** One in-window turn/end, keyed by turn and valued by its event seq. */
const endsAt = (...turns: number[]) => new Map(turns.map(turn => [turn, turn * 10 + 1]))

function facts(overrides: Partial<TodoPostureFacts> = {}): TodoPostureFacts {
  return {
    removed: false,
    running: false,
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map(),
    ...overrides,
  }
}

describe('deriveTodoPosture', () => {
  it('spins while the Host reports a running turn', () => {
    // The running bit is the Host's own authority, so a recorded end for a
    // lower turn cannot conclude past it.
    expect(deriveTodoPosture(facts({ running: true, turnEnds: endsAt(3) }))).toBe('live')
  })

  it('settles once the highest turn in window ended cleanly', () => {
    const posture = deriveTodoPosture(facts({ turnEnds: endsAt(3), nodes: [assistantNode(3)] }))

    expect(posture).toBe('settled')
  })

  it('keeps spinning while the window holds no turn boundary', () => {
    // Either the Session never ran a turn (and the panel is not rendered at
    // all) or paging moved the list's own turn out; neither proves an end.
    expect(deriveTodoPosture(facts())).toBe('live')
  })

  it('keeps spinning while the highest turn has a start but no end', () => {
    const posture = deriveTodoPosture(facts({ turnTimings: startsAt(5), turnEnds: endsAt(3) }))

    expect(posture).toBe('live')
  })

  it('halts on a terminal error in the highest turn', () => {
    const posture = deriveTodoPosture(facts({ turnEnds: endsAt(3), nodes: [turnErrorNode(3)] }))

    expect(posture).toBe('halted')
  })

  it('ignores a terminal error from an earlier turn', () => {
    const posture = deriveTodoPosture(facts({
      turnEnds: endsAt(2, 3),
      nodes: [turnErrorNode(2), assistantNode(3)],
    }))

    expect(posture).toBe('settled')
  })

  it('halts on a token-cap end in the highest turn', () => {
    const posture = deriveTodoPosture(facts({ turnEnds: endsAt(3), nodes: [maxTokensNode(3)] }))

    expect(posture).toBe('halted')
  })

  it('ignores a token cap from an earlier turn', () => {
    const posture = deriveTodoPosture(facts({
      turnEnds: endsAt(2, 3),
      nodes: [maxTokensNode(2), assistantNode(3)],
    }))

    expect(posture).toBe('settled')
  })

  it('halts on a frozen stop in the highest turn', () => {
    const posture = deriveTodoPosture(facts({ turnEnds: endsAt(3), nodes: [stoppedNode(3)] }))

    expect(posture).toBe('halted')
  })

  it('ignores a frozen stop from an earlier turn', () => {
    const posture = deriveTodoPosture(facts({
      turnEnds: endsAt(2, 3),
      nodes: [stoppedNode(2), assistantNode(3)],
    }))

    expect(posture).toBe('settled')
  })

  it('halts once the Host removed the Session, running or not', () => {
    // A removed Session never sees another turn/start, so anything still
    // animating on it animates forever — and reporting it finished would claim
    // a completion that never happened.
    expect(deriveTodoPosture(facts({ removed: true }))).toBe('halted')
    expect(deriveTodoPosture(facts({ removed: true, running: true, turnEnds: endsAt(3) }))).toBe('halted')
  })

  it('settles on an end whose start paged out of the window', () => {
    const posture = deriveTodoPosture(facts({ turnEnds: endsAt(7), nodes: [assistantNode(7)] }))

    expect(posture).toBe('settled')
  })

  it('skips node kinds that carry no turn', () => {
    const posture = deriveTodoPosture(facts({
      turnEnds: endsAt(3),
      nodes: [userNode('请审核该文件'), toolResultNode(), assistantNode(3)],
    }))

    expect(posture).toBe('settled')
  })
})

// How the plan strip reads once the turn that wrote it is over. Derived on the
// client, not pushed by the Host: the 'todos' projection deliberately keeps the
// finished list visible until the next turn/start, so a Session that never gets
// another turn — a sealed submission — would spin its last open item forever.
// The loop ends when the model emits text with no tool call, which is exactly
// what a final item like "summarize the conclusion" asks it to do, so the model
// structurally cannot tick its own last item.

import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * The reading the plan strip takes: `live` while a turn runs, `settled` once
 * the highest turn in window ended cleanly, `halted` when it left failure
 * evidence behind.
 */
export type TodoPosture = 'live' | 'settled' | 'halted'

/** The Session facts the posture is derived from, all of which the dock entry already holds. */
export interface TodoPostureFacts {
  /** Whether the Host removed the Session, which will never see another turn/start. */
  readonly removed: boolean
  /** The Host's running bit, whose sole writer is the agent/status relay. */
  readonly running: boolean
  /** Nodes of the loaded window, scanned for the highest turn's failure evidence. */
  readonly nodes: readonly ConversationNode[]
  /** Exact in-window turn/start time and optional matching turn/end time. */
  readonly turnTimings: ReadonlyMap<number, { readonly startTime: number; readonly endTime?: number }>
  /** In-window turn number to its turn/end event seq. */
  readonly turnEnds: ReadonlyMap<number, number>
}

/**
 * The highest turn number either boundary map holds.
 * @param facts - the Session facts to read the window from.
 * @returns that turn number, or null when the window holds no turn boundary at
 * all — either the Session never ran one, or paging moved it out of window.
 */
function lastTurnInWindow(facts: TodoPostureFacts): number | null {
  const turns = [...facts.turnEnds.keys(), ...facts.turnTimings.keys()]
  return turns.length === 0 ? null : Math.max(...turns)
}

/**
 * Whether one turn left failure evidence. Scoped to that turn, never folded
 * over the whole log: an earlier turn's token cap says nothing about the turn
 * that owns the list currently on screen.
 * @param nodes - nodes of the loaded window.
 * @param turn - the turn number to judge.
 * @returns true when that turn carries a terminal error, a token-cap end, or an
 * assistant node frozen by an abort.
 */
function failedInTurn(nodes: readonly ConversationNode[], turn: number): boolean {
  return nodes.some((node) => {
    if (node.kind === 'turn-error' || node.kind === 'turn-max-tokens') return node.turn === turn
    return node.kind === 'assistant' && node.interrupted === true && node.turn === turn
  })
}

/**
 * Decide how the plan strip should read its items.
 *
 * `removed` outranks `running` because a Session the Host deleted will never
 * see another turn/start, so anything still animating on it animates forever,
 * and reporting it as finished would claim a completion that never happened.
 * `running` outranks every derived reading because it is the Host's own
 * authority on whether a turn is in flight.
 * @param facts - the Session facts to decide from.
 * @returns `live` while a turn runs or while the window cannot prove one ended,
 * `settled` once the highest turn in window ended cleanly, and `halted` when
 * the Session is gone or that turn failed.
 */
export function deriveTodoPosture(facts: TodoPostureFacts): TodoPosture {
  if (facts.removed) return 'halted'
  if (facts.running) return 'live'
  const lastTurn = lastTurnInWindow(facts)
  // No boundary in window, or the highest one has a start without an end: the
  // list's own turn may be the one that paged out, and a dropped frame or a
  // reconnect resyncs `running` anyway. Neither is evidence to conclude from.
  if (lastTurn === null || !facts.turnEnds.has(lastTurn)) return 'live'
  return failedInTurn(facts.nodes, lastTurn) ? 'halted' : 'settled'
}

// @vitest-environment jsdom
/**
 * Todo display acceptance: the TodoPanel plan strip (empty-hidden, status rows
 * including several `in_progress` at once, collapse, and the three postures a
 * finished turn can leave it in), and its TodoDock adapter (selects the plan
 * off the session snapshot, derives the posture from the same snapshot, and
 * follows changes).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationNode, ConversationSnapshot, SessionId, TodoItem } from '@deepseek-ai/dsh-client-runtime/client'
import { conversationSnapshot, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { TodoDockProps } from '../src/client/skeleton/TodoPanel.tsx'
import { TodoDock, TodoPanel, todoDockEntry } from '../src/client/skeleton/TodoPanel.tsx'
import type { TodoPosture } from '../src/client/skeleton/todo-posture.ts'
import { NS, zh } from '../src/client/locales.ts'

const SID = 'session-1' as SessionId

// Mirrors the real lookup chain (conversation namespace, then common).
const t: TodoDockProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

const LIST: TodoItem[] = [
  { content: '搭骨架', status: 'completed' },
  { content: '写组件', status: 'in_progress' },
  { content: '补测试', status: 'pending' },
]

/** A parallel plan: three tasks running at once (concurrent subagents). */
const PARALLEL: TodoItem[] = [
  { content: '搭骨架', status: 'completed' },
  { content: '写组件', status: 'in_progress' },
  { content: '跑后台构建', status: 'in_progress' },
  { content: '读源码', status: 'in_progress' },
  { content: '补测试', status: 'pending' },
]

/**
 * Which glyph a row renders. Structural, not by class name: this lane never
 * compiles CSS modules, so the completed tick is the only glyph carrying a
 * path, the in-progress ring is the only one whose circle strokes a gradient,
 * and the dashed pending ring is what is left.
 */
function glyphOf(li: HTMLElement): 'completed' | 'in_progress' | 'pending' | 'none' {
  const svg = li.querySelector('svg')
  if (svg === null) return 'none'
  if (svg.querySelector('path') !== null) return 'completed'
  return svg.querySelector('circle')?.getAttribute('stroke')?.startsWith('url(#') === true
    ? 'in_progress'
    : 'pending'
}

describe('TodoPanel', () => {
  it('renders nothing while the list is empty', () => {
    const { container } = render(<TodoPanel todos={[]} posture="live" t={t} />)
    expect(container.innerHTML).toBe('')
  })

  it('starts collapsed with the per-status count summary visible', () => {
    render(<TodoPanel todos={LIST} posture="live" t={t} />)
    expect(screen.getByTestId('todo-panel')).toBeTruthy()
    expect(screen.getByText('任务')).toBeTruthy()
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('omits the completed segment while nothing is done yet', () => {
    render(<TodoPanel todos={[
      { content: '写组件', status: 'in_progress' },
      { content: '补测试', status: 'pending' },
    ]} posture="live" t={t} />)
    expect(screen.getByText('1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.queryByText(/已完成/)).toBeNull()
  })

  it('expands to show one row per item with its status glyph', () => {
    render(<TodoPanel todos={LIST} posture="live" t={t} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const items = screen.getAllByRole('listitem')
    expect(items.map(li => li.getAttribute('data-status'))).toEqual(['completed', 'in_progress', 'pending'])
    expect(screen.getByText('搭骨架')).toBeTruthy()
    expect(screen.getByText('写组件')).toBeTruthy()
    // Each status row carries an SVG glyph (not a text bullet).
    expect(items.every(li => li.querySelector('svg') !== null)).toBe(true)
  })

  it('collapse hides an expanded list; expand restores; header keeps the count summary', () => {
    render(<TodoPanel todos={LIST} posture="live" t={t} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const header = screen.getByRole('button', { expanded: true })
    fireEvent.click(header)
    expect(screen.queryByRole('list')).toBeNull()
    // Collapsed header is title + progress only (no in-progress content hint).
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.queryByText('写组件')).toBeNull()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('marks every parallel active item, and counts them all in the header', () => {
    render(<TodoPanel todos={PARALLEL} posture="live" t={t} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    // An unconditional in-progress cap would make this list unreachable: three
    // items carry the in-progress glyph at once, and the header counts all three.
    const statuses = screen.getAllByRole('listitem').map(li => li.getAttribute('data-status'))
    expect(statuses.filter(s => s === 'in_progress')).toHaveLength(3)
    expect(screen.getByText('跑后台构建')).toBeTruthy()
    expect(screen.getByText('读源码')).toBeTruthy()
    expect(screen.getByText('1 已完成 · 3 进行中 · 1 待处理')).toBeTruthy()
  })

  it('an all-completed list collapses the summary to the done count alone', () => {
    render(<TodoPanel todos={[{ content: '都完了', status: 'completed' }]} posture="live" t={t} />)
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy()
    expect(screen.queryByText('都完了')).toBeNull()
    expect(screen.getByText('1 已完成')).toBeTruthy()
    expect(screen.queryByText(/进行中|待处理/)).toBeNull()
  })

  it('settles every open item once its turn is over', () => {
    render(<TodoPanel todos={LIST} posture="settled" t={t} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const items = screen.getAllByRole('listitem')
    // The row keeps the model's own record; only the reading changes.
    expect(items.map(li => li.getAttribute('data-status'))).toEqual(['completed', 'in_progress', 'pending'])
    expect(items.map(glyphOf)).toEqual(['completed', 'completed', 'completed'])
    expect(screen.getByText('3 已完成')).toBeTruthy()
  })

  it('settles a parallel plan to the done count alone', () => {
    // The bid-review case in miniature: the model left three items open and
    // then ended its turn by writing the report those items asked for.
    render(<TodoPanel todos={PARALLEL} posture="settled" t={t} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const items = screen.getAllByRole('listitem')
    expect(items.map(li => li.getAttribute('data-status')).filter(s => s === 'in_progress')).toHaveLength(3)
    expect(items.map(glyphOf).filter(g => g === 'completed')).toHaveLength(5)
    expect(screen.getByText('5 已完成')).toBeTruthy()
    expect(screen.queryByText(/进行中|待处理/)).toBeNull()
  })

  it('freezes the ring but keeps every real status on a halted turn', () => {
    render(<TodoPanel todos={LIST} posture="halted" t={t} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    const items = screen.getAllByRole('listitem')
    expect(items.map(li => li.getAttribute('data-status'))).toEqual(['completed', 'in_progress', 'pending'])
    expect(items.map(glyphOf)).toEqual(['completed', 'in_progress', 'pending'])
  })

  it('halts the wording along with the ring', () => {
    render(<TodoPanel todos={LIST} posture="halted" t={t} />)
    expect(screen.getByText('1 已完成 · 1 已停止 · 1 待处理')).toBeTruthy()
    expect(screen.queryByText(/进行中/)).toBeNull()
  })

  it('publishes its posture on the panel root', () => {
    // The only automated handle on the CSS rule that decides whether the ring
    // spins: the animation is scoped to [data-posture='live'] .glyphProgress.
    const postures: TodoPosture[] = ['live', 'settled', 'halted']
    for (const posture of postures) {
      render(<TodoPanel todos={LIST} posture={posture} t={t} />)
      expect(screen.getByTestId('todo-panel').getAttribute('data-posture')).toBe(posture)
      cleanup()
    }
  })
})

/** One in-window turn/end, keyed by turn and valued by its event seq. */
const endsAt = (...turns: number[]) => new Map(turns.map(turn => [turn, turn * 10 + 1]))

/** A durable terminal failure for a turn that has no scheduled retry. */
const turnErrorNode = (turn: number): ConversationNode =>
  ({ kind: 'turn-error', seq: 5, turn, step: 1, message: '上游超时' }) as unknown as ConversationNode

/**
 * Dock props stub: the adapter reads the 'todos' projection and the owner
 * share's session snapshot. The default snapshot is quiescent with no turn
 * boundary in window, which derives to `live`.
 */
function dockProps(
  store: ReturnType<typeof createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>>,
  session: ConversationSnapshot = conversationSnapshot(SID),
): TodoDockProps {
  const useProjection = (_key: string, selector?: (v: unknown) => unknown) =>
    bindSnapshotSelector(store)(s => (selector ?? (v => v))(s.value))
  return { session, useProjection, t } as unknown as TodoDockProps
}

describe('TodoDock', () => {
  it('reads the host-computed todos projection and follows pushed updates', () => {
    const store = createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>({ value: undefined })
    render(<TodoDock {...dockProps(store)} />)
    // Capability absent (no baseline/frame yet) renders nothing.
    expect(screen.queryByTestId('todo-panel')).toBeNull()
    act(() => { store.set({ value: LIST }) })
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    // The pre-first-write whole value (null) retires the strip (the panel owns no data).
    act(() => { store.set({ value: null }) })
    expect(screen.queryByTestId('todo-panel')).toBeNull()
  })

  it('settles the strip once the owner share reports the turn ended', () => {
    const store = createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>({ value: LIST })
    render(<TodoDock {...dockProps(store, { ...conversationSnapshot(SID), turnEnds: endsAt(3) })} />)
    expect(screen.getByText('3 已完成')).toBeTruthy()
    expect(screen.getByTestId('todo-panel').getAttribute('data-posture')).toBe('settled')
  })

  it('keeps the live wording while the Host still reports the turn running', () => {
    // The running bit is the Host's own authority: a recorded end for an
    // earlier turn cannot conclude past it.
    const store = createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>({ value: LIST })
    render(<TodoDock {...dockProps(store, {
      ...conversationSnapshot(SID), running: true, turnEnds: endsAt(3),
    })} />)
    expect(screen.getByText('1 已完成 · 1 进行中 · 1 待处理')).toBeTruthy()
    expect(screen.getByTestId('todo-panel').getAttribute('data-posture')).toBe('live')
  })

  it('halts the strip when the last turn failed, keeping every real status', () => {
    const store = createSnapshotStore<{ value: readonly TodoItem[] | null | undefined }>({ value: LIST })
    render(<TodoDock {...dockProps(store, {
      ...conversationSnapshot(SID), turnEnds: endsAt(3), nodes: [turnErrorNode(3)],
    })} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getAllByRole('listitem').map(li => li.getAttribute('data-status')))
      .toEqual(['completed', 'in_progress', 'pending'])
    expect(screen.getByText('1 已完成 · 1 已停止 · 1 待处理')).toBeTruthy()
    expect(screen.getByTestId('todo-panel').getAttribute('data-posture')).toBe('halted')
  })

  it('registers before the goal and queue entries', () => {
    expect(todoDockEntry.name).toBe('conversation-todo-dock')
    expect(todoDockEntry.inject).toEqual(['slots'])
    const register = vi.fn(() => () => undefined)
    const inject = vi.fn((_name: string, callback: () => () => void) => callback())
    todoDockEntry.apply({ slots: { inject, register } } as never)
    expect(inject).toHaveBeenCalledWith('conversation.input.dock', expect.any(Function))
    expect(register).toHaveBeenCalledWith({ name: 'conversation.input.dock', id: 'todo', order: 0, locale: NS }, TodoDock)
  })
})

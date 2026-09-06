// @vitest-environment jsdom
/**
 * The reviewing desk: the entry that shadows the chat cell once a bid review is
 * under way. These specs pin what the surface promises the user — that every
 * posture comes from the Session snapshot, that the paper's marks and the timer
 * are the log's own values, that the seal lands only when the last turn ended,
 * and that the opinion sheet it turns to is the model's own closing text headed
 * by the deployment's letterhead.
 */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import type {
  ConversationNode, PartialAssistant, PendingInteraction, RunningToolCall, SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { BidReviewLimits, CompanyQualifications } from '@deepseek-ai/dsh-bid-review/types'
import { ReviewDesk } from '../src/client/ReviewDesk.tsx'
import type { Outcome } from '../src/client/remote.ts'
import { chineseDate, formatElapsed, formatTimeOfDay, formatTimestamp } from '../src/client/format.ts'
import { buildBidReviewPrompt } from '../src/client/prompt.ts'
import { zh, en } from '../src/client/locales.ts'
import css from '../src/client/ReviewDesk.module.css'

afterEach(cleanup)
beforeEach(() => { vi.useRealTimers() })

const t = makeTranslate(zh, commonZh)
const tEn = makeTranslate(en, commonEn)
const SID = 'session-0001' as SessionId
const PATH = '/srv/bid-documents/1f-标书.pdf'
const PROMPT = buildBidReviewPrompt(PATH, '蔬菜配送资质')
const STARTED_AT = new Date(2026, 8, 5, 14, 32, 8).getTime()
const ENDED_AT = new Date(2026, 8, 5, 14, 33, 20).getTime()
const UPDATED_AT = new Date(2026, 8, 4, 9, 5).getTime()
const LIMITS: BidReviewLimits = {
  maxQualificationsBytes: 64 * 1024, maxDocumentBytes: 100 * 1024 * 1024, companyName: '',
}
const FILLED: CompanyQualifications = { text: '蔬菜配送资质', updatedAt: UPDATED_AT }
const REPORT = '判定：不符合\n\n供应商资格要求 ISO22000 认证，公司资格记录中仅有 HACCP。'

// Fixtures carry only the fields the desk reads.
const userNode = (content: string, time = 1000): ConversationNode =>
  ({ kind: 'user', seq: 1, time, content: [{ type: 'text', text: content }] }) as unknown as ConversationNode
const assistantNode = (text: string, seq = 9): ConversationNode =>
  ({ kind: 'assistant', seq, blocks: [{ kind: 'text', text }] }) as unknown as ConversationNode
const toolResultNode = (seq: number): ConversationNode =>
  ({ kind: 'tool-result', seq, call: { name: 'read_file' } }) as unknown as ConversationNode
const runningCall = (name: string): RunningToolCall => ({ name }) as RunningToolCall
const approval = (toolName: string, reason?: string): PendingInteraction => ({
  kind: 'approval',
  key: 'a:1',
  payload: { approvalId: 'ap1', toolName, ...(reason === undefined ? {} : { reason }) },
}) as unknown as PendingInteraction
const question = (): PendingInteraction =>
  ({ kind: 'question', key: 'q:1', payload: { questions: [] } }) as unknown as PendingInteraction

/** The Session facts the desk selects, one field per selector it holds. */
interface Snapshot {
  removed: boolean
  blank: boolean
  composerPhase: 'blank' | 'engaging' | 'active'
  running: boolean
  pending: readonly PendingInteraction[]
  nodes: readonly ConversationNode[]
  partial: PartialAssistant | null
  runningCalls: readonly RunningToolCall[]
  turnTimings: ReadonlyMap<number, { startTime: number; endTime?: number }>
  promptError: { op: 'send' | 'stop'; error: { code: string; message: string } } | null
  openState: 'cold' | 'loading' | 'open' | 'error'
  hasMore: boolean
  loadingOlder: boolean
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    removed: false,
    blank: false,
    composerPhase: 'active',
    running: false,
    pending: [],
    nodes: [userNode(PROMPT)],
    partial: null,
    runningCalls: [],
    turnTimings: new Map(),
    promptError: null,
    openState: 'open',
    hasMore: false,
    loadingOlder: false,
    ...overrides,
  }
}

/** A sealed review: one turn that started, settled three calls, and ended. */
function sealedSnapshot(report: string | null = REPORT, endedAt = ENDED_AT): Snapshot {
  const nodes: ConversationNode[] = [userNode(PROMPT), toolResultNode(2), toolResultNode(3), toolResultNode(4)]
  if (report !== null) nodes.push(assistantNode(report))
  return snapshot({ nodes, turnTimings: new Map([[1, { startTime: STARTED_AT, endTime: endedAt }]]) })
}

function ok<T>(value: T): Outcome<T> {
  return { ok: true, value }
}

function mount(options: {
  snapshot?: Snapshot
  sessionId?: SessionId
  t?: ReturnType<typeof makeTranslate>
  readLimits?: () => Promise<Outcome<BidReviewLimits>>
  readQualifications?: () => Promise<Outcome<CompanyQualifications>>
  loadOlder?: () => void
} = {}) {
  const state = options.snapshot ?? snapshot()
  const useSession = (<S,>(select: (source: Snapshot) => S): S =>
    useSyncExternalStore(() => () => {}, () => select(state))) as never
  const readLimits = vi.fn(options.readLimits ?? (() => Promise.resolve(ok(LIMITS))))
  const readQualifications = vi.fn(options.readQualifications ?? (() => Promise.resolve(ok(FILLED))))
  const loadOlder = vi.fn(options.loadOlder ?? (() => {}))
  const props = {
    useSession,
    sessionId: options.sessionId ?? SID,
    t: options.t ?? t,
    readLimits,
    readQualifications,
    loadOlder,
  } as unknown as Parameters<typeof ReviewDesk>[0]
  const element = (): ReactNode => <ReviewDesk {...props} />
  const ui = render(element())
  return {
    ...ui,
    state,
    readLimits,
    readQualifications,
    loadOlder,
    /** Re-render the same props so a mutated snapshot is read again. */
    refresh: () => { ui.rerender(element()) },
    rail: () => ui.getByRole('status'),
    // The board is the div page; the turned sheet is an article of the same paper class.
    board: () => ui.container.querySelector<HTMLElement>(`div.${css.paper as string}`),
    sheet: () => ui.container.querySelector<HTMLElement>(`article.${css.sheet as string}`),
    ticks: () => ui.container.querySelectorAll(`.${css.tickN as string}`),
    rows: () => [...ui.container.querySelectorAll<HTMLElement>(`.${css.row as string}`)],
    note: () => ui.container.querySelector<HTMLElement>(`.${css.note as string}`),
    timer: () => ui.container.querySelector<HTMLElement>(`.${css.timer as string}`),
    seal: () => ui.container.querySelector<HTMLElement>(`.${css.seal as string}`),
    /** The seal's verdict word, the span that shrinks for long copy. */
    sealWord: () => ui.container.querySelector<HTMLElement>(`.${css.sealMain as string}`),
  }
}

describe('the desk before a review is under way', () => {
  it('renders nothing while the Session is still blank', () => {
    const ui = mount({ snapshot: snapshot({ blank: true, composerPhase: 'blank', nodes: [] }) })

    expect(ui.container.firstElementChild).toBeNull()
  })

  it('holds the waiting posture with the submitted document in the archive tag', () => {
    const ui = mount({ snapshot: snapshot({ composerPhase: 'engaging' }) })

    expect(ui.rail().textContent).toContain(zh['desk.stage.waiting'])
    expect(ui.getByText('1f-标书.pdf')).toBeTruthy()
    expect(ui.getByText(t('desk.tag.submitted', { time: formatTimeOfDay(1000) }))).toBeTruthy()
    // No turn has started, so there is no duration to show.
    expect(ui.timer()).toBeNull()
    expect(ui.ticks()).toHaveLength(0)
  })

  it('names a document the log does not carry by the sheet title instead', () => {
    const ui = mount({ snapshot: snapshot({ nodes: [userNode('随便聊聊')] }) })

    expect(ui.getByText(zh['desk.doc.title'])).toBeTruthy()
  })
})

describe('the desk paging its own history', () => {
  // The desk shadows the transcript that owns the 「加载更早」 button, so a
  // reopened Session whose window starts without the submission must page itself.
  it('pages while the open window still lacks the submission', () => {
    const loadOlder = vi.fn()
    mount({ snapshot: snapshot({ nodes: [], openState: 'open', hasMore: true }), loadOlder })

    expect(loadOlder).toHaveBeenCalledTimes(1)
  })

  it('stays silent once the submission is in the window', () => {
    const loadOlder = vi.fn()
    mount({ snapshot: snapshot({ openState: 'open', hasMore: true }), loadOlder })

    expect(loadOlder).not.toHaveBeenCalled()
  })

  it('holds off while an older page loads, then resumes when it settles', () => {
    const loadOlder = vi.fn()
    const ui = mount({
      snapshot: snapshot({ nodes: [], openState: 'open', hasMore: true, loadingOlder: true }),
      loadOlder,
    })
    expect(loadOlder).not.toHaveBeenCalled()

    ui.state.loadingOlder = false
    ui.refresh()

    expect(loadOlder).toHaveBeenCalledTimes(1)
  })

  it('stays silent when there is nothing older to load', () => {
    const loadOlder = vi.fn()
    mount({ snapshot: snapshot({ nodes: [], openState: 'open', hasMore: false }), loadOlder })

    expect(loadOlder).not.toHaveBeenCalled()
  })

  it('stays silent until the window is open', () => {
    const loadOlder = vi.fn()
    mount({ snapshot: snapshot({ nodes: [], openState: 'loading', hasMore: true }), loadOlder })

    expect(loadOlder).not.toHaveBeenCalled()
  })
})

describe('the desk while the review runs', () => {
  it('shows the running tool beside the status and the turn duration on the rail', () => {
    const startedAt = Date.now() - 65_000
    const ui = mount({
      snapshot: snapshot({
        running: true,
        runningCalls: [runningCall('read_file')],
        nodes: [userNode(PROMPT), toolResultNode(2), toolResultNode(3), toolResultNode(4)],
        turnTimings: new Map([[1, { startTime: startedAt }]]),
      }),
    })

    expect(ui.rail().textContent).toContain(zh['desk.stage.tool'])
    expect(ui.rail().querySelector('code')?.textContent).toBe('read_file')
    expect(ui.timer()?.textContent).toBe(formatElapsed(65_000))
    // One mark per settled call, each naming its own ordinal.
    expect(ui.ticks()).toHaveLength(3)
    expect([...ui.ticks()].map(tick => tick.textContent)).toEqual(['1', '2', '3'])
    // The paper tint follows the last mark, never a measured file position.
    expect(ui.rows().some(row => row.className.includes(css.read as string))).toBe(true)
    expect(ui.note()).toBeNull()
  })

  it('leaves the paper unmarked before any call settled', () => {
    const ui = mount({ snapshot: snapshot({ running: true }) })

    expect(ui.rows().length).toBeGreaterThan(0)
    expect(ui.rows().every(row => !row.className.includes(css.read as string))).toBe(true)
    expect(ui.timer()).toBeNull()
  })

  it('counts the open turn up once a second', async () => {
    vi.useFakeTimers()
    const ui = mount({
      snapshot: snapshot({ running: true, turnTimings: new Map([[1, { startTime: Date.now() - 5_000 }]]) }),
    })

    expect(ui.timer()?.textContent).toBe('00:05')
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(ui.timer()?.textContent).toBe('00:06')
  })

  it('reports the streaming posture with no call in flight', () => {
    const ui = mount({
      snapshot: snapshot({
        running: true,
        partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: '符合' }] },
      }),
    })

    expect(ui.rail().textContent).toContain(zh['desk.stage.writing'])
    expect(ui.rail().querySelector('code')).toBeNull()
  })

  it('pins the paused note to the approval that blocks the turn', () => {
    const ui = mount({
      snapshot: snapshot({
        running: true,
        pending: [approval('Pwsh', '需要执行命令提取正文')],
        turnTimings: new Map([[1, { startTime: Date.now() - 41_000 }]]),
      }),
    })

    expect(ui.rail().textContent).toContain(zh['desk.stage.paused'])
    expect(ui.note()?.textContent).toContain(zh['desk.note.title'])
    // The asker's own reason replaces the generic copy.
    expect(ui.note()?.textContent).toContain('需要执行命令提取正文')
    expect(ui.note()?.textContent).toContain(t('desk.note.tool', { tool: 'Pwsh' }))
    const margin = ui.container.querySelector(`.${css.margin as string}`) as HTMLElement
    expect(margin.className).toContain(css.marginAmber as string)
    expect(margin.style.getPropertyValue('--read')).toBe('0%')
    // The light band holds where it was instead of sweeping on.
    const scan = ui.container.querySelector(`.${css.scan as string}`) as HTMLElement
    expect(scan.className).toContain(css.scanPaused as string)
  })

  it('falls back to its own copy for a wait that carries no reason', () => {
    const approvalWithoutReason = mount({ snapshot: snapshot({ pending: [approval('Pwsh')] }) })
    expect(approvalWithoutReason.note()?.textContent).toContain(zh['desk.note.approval'])

    cleanup()
    const asked = mount({ snapshot: snapshot({ pending: [question()] }) })
    expect(asked.note()?.textContent).toContain(zh['desk.note.question'])
    expect(asked.note()?.textContent).toContain(zh['desk.note.wait'])
    expect(asked.rail().querySelector('code')).toBeNull()
  })
})

describe('the desk when the review did not complete', () => {
  it('reports a refused submission without echoing the credential it masked', () => {
    const ui = mount({
      snapshot: snapshot({
        composerPhase: 'engaging',
        promptError: { op: 'send', error: { code: 'AUTH', message: 'sk-1234 was rejected' } },
      }),
    })

    expect(ui.rail().textContent).toContain(zh['desk.stage.failed'])
    expect(ui.getByRole('alert').textContent).toBe('API key is invalid')
    expect(ui.sheet()).toBeNull()
  })

  it('reports a turn error from the log', () => {
    const node = { kind: 'turn-error', seq: 9, message: '模型超时' } as unknown as ConversationNode
    const ui = mount({ snapshot: snapshot({ nodes: [userNode(PROMPT), node] }) })

    expect(ui.getByRole('alert').textContent).toBe('模型超时')
  })

  it('reports a Session the Host removed', () => {
    const ui = mount({ snapshot: snapshot({ removed: true }) })

    expect(ui.rail().textContent).toContain(zh['desk.stage.ended'])
  })
})

describe('the seal and the opinion sheet', () => {
  it('opens a finished review on the sheet, headed by the deployment letterhead', async () => {
    const ui = mount({
      snapshot: sealedSnapshot(),
      readLimits: () => Promise.resolve(ok({ ...LIMITS, companyName: '绿源农产品配送有限公司' })),
    })

    await waitFor(() => { expect(ui.getByText('绿源农产品配送有限公司')).toBeTruthy() })
    expect(ui.getByRole('heading', { name: zh['desk.doc.title'] })).toBeTruthy()
    expect(ui.getByText(t('desk.doc.subject', { file: '1f-标书.pdf' })
      + ` · ${t('desk.doc.basis', { time: formatTimestamp(UPDATED_AT) })}`)).toBeTruthy()
    expect(ui.getByText(t('desk.doc.number', { id: '0001' }))).toBeTruthy()
    expect(ui.seal()?.textContent).toContain(zh['desk.seal.reject'])
    // The declaration the seal read stays in the body: it is the model's own word.
    expect(ui.container.textContent).toContain('判定：不符合')
    expect(ui.container.textContent).toContain('供应商资格要求 ISO22000 认证，公司资格记录中仅有 HACCP。')
    expect(ui.container.textContent).toContain(chineseDate(ENDED_AT))
    // The letterhead and the basis line are the deployment's own words.
    expect(ui.readLimits).toHaveBeenCalledTimes(1)
    expect(ui.readQualifications).toHaveBeenCalledTimes(1)
  })

  it('heads the sheet with its own copy when the deployment names no company', async () => {
    const ui = mount({ snapshot: sealedSnapshot() })

    await waitFor(() => { expect(ui.getByText(zh['desk.doc.headFallback'])).toBeTruthy() })
  })

  it('drops the letterhead read when the desk went away before it landed', async () => {
    let release: (read: Outcome<BidReviewLimits>) => void = () => {}
    const held = new Promise<Outcome<BidReviewLimits>>((resolve) => { release = resolve })
    const ui = mount({ snapshot: sealedSnapshot(), readLimits: () => held })

    ui.unmount()
    await act(async () => { release(ok({ ...LIMITS, companyName: '绿源农产品配送有限公司' })) })

    expect(ui.readLimits).toHaveBeenCalledTimes(1)
  })

  it('states an unread or empty qualifications record instead of implying a basis', async () => {
    const refused = mount({
      snapshot: sealedSnapshot(),
      readQualifications: () => Promise.resolve({ ok: false, failure: { code: 'unavailable' } }),
    })
    await waitFor(() => {
      expect(refused.container.textContent).toContain(zh['desk.doc.basisUnknown'])
    })

    cleanup()
    const empty = mount({
      snapshot: sealedSnapshot(),
      readQualifications: () => Promise.resolve(ok({ text: '  ', updatedAt: UPDATED_AT })),
    })
    await waitFor(() => {
      expect(empty.container.textContent).toContain(zh['desk.doc.basisEmpty'])
    })

    cleanup()
    const unstamped = mount({
      snapshot: sealedSnapshot(),
      readQualifications: () => Promise.resolve(ok({ text: '蔬菜配送资质', updatedAt: 0 })),
    })
    await waitFor(() => {
      expect(unstamped.container.textContent).toContain(zh['desk.doc.basisNoTime'])
    })
  })

  it('seals in the ink green of a passed review', async () => {
    const ui = mount({ snapshot: sealedSnapshot('判定：符合\n\n评分准则如下。') })

    await waitFor(() => { expect(ui.seal()?.textContent).toContain(zh['desk.seal.pass']) })
    expect(ui.seal()?.className).toContain(css.sealInk as string)
  })

  it('seals the marked-up board in the same ink green', async () => {
    const ui = mount({ snapshot: sealedSnapshot('判定：符合\n\n评分准则如下。') })
    await waitFor(() => { expect(ui.sheet()).toBeTruthy() })

    fireEvent.click(ui.getByText(zh['desk.flip.toBoard']))

    expect(ui.seal()?.className).toContain(css.sealCorner as string)
    expect(ui.seal()?.className).toContain(css.sealInk as string)
  })

  it('seals a fact still to be verified in the amber that waits on a person', async () => {
    const ui = mount({ snapshot: sealedSnapshot('判定：待核验\n\n缺少北京配送车辆的证明。') })

    await waitFor(() => { expect(ui.seal()?.textContent).toContain(zh['desk.seal.unverified']) })
    expect(ui.seal()?.className).toContain(css.sealHold as string)
  })

  it('seals the marked-up board in the same amber', async () => {
    const ui = mount({ snapshot: sealedSnapshot('判定：待核验\n\n缺少北京配送车辆的证明。') })
    await waitFor(() => { expect(ui.sheet()).toBeTruthy() })

    fireEvent.click(ui.getByText(zh['desk.flip.toBoard']))

    expect(ui.seal()?.className).toContain(css.sealCorner as string)
    expect(ui.seal()?.className).toContain(css.sealHold as string)
  })

  it('seals the declaration alone, not the conditional a body paragraph raises', async () => {
    const ui = mount({ snapshot: sealedSnapshot('判定：符合\n\n若这两项无法落实，判定为不符合资格。') })

    await waitFor(() => { expect(ui.seal()?.textContent).toContain(zh['desk.seal.pass']) })
    expect(ui.seal()?.className).toContain(css.sealInk as string)
    expect(ui.seal()?.className).not.toContain(css.sealHold as string)
  })

  it('shrinks the seal word under the copy that spells it out', async () => {
    const ui = mount({ snapshot: sealedSnapshot(), t: tEn })
    await waitFor(() => { expect(ui.seal()?.textContent).toContain(en['desk.seal.reject']) })

    expect(ui.sealWord()?.className).toContain(css.sealSmall as string)
    fireEvent.click(ui.getByText(en['desk.flip.toBoard']))
    expect(ui.sealWord()?.className).toContain(css.sealSmall as string)
  })

  it('seals without a verdict when the sheet declares none', async () => {
    const ui = mount({ snapshot: sealedSnapshot('评分准则如下。') })

    await waitFor(() => { expect(ui.seal()?.textContent).toContain(zh['desk.seal.none']) })
    expect(ui.seal()?.className).not.toContain(css.sealInk as string)
    expect(ui.seal()?.className).not.toContain(css.sealHold as string)
  })

  it('says so when the finished review left no text', async () => {
    const ui = mount({ snapshot: sealedSnapshot(null) })

    await waitFor(() => { expect(ui.getByText(zh['desk.doc.empty'])).toBeTruthy() })
  })

  it('freezes the timer on the turn span once the review ended', () => {
    const ui = mount({ snapshot: sealedSnapshot() })

    expect(ui.timer()?.textContent).toBe(formatElapsed(ENDED_AT - STARTED_AT))
  })

  it('lands the seal on the board and turns the page after it', async () => {
    vi.useFakeTimers()
    const ui = mount({ snapshot: snapshot({ running: true, turnTimings: new Map([[1, { startTime: 1000 }]]) }) })

    // The seal lands the moment the last turn ends: the board settles and the
    // light band collapses to the paper's foot.
    ui.state.running = false
    ui.state.turnTimings = new Map([[1, { startTime: 1000, endTime: 4000 }]])
    ui.state.nodes = [...ui.state.nodes, assistantNode(REPORT)]
    ui.refresh()

    expect(ui.sheet()).toBeNull()
    expect(ui.seal()?.className).toContain(css.sealCorner as string)
    expect(ui.board()?.className).toContain(css.settled as string)
    expect(ui.container.querySelector(`.${css.scanCollapsed as string}`)).toBeTruthy()
    expect(ui.rail().textContent).toContain(zh['desk.stage.sealed'])

    await act(async () => { vi.advanceTimersByTime(1800) })
    expect(ui.sheet()).toBeTruthy()
    expect(ui.board()).toBeNull()
    // The turned page drops the marks and the note: it is the second page.
    expect(ui.ticks()).toHaveLength(0)
    expect(ui.getByText(zh['desk.tag.page'])).toBeTruthy()
    expect(ui.getByText(zh['desk.flip.toBoard'])).toBeTruthy()
  })

  it('turns the page at once when the user asked for reduced motion', () => {
    vi.useFakeTimers()
    globalThis.matchMedia = vi.fn(() => ({ matches: true })) as never
    const ui = mount({ snapshot: snapshot({ running: true, turnTimings: new Map([[1, { startTime: 1000 }]]) }) })

    ui.state.running = false
    ui.state.turnTimings = new Map([[1, { startTime: 1000, endTime: 4000 }]])
    ui.refresh()

    expect(ui.sheet()).toBeTruthy()
    delete (globalThis as { matchMedia?: unknown }).matchMedia
  })

  it('flips between the sheet and the marked-up board by hand', async () => {
    const ui = mount({ snapshot: sealedSnapshot() })
    await waitFor(() => { expect(ui.sheet()).toBeTruthy() })

    fireEvent.click(ui.getByText(zh['desk.flip.toBoard']))
    expect(ui.sheet()).toBeNull()
    expect(ui.board()).toBeTruthy()
    expect(ui.ticks()).toHaveLength(3)

    fireEvent.click(ui.getByText(zh['desk.flip.toDoc']))
    expect(ui.sheet()).toBeTruthy()
  })
})

describe('the sheet pencil actions', () => {
  /** Stub the two browser outputs the pencil actions reach for. */
  function stubOutputs(): { written: string[]; names: string[]; blobs: Blob[] } {
    const written: string[] = []
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: (text: string) => {
          written.push(text)
          return Promise.resolve()
        },
      },
      configurable: true,
    })
    const names: string[] = []
    const blobs: Blob[] = []
    globalThis.URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob)
      return 'blob:desk/1'
    }
    globalThis.URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function patched(this: HTMLAnchorElement) {
      names.push(this.download)
    })
    return { written, names, blobs }
  }

  afterEach(() => {
    delete (globalThis.navigator as { clipboard?: unknown }).clipboard
    delete (document as { execCommand?: unknown }).execCommand
    vi.restoreAllMocks()
  })

  it('copies the sheet in its own reading order', async () => {
    const outputs = stubOutputs()
    const ui = mount({
      snapshot: sealedSnapshot(),
      readLimits: () => Promise.resolve(ok({ ...LIMITS, companyName: '绿源农产品配送有限公司' })),
    })
    await waitFor(() => { expect(ui.getByText(zh['desk.doc.copy'])).toBeTruthy() })

    fireEvent.click(ui.getByText(zh['desk.doc.copy']))

    await waitFor(() => { expect(ui.getByText(zh['desk.doc.copied'])).toBeTruthy() })
    expect(outputs.written).toHaveLength(1)
    expect(outputs.written[0]).toBe([
      '绿源农产品配送有限公司',
      zh['desk.doc.title'],
      t('desk.doc.subject', { file: '1f-标书.pdf' }),
      t('desk.doc.basis', { time: formatTimestamp(UPDATED_AT) }),
      REPORT,
      `${zh['desk.doc.sign']} ${chineseDate(ENDED_AT)}`,
    ].join('\n\n') + '\n')
  })

  it('does not claim a copy the browser refused', async () => {
    const exec = vi.fn(() => false)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    const ui = mount({ snapshot: sealedSnapshot() })
    await waitFor(() => { expect(ui.getByText(zh['desk.doc.copy'])).toBeTruthy() })

    fireEvent.click(ui.getByText(zh['desk.doc.copy']))

    await waitFor(() => { expect(exec).toHaveBeenCalledWith('copy') })
    expect(ui.queryByText(zh['desk.doc.copied'])).toBeNull()
  })

  it('downloads the sheet as one Markdown file named after the document', async () => {
    const outputs = stubOutputs()
    const ui = mount({ snapshot: sealedSnapshot() })
    await waitFor(() => { expect(ui.getByText(zh['desk.doc.download'])).toBeTruthy() })

    fireEvent.click(ui.getByText(zh['desk.doc.download']))

    await waitFor(() => { expect(outputs.names).toHaveLength(1) })
    expect(outputs.names[0]).toBe(`1f-标书-${zh['desk.doc.title']}.md`)
    expect(await outputs.blobs[0]?.text()).toContain(REPORT)
  })
})

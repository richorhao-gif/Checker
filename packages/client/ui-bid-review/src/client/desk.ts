/**
 * The reviewing desk's derivations: the posture the desk holds and the Session
 * facts that paint it. Every value is a pure function of the conversation
 * snapshot, so the component only renders results and no desk state can
 * disagree with the log. The paper's bars and their tint are a document
 * stand-in — the tint follows the settled tool-call count, never a measured
 * position inside the file.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/desk
 */

import type {
  AssistantMessageNode, ComposerPhase, ConversationNode, PartialAssistant, PendingInteraction,
  RunningToolCall, UserMessageNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import { displayFailureMessage } from '@deepseek-ai/dsh-client-runtime/client'
import type { BidReviewLimits, CompanyQualifications } from '@deepseek-ai/dsh-bid-review/types'
import type { BidReviewKey } from './locales.ts'
import type { Outcome } from './remote.ts'
import { parseBidReviewDocumentPath } from './prompt.ts'

/** The posture the desk renders. */
export type DeskStage =
  /** Blank Session: the intake hero owns the screen, so the desk renders nothing. */
  | 'hidden'
  /** Submitted, and no turn has started yet. */
  | 'waiting'
  /** A turn is running. */
  | 'working'
  /** The Agent waits on the user; the approval or question panel owns the answer. */
  | 'paused'
  /** The last turn ended. */
  | 'sealed'
  /** The submission or the turn ended in an error, or the turn was stopped before it ended. */
  | 'failed'
  /** The Session was removed on the Host. */
  | 'ended'

/** What a running turn is doing, read from the live snapshot alone. */
export type DeskActivity = 'tool' | 'writing' | 'thinking'

/** The seal's verdict, read from the sheet's own declaration line. */
export type DeskVerdict =
  /** The declaration says 不符合. */
  | 'reject'
  /** The declaration says 符合. */
  | 'pass'
  /** The declaration says 待核验: a hard requirement the shared record neither confirms nor refutes. */
  | 'unverified'
  /** The sheet's head declares none of the three, so the seal commits to nothing. */
  | 'none'

/** One page-margin mark: a settled tool call placed on the paper's height. */
export interface DeskTick {
  /** Vertical position, in percent of the paper's height. */
  readonly position: number
  /** The settled call's 1-based ordinal in the log. */
  readonly ordinal: number
}

/** The pending wait the sticky note points at. */
export interface DeskWait {
  /** Tool the approval is about; null for a question, which names no tool. */
  readonly toolName: string | null
  /** The asker's own reason text; null when the wait carries none. */
  readonly reason: string | null
}

/** One carrier failure the desk reports; the conversation snapshot satisfies this. */
export interface DeskFailure {
  /** The failed operation's RPC error. */
  readonly error: { readonly code: string; readonly message: string }
}

/** The Session facts the desk reads; the conversation snapshot satisfies this. */
export interface DeskFacts {
  /** The Session was removed on the Host. */
  readonly removed: boolean
  /** The log still holds no user message. */
  readonly blank: boolean
  /** Input-area shape of the Session. */
  readonly composerPhase: ComposerPhase
  /** A turn is in flight. */
  readonly running: boolean
  /** Host-owned interactions waiting on the user. */
  readonly pending: readonly PendingInteraction[]
  /** Finalized log nodes in window order. */
  readonly nodes: readonly ConversationNode[]
  /** The streaming assistant message, absent between deltas. */
  readonly partial: PartialAssistant | null
  /** Tool calls in flight. */
  readonly runningCalls: readonly RunningToolCall[]
  /** Exact in-window turn start and optional matching end times. */
  readonly turnTimings: ReadonlyMap<number, { readonly startTime: number; readonly endTime?: number }>
  /** The refused prompt, present from a failed send until the next attempt. */
  readonly promptError: DeskFailure | null
}

/** Everything the desk renders, derived from one snapshot. */
export interface DeskView {
  /** Posture the desk holds. */
  readonly stage: DeskStage
  /** What the running turn is doing; null unless the stage is `working`. */
  readonly activity: DeskActivity | null
  /** Tool name beside the rail's status copy; null when no tool is involved. */
  readonly toolName: string | null
  /** The wait the sticky note points at; null while nothing is pending. */
  readonly wait: DeskWait | null
  /** Page-margin marks, one per rendered settled tool call. */
  readonly ticks: readonly DeskTick[]
  /** Settled tool calls in the log, the count the marks visualize. */
  readonly settledCalls: number
  /** Height of the margin hairline and the paper tint, in percent. */
  readonly readPercent: number
  /** Verdict the seal carries. */
  readonly verdict: DeskVerdict
  /** The closing assistant message's text, the opinion sheet's body. */
  readonly report: string | null
  /** Display-safe failure text; null when nothing failed. */
  readonly errorText: string | null
  /** Absolute server path of the submitted document; null when the log lacks it. */
  readonly documentPath: string | null
  /** Submission time of the first user message; null before it lands. */
  readonly submittedAt: number | null
  /** Start of the last turn in window; null before any turn starts. */
  readonly startedAt: number | null
  /** End of the last turn in window; null while it is still open. */
  readonly endedAt: number | null
}

/** Most margin marks one paper carries; a busier review samples its ordinals. */
const MAX_TICKS = 12

/** Text of one durable content-block list, ignoring every non-text block. */
function contentText(content: UserMessageNode['content']): string {
  return content.filter(block => block.type === 'text').map(block => block.text).join('')
}

/** Text of one assistant block list, ignoring reasoning, images, and tool heads. */
function assistantText(blocks: AssistantMessageNode['blocks']): string {
  return blocks.filter(block => block.kind === 'text').map(block => block.text).join('').trim()
}

/** The submission facts the archive tag and the opinion sheet's header carry. */
function submissionOf(nodes: readonly ConversationNode[]): { submittedAt: number | null; documentPath: string | null } {
  const first = nodes.find(node => node.kind === 'user')
  if (first?.kind !== 'user') return { submittedAt: null, documentPath: null }
  return { submittedAt: first.time, documentPath: parseBidReviewDocumentPath(contentText(first.content)) }
}

/** Count the settled tool calls the log holds, one mark per call. */
function countSettledCalls(nodes: readonly ConversationNode[]): number {
  return nodes.reduce((total, node) => (node.kind === 'tool-result' ? total + 1 : total), 0)
}

/** Text of the last assistant message that carries any. */
function finalReport(nodes: readonly ConversationNode[]): string | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (node === undefined || node.kind !== 'assistant') continue
    const text = assistantText(node.blocks)
    if (text !== '') return text
  }
  return null
}

/** Display-safe text of the last turn error, when the log holds one. */
function turnErrorText(nodes: readonly ConversationNode[]): string | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (node?.kind === 'turn-error') return displayFailureMessage(node)
  }
  return null
}

/** Start and end of the highest turn number the window holds. */
function lastTurnTiming(
  timings: DeskFacts['turnTimings'],
): { startedAt: number | null; endedAt: number | null } {
  let latestTurn: number | null = null
  let startedAt: number | null = null
  let endedAt: number | null = null
  for (const [turn, timing] of timings) {
    if (latestTurn === null || turn > latestTurn) {
      latestTurn = turn
      startedAt = timing.startTime
      endedAt = timing.endTime ?? null
    }
  }
  return { startedAt, endedAt }
}

/** The first pending wait, which is the one the Agent is blocked on. */
function waitOf(pending: readonly PendingInteraction[]): DeskWait | null {
  const first = pending[0]
  if (first === undefined) return null
  return first.kind === 'approval'
    ? { toolName: first.payload.toolName, reason: first.payload.reason ?? null }
    : { toolName: null, reason: null }
}

/** Whether the streaming partial already carries prose. */
function isWriting(partial: PartialAssistant | null): boolean {
  return partial !== null && partial.blocks.some(block => block.kind === 'text' && block.text.trim() !== '')
}

/** What a running turn is doing: a tool call outranks prose, which outranks thinking. */
function activityOf(partial: PartialAssistant | null, runningTool: string | null): DeskActivity {
  if (runningTool !== null) return 'tool'
  return isWriting(partial) ? 'writing' : 'thinking'
}

/**
 * Decide the posture the desk holds.
 * @param facts - the Session facts to decide from.
 * @param endedAt - end of the last turn in window, null while it is open.
 * @param failed - whether a submission or turn error is on record, or a turn was stopped.
 * @returns the stage, ordered so a live wait outranks a running turn, a running
 * turn outranks a recorded error, and an ended turn seals only when nothing
 * else is outstanding.
 */
function stageOf(facts: DeskFacts, endedAt: number | null, failed: boolean): DeskStage {
  if (facts.removed) return 'ended'
  if (facts.blank && facts.composerPhase === 'blank') return 'hidden'
  if (facts.pending.length > 0) return 'paused'
  if (facts.running) return 'working'
  if (failed) return 'failed'
  return endedAt === null ? 'waiting' : 'sealed'
}

/** Sheet-head lines the verdict declaration is searched in; the contract puts it first. */
const VERDICT_HEAD_LINES = 8

/** The declaration line: `判定：` followed by exactly one of the three words. */
const VERDICT_LINE = /判定[：:]\s*(不符合|待核验|符合)/

/**
 * Read the verdict the seal carries out of the sheet's own declaration line,
 * the one the submitted contract requires at the head of the report. Only the
 * head is searched and only an exact word commits: scanning the whole report
 * for 不符合 read a quoted requirement, a conditional, or a self-negating
 * sentence as the conclusion, so two runs over one tender sealed opposite
 * verdicts on identical findings. A qualified word such as 基本符合 declares
 * none of the three and leaves the seal uncommitted rather than guessing one.
 * @param report - the closing assistant message's text, null when there is none.
 * @returns the verdict the seal renders.
 */
export function verdictOf(report: string | null): DeskVerdict {
  if (report === null) return 'none'
  // Emphasis is stripped for the read alone; the rendered body keeps the model's own markup.
  const head = report.split('\n', VERDICT_HEAD_LINES).join('\n').replace(/[*`]/g, '')
  const word = VERDICT_LINE.exec(head)?.[1]
  if (word === '不符合') return 'reject'
  if (word === '待核验') return 'unverified'
  return word === '符合' ? 'pass' : 'none'
}

/**
 * Place one mark per settled tool call on the paper's height. A review with
 * more calls than the paper carries samples them evenly, so every mark still
 * names a real call ordinal.
 * @param settledCalls - settled tool calls in the log.
 * @returns the marks, top to bottom; empty while no call has settled.
 */
export function deskTicks(settledCalls: number): readonly DeskTick[] {
  const shown = Math.min(settledCalls, MAX_TICKS)
  const ticks: DeskTick[] = []
  for (let index = 0; index < shown; index += 1) {
    ticks.push({
      position: Math.round(((index + 1) / (shown + 1)) * 88 + 6),
      ordinal: Math.round(((index + 1) * settledCalls) / shown),
    })
  }
  return ticks
}

/**
 * Derive everything the reviewing desk renders from one conversation snapshot.
 * @param facts - the Session facts to derive from.
 * @returns the desk's posture and the real values that paint it.
 */
export function deriveDesk(facts: DeskFacts): DeskView {
  const { submittedAt, documentPath } = submissionOf(facts.nodes)
  const { startedAt, endedAt } = lastTurnTiming(facts.turnTimings)
  const turnError = turnErrorText(facts.nodes)
  const errorText = turnError ?? (facts.promptError === null ? null : displayFailureMessage(facts.promptError.error))
  // A frozen interrupted partial is the only fact that survives a reload to
  // tell a stopped review from a finished one; it never seals.
  const aborted = facts.nodes.some(node => node.kind === 'assistant' && node.interrupted === true)
  const wait = waitOf(facts.pending)
  const stage = stageOf(facts, endedAt, errorText !== null || aborted)
  const settledCalls = countSettledCalls(facts.nodes)
  const ticks = deskTicks(settledCalls)
  const report = finalReport(facts.nodes)
  const runningTool = facts.runningCalls[0]?.name ?? null
  return {
    stage,
    activity: stage === 'working' ? activityOf(facts.partial, runningTool) : null,
    toolName: stage === 'paused' ? (wait?.toolName ?? null) : runningTool,
    wait,
    ticks,
    settledCalls,
    readPercent: ticks.at(-1)?.position ?? 0,
    verdict: verdictOf(report),
    report,
    errorText,
    documentPath,
    submittedAt,
    startedAt,
    endedAt,
  }
}

/**
 * The duration the rail's timer shows: the last turn's own span once it ended,
 * and the span since it started while it is still open.
 * @param view - the derived desk.
 * @param now - current Unix epoch milliseconds, the ticking clock's read.
 * @returns the elapsed milliseconds, or null before any turn started.
 */
export function deskElapsed(view: DeskView, now: number): number | null {
  if (view.startedAt === null) return null
  return (view.endedAt ?? now) - view.startedAt
}

/**
 * Display name of the submitted document: the last segment of the server path
 * the prompt carried, whichever separator the Host wrote it with.
 * @param path - absolute server path from the submitted prompt, null when absent.
 * @returns the file name, or null when there is no path or it ends in a separator.
 */
export function documentName(path: string | null): string | null {
  if (path === null) return null
  const segments = path.split(/[\\/]/)
  const name = segments.at(-1)
  return name === undefined || name === '' ? null : name
}

/**
 * The opinion sheet's red-header number: the session counter the store mints
 * behind its `session-` prefix, or the first eight characters of ids minted
 * elsewhere, so the number never degenerates into the mint prefix alone.
 * @param sessionId - the session the sheet reports on.
 * @returns the short document number.
 */
export function docNumberOf(sessionId: string): string {
  return sessionId.replace(/^session-/, '').slice(0, 8)
}

/** Closed-union exhaustiveness fence for the desk's own vocabulary. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a stage is forged */
function assertNever(value: never): never {
  throw new Error(`unhandled desk stage: ${JSON.stringify(value)}`)
}

/** The rail dot's tone: the desk's one color word for its posture. */
export type DeskDot = 'live' | 'amber' | 'done'

/**
 * Tone of the rail dot for one posture. A wait is amber, a finished review is
 * the ink green of a settled verdict, and everything still moving is vermilion.
 * @param stage - posture the desk holds.
 * @returns the dot tone.
 */
export function dotTone(stage: DeskStage): DeskDot {
  switch (stage) {
    case 'paused': return 'amber'
    case 'sealed':
    case 'ended': return 'done'
    case 'hidden':
    case 'waiting':
    case 'working':
    case 'failed': return 'live'
    /* v8 ignore next -- closed stage union */
    default: return assertNever(stage)
  }
}

/** Copy key of what a running turn is doing. */
function activityKey(activity: DeskActivity | null): BidReviewKey {
  if (activity === 'tool') return 'desk.stage.tool'
  // A turn that streams no prose yet is thinking; the snapshot distinguishes no
  // finer state, so the rail says the least it knows.
  return activity === 'writing' ? 'desk.stage.writing' : 'desk.stage.thinking'
}

/**
 * Copy key of the rail's status line.
 * @param stage - posture the desk holds.
 * @param activity - what a running turn is doing, null in every other posture.
 * @returns the `bidReview` dictionary key the rail renders.
 */
export function stageKey(stage: DeskStage, activity: DeskActivity | null): BidReviewKey {
  switch (stage) {
    // A blank Session never renders the rail; the key keeps the function total.
    case 'hidden':
    case 'waiting': return 'desk.stage.waiting'
    case 'working': return activityKey(activity)
    case 'paused': return 'desk.stage.paused'
    case 'sealed': return 'desk.stage.sealed'
    case 'failed': return 'desk.stage.failed'
    case 'ended': return 'desk.stage.ended'
    /* v8 ignore next -- closed stage union */
    default: return assertNever(stage)
  }
}

/**
 * Copy key of the word the seal carries.
 * @param verdict - verdict read out of the report.
 * @returns the `bidReview` dictionary key the seal renders.
 */
export function sealKey(verdict: DeskVerdict): BidReviewKey {
  switch (verdict) {
    case 'reject': return 'desk.seal.reject'
    case 'pass': return 'desk.seal.pass'
    case 'unverified': return 'desk.seal.unverified'
    case 'none': return 'desk.seal.none'
    /* v8 ignore next -- closed verdict union */
    default: return assertNever(verdict)
  }
}

/** The seal's ink: the desk's one color word for its verdict. */
export type DeskSealInk = 'zhu' | 'mo' | 'amber'

/**
 * Ink of the seal for one verdict. A pass is ink green and a fact still to be
 * verified is the amber the desk already spends on a wait, because both are
 * outstanding; a rejection and a sheet that declares nothing stay vermilion.
 * @param verdict - verdict read out of the report.
 * @returns the ink the seal carries.
 */
export function sealInk(verdict: DeskVerdict): DeskSealInk {
  switch (verdict) {
    case 'pass': return 'mo'
    case 'unverified': return 'amber'
    case 'reject':
    case 'none': return 'zhu'
    /* v8 ignore next -- closed verdict union */
    default: return assertNever(verdict)
  }
}

/**
 * Copy key of the sticky note's fallback body, for the wait that carries no
 * reason text of its own.
 * @param wait - the pending wait the note points at.
 * @returns the approval key when a tool is named, the question key otherwise.
 */
export function noteKey(wait: DeskWait): BidReviewKey {
  return wait.toolName === null ? 'desk.note.question' : 'desk.note.approval'
}

/**
 * Letterhead of the opinion sheet.
 * @param limits - the deployment display config's read, null while it is in flight.
 * @returns the configured company name, or null while it is unread or empty.
 */
export function letterheadOf(limits: Outcome<BidReviewLimits> | null): string | null {
  if (limits === null || !limits.ok) return null
  return limits.value.companyName === '' ? null : limits.value.companyName
}

/** The opinion sheet's basis line: one dictionary key and the time it needs. */
export interface DeskBasis {
  /** Key of the basis line. */
  readonly key: BidReviewKey
  /** Save time to interpolate into it; null for the keys that carry no time. */
  readonly time: number | null
}

/**
 * Decide the basis line from the shared record's read. A record that was never
 * saved states no time; an empty record says so rather than implying a basis.
 * @param qualifications - the shared record's read, null while it is in flight.
 * @returns the basis key and the save time it interpolates.
 */
export function basisOf(qualifications: Outcome<CompanyQualifications> | null): DeskBasis {
  if (qualifications === null || !qualifications.ok) return { key: 'desk.doc.basisUnknown', time: null }
  const record = qualifications.value
  if (record.text.trim() === '') return { key: 'desk.doc.basisEmpty', time: null }
  return record.updatedAt === 0
    ? { key: 'desk.doc.basisNoTime', time: null }
    : { key: 'desk.doc.basis', time: record.updatedAt }
}

/**
 * Join the opinion sheet's export lines into the Markdown the copy and download
 * actions hand over: the sheet's own reading order, blank lines between parts.
 * @param lines - parts to join; an empty part is dropped.
 * @returns the export text, ending in one newline.
 */
export function sheetText(lines: readonly string[]): string {
  return `${lines.filter(line => line.trim() !== '').join('\n\n')}\n`
}

/**
 * Suggested file name for the downloaded opinion sheet: the submitted
 * document's name without its extension, then the sheet's own title.
 * @param path - absolute server path from the submitted prompt, null when absent.
 * @param title - localized sheet title.
 * @returns the `.md` file name.
 */
export function sheetFilename(path: string | null, title: string): string {
  const base = documentName(path)?.replace(/\.[^.]+$/, '')
  return base === undefined ? `${title}.md` : `${base}-${title}.md`
}

/**
 * The reviewing desk's derivations. These specs pin the two things the surface
 * promises: every posture is read out of the Session snapshot alone, and the
 * values it paints are the log's own — the settled tool calls behind the page
 * marks, the last turn's span behind the timer, the model's own declaration line
 * behind the seal.
 */
import { describe, expect, it } from 'vitest'
import type { ConversationNode, PendingInteraction, RunningToolCall } from '@deepseek-ai/dsh-client-runtime/client'
import type { BidReviewLimits, CompanyQualifications } from '@deepseek-ai/dsh-bid-review/types'
import type { DeskFacts, DeskView } from '../src/client/desk.ts'
import {
  basisOf, deriveDesk, deskElapsed, deskTicks, docNumberOf, documentName, dotTone, letterheadOf,
  noteKey, sealInk, sealKey, sheetFilename, sheetText, stageKey, verdictOf,
} from '../src/client/desk.ts'
import type { Outcome } from '../src/client/remote.ts'
import { buildBidReviewPrompt } from '../src/client/prompt.ts'

const PATH = '/srv/bid-documents/1f-标书.pdf'
const PROMPT = buildBidReviewPrompt(PATH, '蔬菜配送资质')

// Fixtures carry only the fields the desk reads; the node types are the
// projection's, and nothing here exercises the rest of them.
const userNode = (content: string, time = 1000): ConversationNode =>
  ({ kind: 'user', seq: 1, time, content: [{ type: 'text', text: content }] }) as unknown as ConversationNode
const assistantNode = (text: string, seq = 2): ConversationNode =>
  ({ kind: 'assistant', seq, blocks: [{ kind: 'text', text }] }) as unknown as ConversationNode
const interruptedAssistantNode = (text: string, seq = 2): ConversationNode =>
  ({ kind: 'assistant', seq, interrupted: true, blocks: [{ kind: 'text', text }] }) as unknown as ConversationNode
const toolResultNode = (seq: number): ConversationNode =>
  ({ kind: 'tool-result', seq, call: { name: 'read_file' } }) as unknown as ConversationNode
const turnErrorNode = (message: string, code?: string): ConversationNode =>
  ({ kind: 'turn-error', seq: 9, message, ...(code === undefined ? {} : { code }) }) as unknown as ConversationNode
const runningCall = (name: string): RunningToolCall => ({ name }) as RunningToolCall
const approval = (toolName: string, reason?: string): PendingInteraction => ({
  kind: 'approval',
  key: 'a:1',
  payload: { approvalId: 'ap1', toolName, ...(reason === undefined ? {} : { reason }) },
}) as unknown as PendingInteraction
const question = (): PendingInteraction =>
  ({ kind: 'question', key: 'q:1', payload: { questions: [] } }) as unknown as PendingInteraction

function facts(overrides: Partial<DeskFacts> = {}): DeskFacts {
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
    ...overrides,
  }
}

describe('deriveDesk postures', () => {
  it('renders nothing while the Session is still blank', () => {
    const view = deriveDesk(facts({ blank: true, composerPhase: 'blank', nodes: [] }))

    expect(view.stage).toBe('hidden')
  })

  it('keeps the desk up for a blank log whose prompt is still engaging', () => {
    const view = deriveDesk(facts({ blank: true, composerPhase: 'engaging', nodes: [] }))

    expect(view.stage).toBe('waiting')
    expect(view.submittedAt).toBeNull()
    expect(view.documentPath).toBeNull()
  })

  it('waits while no turn has started', () => {
    const view = deriveDesk(facts())

    expect(view.stage).toBe('waiting')
    expect(view.activity).toBeNull()
    expect(view.submittedAt).toBe(1000)
    expect(view.documentPath).toBe(PATH)
    expect(view.startedAt).toBeNull()
  })

  it('works through an open turn, naming the running tool', () => {
    const view = deriveDesk(facts({
      running: true,
      runningCalls: [runningCall('read_file')],
      turnTimings: new Map([[1, { startTime: 5000 }]]),
    }))

    expect(view.stage).toBe('working')
    expect(view.activity).toBe('tool')
    expect(view.toolName).toBe('read_file')
    expect(view.startedAt).toBe(5000)
    expect(view.endedAt).toBeNull()
  })

  it('reads prose streaming with no call in flight as writing', () => {
    const view = deriveDesk(facts({
      running: true,
      partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: '符合' }] },
    }))

    expect(view.activity).toBe('writing')
    expect(view.toolName).toBeNull()
  })

  it('reads a running turn with no prose yet as thinking', () => {
    const thinking = deriveDesk(facts({ running: true }))
    // Whitespace-only prose is no prose yet.
    const blank = deriveDesk(facts({
      running: true, partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: '  ' }] },
    }))

    expect(thinking.activity).toBe('thinking')
    expect(blank.activity).toBe('thinking')
  })

  it('pauses on the first pending wait and carries its reason', () => {
    const view = deriveDesk(facts({ pending: [approval('Pwsh', '需要执行命令')], running: true }))

    expect(view.stage).toBe('paused')
    expect(view.activity).toBeNull()
    expect(view.toolName).toBe('Pwsh')
    expect(view.wait).toEqual({ toolName: 'Pwsh', reason: '需要执行命令' })
  })

  it('pauses on an approval that states no reason and on a question that names no tool', () => {
    expect(deriveDesk(facts({ pending: [approval('Pwsh')] })).wait)
      .toEqual({ toolName: 'Pwsh', reason: null })
    expect(deriveDesk(facts({ pending: [question()] })).wait)
      .toEqual({ toolName: null, reason: null })
  })

  it('seals once the last turn ended', () => {
    const view = deriveDesk(facts({
      nodes: [userNode(PROMPT), toolResultNode(2), assistantNode('判定：不符合\n\n认证不足', 3)],
      turnTimings: new Map([[1, { startTime: 5000, endTime: 9000 }]]),
    }))

    expect(view.stage).toBe('sealed')
    expect(view.endedAt).toBe(9000)
    expect(view.report).toBe('判定：不符合\n\n认证不足')
    expect(view.verdict).toBe('reject')
  })

  it('seals on the highest turn the window holds', () => {
    const view = deriveDesk(facts({
      turnTimings: new Map([[2, { startTime: 7000 }], [1, { startTime: 1000, endTime: 2000 }]]),
    }))

    expect(view.startedAt).toBe(7000)
    expect(view.endedAt).toBeNull()
    expect(view.stage).toBe('waiting')
  })

  it('fails on a refused submission', () => {
    const view = deriveDesk(facts({
      composerPhase: 'engaging',
      promptError: { error: { code: 'AUTH', message: 'sk-masked was rejected' } },
    }))

    expect(view.stage).toBe('failed')
    // The credential-bearing provider message never reaches the surface.
    expect(view.errorText).toBe('API key is invalid')
  })

  it('fails on a turn error, which outranks an earlier submission error', () => {
    const view = deriveDesk(facts({
      nodes: [userNode(PROMPT), turnErrorNode('模型超时', 'TIMEOUT')],
      promptError: { error: { code: 'OTHER', message: '发送失败' } },
    }))

    expect(view.stage).toBe('failed')
    expect(view.errorText).toBe('模型超时')
  })

  it('keeps a running turn ahead of a recorded error', () => {
    const view = deriveDesk(facts({
      running: true,
      nodes: [userNode(PROMPT), turnErrorNode('上一次超时')],
    }))

    expect(view.stage).toBe('working')
    expect(view.errorText).toBe('上一次超时')
  })

  it('fails on a turn that stopped mid-write rather than sealing it', () => {
    const view = deriveDesk(facts({
      nodes: [userNode(PROMPT), interruptedAssistantNode('不符合：认证')],
      turnTimings: new Map([[1, { startTime: 1000, endTime: 2000 }]]),
    }))

    expect(view.stage).toBe('failed')
  })

  it('ends when the Host removed the Session', () => {
    expect(deriveDesk(facts({ removed: true, running: true })).stage).toBe('ended')
  })
})

describe('deriveDesk values', () => {
  it('reads the opinion out of the last assistant message that carries text', () => {
    const view = deriveDesk(facts({
      nodes: [
        userNode(PROMPT),
        assistantNode('先看主营业务', 2),
        assistantNode('', 3),
        assistantNode('   ', 4),
        assistantNode('判定：符合\n\n评分准则如下', 5),
      ],
    }))

    expect(view.report).toBe('判定：符合\n\n评分准则如下')
    expect(view.verdict).toBe('pass')
  })

  it('ignores the reasoning and tool blocks around the prose', () => {
    const node = {
      kind: 'assistant',
      seq: 2,
      blocks: [
        { kind: 'reasoning', text: '内部推理' },
        { kind: 'text', text: '符合' },
        { kind: 'tool-call', name: 'read_file' },
        { kind: 'text', text: '，可以投标' },
      ],
    } as unknown as ConversationNode
    const view = deriveDesk(facts({ nodes: [userNode(PROMPT), node] }))

    expect(view.report).toBe('符合，可以投标')
  })

  it('reports no opinion when the log holds none', () => {
    const view = deriveDesk(facts({ nodes: [userNode(PROMPT), assistantNode('', 2)] }))

    expect(view.report).toBeNull()
    expect(view.verdict).toBe('none')
  })

  it('parses the document path back out of the submitted prompt', () => {
    const view = deriveDesk(facts({
      nodes: [userNode(buildBidReviewPrompt('C:\\dsh\\bid-documents\\2a-标书.docx', ''), 4242)],
    }))

    expect(view.documentPath).toBe('C:\\dsh\\bid-documents\\2a-标书.docx')
    expect(view.submittedAt).toBe(4242)
  })

  it('ignores a user message this surface did not compose', () => {
    const view = deriveDesk(facts({ nodes: [userNode('随便聊聊')] }))

    expect(view.documentPath).toBeNull()
  })

  it('counts one page mark per settled tool call', () => {
    const view = deriveDesk(facts({
      nodes: [userNode(PROMPT), toolResultNode(2), toolResultNode(3), toolResultNode(4)],
    }))

    expect(view.settledCalls).toBe(3)
    expect(view.ticks).toHaveLength(3)
    expect(view.readPercent).toBe(view.ticks[2]?.position)
  })

  it('leaves the paper unmarked before any call settled', () => {
    const view = deriveDesk(facts())

    expect(view.settledCalls).toBe(0)
    expect(view.ticks).toEqual([])
    expect(view.readPercent).toBe(0)
  })
})

describe('deskTicks', () => {
  it('spreads the marks down the paper, each naming its own call', () => {
    expect(deskTicks(3)).toEqual([
      { position: 28, ordinal: 1 },
      { position: 50, ordinal: 2 },
      { position: 72, ordinal: 3 },
    ])
  })

  it('samples the ordinals once the calls outnumber the paper', () => {
    const ticks = deskTicks(30)

    expect(ticks).toHaveLength(12)
    expect(ticks[0]).toEqual({ position: 13, ordinal: 3 })
    expect(ticks.at(-1)).toEqual({ position: 87, ordinal: 30 })
    // Every mark still names a real call, in ascending order.
    const ordinals = ticks.map(tick => tick.ordinal)
    expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b))
    expect(new Set(ordinals).size).toBe(12)
  })

  it('marks nothing for no settled call', () => {
    expect(deskTicks(0)).toEqual([])
  })
})

describe('deskElapsed', () => {
  const view = (overrides: Partial<DeskView>): DeskView => ({
    startedAt: null, endedAt: null, stage: 'waiting', ...overrides,
  } as DeskView)

  it('shows nothing before a turn started', () => {
    expect(deskElapsed(view({}), 9999)).toBeNull()
  })

  it('follows the clock while the turn is open', () => {
    expect(deskElapsed(view({ startedAt: 5000 }), 8000)).toBe(3000)
  })

  it('freezes on the turn span once it ended', () => {
    expect(deskElapsed(view({ startedAt: 5000, endedAt: 9000 }), 99_999)).toBe(4000)
  })
})

describe('documentName', () => {
  it('takes the last segment of either separator', () => {
    expect(documentName('/srv/bid-documents/1f-标书.pdf')).toBe('1f-标书.pdf')
    expect(documentName('C:\\dsh\\bid-documents\\2a-标书.docx')).toBe('2a-标书.docx')
  })

  it('names nothing for an absent path or a trailing separator', () => {
    expect(documentName(null)).toBeNull()
    expect(documentName('/srv/bid-documents/')).toBeNull()
  })
})

describe('docNumberOf', () => {
  it('numbers the counter the store mints behind its prefix', () => {
    expect(docNumberOf('session-42')).toBe('42')
    expect(docNumberOf('session-0001')).toBe('0001')
  })

  it('takes the first eight characters of an id without that prefix', () => {
    expect(docNumberOf('cf63163f-5c55-4341')).toBe('cf63163f')
  })
})

describe('verdictOf', () => {
  it('seals the three declarations the output contract admits', () => {
    expect(verdictOf('判定：不符合\n\n供应商资格要求 ISO22000 认证。')).toBe('reject')
    expect(verdictOf('判定：待核验\n\n缺少北京配送车辆的证明。')).toBe('unverified')
    expect(verdictOf('判定：符合\n\n评分准则如下。')).toBe('pass')
  })

  it('reads a declaration through Markdown emphasis and a halfwidth colon', () => {
    expect(verdictOf('**判定：不符合**\n\n理由如下。')).toBe('reject')
    expect(verdictOf('# 判定：待核验')).toBe('unverified')
    expect(verdictOf('判定: 符合')).toBe('pass')
  })

  it('commits to nothing when the declaration says any other word', () => {
    // A qualified word is the softening the contract forbids, not a verdict.
    expect(verdictOf('判定：基本符合')).toBe('none')
    // The sentence that made two runs over one tender seal opposite verdicts.
    expect(verdictOf('第二步判定：不是简单的不符合，而是主体与资质符合，但有 4 项资格硬指标无法证实')).toBe('none')
  })

  it('reads the head alone, so a conditional in the body seals nothing', () => {
    expect(verdictOf('判定：符合\n\n若这两项无法落实，判定为不符合资格。')).toBe('pass')
    expect(verdictOf(`${'标题\n'.repeat(7)}判定：不符合`)).toBe('reject')
    expect(verdictOf(`${'标题\n'.repeat(8)}判定：不符合`)).toBe('none')
  })

  it('commits to nothing without a declaration, as the records predating the contract do', () => {
    expect(verdictOf('主营业务符合，但供应商资格不符合')).toBe('none')
    expect(verdictOf('评分准则如下')).toBe('none')
    expect(verdictOf(null)).toBe('none')
  })
})

describe('the desk copy decisions', () => {
  it('tones the rail dot by posture', () => {
    expect(dotTone('paused')).toBe('amber')
    expect(dotTone('sealed')).toBe('done')
    expect(dotTone('ended')).toBe('done')
    expect(dotTone('working')).toBe('live')
    expect(dotTone('waiting')).toBe('live')
    expect(dotTone('failed')).toBe('live')
    expect(dotTone('hidden')).toBe('live')
  })

  it('keys the rail status by posture and activity', () => {
    expect(stageKey('hidden', null)).toBe('desk.stage.waiting')
    expect(stageKey('waiting', null)).toBe('desk.stage.waiting')
    expect(stageKey('working', 'tool')).toBe('desk.stage.tool')
    expect(stageKey('working', 'writing')).toBe('desk.stage.writing')
    expect(stageKey('working', 'thinking')).toBe('desk.stage.thinking')
    // A posture that carries no activity still reads as thinking.
    expect(stageKey('working', null)).toBe('desk.stage.thinking')
    expect(stageKey('paused', null)).toBe('desk.stage.paused')
    expect(stageKey('sealed', null)).toBe('desk.stage.sealed')
    expect(stageKey('failed', null)).toBe('desk.stage.failed')
    expect(stageKey('ended', null)).toBe('desk.stage.ended')
  })

  it('keys the seal by verdict and the note by the wait kind', () => {
    expect(sealKey('reject')).toBe('desk.seal.reject')
    expect(sealKey('pass')).toBe('desk.seal.pass')
    expect(sealKey('unverified')).toBe('desk.seal.unverified')
    expect(sealKey('none')).toBe('desk.seal.none')
    expect(noteKey({ toolName: 'Pwsh', reason: null })).toBe('desk.note.approval')
    expect(noteKey({ toolName: null, reason: null })).toBe('desk.note.question')
  })

  it('inks the seal by verdict', () => {
    expect(sealInk('pass')).toBe('mo')
    // A fact still to be verified waits on a person, so it carries the desk's amber.
    expect(sealInk('unverified')).toBe('amber')
    expect(sealInk('reject')).toBe('zhu')
    expect(sealInk('none')).toBe('zhu')
  })

  it('heads the sheet with the configured company name only', () => {
    const limits = (companyName: string): Outcome<BidReviewLimits> => ({
      ok: true, value: { maxQualificationsBytes: 1, maxDocumentBytes: 1, companyName },
    })

    expect(letterheadOf(limits('绿源农产品配送有限公司'))).toBe('绿源农产品配送有限公司')
    expect(letterheadOf(limits(''))).toBeNull()
    expect(letterheadOf({ ok: false, failure: { code: 'unavailable' } })).toBeNull()
    expect(letterheadOf(null)).toBeNull()
  })

  it('states the basis line from the shared record it read', () => {
    const record = (value: CompanyQualifications): Outcome<CompanyQualifications> => ({ ok: true, value })

    expect(basisOf(record({ text: '蔬菜配送资质', updatedAt: 1757 })))
      .toEqual({ key: 'desk.doc.basis', time: 1757 })
    // A record written before the Host stamped save times states no time.
    expect(basisOf(record({ text: '蔬菜配送资质', updatedAt: 0 })))
      .toEqual({ key: 'desk.doc.basisNoTime', time: null })
    expect(basisOf(record({ text: '   ', updatedAt: 1757 })))
      .toEqual({ key: 'desk.doc.basisEmpty', time: null })
    expect(basisOf({ ok: false, failure: { code: 'unavailable' } }))
      .toEqual({ key: 'desk.doc.basisUnknown', time: null })
    expect(basisOf(null)).toEqual({ key: 'desk.doc.basisUnknown', time: null })
  })
})

describe('sheetText', () => {
  it('joins the sheet parts in reading order and drops the empty ones', () => {
    expect(sheetText(['绿源公司', '', '  ', '标书审核意见书', '符合。'])).toBe(
      '绿源公司\n\n标书审核意见书\n\n符合。\n',
    )
  })

  it('exports nothing but a newline when every part is empty', () => {
    expect(sheetText([])).toBe('\n')
  })
})

describe('sheetFilename', () => {
  it('names the download after the submitted document', () => {
    expect(sheetFilename('/srv/bid-documents/1f-标书.pdf', '标书审核意见书'))
      .toBe('1f-标书-标书审核意见书.md')
    expect(sheetFilename('C:\\dsh\\2a-标书', '标书审核意见书')).toBe('2a-标书-标书审核意见书.md')
  })

  it('falls back to the title alone without a document path', () => {
    expect(sheetFilename(null, '标书审核意见书')).toBe('标书审核意见书.md')
  })
})

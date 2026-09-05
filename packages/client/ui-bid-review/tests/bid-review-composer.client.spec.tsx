// @vitest-environment jsdom
/**
 * The bid-review composer: the entry that replaces the free-text bar with a
 * one-document intake. These specs pin the four surfaces the Session puts it in,
 * the intake state machine across a pick, a drop, a refusal, and a reload, the
 * submit that carries the fixed question plus the server path plus the shared
 * qualifications, and the owner's inert and blocked postures, which this surface
 * must respect rather than replace.
 */
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { BidReviewLimits, CompanyQualifications } from '@deepseek-ai/dsh-bid-review/types'
import { BidReviewComposer } from '../src/client/BidReviewComposer.tsx'
import type { Outcome, ReviewFailure } from '../src/client/remote.ts'
import type { StoredDocument } from '../src/client/document.ts'
import { BID_REVIEW_PRESET_QUESTION } from '../src/client/prompt.ts'
import { formatBytes } from '../src/client/format.ts'
import { zh } from '../src/client/locales.ts'
import css from '../src/client/BidReviewComposer.module.css'

afterEach(cleanup)
beforeEach(() => { globalThis.sessionStorage.clear() })

const t = makeTranslate(zh, commonZh)
const SID = 's1' as SessionId
const DOC: StoredDocument = { filename: '标书.pdf', bytes: 3, path: '/srv/bid-documents/1f-标书.pdf' }
const LIMITS: BidReviewLimits = { maxQualificationsBytes: 64 * 1024, maxDocumentBytes: 100 * 1024 * 1024 }
const FILLED: CompanyQualifications = { text: '蔬菜配送资质', updatedAt: 5 }

function ok<T>(value: T): Outcome<T> {
  return { ok: true, value }
}

function refused(failure: ReviewFailure): Outcome<never> {
  return { ok: false, failure }
}

/** A promise the test releases by hand, for the in-flight postures. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve = (_value: T): void => {}
  const promise = new Promise<T>((release) => { resolve = release })
  return { promise, resolve }
}

/** The Session facts the composer reads. */
interface Snapshot {
  composerPhase?: 'blank' | 'engaging' | 'active'
  removed?: boolean
  promptError?: { op: 'send' | 'stop'; error: { code: string; message: string } } | null
}

/** Remember one document the way a previous page load would have. */
function seedStored(sessionId: SessionId = SID, document: StoredDocument = DOC): void {
  globalThis.sessionStorage.setItem(`dsh-bid-doc:${sessionId}`, JSON.stringify(document))
}

function mount(options: {
  sessionId?: SessionId | null
  snapshot?: Snapshot
  inputActions?: { setDraft: (text: string) => void; submit: () => void } | null
  readLimits?: () => Promise<Outcome<BidReviewLimits>>
  readQualifications?: () => Promise<Outcome<CompanyQualifications>>
  saveQualifications?: (text: string) => Promise<Outcome<CompanyQualifications>>
  uploadDocument?: (file: File) => Promise<Outcome<StoredDocument>>
  variant?: 'hero' | 'composer'
  disabled?: boolean
  blocked?: { reason: string }
  workspacePickerOpen?: boolean
  onRequestWorkspace?: (() => void) | null
  placeholder?: string
  footer?: ReactNode
} = {}) {
  const snapshot: Snapshot = { composerPhase: 'blank', removed: false, promptError: null, ...options.snapshot }
  const sessionId = options.sessionId === null ? undefined : (options.sessionId ?? SID)
  // The real seat is a maybe-hook: with no Session current it answers undefined
  // to every selector rather than selecting from an absent snapshot.
  const useSession = (<S,>(select: (source: Snapshot) => S): S | undefined =>
    useSyncExternalStore(
      () => () => {},
      () => (sessionId === undefined ? undefined : select(snapshot)),
    )) as never
  const inputActions = options.inputActions === null
    ? undefined
    : (options.inputActions ?? { setDraft: vi.fn(), submit: vi.fn() })
  const readLimits = vi.fn(options.readLimits ?? (() => Promise.resolve(ok(LIMITS))))
  const readQualifications = vi.fn(options.readQualifications ?? (() => Promise.resolve(ok(FILLED))))
  const saveQualifications = vi.fn(options.saveQualifications ?? (() => Promise.resolve(ok(FILLED))))
  const uploadDocument = vi.fn(options.uploadDocument ?? (() => Promise.resolve(ok(DOC))))
  const onRequestWorkspace = options.onRequestWorkspace === null
    ? undefined
    : (options.onRequestWorkspace ?? vi.fn())
  const props = {
    useSession,
    sessionId,
    inputActions,
    t,
    readLimits,
    readQualifications,
    saveQualifications,
    uploadDocument,
    ...(options.variant === undefined ? {} : { variant: options.variant }),
    ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
    ...(options.blocked === undefined ? {} : { blocked: options.blocked }),
    ...(options.workspacePickerOpen === undefined ? {} : { workspacePickerOpen: options.workspacePickerOpen }),
    ...(onRequestWorkspace === undefined ? {} : { onRequestWorkspace }),
    ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
    ...(options.footer === undefined ? {} : { footer: options.footer }),
  } as unknown as Parameters<typeof BidReviewComposer>[0]
  const element = (): ReactNode => <BidReviewComposer {...props} />
  const ui = render(element())
  return {
    ...ui,
    snapshot,
    sessionId,
    inputActions,
    readLimits,
    readQualifications,
    saveQualifications,
    uploadDocument,
    onRequestWorkspace,
    /** Re-render the same props so a mutated snapshot is read again. */
    refresh: () => { ui.rerender(element()) },
    fileInput: () => ui.getByLabelText(zh['composer.pick']) as HTMLInputElement,
    submit: () => ui.getByText(zh['composer.submit']) as HTMLButtonElement,
    sending: () => ui.getByText(zh['composer.sending']) as HTMLButtonElement,
    repick: () => ui.getByText(zh['composer.repick']) as HTMLButtonElement,
    qualifications: () => ui.getByText(zh['composer.qualifications']) as HTMLButtonElement,
    alerts: () => ui.queryAllByRole('alert').map(node => node.textContent),
    root: () => ui.container.firstElementChild as HTMLElement,
  }
}

/** Drive a pick through the file input. */
function pick(ui: ReturnType<typeof mount>, file: File = new File(['bid'], '标书.pdf')): void {
  fireEvent.change(ui.fileInput(), { target: { files: [file] } })
}

/** Settle the composer on the ready step over a remembered document. */
function mountReady(options: Parameters<typeof mount>[0] = {}) {
  seedStored()
  return mount(options)
}

describe('the workspace surface', () => {
  it('offers the workspace picker while the owner holds the seat inert', () => {
    const ui = mount({ disabled: true, placeholder: '选择工作区' })

    const trigger = ui.getByRole('button', { name: zh['composer.chooseWorkspace'] })
    expect(trigger.textContent).toBe('选择工作区')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(ui.queryByLabelText(zh['composer.pick'])).toBeNull()

    fireEvent.click(trigger)
    expect(ui.onRequestWorkspace).toHaveBeenCalledTimes(1)
  })

  it('reports an already-open workspace picker', () => {
    const ui = mount({ disabled: true, workspacePickerOpen: true })

    expect(ui.getByRole('button', { name: zh['composer.chooseWorkspace'] }).getAttribute('aria-expanded')).toBe('true')
  })

  it('disables the trigger when the owner cannot open the picker', () => {
    const ui = mount({ disabled: true, onRequestWorkspace: null })

    expect((ui.getByRole('button', { name: zh['composer.chooseWorkspace'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('reads the Session as absent while no Workspace is connected', () => {
    const ui = mount({ sessionId: null, disabled: true, placeholder: '选择工作区' })

    expect(ui.getByRole('button', { name: zh['composer.chooseWorkspace'] })).toBeTruthy()
    expect(ui.queryByLabelText(zh['composer.pick'])).toBeNull()
  })
})

describe('the locked and removed surfaces', () => {
  it('locks while no Session is current and the seat is live', () => {
    const ui = mount({ sessionId: null })

    expect(ui.getByText(zh['composer.locked'])).toBeTruthy()
  })

  it('locks once the review is under way', () => {
    const ui = mount({ snapshot: { composerPhase: 'engaging' } })

    expect(ui.getByText(zh['composer.locked'])).toBeTruthy()
    expect(ui.queryByLabelText(zh['composer.pick'])).toBeNull()
  })

  it('locks while the review is active', () => {
    const ui = mount({ snapshot: { composerPhase: 'active' } })

    expect(ui.getByText(zh['composer.locked'])).toBeTruthy()
  })

  it('reports a Session removed on the Host', () => {
    const ui = mount({ snapshot: { composerPhase: 'active', removed: true } })

    expect(ui.getByText(zh['composer.removed'])).toBeTruthy()
  })

  it('forgets the remembered document once the review is under way', () => {
    seedStored()

    mount({ snapshot: { composerPhase: 'engaging' } })

    expect(globalThis.sessionStorage.getItem(`dsh-bid-doc:${SID}`)).toBeNull()
  })
})

describe('the interactive surface before a document is held', () => {
  it('offers the drop target and holds the submit back', () => {
    const ui = mount()

    expect(ui.getByText(zh['composer.dropHint'])).toBeTruthy()
    expect(ui.fileInput()).toBeTruthy()
    expect(ui.submit().disabled).toBe(true)
    expect(ui.qualifications()).toBeTruthy()
  })

  it('marks the hero variant on the root', () => {
    const hero = mount({ variant: 'hero' })
    const plain = mount({ variant: 'composer' })

    expect(hero.root().className).toBe(`${css.root as string} ${css.hero as string}`)
    expect(plain.root().className).toBe(css.root as string)
  })

  it('renders the owner footer under the card', () => {
    const ui = mount({ footer: <span>stats</span> })

    expect(ui.getByText('stats')).toBeTruthy()
  })

  it('reports the shared qualifications as on file', async () => {
    const ui = mount()

    await waitFor(() => { expect(ui.getByText(zh['composer.qualificationsFilled'])).toBeTruthy() })
  })

  it('reports a blank shared record as not on file', async () => {
    const ui = mount({ readQualifications: () => Promise.resolve(ok({ text: '   ', updatedAt: 0 })) })

    await waitFor(() => { expect(ui.getByText(zh['composer.qualificationsEmpty'])).toBeTruthy() })
  })

  it('shows no badge at all when the shared record cannot be read', async () => {
    const ui = mount({ readQualifications: () => Promise.resolve(refused({ code: 'timeout' })) })

    await waitFor(() => { expect(ui.readQualifications).toHaveBeenCalled() })
    expect(ui.queryByText(zh['composer.qualificationsFilled'])).toBeNull()
    expect(ui.queryByText(zh['composer.qualificationsEmpty'])).toBeNull()
  })

  it('highlights the drop target only while dragging', () => {
    const ui = mount()
    const drop = ui.getByText(zh['composer.dropHint']).parentElement as HTMLElement

    fireEvent.dragOver(drop)
    expect(drop.className).toContain(css.dropActive as string)

    fireEvent.dragLeave(drop)
    expect(drop.className).not.toContain(css.dropActive as string)
  })

  it('ignores a picker change that carries no file', () => {
    const ui = mount()

    fireEvent.change(ui.fileInput())

    expect(ui.uploadDocument).not.toHaveBeenCalled()
    expect(ui.getByText(zh['composer.dropHint'])).toBeTruthy()
  })

  it('ignores a drop that offers nothing', () => {
    const ui = mount()
    const drop = ui.getByText(zh['composer.dropHint']).parentElement as HTMLElement

    fireEvent.drop(drop, { dataTransfer: { files: [] } })

    expect(ui.uploadDocument).not.toHaveBeenCalled()
  })
})

describe('the intake state machine', () => {
  it('uploads the picked file and settles on the document card', async () => {
    const gate = deferred<Outcome<StoredDocument>>()
    const ui = mount({ uploadDocument: () => gate.promise })

    pick(ui)

    expect(ui.getByText(zh['composer.uploading'])).toBeTruthy()
    expect(ui.queryByText(zh['composer.dropHint'])).toBeNull()

    gate.resolve(ok(DOC))
    await waitFor(() => { expect(ui.getByText(DOC.filename)).toBeTruthy() })
    expect(ui.getByText(formatBytes(DOC.bytes))).toBeTruthy()
    expect(ui.submit().disabled).toBe(false)
  })

  it('remembers the uploaded document so a reload restores the card', async () => {
    const ui = mount()

    pick(ui)
    await waitFor(() => { expect(ui.getByText(DOC.filename)).toBeTruthy() })

    expect(JSON.parse(globalThis.sessionStorage.getItem(`dsh-bid-doc:${SID}`) as string)).toEqual(DOC)
  })

  it('restores the document card after a reload without re-uploading', () => {
    const ui = mountReady()

    expect(ui.getByText(DOC.filename)).toBeTruthy()
    expect(ui.getByText(formatBytes(DOC.bytes))).toBeTruthy()
    expect(ui.uploadDocument).not.toHaveBeenCalled()
    expect(ui.submit().disabled).toBe(false)
  })

  it('accepts a dropped file', async () => {
    const ui = mount()
    const drop = ui.getByText(zh['composer.dropHint']).parentElement as HTMLElement

    fireEvent.drop(drop, { dataTransfer: { files: [new File(['bid'], '标书.pdf')] } })

    await waitFor(() => { expect(ui.uploadDocument).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(ui.getByText(DOC.filename)).toBeTruthy() })
  })

  it('reports a refused upload inline and offers to pick again', async () => {
    const ui = mount({ uploadDocument: () => Promise.resolve(refused({ code: 'filename-blank' })) })

    pick(ui, new File(['bid'], '   '))

    await waitFor(() => { expect(ui.alerts()).toContain(zh['error.filenameBlank']) })
    expect(ui.queryByText(DOC.filename)).toBeNull()

    fireEvent.click(ui.repick())
    expect(ui.getByText(zh['composer.dropHint'])).toBeTruthy()
  })

  it('reports an oversized document with both byte counts', async () => {
    const ui = mount({
      uploadDocument: () => Promise.resolve(refused({
        code: 'document-too-large', maxBytes: 128, actualBytes: 200,
      })),
    })

    pick(ui)

    await waitFor(() => { expect(ui.alerts()[0]).toContain('200 B') })
  })

  it('returns to the picker on repick and forgets the document', () => {
    const ui = mountReady()

    fireEvent.click(ui.repick())

    expect(ui.getByText(zh['composer.dropHint'])).toBeTruthy()
    expect(globalThis.sessionStorage.getItem(`dsh-bid-doc:${SID}`)).toBeNull()
  })

  it('publishes nothing after the composer unmounts mid-upload', async () => {
    const gate = deferred<Outcome<StoredDocument>>()
    const ui = mount({ uploadDocument: () => gate.promise })

    pick(ui)
    ui.unmount()
    gate.resolve(ok(DOC))
    await gate.promise

    expect(globalThis.sessionStorage.getItem(`dsh-bid-doc:${SID}`)).toBeNull()
  })
})

describe('submitting the fixed question', () => {
  it('sends the question, the server path, and the shared qualifications', async () => {
    const ui = mountReady({ readQualifications: () => Promise.resolve(ok(FILLED)) })

    fireEvent.click(ui.submit())

    await waitFor(() => { expect(ui.inputActions?.setDraft).toHaveBeenCalledWith(
      `${BID_REVIEW_PRESET_QUESTION}\n\n标书文件：${DOC.path}\n\n公司资格：\n${FILLED.text}`,
    ) })
    expect(ui.inputActions?.submit).toHaveBeenCalledTimes(1)
  })

  it('shows the sending posture and holds the document out of a second pick', async () => {
    const gate = deferred<Outcome<CompanyQualifications>>()
    const ui = mountReady({ readQualifications: () => gate.promise })

    fireEvent.click(ui.submit())

    expect(ui.sending().disabled).toBe(true)
    expect(ui.repick().disabled).toBe(true)

    gate.resolve(ok(FILLED))
    await waitFor(() => { expect(ui.inputActions?.submit).toHaveBeenCalled() })
  })

  it('reports a qualifications failure at submit and keeps the document', async () => {
    const ui = mountReady()
    // The badge read succeeds; only the submit read fails.
    await waitFor(() => { expect(ui.readQualifications).toHaveBeenCalledTimes(1) })
    ui.readQualifications.mockResolvedValue(refused({ code: 'timeout' }))

    fireEvent.click(ui.submit())

    await waitFor(() => { expect(ui.alerts()).toContain(zh['error.generic'].replace('{detail}', 'timeout')) })
    expect(ui.getByText(DOC.filename)).toBeTruthy()
    expect(ui.inputActions?.submit).not.toHaveBeenCalled()
  })

  it('publishes nothing after the composer unmounts mid-submit', async () => {
    const gate = deferred<Outcome<CompanyQualifications>>()
    const ui = mountReady({ readQualifications: () => gate.promise })

    fireEvent.click(ui.submit())
    ui.unmount()
    gate.resolve(ok(FILLED))
    await gate.promise

    expect(ui.inputActions?.setDraft).not.toHaveBeenCalled()
    expect(ui.inputActions?.submit).not.toHaveBeenCalled()
  })

  it('holds the submit back while the input actions are absent', () => {
    const ui = mountReady({ inputActions: null })

    expect(ui.getByText(DOC.filename)).toBeTruthy()
    expect(ui.submit().disabled).toBe(true)
  })

  it('returns to the intake after a failed first prompt', async () => {
    const ui = mount({
      snapshot: { composerPhase: 'engaging', promptError: { op: 'send', error: { code: 'model-not-found', message: 'no model' } } },
    })

    expect(ui.getByText(zh['composer.dropHint'])).toBeTruthy()
    expect(ui.alerts()).toContain(zh['error.generic'].replace('{detail}', 'no model'))
  })

  it('stays locked when a later prompt fails', () => {
    const ui = mount({
      snapshot: { composerPhase: 'active', promptError: { op: 'send', error: { code: 'model-not-found', message: 'no model' } } },
    })

    expect(ui.getByText(zh['composer.locked'])).toBeTruthy()
    expect(ui.alerts()).toEqual([])
  })
})

describe('the owner blocked posture', () => {
  it('names the blocker and refuses the picker and both buttons', () => {
    const ui = mount({ blocked: { reason: '需要先选择模型' } })

    expect(ui.getByRole('status').textContent).toBe('需要先选择模型')
    expect(ui.fileInput().disabled).toBe(true)
    expect(ui.qualifications().disabled).toBe(true)
    expect(ui.submit().disabled).toBe(true)
  })

  it('refuses a held document as well', () => {
    seedStored()
    const ui = mount({ blocked: { reason: '需要先选择模型' } })

    expect(ui.getByText(DOC.filename)).toBeTruthy()
    expect(ui.repick().disabled).toBe(true)
    expect(ui.submit().disabled).toBe(true)
  })

  it('ignores a drop while a blocker holds the seat', () => {
    const ui = mount({ blocked: { reason: '需要先选择模型' } })
    const drop = ui.getByText(zh['composer.dropHint']).parentElement as HTMLElement

    fireEvent.drop(drop, { dataTransfer: { files: [new File(['bid'], '标书.pdf')] } })

    expect(ui.uploadDocument).not.toHaveBeenCalled()
  })
})

describe('the qualifications dialog seat', () => {
  it('opens from the composer and refreshes the badge on close', async () => {
    const ui = mount({ readQualifications: () => Promise.resolve(ok({ text: '', updatedAt: 0 })) })
    await waitFor(() => { expect(ui.getByText(zh['composer.qualificationsEmpty'])).toBeTruthy() })

    fireEvent.click(ui.qualifications())
    expect(ui.getByRole('dialog')).toBeTruthy()

    ui.readQualifications.mockResolvedValue(ok(FILLED))
    fireEvent.click(ui.getByText(zh['qualifications.cancel']))

    await waitFor(() => { expect(ui.getByText(zh['composer.qualificationsFilled'])).toBeTruthy() })
    expect(ui.queryByRole('dialog')).toBeNull()
  })
})

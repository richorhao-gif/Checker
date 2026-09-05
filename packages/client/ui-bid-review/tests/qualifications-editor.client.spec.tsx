// @vitest-environment jsdom
/**
 * The shared company-qualifications dialog: one textarea over the one Host
 * record, the UTF-8 byte count against the deployment limit, the last save
 * time, and a save that reports its own refusal inline without losing the draft.
 * Both opening reads must settle before the dialog accepts input, and a
 * failure of either leaves it an error dialog rather than a half-loaded form.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { BidReviewLimits, CompanyQualifications } from '@deepseek-ai/dsh-bid-review/types'
import { QualificationsEditor } from '../src/client/QualificationsEditor.tsx'
import type { Outcome } from '../src/client/remote.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)
const LIMITS: BidReviewLimits = { maxQualificationsBytes: 64, maxDocumentBytes: 128, companyName: '' }

/** One outcome the dialog's verbs resolve against. */
function ok<T>(value: T): Outcome<T> {
  return { ok: true, value }
}

/** A promise the test releases by hand, for the in-flight postures. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve = (_value: T): void => {}
  const promise = new Promise<T>((release) => { resolve = release })
  return { promise, resolve }
}

function mount(options: {
  open?: boolean
  limits?: Outcome<BidReviewLimits> | Promise<Outcome<BidReviewLimits>>
  qualifications?: Outcome<CompanyQualifications> | Promise<Outcome<CompanyQualifications>>
  save?: Outcome<CompanyQualifications> | Promise<Outcome<CompanyQualifications>>
} = {}) {
  const readLimits = vi.fn(() => Promise.resolve(options.limits ?? ok(LIMITS)))
  const readQualifications = vi.fn(() => Promise.resolve(options.qualifications ?? ok<CompanyQualifications>({ text: '', updatedAt: 0 })))
  const saveQualifications = vi.fn((_text: string) => Promise.resolve(
    options.save ?? ok<CompanyQualifications>({ text: '', updatedAt: 9 }),
  ))
  const onClose = vi.fn()
  const ui = render(
    <QualificationsEditor
      open={options.open ?? true}
      onClose={onClose}
      t={t}
      readLimits={readLimits}
      readQualifications={readQualifications}
      saveQualifications={saveQualifications}
    />,
  )
  return {
    ...ui, onClose, readLimits, readQualifications, saveQualifications,
    textbox: () => ui.getByRole('textbox') as HTMLTextAreaElement,
    save: () => ui.getByText(zh['qualifications.save']) as HTMLButtonElement,
  }
}

describe('QualificationsEditor', () => {
  it('renders nothing and reads nothing while closed', () => {
    const ui = mount({ open: false })

    expect(ui.queryByRole('dialog')).toBeNull()
    expect(ui.readLimits).not.toHaveBeenCalled()
    expect(ui.readQualifications).not.toHaveBeenCalled()
  })

  it('shows the loading hint until both opening reads settle', async () => {
    const gate = deferred<Outcome<CompanyQualifications>>()
    const ui = mount({ qualifications: gate.promise })

    expect(ui.getByText(zh['qualifications.loading'])).toBeTruthy()
    expect(ui.queryByRole('textbox')).toBeNull()

    gate.resolve(ok({ text: '蔬菜配送', updatedAt: 0 }))
    await waitFor(() => { expect(ui.queryByText(zh['qualifications.loading'])).toBeNull() })
    expect(ui.textbox().value).toBe('蔬菜配送')
  })

  it('seeds the textarea with the shared record and names the deployment', () => {
    const ui = mount()

    expect(ui.getByRole('dialog').getAttribute('aria-label')).toBe(zh['qualifications.aria'])
    expect(ui.getByText(zh['qualifications.description'])).toBeTruthy()
  })

  it('shows the last save time once the record was saved', async () => {
    const ui = mount({ qualifications: ok({ text: 'a', updatedAt: new Date(2026, 8, 4, 9, 5).getTime() }) })

    await waitFor(() => { expect(ui.getByText('上次更新 2026-09-04 09:05')).toBeTruthy() })
  })

  it('omits the save time for a record that was never saved', async () => {
    const ui = mount({ qualifications: ok({ text: '', updatedAt: 0 }) })

    await waitFor(() => { expect(ui.queryByRole('textbox')).toBeTruthy() })
    expect(document.body.textContent).not.toContain('上次更新')
  })

  it('counts the UTF-8 bytes of the draft against the limit', async () => {
    const ui = mount({ limits: ok({ maxQualificationsBytes: 64 * 1024, maxDocumentBytes: 128, companyName: '' }) })
    await waitFor(() => { expect(ui.queryByRole('textbox')).toBeTruthy() })

    fireEvent.change(ui.textbox(), { target: { value: '蔬菜' } })

    expect(document.body.textContent).toContain('6 B / 64.0 KiB')
  })

  it('refuses to save a draft over the limit and says why', async () => {
    // Six CJK characters are 18 bytes against a 12-byte limit.
    const ui = mount({ limits: ok({ maxQualificationsBytes: 12, maxDocumentBytes: 128, companyName: '' }) })
    await waitFor(() => { expect(ui.queryByRole('textbox')).toBeTruthy() })

    fireEvent.change(ui.textbox(), { target: { value: '蔬菜肉禽蛋奶' } })

    expect(ui.getByText(zh['qualifications.tooLarge'])).toBeTruthy()
    expect(ui.save().disabled).toBe(true)

    fireEvent.change(ui.textbox(), { target: { value: '蔬菜' } })

    expect(ui.queryByText(zh['qualifications.tooLarge'])).toBeNull()
    expect(ui.save().disabled).toBe(false)
  })

  it('saves the draft through the verb and closes', async () => {
    const ui = mount({ save: ok({ text: '蔬菜配送', updatedAt: 11 }) })
    await waitFor(() => { expect(ui.queryByRole('textbox')).toBeTruthy() })

    fireEvent.change(ui.textbox(), { target: { value: '蔬菜配送' } })
    fireEvent.click(ui.save())

    await waitFor(() => { expect(ui.saveQualifications).toHaveBeenCalledWith('蔬菜配送') })
    await waitFor(() => { expect(ui.onClose).toHaveBeenCalledTimes(1) })
  })

  it('keeps the draft and reports a refused save inline', async () => {
    const ui = mount({
      save: { ok: false, failure: { code: 'qualifications-too-large', maxBytes: 12, actualBytes: 18 } },
    })
    await waitFor(() => { expect(ui.queryByRole('textbox')).toBeTruthy() })

    fireEvent.change(ui.textbox(), { target: { value: '蔬菜配送' } })
    fireEvent.click(ui.save())

    await waitFor(() => { expect(ui.getByRole('alert').textContent).toContain('18 B') })
    // The draft survives so the human shortens it instead of retyping it, and
    // a refused save is not a close request.
    expect(ui.textbox().value).toBe('蔬菜配送')
    expect(ui.onClose).not.toHaveBeenCalled()
  })

  it('disables save while a save is in flight', async () => {
    const gate = deferred<Outcome<CompanyQualifications>>()
    const ui = mount({ save: gate.promise })
    await waitFor(() => { expect(ui.queryByRole('textbox')).toBeTruthy() })

    fireEvent.click(ui.save())

    await waitFor(() => { expect(ui.save().disabled).toBe(true) })
    gate.resolve(ok({ text: '', updatedAt: 9 }))
    await waitFor(() => { expect(ui.onClose).toHaveBeenCalled() })
  })

  it('becomes an error dialog when the limits read fails', async () => {
    const ui = mount({ limits: { ok: false, failure: { code: 'not-found', message: 'no bidReview service' } } })

    await waitFor(() => { expect(ui.getByRole('alert').textContent).toContain('no bidReview service') })
    expect(ui.queryByRole('textbox')).toBeNull()
    expect(ui.save().disabled).toBe(true)
  })

  it('becomes an error dialog when the record read fails', async () => {
    const ui = mount({ qualifications: { ok: false, failure: { code: 'timeout' } } })

    await waitFor(() => { expect(ui.getByRole('alert').textContent).toContain('timeout') })
    expect(ui.queryByRole('textbox')).toBeNull()
    expect(ui.save().disabled).toBe(true)
  })

  it('routes the cancel button and the dialog chrome to onClose', async () => {
    const ui = mount()
    await waitFor(() => { expect(ui.queryByRole('textbox')).toBeTruthy() })

    fireEvent.click(ui.getByText(zh['qualifications.cancel']))
    fireEvent.click(ui.getByLabelText(zh['qualifications.close']))

    expect(ui.onClose).toHaveBeenCalledTimes(2)
    expect(ui.saveQualifications).not.toHaveBeenCalled()
  })

  it('publishes nothing after the dialog unmounts mid-load', async () => {
    const gate = deferred<Outcome<CompanyQualifications>>()
    const ui = mount({ qualifications: gate.promise })
    await waitFor(() => { expect(ui.readQualifications).toHaveBeenCalled() })

    ui.unmount()
    gate.resolve(ok({ text: 'late', updatedAt: 3 }))
    await gate.promise

    expect(ui.onClose).not.toHaveBeenCalled()
  })

  it('publishes nothing after the dialog unmounts mid-save', async () => {
    const gate = deferred<Outcome<CompanyQualifications>>()
    const ui = mount({ save: gate.promise })
    await waitFor(() => { expect(ui.queryByRole('textbox')).toBeTruthy() })

    fireEvent.click(ui.save())
    ui.unmount()
    gate.resolve(ok({ text: 'late', updatedAt: 3 }))
    await gate.promise

    expect(ui.onClose).not.toHaveBeenCalled()
  })

  it('re-reads both faces when the dialog reopens', async () => {
    const readLimits = vi.fn(() => Promise.resolve(ok(LIMITS)))
    const readQualifications = vi.fn(() => Promise.resolve(ok<CompanyQualifications>({ text: '', updatedAt: 0 })))
    const editor = (open: boolean) => (
      <QualificationsEditor
        open={open}
        onClose={() => {}}
        t={t}
        readLimits={readLimits}
        readQualifications={readQualifications}
        saveQualifications={vi.fn(() => Promise.resolve(ok<CompanyQualifications>({ text: '', updatedAt: 0 })))}
      />
    )
    const ui = render(editor(true))
    await waitFor(() => { expect(readQualifications).toHaveBeenCalledTimes(1) })

    ui.rerender(editor(false))
    ui.rerender(editor(true))

    await waitFor(() => { expect(readQualifications).toHaveBeenCalledTimes(2) })
    expect(readLimits).toHaveBeenCalledTimes(2)
  })
})

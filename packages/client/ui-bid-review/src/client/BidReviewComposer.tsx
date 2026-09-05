/**
 * The bid-review composer: the 'conversation.composer.bar' entry that shadows
 * the free-text input bar at a lower priority. It replaces the textarea with a
 * one-document intake, submits the fixed review question over the standard
 * input actions, and hosts the shared company-qualifications dialog. The owner
 * props decide the inert and blocked postures; the Session snapshot decides
 * whether the fixed question was already sent.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/BidReviewComposer
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import clsx from 'clsx'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BidReviewComposerProps } from './slots.ts'
import { firstFile, forgetDocument, readStoredDocument, rememberDocument } from './document.ts'
import type { BidReviewStep } from './surface.ts'
import { deriveSurface } from './surface.ts'
import { buildBidReviewPrompt } from './prompt.ts'
import { failureText } from './remote.ts'
import { formatBytes } from './format.ts'
import { QualificationsEditor } from './QualificationsEditor.tsx'
import css from './BidReviewComposer.module.css'

/**
 * Render the bid-review composer.
 * @param props - the composed slot props: the owner's layout share, the
 * session-maybe standard kit, the injected bidReview operations, and the
 * bidReview translate seat.
 * @returns the composer tree for the surface the Session puts it in.
 */
export function BidReviewComposer({
  useSession, sessionId, inputActions, t,
  readLimits, readQualifications, saveQualifications, uploadDocument,
  variant, disabled: inert = false, blocked, workspacePickerOpen = false,
  onRequestWorkspace, placeholder, footer,
}: BidReviewComposerProps) {
  const composerPhase = useSession(snapshot => snapshot.composerPhase)
  const removed = useSession(snapshot => snapshot.removed) ?? false
  const promptError = useSession(snapshot => snapshot.promptError) ?? null
  const surface = deriveSurface({
    disabled: inert, removed, composerPhase, promptFailed: promptError !== null,
  })
  const unusable = blocked !== undefined

  const [step, setStep] = useState<BidReviewStep>({ kind: 'pick' })
  const [dragging, setDragging] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [qualificationsFilled, setQualificationsFilled] = useState<boolean | null>(null)
  const [submitFailure, setSubmitFailure] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const sending = step.kind === 'sending'
  const lockedText = surface === 'removed' ? t('composer.removed') : t('composer.locked')

  // A reload before the first submitted prompt restores the file card; the Host
  // path is still valid, so the review can start without re-uploading.
  useEffect(() => {
    const stored = readStoredDocument(globalThis.sessionStorage, sessionId)
    setStep(stored === null ? { kind: 'pick' } : { kind: 'ready', document: stored })
  }, [sessionId])

  // The review is under way, so the remembered document has nothing left to
  // restore and must not survive into a later conversation on this Session id.
  useEffect(() => {
    if (surface !== 'locked') return
    forgetDocument(globalThis.sessionStorage, sessionId)
  }, [surface, sessionId])

  const refreshBadge = useCallback(() => {
    void readQualifications().then((outcome) => {
      if (!alive.current) return
      // A failed read says nothing about the record, so the badge stays absent
      // rather than claiming the shared qualifications are empty.
      setQualificationsFilled(outcome.ok ? outcome.value.text.trim() !== '' : null)
    })
  }, [readQualifications])
  useEffect(() => { refreshBadge() }, [refreshBadge])

  const startUpload = useCallback((file: File): void => {
    setStep({ kind: 'uploading' })
    void uploadDocument(file).then((outcome) => {
      if (!alive.current) return
      if (!outcome.ok) {
        setStep({ kind: 'uploadError', message: failureText(t, outcome.failure) })
        return
      }
      rememberDocument(globalThis.sessionStorage, sessionId, outcome.value)
      setStep({ kind: 'ready', document: outcome.value })
    })
  }, [sessionId, t, uploadDocument])

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = firstFile(event.target.files)
    // Reset so picking the same file again still fires a change event.
    event.target.value = ''
    if (file !== undefined) startUpload(file)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(true)
  }

  const onDragLeave = (): void => { setDragging(false) }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    if (unusable) return
    const file = firstFile(event.dataTransfer.files)
    if (file !== undefined) startUpload(file)
  }

  const onRepick = (): void => {
    forgetDocument(globalThis.sessionStorage, sessionId)
    setStep({ kind: 'pick' })
  }

  const onEditorClose = (): void => {
    setEditorOpen(false)
    refreshBadge()
  }

  // The primary button's disabled state is the only precondition check, so the
  // body needs none. TypeScript preserves narrowing for a const read inside a
  // closure but not for a destructured parameter, hence the two local copies.
  const readyDocument = step.kind === 'ready' ? step.document : undefined
  const submitActions = inputActions
  const onSubmit = readyDocument === undefined || submitActions === undefined ? undefined : (): void => {
    setStep({ kind: 'sending', document: readyDocument })
    setSubmitFailure(null)
    void readQualifications().then((outcome) => {
      if (!alive.current) return
      if (!outcome.ok) {
        setStep({ kind: 'ready', document: readyDocument })
        setSubmitFailure(failureText(t, outcome.failure))
        return
      }
      submitActions.setDraft(buildBidReviewPrompt(readyDocument.path, outcome.value.text))
      submitActions.submit()
    })
  }

  return (
    <div className={clsx(css.root, variant === 'hero' && css.hero)}>
      {blocked !== undefined && <div className={css.notice} role="status">{blocked.reason}</div>}
      {surface === 'workspace' && (
        <button
          type="button"
          className={clsx(css.card, css.workspaceTrigger)}
          onClick={onRequestWorkspace}
          disabled={onRequestWorkspace === undefined}
          aria-label={t('composer.chooseWorkspace')}
          aria-haspopup="menu"
          aria-expanded={workspacePickerOpen}
        >
          {placeholder}
        </button>
      )}
      {(surface === 'locked' || surface === 'removed') && (
        <div className={css.card}>
          <p className={css.hint}>{lockedText}</p>
        </div>
      )}
      {surface === 'interactive' && (
        <div className={css.card}>
          {step.kind === 'pick' && (
            <div
              className={clsx(css.drop, dragging && css.dropActive)}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <p className={css.dropText}>{t('composer.dropHint')}</p>
              <input
                type="file"
                className={css.fileInput}
                aria-label={t('composer.pick')}
                disabled={unusable}
                onChange={onFileChange}
              />
            </div>
          )}
          {step.kind === 'uploading' && <p className={css.hint}>{t('composer.uploading')}</p>}
          {step.kind === 'uploadError' && (
            <div className={css.errorRow}>
              <p className={css.error} role="alert">{step.message}</p>
              <Button variant="outline" disabled={unusable} onClick={onRepick}>
                {t('composer.repick')}
              </Button>
            </div>
          )}
          {(step.kind === 'ready' || step.kind === 'sending') && (
            <div className={css.fileCard}>
              <span className={css.fileName}>{step.document.filename}</span>
              <span className={css.fileSize}>{formatBytes(step.document.bytes)}</span>
              <Button variant="ghost" size="sm" disabled={unusable || sending} onClick={onRepick}>
                {t('composer.repick')}
              </Button>
            </div>
          )}
          {submitFailure !== null && <p className={css.error} role="alert">{submitFailure}</p>}
          {promptError !== null && (
            <p className={css.error} role="alert">
              {failureText(t, { code: promptError.error.code, message: promptError.error.message })}
            </p>
          )}
          <div className={css.row}>
            <Button variant="ghost" disabled={unusable} onClick={() => { setEditorOpen(true) }}>
              {t('composer.qualifications')}
              {qualificationsFilled !== null && (
                <span className={css.badge}>
                  {qualificationsFilled ? t('composer.qualificationsFilled') : t('composer.qualificationsEmpty')}
                </span>
              )}
            </Button>
            <Button variant="primary" onClick={onSubmit} disabled={onSubmit === undefined || unusable}>
              {sending ? t('composer.sending') : t('composer.submit')}
            </Button>
          </div>
        </div>
      )}
      {footer}
      <QualificationsEditor
        open={editorOpen}
        onClose={onEditorClose}
        t={t}
        readLimits={readLimits}
        readQualifications={readQualifications}
        saveQualifications={saveQualifications}
      />
    </div>
  )
}

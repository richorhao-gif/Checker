/**
 * The shared company-qualifications editor: one dialog around one textarea, the
 * UTF-8 byte count against the deployment limit, and the last save time. Every
 * user of the deployment reads and writes the same Host record.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/QualificationsEditor
 */

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { BidReviewLimits, CompanyQualifications } from '@deepseek-ai/dsh-bid-review/types'
import type { Outcome } from './remote.ts'
import { failureText } from './remote.ts'
import { formatBytes, formatTimestamp, utf8ByteLength } from './format.ts'
import css from './QualificationsEditor.module.css'

/** Load state of the dialog's opening reads. */
type EditorStatus = 'loading' | 'ready' | 'error'

/** Props of the shared company-qualifications dialog. */
export interface QualificationsEditorProps {
  /** Whether the dialog is showing. */
  open: boolean
  /** Close request from the dialog chrome or a successful save. */
  onClose: () => void
  /** Translate seat of the bidReview namespace. */
  t: TranslateNS<'bidReview'>
  /** Read the deployment's byte limits. */
  readLimits: () => Promise<Outcome<BidReviewLimits>>
  /** Read the shared record. */
  readQualifications: () => Promise<Outcome<CompanyQualifications>>
  /** Replace the shared record's text. */
  saveQualifications: (text: string) => Promise<Outcome<CompanyQualifications>>
}

/**
 * Render the shared company-qualifications dialog.
 * @param props - the open flag, the close callback, the translate seat, and the
 * three bidReview operations.
 * @returns the dialog tree, or null while closed.
 */
export function QualificationsEditor({
  open, onClose, t, readLimits, readQualifications, saveQualifications,
}: QualificationsEditorProps) {
  const [status, setStatus] = useState<EditorStatus>('loading')
  const [text, setText] = useState('')
  const [maxBytes, setMaxBytes] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => {
    if (!open) return
    setStatus('loading')
    setFailure(null)
    setSaving(false)
    void Promise.all([readLimits(), readQualifications()]).then(([limits, qualifications]) => {
      if (!alive.current) return
      if (!limits.ok) {
        setFailure(failureText(t, limits.failure))
        setStatus('error')
        return
      }
      if (!qualifications.ok) {
        setFailure(failureText(t, qualifications.failure))
        setStatus('error')
        return
      }
      setMaxBytes(limits.value.maxQualificationsBytes)
      setText(qualifications.value.text)
      setUpdatedAt(qualifications.value.updatedAt)
      setStatus('ready')
    })
  }, [open, readLimits, readQualifications, t])

  const bytes = utf8ByteLength(text)
  // The limit is unknown until the reads settle, so only a ready dialog counts.
  const over = status === 'ready' && bytes > maxBytes

  const onSave = (): void => {
    setSaving(true)
    setFailure(null)
    void saveQualifications(text).then((outcome) => {
      if (!alive.current) return
      setSaving(false)
      if (!outcome.ok) {
        setFailure(failureText(t, outcome.failure))
        return
      }
      setUpdatedAt(outcome.value.updatedAt)
      onClose()
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('qualifications.aria')}
      closeLabel={t('qualifications.close')}
      description={t('qualifications.description')}
      className={css.dialog as string}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('qualifications.cancel')}</Button>
          <Button variant="primary" onClick={onSave} disabled={saving || over || status !== 'ready'}>
            {t('qualifications.save')}
          </Button>
        </>
      )}
    >
      {status === 'loading' && <p className={css.hint}>{t('qualifications.loading')}</p>}
      {status === 'ready' && (
        <>
          {updatedAt > 0 && (
            <p className={css.meta}>
              {t('qualifications.updatedAt', { time: formatTimestamp(updatedAt) })}
            </p>
          )}
          <textarea
            className={css.textarea}
            value={text}
            rows={16}
            aria-label={t('qualifications.aria')}
            onChange={(event) => { setText(event.target.value) }}
          />
          <p className={clsx(css.counter, over && css.counterOver)}>
            {t('qualifications.bytes', { used: formatBytes(bytes), max: formatBytes(maxBytes) })}
          </p>
          {over && <p className={css.error}>{t('qualifications.tooLarge')}</p>}
        </>
      )}
      {failure !== null && <p className={css.error} role="alert">{failure}</p>}
    </Modal>
  )
}

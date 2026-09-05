/**
 * The reviewing desk: the 'conversation.view' entry that shadows the chat cell
 * at a lower priority, so a submitted bid review reads as one sheet of paper
 * under review instead of a transcript. Every value it paints comes from the
 * Session snapshot through {@link deriveDesk}: the paper's bars are a document
 * stand-in, while the page-margin marks, the timer, the paused note, the seal,
 * and the opinion text are the log's own. Approvals and questions stay with the
 * composer chain below the desk, so a paused review is answered where it always
 * was; this surface only points at it.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/ReviewDesk
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import clsx from 'clsx'
import { MarkdownText, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BidReviewLimits, CompanyQualifications } from '@deepseek-ai/dsh-bid-review/types'
import type { ReviewDeskProps } from './slots.ts'
import type { Outcome } from './remote.ts'
import type { DeskFacts } from './desk.ts'
import {
  basisOf, deriveDesk, deskElapsed, docNumberOf, documentName, dotTone, letterheadOf, noteKey,
  sealKey, sheetFilename, sheetText, stageKey,
} from './desk.ts'
import { chineseDate, formatElapsed, formatTimeOfDay, formatTimestamp } from './format.ts'
import { downloadText } from './output.ts'
import css from './ReviewDesk.module.css'

/** Milliseconds between the rail timer's reads while a turn is open. */
const CLOCK_MS = 1000

/** How long the sealed sheet holds its landing seal before the page turns. */
const SEAL_HOLD_MS = 1800

/**
 * Blind rows of the paper's document stand-in: a row kind and its bar width in
 * percent of the text column. `h` heads a paragraph, `l` is a body line, `g` is
 * paragraph space, and `t` is the one table block.
 */
const PAPER_ROWS = [
  ['h', 34], ['l', 92], ['l', 88], ['l', 95], ['l', 61], ['g', 0],
  ['h', 28], ['l', 94], ['l', 90], ['l', 86], ['l', 93], ['l', 74], ['g', 0],
  ['t', 0], ['g', 0],
  ['h', 31], ['l', 91], ['l', 87], ['l', 94], ['l', 58], ['g', 0],
  ['h', 26], ['l', 93], ['l', 89], ['l', 92], ['l', 66], ['l', 84], ['l', 47],
] as const

/** Bar widths of the stand-in's table block, in percent; the first three head it. */
const TABLE_WIDTHS = [82, 64, 71, 90, 58, 66, 86, 62, 74] as const

/** The margin's grown hairline, carried as a custom property. */
type MarginStyle = CSSProperties & { '--read': string }

/** Whether the user asked for reduced motion. */
function reducedMotion(): boolean {
  // jsdom (the unit lane) implements no matchMedia despite lib.dom's
  // non-optional typing; the optional call keeps that lane on the timed turn.
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * The paper's blind rows, tinted up to the height the reading has reached.
 * @param props - the reached height, in percent of the paper.
 * @returns the document stand-in.
 */
function PaperRows({ read }: { read: number }) {
  return (
    <div className={css.lines}>
      {PAPER_ROWS.map(([kind, width], index) => {
        if (kind === 'g') return <div key={`g${index}`} className={css.gap} />
        if (kind === 't') {
          return (
            <div key={`t${index}`} className={css.table}>
              {TABLE_WIDTHS.map((cell, cellIndex) => (
                <span
                  key={`c${cellIndex}`}
                  className={clsx(css.bar, cellIndex < 3 && css.barHead)}
                  style={{ width: `${cell}%` }}
                />
              ))}
            </div>
          )
        }
        return (
          <div
            key={`r${index}`}
            className={clsx(css.row, ((index / PAPER_ROWS.length) * 100) < read && css.read)}
          >
            <span
              className={clsx(css.bar, kind === 'h' && css.barHead)}
              style={{ width: `${width}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * The desk's stamped seal: the verdict word under its label, shrunk for copy
 * longer than four characters and inked green on a pass.
 * @param props - placement class, whether the verdict passes, and the two copy lines.
 * @returns the seal.
 */
function Seal({ place, pass, top, label }: { place: string | undefined; pass: boolean; top: string; label: string }) {
  return (
    <div className={clsx(css.seal, place, pass && css.sealInk)}>
      <span className={css.sealTop}>{top}</span>
      <span className={clsx(css.sealMain, label.length > 4 && css.sealSmall)}>{label}</span>
    </div>
  )
}

/**
 * Render the reviewing desk for one Session.
 * @param props - the composed slot props: the framework session kit, the
 * injected bidReview reads behind the opinion sheet's letterhead and basis
 * line, the history-paging verb the shadowed transcript owned, and the
 * bidReview translate seat.
 * @returns the desk, or null while the Session is still blank and the intake
 * hero owns the screen.
 */
export function ReviewDesk({ useSession, sessionId, t, readLimits, readQualifications, loadOlder }: ReviewDeskProps) {
  const facts: DeskFacts = {
    removed: useSession(snapshot => snapshot.removed),
    blank: useSession(snapshot => snapshot.blank),
    composerPhase: useSession(snapshot => snapshot.composerPhase),
    running: useSession(snapshot => snapshot.running),
    pending: useSession(snapshot => snapshot.pending),
    nodes: useSession(snapshot => snapshot.nodes),
    partial: useSession(snapshot => snapshot.partial),
    runningCalls: useSession(snapshot => snapshot.runningCalls),
    turnTimings: useSession(snapshot => snapshot.turnTimings),
    promptError: useSession(snapshot => snapshot.promptError),
  }
  const openState = useSession(snapshot => snapshot.openState)
  const hasMore = useSession(snapshot => snapshot.hasMore)
  const loadingOlder = useSession(snapshot => snapshot.loadingOlder)
  const view = deriveDesk(facts)
  const sealed = view.stage === 'sealed'

  const [now, setNow] = useState(() => Date.now())
  // A review opened after it sealed starts on the opinion sheet: the page turn
  // belongs to the moment the seal lands, not to every later visit.
  const [turned, setTurned] = useState(() => view.stage === 'sealed')
  const [limits, setLimits] = useState<Outcome<BidReviewLimits> | null>(null)
  const [qualifications, setQualifications] = useState<Outcome<CompanyQualifications> | null>(null)
  const [copied, setCopied] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  // The timer reads the open turn's own span, so it only ticks while one is open.
  useEffect(() => {
    if (view.startedAt === null || view.endedAt !== null) return
    const clock = setInterval(() => { setNow(Date.now()) }, CLOCK_MS)
    return () => { clearInterval(clock) }
  }, [view.startedAt, view.endedAt])

  // Shadowing the transcript shadows its paging button with it, and a reopened
  // Session's window starts without the submission; page until it enters.
  useEffect(() => {
    if (openState !== 'open' || loadingOlder || !hasMore) return
    if (view.submittedAt !== null || facts.removed) return
    loadOlder()
  }, [openState, loadingOlder, hasMore, view.submittedAt, facts.removed, loadOlder])

  useEffect(() => {
    if (!sealed) {
      setTurned(false)
      return
    }
    if (reducedMotion()) {
      setTurned(true)
      return
    }
    const turn = setTimeout(() => { setTurned(true) }, SEAL_HOLD_MS)
    return () => { clearTimeout(turn) }
  }, [sealed])

  // The opinion sheet's letterhead and basis line are the deployment's own
  // words, so they are read once the review is over rather than guessed.
  useEffect(() => {
    if (!sealed) return
    void Promise.all([readLimits(), readQualifications()]).then(([limitsRead, record]) => {
      if (!alive.current) return
      setLimits(limitsRead)
      setQualifications(record)
    })
  }, [sealed, readLimits, readQualifications])

  const codeLabels = useMemo(() => ({
    copyLabel: t('desk.doc.codeCopy'),
    copiedLabel: t('desk.doc.codeCopied'),
  }), [t])

  if (view.stage === 'hidden') return null

  const sheet = sealed && turned
  const head = letterheadOf(limits) ?? t('desk.doc.headFallback')
  const basis = basisOf(qualifications)
  const basisText = basis.time === null ? t(basis.key) : t(basis.key, { time: formatTimestamp(basis.time) })
  const fileName = documentName(view.documentPath)
  const subject = fileName === null ? t('desk.doc.subjectMissing') : t('desk.doc.subject', { file: fileName })
  const docTitle = t('desk.doc.title')
  const signDate = chineseDate(view.endedAt ?? now)
  const exportText = sheetText([
    head, docTitle, subject, basisText, view.report ?? '', `${t('desk.doc.sign')} ${signDate}`,
  ])
  const elapsed = deskElapsed(view, now)
  const sealLabel = t(sealKey(view.verdict))
  const wait = view.wait

  const onCopy = (): void => {
    void writeClipboard(exportText).then((landed) => {
      if (alive.current && landed) setCopied(true)
    })
  }
  const onDownload = (): void => {
    downloadText(sheetFilename(view.documentPath, docTitle), exportText)
  }

  return (
    <div className={clsx(css.stage, sheet && css.stageSheet)}>
      <div className={css.desk}>
        <div className={css.stack}>
          <div className={css.tag}>
            <b>{sheet ? docTitle : (fileName ?? docTitle)}</b>
            {sheet && <i>{t('desk.tag.page')}</i>}
            {!sheet && view.submittedAt !== null && (
              <i>{t('desk.tag.submitted', { time: formatTimeOfDay(view.submittedAt) })}</i>
            )}
            {sealed && (
              <button type="button" className={css.flip} onClick={() => { setTurned(!turned) }}>
                {sheet ? t('desk.flip.toBoard') : t('desk.flip.toDoc')}
              </button>
            )}
          </div>

          <div className={css.paperBack} aria-hidden="true" />

          {sheet
            ? (
              <article className={clsx(css.paper, css.sheet)} aria-label={t('desk.doc.aria')}>
                <div className={css.redhead}>{head}</div>
                <div className={css.redrule} aria-hidden="true" />
                <div className={css.docno}>{t('desk.doc.number', { id: docNumberOf(String(sessionId)) })}</div>
                <h2 className={css.docTitle}>{docTitle}</h2>
                <p className={css.docSub}>{`${subject} · ${basisText}`}</p>
                <div className={css.docBody}>
                  <Seal
                    place={css.sealSheet}
                    pass={view.verdict === 'pass'}
                    top={t('desk.seal.label')}
                    label={sealLabel}
                  />
                  {view.report === null
                    ? <p className={css.docEmpty}>{t('desk.doc.empty')}</p>
                    : <MarkdownText text={view.report} codeLabels={codeLabels} />}
                  <div className={css.sign}>
                    {t('desk.doc.sign')}
                    <br />
                    {signDate}
                  </div>
                </div>
                <div className={css.pencil}>
                  <button type="button" onClick={onCopy}>
                    {copied ? t('desk.doc.copied') : t('desk.doc.copy')}
                  </button>
                  <button type="button" onClick={onDownload}>{t('desk.doc.download')}</button>
                </div>
              </article>
            )
            : (
              <div className={clsx(css.paper, sealed && css.settled)} aria-hidden="true">
                <PaperRows read={view.readPercent} />
                <div
                  className={clsx(
                    css.scan,
                    view.stage === 'paused' && css.scanPaused,
                    sealed && css.scanCollapsed,
                  )}
                />
                {sealed && (
                  <Seal
                    place={css.sealCorner}
                    pass={view.verdict === 'pass'}
                    top={t('desk.seal.label')}
                    label={sealLabel}
                  />
                )}
              </div>
            )}

          {!sheet && (
            <div
              className={clsx(css.margin, view.stage === 'paused' && css.marginAmber)}
              style={{ '--read': `${view.readPercent}%` } as MarginStyle}
              aria-hidden="true"
            >
              {view.ticks.map(tick => (
                <span key={tick.ordinal} className={css.tick} style={{ top: `${tick.position}%` }}>
                  <span className={css.tickN}>{tick.ordinal}</span>
                </span>
              ))}
            </div>
          )}

          {!sheet && wait !== null && (
            <aside className={css.note}>
              <b>{t('desk.note.title')}</b>
              {wait.reason ?? t(noteKey(wait))}
              <span className={css.arrow}>
                {wait.toolName === null ? t('desk.note.wait') : t('desk.note.tool', { tool: wait.toolName })}
              </span>
            </aside>
          )}
        </div>

        <div className={css.rail} role="status" aria-label={t('desk.status.aria')}>
          <span className={clsx(css.railDot, css[dotTone(view.stage)])} aria-hidden="true" />
          <b>{t(stageKey(view.stage, view.activity))}</b>
          {view.toolName !== null && <code>{view.toolName}</code>}
          {elapsed !== null && <span className={css.timer}>{formatElapsed(elapsed)}</span>}
        </div>
        {view.errorText !== null && <p className={css.error} role="alert">{view.errorText}</p>}
      </div>
    </div>
  )
}

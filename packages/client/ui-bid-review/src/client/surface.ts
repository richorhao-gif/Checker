/**
 * The two decisions the bid-review composer cannot make from its own state:
 * which shape the Session puts it in, and which local step that shape is on.
 * Both are pure so the component only renders them.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/surface
 */

import type { ComposerPhase } from '@deepseek-ai/dsh-client-runtime/client'
import type { StoredDocument } from './document.ts'

/** The shape the composer renders, decided by the Session rather than by input. */
export type BidReviewSurface = 'workspace' | 'interactive' | 'removed' | 'locked'

/** Local step of the interactive shape: the one-document intake state machine. */
export type BidReviewStep =
  | { readonly kind: 'pick' }
  | { readonly kind: 'uploading' }
  | { readonly kind: 'uploadError'; readonly message: string }
  | { readonly kind: 'ready'; readonly document: StoredDocument }
  | { readonly kind: 'sending'; readonly document: StoredDocument }

/** Session facts the surface decision reads. */
export interface SurfaceFacts {
  /** The owner put the seat in its inert no-Workspace posture. */
  readonly disabled: boolean
  /** The Session was removed on the Host. */
  readonly removed: boolean
  /** Input-area shape of the Session, absent while no Session is current. */
  readonly composerPhase: ComposerPhase | undefined
  /** The first prompt was attempted and failed. */
  readonly promptFailed: boolean
}

/**
 * Decide which shape the composer renders.
 * @param facts - the Session facts to decide from.
 * @returns `workspace` while the owner holds the seat inert, `removed` for a
 * deleted Session, `interactive` while the fixed question is still unsent — a
 * failed first prompt stays interactive so the same document can be retried —
 * and `locked` once the review is under way.
 */
export function deriveSurface(facts: SurfaceFacts): BidReviewSurface {
  if (facts.disabled) return 'workspace'
  if (facts.removed) return 'removed'
  if (facts.composerPhase === 'blank') return 'interactive'
  return facts.composerPhase === 'engaging' && facts.promptFailed ? 'interactive' : 'locked'
}

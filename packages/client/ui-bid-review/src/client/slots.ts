/**
 * The bid-review composer's injected face. The target
 * 'conversation.composer.bar' slot is declared and typed by ui-conversation;
 * this package only contributes the entry that shadows it, so no SlotMap merge
 * lives here. The inject carries the four bidReview operations, already folded
 * into the surface's one settled shape.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/slots
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { BidReviewLimits, CompanyQualifications } from '@deepseek-ai/dsh-bid-review/types'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'bidReview' seat).
import type {} from './locales.ts'
import type { StoredDocument } from './document.ts'
import type { Outcome } from './remote.ts'

/** Injected business face of the bid-review composer entry. */
export interface BidReviewInjected {
  /** Read the deployment's byte limits. */
  readLimits: () => Promise<Outcome<BidReviewLimits>>
  /** Read the one shared company-qualifications record. */
  readQualifications: () => Promise<Outcome<CompanyQualifications>>
  /** Replace the shared company-qualifications text. */
  saveQualifications: (text: string) => Promise<Outcome<CompanyQualifications>>
  /** Store one bid document on the server and report the path it landed at. */
  uploadDocument: (file: File) => Promise<Outcome<StoredDocument>>
}

/** Full props of the bid-review composer entry. */
export type BidReviewComposerProps =
  PropsRuntime<'conversation.composer.bar'>
  & InjectFace<BidReviewInjected>
  & PropsLocale<'bidReview'>

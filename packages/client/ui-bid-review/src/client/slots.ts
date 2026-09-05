/**
 * The two shadowing entries this package contributes. Both target slots are
 * declared and typed by ui-conversation: the composer bar entry replaces the
 * free-text input, and the reviewing desk entry replaces the chat view cell of
 * the conversation view ring. The inject faces carry the bidReview operations
 * each surface needs, already folded into this package's one settled shape.
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

/** Injected business face of the reviewing desk entry. */
export interface ReviewDeskInjected {
  /** Read the deployment's display config, which names the opinion sheet's red head. */
  readLimits: () => Promise<Outcome<BidReviewLimits>>
  /** Read the one shared company-qualifications record, for the opinion sheet's basis line. */
  readQualifications: () => Promise<Outcome<CompanyQualifications>>
  /**
   * Pull one older history page into the Session's chat window. The desk
   * shadows the transcript that owns the paging button, so it pages itself
   * until the submitted prompt enters the window.
   */
  loadOlder: () => void
}

/**
 * Full props of the reviewing desk entry: the store-less pure-reader shape a
 * conversation view entry takes when it renders the Session snapshot itself.
 */
export type ReviewDeskProps =
  PropsRuntime<'conversation.view'>
  & InjectFace<ReviewDeskInjected>
  & PropsLocale<'bidReview'>

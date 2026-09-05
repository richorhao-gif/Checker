/**
 * The bidReview Remote calls this surface makes and the one settled shape both
 * components render. The generated face wraps every business result in
 * {@link RemoteResult} and the Host returns its own ok/error union inside that,
 * so each operation here folds the two envelopes into a single {@link Outcome}.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/remote
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  BidReviewFailure as HostBidReviewFailure,
  BidReviewLimits,
  BidReviewSetQualificationsResult,
  BidReviewUploadResult,
  CompanyQualifications,
} from '@deepseek-ai/dsh-bid-review/types'
import type { StoredDocument } from './document.ts'
import { fileToBase64 } from './document.ts'
import { formatBytes } from './format.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'bidReview' seat).
import type {} from './locales.ts'

/** The bidReview operations this surface calls. */
export interface BidReviewRemote {
  /** Read the deployment's byte limits. */
  getLimits: () => Promise<RemoteResult<BidReviewLimits>>
  /** Read the one shared company-qualifications record. */
  getQualifications: () => Promise<RemoteResult<CompanyQualifications>>
  /** Replace the shared company-qualifications text. */
  setQualifications: (request: { text: string }) => Promise<RemoteResult<BidReviewSetQualificationsResult>>
  /** Store one bid document on the server. */
  uploadDocument: (request: {
    filename: string
    contentBase64: string
  }) => Promise<RemoteResult<BidReviewUploadResult>>
}

/** One settled failure both components render. */
export interface ReviewFailure {
  /** Stable failure code: a Host business code or a carrier code. */
  readonly code: string
  /** Carrier-supplied text; absent for the Host's own business failures. */
  readonly message?: string
  /** Configured limit, present on the two size failures. */
  readonly maxBytes?: number
  /** Observed size, present on the two size failures. */
  readonly actualBytes?: number
}

/** Settled result of one bid-review operation. */
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ReviewFailure }

/** Fold one carrier failure. */
function carrierFailure(error: { code: string; message: string }): Outcome<never> {
  return { ok: false, failure: { code: error.code, message: error.message } }
}

/** Fold one Host business failure, keeping the size pair when it carries one. */
function hostFailure(error: HostBidReviewFailure): ReviewFailure {
  return 'maxBytes' in error
    ? { code: error.code, maxBytes: error.maxBytes, actualBytes: error.actualBytes }
    : { code: error.code }
}

/** Fold the carrier envelope of a call whose business result is the value itself. */
function carried<T>(result: RemoteResult<T>): Outcome<T> {
  return result.ok ? { ok: true, value: result.value } : carrierFailure(result.error)
}

/**
 * Render one bid-review failure in this surface's dictionary.
 * @param t - the bidReview namespace translate seat.
 * @param failure - the settled failure to describe.
 * @returns the user-facing text.
 */
export function failureText(t: TranslateNS<'bidReview'>, failure: ReviewFailure): string {
  const size = { max: formatBytes(failure.maxBytes ?? 0), actual: formatBytes(failure.actualBytes ?? 0) }
  switch (failure.code) {
    case 'qualifications-too-large': return t('error.qualificationsTooLarge', size)
    case 'document-too-large': return t('error.documentTooLarge', size)
    case 'filename-blank': return t('error.filenameBlank')
    case 'filename-unsafe': return t('error.filenameUnsafe')
    case 'content-invalid': return t('error.contentInvalid')
    default: return t('error.generic', { detail: failure.message ?? failure.code })
  }
}

/**
 * Read the deployment's byte limits.
 * @param remote - the bidReview Remote namespace.
 * @returns the limits, or the carrier failure.
 */
export function readLimits(remote: BidReviewRemote): Promise<Outcome<BidReviewLimits>> {
  return remote.getLimits().then(result => carried(result))
}

/**
 * Read the one shared company-qualifications record.
 * @param remote - the bidReview Remote namespace.
 * @returns the record, or the carrier failure.
 */
export function readQualifications(remote: BidReviewRemote): Promise<Outcome<CompanyQualifications>> {
  return remote.getQualifications().then(result => carried(result))
}

/**
 * Replace the shared company-qualifications text.
 * @param remote - the bidReview Remote namespace.
 * @param text - replacement text; the empty string clears it.
 * @returns the stored record, or the failure that refused it.
 */
export async function saveQualifications(
  remote: BidReviewRemote,
  text: string,
): Promise<Outcome<CompanyQualifications>> {
  const result = await remote.setQualifications({ text })
  if (!result.ok) return carrierFailure(result.error)
  return result.value.ok ? { ok: true, value: result.value.value } : { ok: false, failure: hostFailure(result.value.error) }
}

/**
 * Upload one bid document. A file larger than the deployment accepts is refused
 * before its bytes are read into memory, so an oversized pick costs one limits
 * read instead of a base64 string the tab cannot hold.
 * @param remote - the bidReview Remote namespace.
 * @param file - the picked bid document.
 * @returns the stored document, or the failure that refused it.
 */
export async function uploadDocument(remote: BidReviewRemote, file: File): Promise<Outcome<StoredDocument>> {
  const limits = await readLimits(remote)
  if (!limits.ok) return { ok: false, failure: limits.failure }
  if (file.size > limits.value.maxDocumentBytes) {
    return {
      ok: false,
      failure: { code: 'document-too-large', maxBytes: limits.value.maxDocumentBytes, actualBytes: file.size },
    }
  }
  const result = await remote.uploadDocument({ filename: file.name, contentBase64: await fileToBase64(file) })
  if (!result.ok) return carrierFailure(result.error)
  return result.value.ok
    ? { ok: true, value: { filename: file.name, bytes: file.size, path: result.value.value.path } }
    : { ok: false, failure: hostFailure(result.value.error) }
}

/**
 * Public request, value, and failure vocabulary for the bid-review flow.
 * This module contains types only so generated Remote clients can consume it
 * without importing Host runtime code.
 * @module @deepseek-ai/dsh-bid-review/types
 */

/** Deployment limits a Client reads before an upload or a qualifications save. */
export interface BidReviewLimits {
  /** Maximum UTF-8 byte length accepted for the shared qualifications text. */
  readonly maxQualificationsBytes: number
  /** Maximum decoded byte length accepted for one uploaded bid document. */
  readonly maxDocumentBytes: number
}

/** The one shared company-qualifications record every user reads and writes. */
export interface CompanyQualifications {
  /** Qualifications text, stored verbatim. */
  readonly text: string
  /** Host-assigned time of the last save in Unix epoch milliseconds; 0 before the first save. */
  readonly updatedAt: number
}

/** Replace the shared company-qualifications text. */
export interface BidReviewSetQualificationsRequest {
  /** Replacement text, stored verbatim; the empty string clears it. */
  readonly text: string
}

/** Upload one bid document for the fixed-question review. */
export interface BidReviewUploadRequest {
  /** Original file name; the Host stores a sanitized, collision-free derivation. */
  readonly filename: string
  /** Complete file content, base64-encoded. */
  readonly contentBase64: string
}

/** One stored bid document. */
export interface BidReviewDocument {
  /** Absolute server path the Agent reads with its own file tools. */
  readonly path: string
}

/** The supplied qualifications text exceeds the configured UTF-8 byte limit. */
export interface BidReviewQualificationsTooLarge {
  readonly code: 'qualifications-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}

/** The supplied filename holds no usable name character. */
export interface BidReviewFilenameBlank {
  readonly code: 'filename-blank'
}

/** Every character of the supplied filename is forbidden on the server filesystem. */
export interface BidReviewFilenameUnsafe {
  readonly code: 'filename-unsafe'
}

/** The decoded document exceeds the configured byte limit. */
export interface BidReviewDocumentTooLarge {
  readonly code: 'document-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}

/** The supplied content is not valid base64. */
export interface BidReviewContentInvalid {
  readonly code: 'content-invalid'
}

/** Failures shared by the public bid-review operations. */
export type BidReviewFailure =
  | BidReviewQualificationsTooLarge
  | BidReviewFilenameBlank
  | BidReviewFilenameUnsafe
  | BidReviewDocumentTooLarge
  | BidReviewContentInvalid

/** Successful public operation result. */
export interface BidReviewSuccess<T> {
  readonly ok: true
  readonly value: T
}

/** Rejected public operation result with a stable business failure. */
export interface BidReviewRejected<E extends BidReviewFailure> {
  readonly ok: false
  readonly error: E
}

/** Result returned by the bid-review `setQualifications` operation. */
export type BidReviewSetQualificationsResult =
  | BidReviewSuccess<CompanyQualifications>
  | BidReviewRejected<BidReviewQualificationsTooLarge>

/** Result returned by the bid-review `uploadDocument` operation. */
export type BidReviewUploadResult =
  | BidReviewSuccess<BidReviewDocument>
  | BidReviewRejected<
    | BidReviewFilenameBlank
    | BidReviewFilenameUnsafe
    | BidReviewDocumentTooLarge
    | BidReviewContentInvalid
  >

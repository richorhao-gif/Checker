/**
 * Shared company qualifications and bid-document intake for the fixed-question
 * review flow. The Host owns the one qualifications record every user shares
 * and the sanitized on-disk landing of every uploaded document; composing the
 * review prompt stays a Client concern.
 * @module @deepseek-ai/dsh-bid-review
 */

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, posix, resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { bidReviewDomainSpec } from './spec.ts'
import type { BidReviewQualificationsRecord } from './spec.ts'
import type {
  BidReviewContentInvalid,
  BidReviewDocument,
  BidReviewDocumentTooLarge,
  BidReviewFailure,
  BidReviewFilenameBlank,
  BidReviewFilenameUnsafe,
  BidReviewLimits,
  BidReviewQualificationsTooLarge,
  BidReviewRejected,
  BidReviewSetQualificationsRequest,
  BidReviewSetQualificationsResult,
  BidReviewSuccess,
  BidReviewUploadRequest,
  BidReviewUploadResult,
  CompanyQualifications,
} from './types.ts'

export type * from './types.ts'
export { bidReviewDomainSpec, bidReviewQualificationsSchema } from './spec.ts'
export type { BidReviewQualificationsRecord } from './spec.ts'

/** Required deployment policy for the shared review flow. */
export interface Config {
  /** Maximum UTF-8 byte length accepted for the shared qualifications text. */
  readonly maxQualificationsBytes: number
  /** Maximum decoded byte length accepted for one uploaded bid document. */
  readonly maxDocumentBytes: number
  /** Absolute directory uploaded documents land in; created on first upload. */
  readonly uploadsRoot: string
  /** Company name published to Clients for the opinion sheet's letterhead; the empty string states none. */
  readonly companyName: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    bidReview: BidReviewService
  }
}

/** Characters Windows forbids in file names, plus the ASCII control range. */
const FORBIDDEN_FILENAME_CHARS = /[<>:"|?*\u0000-\u001F]/g

/** Longest stored base name before the collision-avoiding UUID prefix. */
const MAX_BASENAME_LENGTH = 200

/** Sanitization outcome: one storable base name, or the request failure it proves. */
type SanitizedName =
  | BidReviewSuccess<string>
  | BidReviewRejected<BidReviewFilenameBlank | BidReviewFilenameUnsafe>

/** Validate one deployment-varying byte limit at the configuration boundary. */
function resolveByteLimit(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`bid-review: ${label} must be a positive safe integer, got ${String(value)}`)
  }
  return value
}

/** Build a frozen success branch. */
function success<T>(value: T): BidReviewSuccess<T> {
  return Object.freeze({ ok: true, value })
}

/** Build a frozen business-failure branch. */
function rejected<E extends BidReviewFailure>(error: E): BidReviewRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}

/**
 * Reduce one supplied filename to a storable base name. Path segments are
 * dropped, characters the server filesystem forbids become `_`, trailing dots
 * and spaces are removed, and the result is capped; the caller prefixes a UUID,
 * so a sanitized name never collides and never names a reserved device.
 * @param filename - client-supplied original name.
 * @returns the sanitized base name, or the failure its characters prove.
 */
function sanitizeFilename(filename: string): SanitizedName {
  // path.basename is host-specific while clients send both separator styles.
  const base = posix.basename(filename.replaceAll('\\', '/')).trim()
  if (base.length === 0) return rejected<BidReviewFilenameBlank>({ code: 'filename-blank' })
  const cleaned = base.replace(FORBIDDEN_FILENAME_CHARS, '_').replace(/[. ]+$/, '')
  if (cleaned.length === 0) return rejected<BidReviewFilenameUnsafe>({ code: 'filename-unsafe' })
  return success(cleaned.length > MAX_BASENAME_LENGTH ? cleaned.slice(0, MAX_BASENAME_LENGTH) : cleaned)
}

/**
 * Decode one wire base64 payload, rejecting anything a lenient decoder would
 * silently drop.
 * @param contentBase64 - client-supplied base64 content.
 * @returns the decoded bytes, or the invalid-content failure.
 */
function decodeContent(contentBase64: string): BidReviewSuccess<Buffer> | BidReviewRejected<BidReviewContentInvalid> {
  const normalized = contentBase64.replace(/[\r\n\t ]/g, '')
  const content = Buffer.from(normalized, 'base64')
  // Buffer's base64 decoder ignores invalid characters and short tails, so a
  // canonical re-encode is the only comparison that proves the input was base64.
  if (content.toString('base64') !== normalized) {
    return rejected<BidReviewContentInvalid>({ code: 'content-invalid' })
  }
  return success(content)
}

/**
 * Storage-domain service publishing the shared qualifications record and the
 * document-upload landing. It never creates or resumes an Agent or Session.
 */
export class BidReviewService extends TypertRemoteService {
  static inject = ['storageDomain']

  /** Loader validation for the required deployment policy. */
  static Config: s<Config> = s.object({
    maxQualificationsBytes: s.number().step(1).min(1).required(),
    maxDocumentBytes: s.number().step(1).min(1).required(),
    uploadsRoot: s.string().min(1).required(),
    // A deployment that names no company states the empty string; the Client's
    // own copy heads the opinion sheet instead.
    companyName: s.string().required(),
  })

  private readonly limits: BidReviewLimits
  private readonly uploadsRoot: string
  private global?: DomainGlobal<BidReviewQualificationsRecord>
  private uploadsRootReady?: Promise<string | undefined>

  /**
   * @param ctx - Host context carrying the storage-domain form.
   * @param config - required size limits and upload directory.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'bidReview')
    this.limits = Object.freeze({
      maxQualificationsBytes: resolveByteLimit(config.maxQualificationsBytes, 'maxQualificationsBytes'),
      maxDocumentBytes: resolveByteLimit(config.maxDocumentBytes, 'maxDocumentBytes'),
      companyName: config.companyName,
    })
    this.uploadsRoot = resolve(config.uploadsRoot)
  }

  /** Open and own the one bid-review domain. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(bidReviewDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'bid-review.domainClose')
    this.global = domain.global
  }

  /**
   * Read the deployment policy a Client needs before an upload or a save, plus
   * the company name its opinion sheet heads with.
   * @returns the frozen configured limits.
   */
  @Remote('getLimits')
  getLimits(): Promise<BidReviewLimits> {
    return Promise.resolve(this.limits)
  }

  /**
   * Read the shared company qualifications.
   * @returns the current record; `updatedAt: 0` before the first save.
   */
  @Remote('getQualifications')
  // oxlint-disable-next-line typescript/require-await -- async keeps an uninitialized domain a rejection, not a synchronous throw
  async getQualifications(): Promise<CompanyQualifications> {
    return Object.freeze({ ...this.requireGlobal().get() })
  }

  /**
   * Replace the shared company qualifications text, stored verbatim. The
   * empty string clears it. Concurrent saves serialize on the domain write
   * chain; the last committed save wins.
   * @param request - replacement text.
   * @returns the committed record or `qualifications-too-large`.
   */
  @Remote('setQualifications')
  async setQualifications(request: BidReviewSetQualificationsRequest): Promise<BidReviewSetQualificationsResult> {
    const actualBytes = Buffer.byteLength(request.text, 'utf8')
    if (actualBytes > this.limits.maxQualificationsBytes) {
      return rejected<BidReviewQualificationsTooLarge>({
        code: 'qualifications-too-large',
        maxBytes: this.limits.maxQualificationsBytes,
        actualBytes,
      })
    }
    const record: BidReviewQualificationsRecord = Object.freeze({
      text: request.text,
      updatedAt: Date.now(),
    })
    await this.requireGlobal().set(record)
    return success(Object.freeze({ ...record }))
  }

  /**
   * Land one uploaded bid document under the configured root. The stored name
   * is a sanitized derivation of the supplied filename behind a fresh UUID, so
   * concurrent uploads never collide and no client string reaches the path.
   * @param request - original filename and base64 content.
   * @returns the absolute stored path, or the request failure it proves.
   */
  @Remote('uploadDocument')
  async uploadDocument(request: BidReviewUploadRequest): Promise<BidReviewUploadResult> {
    const name = sanitizeFilename(request.filename)
    if (!name.ok) return name
    const decoded = decodeContent(request.contentBase64)
    if (!decoded.ok) return decoded
    if (decoded.value.byteLength > this.limits.maxDocumentBytes) {
      return rejected<BidReviewDocumentTooLarge>({
        code: 'document-too-large',
        maxBytes: this.limits.maxDocumentBytes,
        actualBytes: decoded.value.byteLength,
      })
    }
    await this.ensureUploadsRoot()
    const path = join(this.uploadsRoot, `${randomUUID()}-${name.value}`)
    await writeFile(path, decoded.value)
    return success(Object.freeze<BidReviewDocument>({ path }))
  }

  /** Create the upload directory once; concurrent uploads share one mkdir. */
  private async ensureUploadsRoot(): Promise<void> {
    this.uploadsRootReady ??= mkdir(this.uploadsRoot, { recursive: true })
    await this.uploadsRootReady
  }

  /** Resolve the initialized global slot or fail a broken service lifecycle. */
  private requireGlobal(): DomainGlobal<BidReviewQualificationsRecord> {
    if (this.global === undefined) {
      throw new Error('bid-review: durable domain is not initialized')
    }
    return this.global
  }
}

export default BidReviewService

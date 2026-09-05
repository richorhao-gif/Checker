# Bid Review

English | [中文](bid-review.zh.md)

[`@deepseek-ai/dsh-bid-review`](../../packages/bid/bid-review) owns the server half of a fixed-question bid-document review: one company-wide qualifications record every user shares, and the sanitized on-disk landing of every uploaded bid document. It creates no Session, resumes no Agent, and composes no prompt; the browser half owns the review request that consumes both records.

Source: [`packages/bid/bid-review/src/types.ts`](../../packages/bid/bid-review/src/types.ts)

## Public types

```ts type-equiv
/** Deployment policy a Client reads before an upload or a qualifications save. */
interface BidReviewLimits {
  /** Maximum UTF-8 byte length accepted for the shared qualifications text. */
  readonly maxQualificationsBytes: number
  /** Maximum decoded byte length accepted for one uploaded bid document. */
  readonly maxDocumentBytes: number
  /** Company name the review surface heads its opinion sheet with; empty leaves the head to the Client's own copy. */
  readonly companyName: string
}
```

```ts type-equiv
/** The one shared company-qualifications record every user reads and writes. */
interface CompanyQualifications {
  /** Qualifications text, stored verbatim. */
  readonly text: string
  /** Host-assigned time of the last save in Unix epoch milliseconds; 0 before the first save. */
  readonly updatedAt: number
}
```

```ts type-equiv
/** Replace the shared company-qualifications text. */
interface BidReviewSetQualificationsRequest {
  /** Replacement text, stored verbatim; the empty string clears it. */
  readonly text: string
}
```

```ts type-equiv
/** Upload one bid document for the fixed-question review. */
interface BidReviewUploadRequest {
  /** Original file name; the Host stores a sanitized, collision-free derivation. */
  readonly filename: string
  /** Complete file content, base64-encoded. */
  readonly contentBase64: string
}
```

```ts type-equiv
/** One stored bid document. */
interface BidReviewDocument {
  /** Absolute server path the Agent reads with its own file tools. */
  readonly path: string
}
```

```ts type-equiv
/** The supplied qualifications text exceeds the configured UTF-8 byte limit. */
interface BidReviewQualificationsTooLarge {
  readonly code: 'qualifications-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}
```

```ts type-equiv
/** The supplied filename holds no usable name character. */
interface BidReviewFilenameBlank {
  readonly code: 'filename-blank'
}
```

```ts type-equiv
/** Every character of the supplied filename is forbidden on the server filesystem. */
interface BidReviewFilenameUnsafe {
  readonly code: 'filename-unsafe'
}
```

```ts type-equiv
/** The decoded document exceeds the configured byte limit. */
interface BidReviewDocumentTooLarge {
  readonly code: 'document-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}
```

```ts type-equiv
/** The supplied content is not valid base64. */
interface BidReviewContentInvalid {
  readonly code: 'content-invalid'
}
```

```ts type-equiv
/** Failures shared by the public bid-review operations. */
type BidReviewFailure =
  | BidReviewQualificationsTooLarge
  | BidReviewFilenameBlank
  | BidReviewFilenameUnsafe
  | BidReviewDocumentTooLarge
  | BidReviewContentInvalid
```

```ts type-equiv
/** Successful public operation result. */
interface BidReviewSuccess<T> {
  readonly ok: true
  readonly value: T
}
```

```ts type-equiv
/** Rejected public operation result with a stable business failure. */
interface BidReviewRejected<E extends BidReviewFailure> {
  readonly ok: false
  readonly error: E
}
```

```ts type-equiv
/** Result returned by the bid-review `setQualifications` operation. */
type BidReviewSetQualificationsResult =
  | BidReviewSuccess<CompanyQualifications>
  | BidReviewRejected<BidReviewQualificationsTooLarge>
```

```ts type-equiv
/** Result returned by the bid-review `uploadDocument` operation. */
type BidReviewUploadResult =
  | BidReviewSuccess<BidReviewDocument>
  | BidReviewRejected<
    | BidReviewFilenameBlank
    | BidReviewFilenameUnsafe
    | BidReviewDocumentTooLarge
    | BidReviewContentInvalid
  >
```

## Shared record and concurrency

The qualifications text is one row shared by every caller of the deployment. `updatedAt` is Host-assigned and is `0` before the first save, which lets a Client distinguish a never-saved record from an empty one. `setQualifications` replaces the whole text and returns the committed record, so the empty string clears it.

There is no version token and no compare-and-set. Concurrent saves serialize on the storage-domain write chain and the last committed save wins, with no conflict signal to either editor.

## Upload landing and filename sanitization

`uploadDocument` writes one decoded document under the configured `uploadsRoot` and returns its absolute `path`, which the Agent reads with its own file tools. The stored name is `${randomUUID()}-${base}`: a fresh UUID keeps concurrent uploads collision-free without a reservation round trip, and no client string reaches the path beyond the sanitized base name.

Sanitization normalizes backslashes, takes the POSIX base name so a client path contributes no directory segment, replaces the Windows-forbidden set `<>:"|?*` and the ASCII control range with `_`, strips trailing dots and spaces, and caps the result at 200 characters. An empty result before cleaning is `filename-blank`; an empty result after cleaning is `filename-unsafe`. The UUID prefix also keeps a sanitized name from addressing a reserved device.

The payload is proved to be base64 by re-encoding it, because Node's decoder silently drops invalid characters and short tails; only a canonical round trip can classify `content-invalid`. Whitespace is stripped before that comparison because a wire payload may carry line breaks. The size check reads the decoded buffer's `byteLength` rather than the base64 length, so `document-too-large` reports the bytes actually written.

## Persistence and Remote contract

The service stores the record in the `bid_review` storage domain through `ctx.storageDomain`. The domain declares one `global` slot with the schema-validated `{text, updatedAt}` shape and no tables, so there are no per-Session rows and nothing to cascade on Session disposal. The Web Host composition sets `maxQualificationsBytes: 65536`, `maxDocumentBytes: 104857600`, `uploadsRoot: dshHomePath('bid-documents')`, and `companyName: ''`; all four are required Config fields with no defaults, so a deployment states its own sizes, directory, and company. An empty `companyName` states no company, and the review surface heads its opinion sheet with its own copy instead. The json backend stores the domain under `dshHomePath('storages')`, which makes the record server-side and shared across LAN users by construction.

The package publishes the Host `bidReview.getLimits`, `bidReview.getQualifications`, `bidReview.setQualifications`, and `bidReview.uploadDocument` unary Remote contract through `TypertRemoteService` and `@Remote`; the generated Cordis API below is the method-level authority. `getLimits` exists so a Client can refuse an oversized document before reading its bytes into memory, and so the review surface can read the letterhead its opinion sheet heads with. Both size failures return `maxBytes` and `actualBytes`, and `uploadDocument` checks the filename before the content, so a request carrying both defects reports the filename.

## Web surface

[`@deepseek-ai/dsh-client-ui-bid-review`](../../packages/client/ui-bid-review) is the browser consumer. `@deepseek-ai/dsh-api-remotes` mounts the generated `bidReview` contribution, so the plugin calls `ctx.remote.bidReview` and never touches the transport. The methods are not in the loopback-only privileged set, so a LAN browser reaches them through the same `trusted-host` gateway as the rest of the Remote surface.

The plugin contributes two `priority: -1` entries into slots `ui-conversation` declares: the single-kind `conversation.composer.bar`, whose lowest-priority entry renders, and the `chat` cell of the `conversation.view` list slot, whose lowest-priority entry per cell renders. The composer entry replaces the free-text `InputBar` without editing that package and declares no `children`, so the command menu, image rail, plan seat, and model picker are absent because nothing renders them. The qualifications editor is one dialog around one textarea with a live UTF-8 byte count against `maxQualificationsBytes`.

Submission composes the fixed review question, the uploaded document's absolute server path, and the shared qualifications text into one prompt and sends it through the standard input actions, so it is an ordinary user message on the existing `conversation.send` path. One document per conversation is Client state plus `sessionStorage`, and the Host keeps no per-Session registry.

The view entry is the reviewing desk, which replaces the transcript for a submitted review and derives everything it paints from the conversation snapshot: one posture per real state of the turn, one page-margin mark per settled tool call, the open turn's own span as the timer, and the closing assistant text as the opinion sheet's body and verdict. The paper is a document stand-in whose tint follows the settled-call count rather than a measured position inside the file, and no stage is read out of prompt or assistant text, because the log carries no bid-domain vocabulary. A sealed desk holds its seal and then turns to the opinion sheet, which heads with `companyName` and states the shared record's save time as its basis. Because replacing the transcript also replaces its 「加载更早」 history-paging button, the desk pages the window itself through an injected `loadOlder` until a reopened Session's submission enters it. Approvals and questions stay in the `conversation.composer` chain the plugin does not shadow, so the desk points at a wait without owning its answer.

## Boundaries and limitations

- Uploads accumulate. Nothing deletes a landed file, so an abandoned upload or a replaced pick leaves its bytes on disk. `maxDocumentBytes` bounds one document but not their count or aggregate size, and a GC or quota needs an authority for which document is still referenced.
- The shared record has no compare-and-set, so two concurrent editors both succeed and the later commit wins with no conflict signal.
- The Host does not record which Session uploaded which file and would not refuse a second document on one conversation; that limit belongs to the Client surface that owns the conversation.
- The service stores bytes and returns a path. Whether a document is readable, and what a bid format requires, belongs to the Agent's own file tools, so a corrupted upload surfaces later as an Agent read failure rather than as an upload refusal.
- Sanitization is lossy and not reversible: a stored name records the sanitized derivation, not the original filename, and two uploads of the same file produce two distinct paths.
- The four methods record no authenticated actor or audit identity and therefore assume a trusted caller boundary.
- The desk reports the agent loop's progress, not the bid's: the log carries no bid-domain stage, so one would have to be published as a Session event before the desk could name it, and the verdict it seals is the model's own closing words — a report that states neither 符合 nor 不符合 leaves the seal uncommitted.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbidreview--bidreviewservice"></a>

### `ctx.bidReview` — `BidReviewService`

Storage-domain service publishing the shared qualifications record and the document-upload landing. It never creates or resumes an Agent or Session.

```ts cordis-catalog
/**
 * Read the deployment policy a Client needs before an upload or a save, plus
 * the company name its opinion sheet heads with.
 * @returns the frozen configured limits.
 */
@Remote('getLimits') getLimits(): Promise<BidReviewLimits>

/**
 * Read the shared company qualifications.
 * @returns the current record; `updatedAt: 0` before the first save.
 */
@Remote('getQualifications') // oxlint-disable-next-line typescript/require-await -- async keeps an uninitialized domain a rejection, not a synchronous throw async getQualifications(): Promise<CompanyQualifications>

/**
 * Replace the shared company qualifications text, stored verbatim. The
 * empty string clears it. Concurrent saves serialize on the domain write
 * chain; the last committed save wins.
 * @param request - replacement text.
 * @returns the committed record or `qualifications-too-large`.
 */
@Remote('setQualifications') async setQualifications(request: BidReviewSetQualificationsRequest): Promise<BidReviewSetQualificationsResult>

/**
 * Land one uploaded bid document under the configured root. The stored name
 * is a sanitized derivation of the supplied filename behind a fresh UUID, so
 * concurrent uploads never collide and no client string reaches the path.
 * @param request - original filename and base64 content.
 * @returns the absolute stored path, or the request failure it proves.
 */
@Remote('uploadDocument') async uploadDocument(request: BidReviewUploadRequest): Promise<BidReviewUploadResult>
```

Source: [`packages/bid/bid-review/src/index.ts:126`](../../packages/bid/bid-review/src/index.ts)
<!-- END GENERATED cordis-surface -->

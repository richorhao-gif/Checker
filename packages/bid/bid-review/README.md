# @deepseek-ai/dsh-bid-review

English | [中文](README.zh.md)

Host-owned storage and intake for the fixed-question bid review flow. The package registers `ctx.bidReview`, persists one company-wide qualifications record in storage-domain, lands every uploaded bid document under a configured directory, and publishes the Host `bidReview.getLimits`, `bidReview.getQualifications`, `bidReview.setQualifications`, and `bidReview.uploadDocument` unary Remote contract. It creates no Session, resumes no Agent, and composes no prompt; the Client owns the review request that consumes both records. The [fixed-question bid review Agent Note](../../../.agents/notes/implemented/architecture/2026-09-04-bid-review-fixed-prompt-surface.md) owns the design boundary.

Public request, value, and failure types are exported from the package root and `@deepseek-ai/dsh-bid-review/types`; [`src/types.ts`](src/types.ts) is their source. The storage-domain declaration is exported as `bidReviewDomainSpec` with its runtime `bidReviewQualificationsSchema` and stored `BidReviewQualificationsRecord`.

## Configuration

| key | meaning |
|---|---|
| `maxQualificationsBytes` | Required positive integer: maximum UTF-8 byte length of the shared qualifications text. |
| `maxDocumentBytes` | Required positive integer: maximum decoded byte length of one uploaded bid document. |
| `uploadsRoot` | Required non-empty directory that uploaded documents land in; created on the first upload. |

All three are deployment policy and carry no defaults, so a bundle states the sizes it accepts and the directory it writes to rather than inheriting a constant. The Web bundle sets 64 KiB, 100 MiB, and `dshHomePath('bid-documents')`.

```yaml
- id: bid-review
  name: '@deepseek-ai/dsh-bid-review'
  config:
    maxQualificationsBytes: 65536
    maxDocumentBytes: 104857600
    uploadsRoot: !!js dshHomePath('bid-documents')
```

The service injects `storageDomain`. Its durable domain is `bid_review`, whose single `global` slot holds the one company-wide record; the domain declares no tables and no per-Session rows.

## Shared qualifications record

`CompanyQualifications` contains `text`, stored verbatim and never trimmed, plus a Host-assigned `updatedAt` Unix-millisecond timestamp that is `0` before the first save. `setQualifications` replaces the whole text and returns the committed record, so the empty string clears it. There is no version token and no compare-and-set: concurrent saves serialize on the domain write chain and the last committed save wins.

Every caller of one deployment reads and writes the same row. The Web bundle's json backend stores the domain under `dshHomePath('storages')`, which makes the record server-side and shared across LAN users by construction.

## Document upload

`uploadDocument` writes one decoded document under `uploadsRoot` and returns its absolute `path`, which the Agent reads with its own file tools. The stored name is `${randomUUID()}-${base}`: a fresh UUID keeps concurrent uploads collision-free without a reservation round trip, and no client string reaches the path beyond the sanitized base name.

Sanitization normalizes backslashes, takes the POSIX base name so a client path contributes no directory segment, replaces the Windows-forbidden set `<>:"|?*` and the ASCII control range with `_`, strips trailing dots and spaces, and caps the result at 200 characters. An empty result before cleaning is `filename-blank`; an empty result after cleaning is `filename-unsafe`. The UUID prefix also keeps a sanitized name from addressing a reserved device.

The payload is proved to be base64 by re-encoding it, because Node's decoder silently drops invalid characters and short tails; only a canonical round trip can classify `content-invalid`. Line breaks and other whitespace are stripped before that comparison. The size check reads the decoded buffer's `byteLength` rather than the base64 length, so `document-too-large` reports the bytes actually written.

## Service and Host Remote contract

`TypertRemoteService` and `@Remote` publish the four `BidReviewService` methods; the Host endpoint names are `bidReview.getLimits`, `bidReview.getQualifications`, `bidReview.setQualifications`, and `bidReview.uploadDocument`. The two mutating methods return a discriminated business union: `{ ok: true, value }` or `{ ok: false, error }`. Storage failures and a use-before-initialization lifecycle failure reject instead of being mislabeled as business errors.

| Method | Request | Success `value` | Rejected `error.code` |
|---|---|---|---|
| `getLimits` | none | `BidReviewLimits { maxQualificationsBytes, maxDocumentBytes }` | none |
| `getQualifications` | none | `CompanyQualifications { text, updatedAt }` | none |
| `setQualifications` | `BidReviewSetQualificationsRequest { text }` | committed `CompanyQualifications` | `qualifications-too-large` |
| `uploadDocument` | `BidReviewUploadRequest { filename, contentBase64 }` | `BidReviewDocument { path }` | `filename-blank`, `filename-unsafe`, `content-invalid`, `document-too-large` |

`getLimits` exists so a Client can refuse an oversized document before reading its bytes into memory. Both size failures return `maxBytes` and `actualBytes`; `uploadDocument` checks the filename before the content, so a request carrying both defects reports the filename.

## Model Experience

### Stored qualifications and landed documents

#### What the model sees

Nothing this package registers. `ctx.bidReview` publishes no tool, prompt section, model-facing context, or Session event; the qualifications text stays in its storage-domain global slot and an uploaded document stays a file on the server disk. Both reach a model request only when a separately documented Client composes them into an ordinary user message, and this service never learns that a prompt was sent.

#### Token effect

Zero. No request, record, limit, stored path, timestamp, or failure from this package enters a model request. The bytes a Client later submits are counted by that Client's prompt, not here.

#### KV Cache effect

Independent. Reading or replacing the qualifications record and landing an upload touch no model request prefix, so neither can invalidate an otherwise reusable provider cache entry.

## Known Limitations and Deferred Work

- **Uploads accumulate without bound** — nothing deletes a landed file, so an abandoned upload or a replaced pick leaves its bytes on disk. `maxDocumentBytes` bounds one document but not their count or aggregate size; a GC or quota needs an authority for which document is still referenced, and none exists yet.
- **No compare-and-set on the shared record** — `setQualifications` carries no version, so two concurrent editors both succeed and the later commit wins with no conflict signal. The one-record, few-editors topology accepts this; a version token is the fix if that changes.
- **No per-Session document registry** — the Host does not record which Session uploaded which file and would not refuse a second document on one conversation. One document per conversation is enforced by the Client surface that owns the conversation.
- **Trusted caller boundary** — the four methods carry no authenticated actor or audit identity, and `bidReview` is mounted for `trusted-host` callers, so LAN clients can write the shared record and the upload directory. A deployment must expose the Host gateway only through its trusted or separately authenticated boundary until authorization and attribution are added.
- **No format awareness** — the service stores bytes and returns a path. Whether the document is readable, and what a bid format requires, belongs to the Agent's own file tools; a corrupted upload surfaces later as an Agent read failure rather than as an upload refusal.
- **Sanitization is lossy and not reversible** — a stored name records the sanitized derivation, not the original filename, and two uploads of the same file produce two distinct paths. The Client keeps the original name for display and holds the mapping only in browser storage.

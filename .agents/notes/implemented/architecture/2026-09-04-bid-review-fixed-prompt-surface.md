# Agent Note: Fixed-question bid review over a shadowed composer bar

Status: implemented

English | [中文](2026-09-04-bid-review-fixed-prompt-surface.zh.md)

> The fixed question remains literal product copy in `prompt.ts` rather than a dictionary entry. It is now submitted with a second block of fixed copy, the opinion sheet's output contract, added by [the declaration-line verdict](../bug-fix/2026-09-06-bid-verdict-declaration-line.md) under the same rule and the same limitation on localizing it.

## Problem

A company runs one Web Host on a server for many LAN users who must not type a free-form message. The only admissible request is one fixed review question over exactly one uploaded bid document, judged against one company-wide qualifications text that every user shares.

Nothing in the harness carries that policy. The composer bar renders a textarea, an image rail, a command menu, a plan seat, and a model picker, and each of those admits input the deployment forbids. The qualifications text has no server-side home: browser-local storage forks it per user, and the `settings.*` Remote is loopback-only, so a LAN user could neither read nor write it. An uploaded document has no landing that gives the Agent an absolute path it can read with its own file tools, and no client-supplied string may reach that path.

Deleting the free-text input from the product would remove the harness's general capability; a separate application would duplicate the Session, agent, and transcript machinery this one already ships.

## Decision

Two new packages carry the deployment, and the intake described here changes no existing package's behavior. `@deepseek-ai/dsh-bid-review` is the Host service; `@deepseek-ai/dsh-client-ui-bid-review` is the web Client surface, whose second entry — the [reviewing desk](2026-09-05-bid-review-reviewing-desk.md) — owns the chat view cell and needs one tab-projection rule in `ui-conversation`. The Client Remote aggregate mounts the generated `bidReview` face beside `messageFeedback`.

The Host service extends `TypertRemoteService` under the `bidReview` namespace and publishes four unary Remote methods: `getLimits`, `getQualifications`, `setQualifications`, and `uploadDocument`. Business refusals are returned as `{ ok: true, value }` or `{ ok: false, error }`; only storage and lifecycle failures reject. `maxQualificationsBytes`, `maxDocumentBytes`, `uploadsRoot`, and `companyName` are required Config fields, so a deployment states its own policy and the company it reviews for instead of inheriting a constant. The Web bundle sets 64 KiB, 100 MiB, `dshHomePath('bid-documents')`, and the empty company name, which the opinion sheet answers with its own letterhead copy.

The qualifications text lives in the `bid_review` storage domain as one global slot `{ text, updatedAt }`, where `updatedAt: 0` marks the never-saved record. Every user reads and writes the same row and the last committed save wins. The Web bundle's json backend stores it under `dshHomePath('storages')`, which makes the record server-side and shared by construction rather than by agreement.

Submission reuses the standard input actions: `setDraft(buildBidReviewPrompt(path, qualifications))` then `submit()`. The prompt is an ordinary user message on the existing `conversation.send` path, so it needs no new model-visible input form, no new `SessionEventMap` member, and no agent-loop change. The Agent reads the document itself through tool-fs and shell from the absolute server path; neither package parses, converts, or inspects a bid format.

The constraint is Client-side only. The Host keeps its free-form conversation capability, presets, tools, and Remote surface unchanged, and removing the Client entry restores the ordinary composer.

## Composer shadowing and the one-document state

The Client entry registers into `conversation.composer.bar` at `priority: -1` through `ctx.slots.inject`. A single-kind slot renders its lowest-priority entry, so this one replaces InputBar's `priority: 0` without editing it, and injection rather than direct registration keeps the contribution tied to the declaring slot's lifetime.

The entry declares no `children`. It therefore receives no `renderSlot` kit, and the command menu, image rail, plan seat, and model picker are absent because nothing renders them, not because a conditional hides them. The owner's `disabled`, `blocked`, `variant`, `placeholder`, and `footer` props are still honored, so an approval or ask-user turn arriving through the separate `conversation.composer` chain remains usable.

`deriveSurface` decides the rendered shape from Session facts rather than local state: the owner's inert posture renders the workspace trigger, a removed Session renders an ended notice, `composerPhase: 'blank'` renders the intake, `'engaging'` with a failed first prompt stays intake so the same document can be retried, and anything else renders locked. Reading `composerPhase` instead of a local flag makes the lock survive a reload and agree with the Host.

Exactly one document per conversation is Client state: `pick`, `uploading`, `uploadError`, `ready`, `sending`. `sessionStorage` under `dsh-bid-doc:<sessionId>` holds `{filename, bytes, path}`, so a reload before submission restores the file card without re-uploading, and the locked surface forgets it so a later conversation on that Session id starts empty. The Host keeps no per-Session registry and would not refuse a second prompt.

## Upload landing and filename sanitization

An upload lands at `join(uploadsRoot, randomUUID() + '-' + base)`. Sanitization takes the POSIX base name after normalizing backslashes, replaces the Windows-forbidden set and the ASCII control characters with `_`, strips trailing dots and spaces, and caps the result at 200 characters. An empty result before cleaning is `filename-blank`; an empty result after cleaning is `filename-unsafe`. Beyond that base name no client string reaches the path, and the fresh UUID makes concurrent uploads collision-free without a reservation round trip.

`decodeContent` proves the payload was base64 by re-encoding it: Node's decoder drops invalid characters and short tails silently, so a canonical round trip is the only comparison that can classify `content-invalid`. Whitespace is stripped first because a wire payload may carry line breaks. The size check reads the decoded buffer's `byteLength` rather than the base64 length, because base64 inflates content by a third.

The Client refuses an oversized pick before reading its bytes: `uploadDocument` reads the limits first and returns `document-too-large` from `file.size`, so a rejected 100 MiB document costs one Remote call instead of a base64 string the tab cannot hold. Uploads travel over the existing JSON-RPC carrier, whose 160 MiB request-body cap admits the configured 100 MiB document at roughly 134 MiB encoded.

## Alternatives considered

**Add a restricted mode to InputBar in `ui-conversation`.** Rejected because it puts one deployment's product policy inside the composer every bundle mounts, needs a config flag on a shared package, and gains nothing over an entry that already renders in the same slot.

**Register at the same priority and rely on load order.** Rejected: a single-kind slot throws on a duplicate priority, and activation order between independently reloadable plugins is not a contract. An explicit lower priority through `slots.inject` makes the replacement auditable at the registration site.

**Store the qualifications in `localStorage` or in `settings.*`.** Rejected: `localStorage` forks the record per browser, and the settings Remote is loopback-only, so LAN users could neither read nor write it. A storage-domain global slot is server-side and shared without either failure.

**Keep a server-side per-Session document registry.** Rejected for this change. The Client already holds the path it uploaded, and a registry would need Session-lifecycle authority that persistence does not expose: detach is not durable deletion, and no deletion API exists to hang a cascade on.

**Trust the base64 length for the size limit.** Rejected: a length check admits documents past `maxDocumentBytes` and refuses some within it. The decoded buffer is the measured value.

**Parse or convert the document in the Client or the Host service.** Rejected: format handling is unbounded, the Agent already owns file reading, and a conversion step would create a second authority over what the model sees.

**Upload through a separate HTTP endpoint.** Rejected: the JSON-RPC body limit already admits the configured maximum, and a second transport would need its own authentication, error vocabulary, and Client plumbing.

## Testing

The Host package tests the qualifications round trip, both size refusals, the four filename cases, the base64 proof, and a custom `uploadsRoot`. The Client package pins the fixed question verbatim and the prompt's field order, tables `deriveSurface`, exercises the `sessionStorage` restore and forget paths, folds both Remote envelopes, and renders the intake, locked, blocked, and dialog postures in jsdom. Both packages report full per-file coverage under the repository gate.

## Consequences

One deployment serves many LAN users from a single qualifications record and a single upload directory, with no free-text entry on the review surface.

Shadowing the composer bar also removes the image rail, command menu, plan seat, and model picker, because the entry declares no children. Model choice is the server's preset configuration, and a model-blocked Session cannot be cleared from this surface; the `blocked` reason still renders.

Uploads accumulate. Nothing deletes a landed file, so an abandoned upload or a repick leaves its bytes on disk. The UUID prefix keeps that correct but not bounded; a GC or a quota needs an owner for which document is still referenced, and no current authority supplies one.

`setQualifications` has no compare-and-set. Two concurrent editors both succeed and the later commit wins with no conflict signal, which the one-record, few-editors topology accepts; a version token is the fix if that changes.

Neither Remote carries an authenticated actor. A deployment must expose the Host gateway only through its trusted boundary, or the shared record and the upload directory are writable by anyone who can reach them.

One document per conversation is a product surface, not a durable invariant: it is Client state plus `sessionStorage`, so it is per browser tab, survives a reload, and does not survive a different browser or cleared storage.

The fixed question is literal product copy in `prompt.ts` rather than a dictionary entry, because it is submitted to the model as a user message; localizing it would change what every deployment's Agent receives. Interface copy stays in the `bidReview` dictionaries in both languages.

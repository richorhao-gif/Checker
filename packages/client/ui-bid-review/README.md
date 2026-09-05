# @deepseek-ai/dsh-client-ui-bid-review

English | [中文](README.zh.md)

Fixed-question bid review plugin, browser half: a one-document intake that replaces the free-text input bar, the dialog that edits the company-wide qualifications record, and the reviewing desk that replaces the transcript once a review is under way. It contributes two shadowing entries, both registered through `ctx.slots.inject` at `priority: -1` into slots `ui-conversation` declares: the single-kind `conversation.composer.bar`, whose lowest-priority entry renders, and the `chat` cell of the `conversation.view` list slot, whose lowest-priority entry per cell renders. So the intake replaces `InputBar`'s `priority: 0` and the desk replaces the chat renderer without editing that package, and injection rather than direct registration keeps both contributions tied to the declaring slot's lifetime.

The composer entry declares no `children`, so it receives no `renderSlot` kit and the command menu, image rail, plan seat, and model picker are absent because nothing renders them. The owner's `disabled`, `blocked`, `variant`, `placeholder`, and `footer` props are still honored: an approval or ask-user turn arriving through the separate `conversation.composer` chain renders its reason above the intake and disables it. The desk entry carries its own `label` thunk, so the tab it takes over follows the active locale, and the chat cell's framework duties — the draft mirror and the released Session images — stay with the owner that declares them.

Exactly one document per conversation is Client state over `pick`, `uploading`, `uploadError`, `ready`, and `sending`. `sessionStorage` under `dsh-bid-doc:<sessionId>` holds `{filename, bytes, path}`, so a reload before submission restores the file card without re-uploading; the locked surface forgets it so a later conversation on that Session id starts empty. A pick or drop takes only the first offered file, and the file input accepts any type because format handling belongs to the Agent's own file tools.

`deriveSurface` decides the rendered shape from Session facts rather than local state: the owner's inert posture renders the workspace trigger, a removed Session renders an ended notice, `composerPhase: 'blank'` renders the intake, `'engaging'` with a failed first prompt stays intake so the same document can be retried, and anything else renders locked. Reading `composerPhase` instead of a local flag makes the lock survive a reload and agree with the Host.

Submission reuses the standard input actions: `setDraft(buildBidReviewPrompt(path, qualifications))` then `submit()`. The prompt is therefore an ordinary user message on the existing `conversation.send` path, and a send failure arrives as the snapshot's `promptError` rather than as a thrown call.

The four operations run through `ctx.remote.bidReview`. The generated face wraps every business result in `RemoteResult` and the Host returns its own `{ ok, value | error }` union inside that, so [`src/client/remote.ts`](src/client/remote.ts) folds both envelopes into one settled `Outcome<T>` that both components render, and `failureText` maps each code into the `bidReview` dictionary. `uploadDocument` reads the limits first and refuses an oversized pick from `file.size`, so a rejected document costs one Remote call instead of a base64 string the tab cannot hold.

The `/client` exports are the plugin body (`apply`/`inject`), the `BidReviewComposer`, `QualificationsEditor`, and `ReviewDesk` components, the fixed question and `buildBidReviewPrompt`, the desk derivations (`deriveDesk` plus the copy decisions that read a stage, verdict, wait, or basis into a dictionary key), and the injected face, surface, desk, outcome, and document types. Interface copy lives in the `bidReview` namespace dictionaries in both languages.

## Reviewing desk

`deriveDesk` folds ten Session snapshot fields into one `DeskView` and `ReviewDesk` renders nothing else, so no desk state can disagree with the log: `hidden` while the Session is blank, `waiting` before the first turn starts, `working` with the running tool's name and what the turn is doing (`tool`, `writing`, or `thinking`), `paused` on the first pending approval or question, `failed` on the durable failure text or on a turn whose streamed partial froze as `interrupted`, `ended` on a Session the Host removed, and `sealed` once the highest turn in the window carries an end time. No stage is read out of the prompt text and none is invented. The page-margin marks are one per settled tool call, sampled evenly past twelve so every mark still names a real ordinal; the timer is the open turn's own span; the paused note carries the asker's own reason when it has one; and the paper's blind rows are a document stand-in whose tint follows the settled-call count, never a measured position inside the file. The desk only points at a wait — the approval or question panel that answers it stays in the `conversation.composer` chain this package does not shadow.

A sealed desk stamps its seal on the marked-up page, holds it 1.8 s, and then turns to the opinion sheet, at once under `prefers-reduced-motion`; either page flips back by hand. The sheet heads with `getLimits().companyName` and falls back to this package's own copy when the deployment names no company. Its basis line states the reviewed document and the shared record's save time, or says the record is unread, empty, or never saved rather than implying a basis. Its red-header number is the Session id with the store's `session-` mint prefix stripped and cut to eight characters. Its body is the last assistant message that carries text, and `verdictOf` reads the seal out of that text: any 不符合 rejects, otherwise 符合 passes, and a report that says neither leaves the seal uncommitted instead of guessing one.

The letterhead and the basis are the deployment's own words, so both are read once per sealed review through the injected `readLimits` and `readQualifications`, and a read that lands after the desk went away is dropped. The pencil actions copy the sheet through `ui-primitives`' shared `writeClipboard`, leaving the button unconfirmed when the host refuses the write, and save it through `downloadText` as one Markdown file named after the reviewed document, in the sheet's own reading order.

## Model Experience

### Fixed review prompt

#### What the model sees

One ordinary user message, composed by this package and submitted through the standard input actions. [`src/client/prompt.ts`](src/client/prompt.ts) owns the literal `BID_REVIEW_PRESET_QUESTION`; the fields follow it in a fixed order, with the uploaded document's absolute server path and then the shared qualifications text verbatim. The Agent reads the document itself from that path with its own file tools. No tool, prompt section, or Session event is registered by this package, and the model never sees the composer's local steps.

##### Prompt order submitted by the review button

```markdown
{BID_REVIEW_PRESET_QUESTION}

标书文件：{absolute server path of the uploaded document}

公司资格：
{shared qualifications text, verbatim}
```

#### Token effect

The question is fixed copy of 145 characters (435 UTF-8 bytes), so its cost is the same on every conversation and every deployment. The qualifications text is the only growing part and is bounded by the Host's `maxQualificationsBytes` (64 KiB in the Web bundle); an empty record contributes its heading and one empty line. The document path adds one line, and the document's own content is never inlined by this package.

#### KV Cache effect

The prompt is a user message at the head of a fresh conversation, so it forms that conversation's prefix. Two conversations sharing the same qualifications text reuse the question and that text; a save between them changes the tail of the prefix and therefore the cache entry from the qualifications onward. Nothing this package does touches an in-flight conversation's history.

## Known Limitations and Deferred Work

- **No free-text input on this surface** — shadowing the composer bar also removes the image rail, command menu, plan seat, and model picker, because the entry declares no `children`. Model choice is the server's preset configuration, and a model-blocked Session cannot be cleared from this surface; its `blocked` reason still renders.
- **One document is browser state, not a durable invariant** — the guarantee is Client state plus `sessionStorage`, so it is per browser tab, survives a reload, and does not survive a different browser or cleared storage. The Host keeps no per-Session registry and would not refuse a second prompt.
- **The fixed question is not localizable** — it is literal product copy rather than a dictionary entry, because it is submitted to the model as a user message and localizing it would change what every deployment's Agent receives. Changing it is a source edit in `prompt.ts`.
- **No cross-tab push for the shared record** — the qualifications badge refreshes on mount and when the dialog closes, so a save from another tab becomes visible then rather than immediately; the Host publishes no live frame for the record.
- **Upload progress is indeterminate** — the intake shows one uploading state for the whole base64 encode plus JSON-RPC round trip, with no byte progress. A 100 MiB document on a slow LAN stays in that state for as long as the carrier takes.
- **A repick leaks the previous upload** — choosing another file before submitting leaves the first document on the server disk, because nothing tracks which landed file is still referenced.
- **The desk replaces the transcript, not the tab** — it registers on the `chat` cell of `conversation.view`, so that cell keeps its id and the trajectory tab beside it is unchanged, while the chat transcript is not mounted at all for as long as the desk renders. The Session's own nodes stay readable in that trajectory view. Because shadowing the transcript also shadows its 「加载更早」 button, the desk drives history paging itself through the injected `loadOlder` until a reopened Session's submitted prompt enters the window.
- **Progress is the loop's, not the bid's** — every stage, mark, and tint is a turn or tool-call fact from the Session snapshot, because nothing in the log distinguishes 资格核对 from extracting 评分准则. Bid-domain stages would have to be published as Session events first; the desk does not read stages out of prompt or assistant text.
- **The opinion is the model's closing text** — the sheet's body is the last assistant message carrying text, so a review that ends on a tool call renders the empty-report copy, and a report naming neither 符合 nor 不符合 carries an uncommitted seal. Neither is corrected here, because a verdict the model did not state would make the sheet lie.

# Agent Note: The bid review's reviewing desk over a shadowed view cell

Status: implemented

English | [中文](2026-09-05-bid-review-reviewing-desk.zh.md)

> The shadowing, the derived postures, the stand-in paper, and the sheet's own reads remain current. The seal's whole-body scan for 不符合 and then 符合 is superseded by [the declaration-line verdict](../bug-fix/2026-09-06-bid-verdict-declaration-line.md), which reads one `判定：` line in the sheet's head and adds 待核验 as a third verdict.

## Problem

The fixed-question bid review ([intake Agent Note](2026-09-04-bid-review-fixed-prompt-surface.md)) submits one prompt and then hands the screen to the ordinary transcript. For this deployment the transcript is the wrong surface: it interleaves tool heads, streamed prose, and reasoning into a scroll a reviewer must interpret, while the only two things a reviewer asks are whether the review is still running and what it concluded. The deployment also has no second page to put a report on, because a conversation admits exactly one document and one question.

A progress page could answer both, but only if every stage it names is real. Nothing in the Session log distinguishes checking supplier qualifications from extracting the scoring rules: the log carries turns, tool calls, streaming state, pending interactions, and the closing assistant text, and no bid-domain vocabulary. Any page that shows 「资格核对 60%」 would be inventing a measurement nothing performs.

## Decision

The Client package contributes a second shadowing entry, the reviewing desk, and one shared rule in `ui-conversation` makes that shadow legible. `ReviewDesk` registers into the `chat` cell of the `conversation.view` list slot at `priority: -1` through `ctx.slots.inject`, carrying its own `label` thunk, so a submitted review reads as one sheet of paper under review instead of a transcript, and removing this plugin restores the chat view.

Everything the desk paints is derived, never held. [`src/client/desk.ts`](../../../../packages/client/ui-bid-review/src/client/desk.ts) folds ten conversation-snapshot fields into one `DeskView` through the pure `deriveDesk`, and the component renders that result, so a reload, a Session switch, and the Host's own view of the turn cannot disagree with the page. The desk's local state is presentation only: the clock read behind the timer, the page turn, the copy confirmation, and the two Remote reads.

No stage is read out of prompt or assistant text and none is invented. A bid-domain stage would first have to be published as a Session event; until one exists, the desk's vocabulary is the loop's own.

## Shadowing one cell of a list slot

`conversation.view` is a `{ kind: 'list', scope: 'session' }` slot, so its entries clash per cell rather than globally: two entries on the same `id` compete, and the lowest-priority live entry renders that cell while the others stay on the ledger. That is the same election rule a single-kind slot applies to its one entry, which is why `priority: -1` shadows the chat renderer without editing the package that declares it.

Projecting the tab bar needed one change in `ui-conversation`: `viewTabs()` iterates `slots.entriesOfSlot('conversation.view')`, the registry's elected entries, instead of the raw ledger, so a shadowing entry replaces the tab rather than adding a phantom duplicate beside it. The raw ledger stays the inspection surface, and the cell keeps its `id`, so anything addressing the chat view by id and the `trajectory` cell beside it are unchanged. `ChatStoreState.view` still holds `'chat'` while the desk renders in it.

The desk does not take over `conversation.session`, which owns the blank-phase return, the persisted draft mirror, and the released Session images, and whose shared store handle cannot be mounted twice. Those framework duties stay with their owner, and the desk receives the composed `useSession` seat like any other view entry.

Shadowing the chat cell also shadows the transcript's 「加载更早」 button, the only product trigger that pulls persisted history into a reopened Session's chat window. Without it a review opened after it sealed would strand the desk on a window that starts empty, showing a waiting posture over a log it cannot see. The desk therefore receives the `loadOlder` verb through its inject and pages the window itself until the submitted prompt enters, stopping once the submission is present, while a page is still loading, when there is nothing older to load, or when the Session is gone.

## What the desk derives

`deriveDesk` orders the postures so a live wait outranks a running turn, a running turn outranks a recorded error, and an ended turn seals only when nothing else is outstanding: `ended` on a Session the Host removed, `hidden` while the log is blank and the composer phase is blank, `paused` on the first pending approval or question, `working` while a turn runs, `failed` on the durable failure text or on a turn whose streamed partial froze as `interrupted` — the one fact that survives a reload to tell a stopped review from a finished one, so a turn cut off mid-write never seals — then `waiting` or `sealed` on whether the highest turn in the window carries an end time. A `working` desk also names what the turn is doing — a running tool outranks streamed prose, which outranks silence — because the snapshot distinguishes no finer state and the rail says the least it knows.

Four painted values are the log's own. The page-margin marks are one per settled tool call, sampled evenly past twelve so every mark still names a real ordinal. The timer is the open turn's own span against a one-second clock, and the last turn's span once it ended. The paused note carries the asker's own reason when it has one and falls back to naming the tool or the question. The seal and the opinion body are the model's closing words.

The paper itself is a stand-in and is documented as one. Its blind rows are fixed copy, tinted up to a height that follows the settled-call count, so the desk shows that the reading has advanced without claiming a measured position inside a file no code inspects. The desk also only points at a wait: the approval or question panel that answers it stays in the `conversation.composer` chain this package does not shadow.

## The sealed turn and the opinion sheet

A sealed desk stamps its seal on the marked-up page, holds it 1.8 s, and turns to the opinion sheet, at once under `prefers-reduced-motion`; either page flips back by hand. The sheet heads with `getLimits().companyName`, a fourth required Host Config field, and falls back to this package's own copy when the deployment names no company — the shipped Web bundle value is the empty string. Its basis line states the reviewed document and the shared record's save time, or says the record is unread, empty, or never saved rather than implying a basis. Its red-header number is the Session id with the store's `session-` mint prefix stripped and cut to eight characters, so a counter-minted id reads as its counter and a durable id reads as a stable prefix instead of the mint word alone. `verdictOf` reads the seal out of the closing text: any 不符合 rejects, otherwise 符合 passes, and a report that says neither leaves the seal uncommitted instead of guessing one.

The letterhead and the basis are the deployment's own words, so both are read once per sealed review through the injected `readLimits` and `readQualifications`, and a read that lands after the desk went away is dropped rather than painted onto an unmounted page. Copying the sheet goes through `ui-primitives`' shared `writeClipboard`, which owns the async-API and `execCommand` fallbacks and returns whether the host accepted the write, so the button stays unconfirmed when a browser refuses; saving goes through `downloadText` as one Markdown file named after the reviewed document, in the sheet's own reading order.

## Alternatives considered

**Shadow `conversation.session` instead of one view cell.** Rejected: `SlotCore.register` throws when a registrant re-declares a slot's `children`, the shared `chatStore` handle cannot be mounted twice, and that owner holds the blank-phase return, the draft mirror, and `releaseSessionImages`. One cell of the view list gives the same visible result and leaves those duties where they are declared.

**Filter duplicate ids inside `viewTabs()`.** Rejected: `entriesOfSlot` is the registry's own election rule, and a consumer that re-implements first-seen-wins would fork it. Reading the elected entries keeps one authority over which entry renders a cell and which tab names it.

**Mark bid stages in the prompt and parse them back.** Rejected: it puts a client-owned protocol inside a model-visible user message, and the reply would still be prose the desk guesses at. The deployment asked for progress from real events only.

**Publish new Session events for bid stages.** Rejected for this change. It is the honest route to bid-domain progress and stays open, but it needs an owner for stage semantics the Agent does not currently emit, and a `SessionEventMap` member is required-on-read for every build. The desk ships on the events the loop already logs.

**Show a percentage read from the document.** Rejected: nothing measures a position inside the file, so any percentage would be fabricated. The stand-in's tint is a count of settled calls, and the module doc states that it is not a measurement.

**Keep the transcript and add a progress header above it.** Rejected: two renderers over the same nodes would each claim authority over the same facts, and the deployment wants one surface per review. The trajectory view remains for anyone who needs the nodes.

**Hold the desk's posture in component state.** Rejected: derived state survives a reload and agrees with the Host, while a component flag would drift after a refresh mid-review and could contradict a turn the Host already ended.

**Hand-roll the sheet's clipboard write.** Rejected in favor of the shared `writeClipboard`, which already carries the fallback and the rule that a refused write is not reported as a copy.

## Testing

`desk.ts` is table-tested over every posture, including the interrupted turn that fails instead of sealing, the mark sampling past twelve, the verdict, basis, and letterhead decisions, the document-number derivation, the elapsed span on both an open and an ended turn, and the export text and file name. `ReviewDesk` renders each posture in jsdom and pins the timed behavior with fake timers: the one-second clock, the 1.8 s seal hold and its immediate turn under `prefers-reduced-motion`, both hand flips, the long-copy seal shrink through the shipped English dictionary, a letterhead read dropped after unmount, a copy the host refused, the download, and the desk paging its own history until the submission enters the window.

`ui-conversation`'s inject test asserts the elected tab through the real `apply()`: a `priority: -1` entry on the `chat` cell replaces the tab's label, both registrations stay on the raw ledger, and disposing the shadow restores the owner's tab. Both packages report full per-file coverage under the repository gate.

Nothing here is model-visible and no `SessionEventMap` member changes, so no keyless snapshot fixture moves: the desk reads events the loop already logs and adds no input that reaches a model request. The assembled Web surface is verified in the browser.

## Consequences

A submitted review has one product surface, and the chat transcript is not mounted while the desk renders. The Session's nodes stay readable in the `trajectory` view, and the cell keeps its id, so persisted view selection and anything addressing the chat view by id are unaffected.

Progress is the agent loop's, not the bid's. A deployment that wants bid-domain stages must publish them as Session events first; the desk will not read stages out of prompt or assistant text, so its vocabulary stays as coarse as the log's.

The opinion is the model's closing text, so a review that ends on a tool call renders the empty-report copy and a report naming neither verdict carries an uncommitted seal. Neither is corrected, because a verdict the model did not state would make the sheet lie.

The letterhead depends on the Host Config naming a company. The shipped Web bundle sets the empty string, so the sheet's own copy heads it until a deployment states its company; `companyName` is required rather than defaulted because Cordis applies Config defaults before the constructor, which would make a constructor-side fallback an unreachable branch.

One tab-projection rule in `ui-conversation` is now shared: any package that shadows a view cell replaces that cell's tab instead of adding one. That is the intended semantics for shadowing a list slot, and it is the only existing-package behavior this surface changes.

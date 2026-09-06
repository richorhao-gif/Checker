# Agent Note: The plan strip takes a settled posture once its turn ends

Status: implemented

English | [中文](2026-09-06-todo-strip-settled-posture.zh.md)

## Problem

The plan strip rendered whatever status the model last wrote and spun the `in_progress` ring unconditionally. The `todos` projection deliberately keeps the finished list visible past `turn/end`, clearing it only on the next `turn/start` ([turn-scoped plan lifetime](../feature/2026-07-28-todo-plan-clears-on-next-turn.md)), so a session that never starts another turn keeps its last open item animating forever while its header still counts that item as in progress.

That is a property of the loop, not of any one deployment. A turn ends when the model emits text with no tool call, so a plan whose final item is "summarize the conclusion" cannot have that item ticked by the model itself: producing the report is producing the end of the turn. Ticking it would need the model to bundle a `todo_write` into the reporting step and then emit a further step carrying no content at all.

The bid-review deployment made the gap permanent rather than transient, because submitting a document seals the session and locks the composer ([reviewing desk](../architecture/2026-09-05-bid-review-reviewing-desk.md)). A sealed review of one bid document showed four of five items completed with 「汇总审核结论」 still spinning under a header reading 「4 已完成 · 1 进行中」. In an ordinary chat session the same rendering is visible for as long as the user spends reading the answer, and disappears at the next `turn/start`.

## Decision

The dock adapter derives a posture from the session snapshot it already receives as an owner prop and passes it to the panel as a plain prop. The panel stays a pure function of its props; the derivation is one module, `skeleton/todo-posture.ts`, with no subscription, no projection key, and no host change.

Three values, in precedence order:

- `halted` when the Host removed the session. A removed session never sees another `turn/start`, so anything still animating on it animates forever, and reporting it finished would claim a completion that never happened.
- `live` while the Host reports a running turn. That bit is the Host's own authority on whether a turn is in flight, and no derived reading outranks it.
- `live` when the loaded window holds no turn boundary, or when its highest boundary has a start without an end. The list's own turn may be the one paging moved out of the window, and an unfinished highest boundary alongside a cleared running bit is a dropped frame or a reconnect, which resyncs on its own. Neither is evidence to conclude from.
- `halted` when the highest turn in window left failure evidence: a `turn-error` node, a `turn-max-tokens` node, or an assistant node frozen by an interruption. Each is matched on that turn's number alone.
- `settled` otherwise.

Rendering follows the posture. `live` is what the strip rendered before this note. `settled` renders every remaining open item with the completed glyph and collapses the header to the done count alone. `halted` keeps every item's real status, holds the ring still, and replaces the header's in-progress segment with `todo.progress.stopped`.

Each row's `data-status` carries the status the model wrote in all three postures. The derived reading is published separately as `data-posture` on the panel root, which is also the selector the CSS scopes the ring animation to.

## Why the posture is derived on the client

The `todos` projection is host-computed and reaches every consumer of the session snapshot, including the automation-only ACP bridge and the Python SDK. Folding a display reading into it would hand each of them a status the model never wrote and require a `stateVersion` bump off 2 for a change in what an existing key means.

The dock slot already supplies the facts. `conversation.input.dock` is a session-scoped list whose owner share is the whole `ConversationSnapshot`, and its contract forbids an entry from subscribing, so the snapshot the adapter already receives is the only source it may read. The derivation returns a primitive string, so it needs no memoization.

The package already holds an activity indicator to this standard. For the model-retry row the Host running bit controls only the live animation, and the row then shows a static completed or cancelled label. An indicator that animates while nothing is running is wrong by the rule this package already documents.

The precedence mirrors the reviewing desk's own stage derivation, whose first line also places a removed session above a running one.

## Alternatives considered

- **Write a synthetic `todo/write` at `turn/end`** — invents a log record the model never authored. The session log is the model's own testimony, and [turn-scoped plan lifetime](../feature/2026-07-28-todo-plan-clears-on-next-turn.md) rejected the mirror-image shape for the same reason: "Append an empty `todo/write` on turn start — mutates the log for a UI lifetime rule."
- **Rewrite statuses inside the host `todos` projection** — the same fabrication one layer down, plus a `stateVersion` bump and a presentation decision leaked to every consumer of the projection.
- **Instruct the model to tick its last item before answering** — the list is model-authored afresh on each run, and the loop terminator makes the instruction unachievable: emitting the closing text with no tool call is what ends the turn.
- **Freeze the ring but keep the in-progress status in every ended turn** — this is `halted` applied universally. It fabricates nothing, but it labels every successful turn as though it had stopped early, which is a worse falsehood than the one being fixed. Kept for the turns that actually failed.
- **Freeze the ring and leave the header wording alone** — the header's 「N 进行中」 is the spinning ring stated in words, and it is the only channel a screen-reader user has. Freezing one and not the other leaves the accessible name contradicting the visual.
- **Gate `settled` on every item being completed except trailing in-progress ones** — an extra branch and an extra test for a distinction no reader perceives, and it would leave a mid-list open item spinning forever.
- **Contain the change in `ui-bid-review`** — the deployment package can register its own strip into `conversation.input.dock` reusing the shipped `todo` id, which replaces that cell. It costs a forked presentation component with its own spec and coverage file, duplicates the header-count and glyph logic under a live duplication gate, leaves the defect unfixed for every other deployment, and gives the deployment package a conversation-domain concern it otherwise only shadows. The defect is not deployment-specific, so neither is the fix.

## Consequences

A sealed session's plan strip now reads as finished instead of working, and an ordinary session's strip reads that way in the gap between `turn/end` and the next `turn/start`, when the list is still on screen. Nothing in the DOM asserts a completion the model did not write: the row keeps the model's own status and the derived reading rides a separate attribute. That attribute is also the animation's CSS hook, so gating the spin added no class and no branch to a component under a 100% coverage regime elsewhere in the repo.

One new locale key, `todo.progress.stopped`, in both languages. `settled` needs none: the existing done count is already the complete and truthful statement of a finished plan.

Partial supersession of [web todo display](../feature/2026-07-23-web-todo-display.md). Only its "TodoPanel: the durable list as a persistent strip" subsection is displaced, and only in two claims: that a status renders its glyph unconditionally, and that the header counts the model's raw per-status tallies. Event sourcing, the two render surfaces, the per-call row's pinned fields, and the strip's collapse behaviour all remain that note's.

Partial supersession of [turn-scoped plan lifetime](../feature/2026-07-28-todo-plan-clears-on-next-turn.md). `turn/end` still keeps the finished checklist visible and the next `turn/start` still clears it. That note's rule gains one clause: while the list remains visible past its own turn, the strip renders it as that turn left it — finished when the turn ended cleanly, stopped when it did not.

Several items may be open at once, because the `standard` preset allows parallel `in_progress` ([parallel in-progress items](../feature/2026-07-26-todo-parallel-in-progress.md)). That is what makes `settled` a collapse to one count rather than a single flipped row.

No `prefers-reduced-motion` escape: the ring animates unconditionally while a turn runs, and a user who asked their OS to reduce motion still gets it. Deferred deliberately to keep this change to the posture; recorded in the package README's known limitations.

`packages/client/ui-conversation/tests/todo-posture.client.spec.ts` pins every branch of the derivation, including each of the three failure kinds in the highest turn and each of the three from an earlier turn, which is what keeps the fold turn-scoped. `tests/todo-panel.client.spec.tsx` pins the three renderings, the `data-status` / `data-posture` split, and the dock reading its owner share. Both sit under the package's existing client-lane coverage exemption, so neither file is gated at 100%.

The assembled web snapshot lane is unchanged. The fixture session that owns the todo panel has its `running` bit pinned true and the spec never enters a prompt-replay or cancel path, so it derives `live`, which renders identically to before, and its golden is byte-identical. The queue-actions golden captures a turn deliberately held open, with the running-only chrome still on screen, for the same reason. Playwright is not installed on the machine this note was written on, so that lane is verified by reading rather than by execution.

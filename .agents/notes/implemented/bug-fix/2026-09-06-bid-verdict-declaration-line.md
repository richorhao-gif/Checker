# Agent Note: The bid review's seal reads one declaration line and can hold for verification

Status: implemented

English | [中文](2026-09-06-bid-verdict-declaration-line.zh.md)

## Problem

The reviewing desk's seal read its verdict by searching the opinion sheet's whole body for 不符合, rejecting on any hit and passing on 符合 otherwise ([reviewing desk](../architecture/2026-09-05-bid-review-reviewing-desk.md)). A substring scan cannot tell a conclusion from a quoted requirement, a conditional, or a sentence that negates itself.

Five recorded reviews of real bid documents show the cost. Two of them reviewed the same tender, number ZY26-CZ06-WZ177, uploaded twice as the same `.doc`, and reached substantially the same findings while sealing opposite verdicts:

- One sealed 符合. Its body never contains 不符合 at all — 0 occurrences against 7 of 符合 — and it lists the same two requirements it cannot confirm.
- The other sealed 不符合. Its body contains 不符合 twice against 12 of 符合, and the first occurrence sits inside 「不是简单"不符合"，而是主体与资质符合，但有 4 项资格硬指标现有资料无法证实」, a sentence meaning the opposite of the word the scan found. The second is 「若这两项无法落实，判定为不符合资格」, a conditional.

The vocabulary is the deeper cause, not only the reader. Both runs were held up by the same fact: the tender states hard requirements — a fixed supply point in 京津冀 or 北京, and delivery vehicles registered in 北京 — that the shared company record neither confirms nor refutes, since it records a 济南 registration, a 3200 m² cold store, and a 150 km delivery radius. Offered only 符合 and 不符合, the model could say "the record does not settle this" only through wording, and the seal could not read wording.

## Decision

The verdict gains a third value and the reader changes to match.

[`prompt.ts`](../../../../packages/client/ui-bid-review/src/client/prompt.ts) gains `BID_REVIEW_VERDICT_CONTRACT`, a second block of fixed copy submitted after the question. It requires the sheet's first line to be exactly `判定：符合`, `判定：不符合`, or `判定：待核验`, forbids any further word after the colon, and states the rule that chooses between them: a hard requirement in the tender that the shared record can neither confirm nor refute is declared 待核验 and itemized — what is missing and who issues it — instead of passed on a guess that it probably exists or failed on not finding it. The same edit removes the doubled 出 from the question's 「不符合给出出原因」.

`verdictOf` reads that declaration and nothing else. It takes the report's first eight lines, strips `*` and backticks so an emphasized declaration still reads, and matches `/判定[：:]\s*(不符合|待核验|符合)/` — both colon widths, because a model that switched input methods mid-line still declared. The first match decides, and a head matching nothing leaves the seal uncommitted. Eight lines is the allowance for a title and a blockquote above the declaration the contract asks to be first.

The strip applies to the read alone. The declaration stays in the rendered body, in the copy, and in the download, because it is the model's own word and the evidence the seal stands on.

`DeskVerdict` is now `reject | pass | unverified | none`, and one new derivation `sealInk` maps it to an ink: green for a pass, amber for 待核验, vermilion for a rejection and for the uncommitted sheet. Amber is already the desk's color for waiting on a person — the paused note and the page-margin line carry it — and a fact still to be verified waits on someone to supply a document. `ReviewDesk` looks the word up in one module-private record of CSS classes and hands the class to the seal, so the component gains no branch over the verdict. One new locale key, `desk.seal.unverified`, in both languages.

The five recorded reviews carry no declaration line, so all five now wear the uncommitted seal. That is the decision rather than an oversight: keeping the old scan as their fallback would keep the reader that produced the contradiction, and a real seal on an old review means submitting it again.

## Why the seal reads one line and not the whole report

The desk's standing rule is that it paints what the log carries and invents nothing. A whole-body scan breaks that rule in the reader rather than in the painter: it emits a verdict the sheet never gave, taken from a word the sheet used for something else. Reading only a line the prompt requires the model to author keeps the seal a transcription, and it makes the failure honest — when the model does not declare, the seal says so instead of guessing, which is the same reason the desk shows no bid-domain progress nothing measures.

The head limit is what makes the restriction real. Without it a declaration-shaped phrase anywhere in the body would decide, and the two sentences that produced this note — a self-negation and a conditional — would still land.

## Alternatives considered

- **Keep the whole-body scan as a fallback for sheets with no declaration line** — rejected. It preserves the reader that sealed opposite verdicts over one tender's identical findings, so the five existing records keep their contradiction and any future sheet omitting the line is guessed at again.
- **Let the desk infer the verdict from the body** — rejected. Weighing 12 occurrences of 符合 against 2 of 不符合, or deciding which sentence is the conclusion, composes a verdict the model did not state. It is the same fabrication the desk refuses for progress, and it would require reading Chinese prose rather than one line.
- **Add 待核验 to the copy and leave the reader scanning** — rejected. The wording drift stays: the model would still express an unsettled fact as either neighbour plus hedging prose, and the scan would still seal on whichever word appeared first anywhere in the body.
- **Parse the verdict on the Host and publish it as a Session event** — rejected for this change. `dsh-bid-review` assembles no prompt and owns no output contract, so the Host would need the contract too, and a `SessionEventMap` member is required-on-read for every build. The declaration is already durable in the assistant message the desk reads, so an event would carry a second copy of a fact one line states. It stays the honest route if a verdict ever needs to reach a consumer that does not render the sheet.
- **Strip the declaration line from the body once read** — rejected. The desk would then paint a sheet differing from the log, and the exported document would lose the sentence its own seal is based on. The seal repeating that line once is the cheaper cost.
- **Anchor the match to the first line alone** — rejected. The contract asks for the first line, but a model that puts a title or a blockquote above it still declared, and refusing to read that leaves an uncommitted seal over a committed sheet. Eight lines admits a title and reaches nothing deep enough to catch a body conditional.

## Consequences

The seal states three outcomes and one refusal, and the refusal is the honest reading of a sheet that did not declare. Every review recorded before the contract existed wears it, so this deployment's five sessions changed seal with their bodies untouched.

The contract is a claim about model behavior that no unit test proves. `desk.ts`'s spec pins the reader, `prompt.ts`'s spec pins both blocks of copy verbatim, and neither shows that a model complies; that is verified in the browser over the five recorded reviews and one fresh submission, which costs a real model call.

One new locale key and one new CSS class, `.sealHold`. It cannot reuse the desk's existing `.amber`, because that name is a rail-dot tone returned by `dotTone` and applied directly as a class name, so the seal needs its own.

Partial supersession of [reviewing desk](../architecture/2026-09-05-bid-review-reviewing-desk.md). Two of its claims are displaced: that `verdictOf` reads the seal out of the closing text by scanning for 不符合 and then 符合, and that the uncommitted seal belongs to a report naming neither verdict. Its principle that the desk will not state a verdict the model did not state survives, and the declaration line is what now enforces it. The shadowing, the derived postures, the stand-in paper, the letterhead and basis reads, and the pencil actions are unchanged.

[Fixed prompt surface](../architecture/2026-09-04-bid-review-fixed-prompt-surface.md) keeps its claim that the fixed question is literal product copy in `prompt.ts` rather than a dictionary entry. The output contract joins it under the same rule and the same limitation: neither is localizable, because both are submitted to the model as a user message.

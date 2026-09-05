# bid/ — fixed-question bid review

English | [中文](README.zh.md)

One company-wide review flow: a single fixed question submitted over exactly one uploaded bid document and one shared qualifications record. The Host half owns the durable record and the sanitized landing of every upload; the browser half owns the composer that replaces free-text input.

| Package | Role | ctx key |
|---|---|---|
| [`bid-review/`](bid-review/README.md) | Shared company qualifications plus bid-document intake, published as the Host `bidReview.*` Remote contract | `bidReview` |

The browser half is [`client/ui-bid-review/`](../client/ui-bid-review/README.md), which shadows the conversation composer bar. The decision record is the [fixed-question bid review Agent Note](../../.agents/notes/implemented/architecture/2026-09-04-bid-review-fixed-prompt-surface.md).

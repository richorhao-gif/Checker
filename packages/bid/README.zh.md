# bid/ — 固定问题标书审核

[English](README.md) | 中文

一个全公司范围的审核流程：针对恰好一个上传的标书文件与一份共享资格记录，提交单个固定问题。Host 半拥有持久记录以及每次上传的净化落点；浏览器半拥有替换自由文本输入的 composer。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`bid-review/`](bid-review/README.md) | 共享公司资格与标书文件接收，以 Host `bidReview.*` Remote 契约发布 | `bidReview` |

浏览器半为 [`client/ui-bid-review/`](../client/ui-bid-review/README.md)，它遮蔽会话 composer bar。决策记录为[固定问题标书审核 Agent Note](../../.agents/notes/implemented/architecture/2026-09-04-bid-review-fixed-prompt-surface.md)。

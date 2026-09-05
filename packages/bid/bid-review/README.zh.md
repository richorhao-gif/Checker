# @deepseek-ai/dsh-bid-review

[English](README.md) | 中文

固定问题标书审核流程的服务端存储与文件接收。本包注册 `ctx.bidReview`，在 storage-domain 中持久化一份全公司共享的资格记录，把每个上传的标书文件落在配置的目录下，并发布 Host `bidReview.getLimits`、`bidReview.getQualifications`、`bidReview.setQualifications` 与 `bidReview.uploadDocument` 一元 Remote 契约。它不创建 Session、不恢复 Agent、也不组装 prompt；消费这两份记录的审核请求由 Client 拥有。[固定问题标书审核 Agent Note](../../../.agents/notes/implemented/architecture/2026-09-04-bid-review-fixed-prompt-surface.md)拥有其设计边界。

公开的请求、值与失败类型从包根入口及 `@deepseek-ai/dsh-bid-review/types` 导出；其源码为 [`src/types.ts`](src/types.ts)。storage-domain 声明以 `bidReviewDomainSpec` 导出，并附带其运行时 `bidReviewQualificationsSchema` 与存储用 `BidReviewQualificationsRecord`。

## 配置

| 键 | 含义 |
|---|---|
| `maxQualificationsBytes` | 必填正整数：共享资格文本的最大 UTF-8 字节长度。 |
| `maxDocumentBytes` | 必填正整数：单个上传标书文件解码后的最大字节长度。 |
| `uploadsRoot` | 必填非空目录，上传文件的落点；首次上传时创建。 |
| `companyName` | 必填字符串，作为意见书的红头发布给 Client；空字符串表示不署名，此时由 Client 自己的文案抬头。 |

四者都是部署策略且没有默认值，因此 bundle 声明自己接受的大小、写入的目录与所审核的公司，而不是继承某个常量。Web bundle 设为 64 KiB、100 MiB、`dshHomePath('bid-documents')` 与空公司名。

```yaml
- id: bid-review
  name: '@deepseek-ai/dsh-bid-review'
  config:
    maxQualificationsBytes: 65536
    maxDocumentBytes: 104857600
    uploadsRoot: !!js dshHomePath('bid-documents')
    companyName: ''
```

服务注入 `storageDomain`。其持久存储域为 `bid_review`，其中唯一的 `global` 槽保存这一份全公司记录；该域不声明任何表，也没有按 Session 的行。

## 共享资格记录

`CompanyQualifications` 包含按原样存储、从不 trim 的 `text`，以及由 Host 分配、以 Unix 毫秒表示的 `updatedAt` 时间戳，首次保存前为 `0`。`setQualifications` 替换整段文本并返回已提交的记录，因此空字符串会清空它。这里没有 version token，也没有 compare-and-set：并发保存在 domain 写入链上串行化，最后提交者生效。

同一部署的每个调用方读写的都是同一行。Web bundle 的 json backend 把该域存放在 `dshHomePath('storages')` 下，因此记录位于服务端并被局域网用户共享是构造使然。

## 文件上传

`uploadDocument` 把一个解码后的文件写入 `uploadsRoot`，并返回其绝对 `path`，Agent 用自身的文件工具读取该路径。存储名为 `${randomUUID()}-${base}`：新的 UUID 使并发上传无需预留往返即不冲突，而除净化后的 base name 之外没有任何客户端字符串进入路径。

净化先规范化反斜杠，再取 POSIX base name，因此客户端路径不会贡献任何目录段；随后把 Windows 禁止字符集 `<>:"|?*` 与 ASCII 控制区间替换为 `_`，去掉结尾的点与空格，并把结果截断到 200 字符。清理前为空即 `filename-blank`；清理后为空即 `filename-unsafe`。UUID 前缀也保证净化后的名字不会指向保留设备名。

载荷通过重新编码来证明其确实是 base64，因为 Node 的解码器会静默丢弃非法字符与不完整的尾部；只有规范化往返才能判定 `content-invalid`。比较前先剥离换行等空白。大小检查读取解码后 buffer 的 `byteLength` 而非 base64 长度，因此 `document-too-large` 报告的是真正写入的字节数。

## 服务与 Host Remote 契约

`TypertRemoteService` 与 `@Remote` 发布 `BidReviewService` 的四个方法；Host endpoint 名称为 `bidReview.getLimits`、`bidReview.getQualifications`、`bidReview.setQualifications` 与 `bidReview.uploadDocument`。两个变更方法返回判别式业务 union：`{ ok: true, value }` 或 `{ ok: false, error }`。存储故障与初始化前使用的生命周期故障会产生 reject，不会被误标为业务错误。

| 方法 | 请求 | 成功 `value` | 拒绝的 `error.code` |
|---|---|---|---|
| `getLimits` | 无 | `BidReviewLimits { maxQualificationsBytes, maxDocumentBytes, companyName }` | 无 |
| `getQualifications` | 无 | `CompanyQualifications { text, updatedAt }` | 无 |
| `setQualifications` | `BidReviewSetQualificationsRequest { text }` | 已提交的 `CompanyQualifications` | `qualifications-too-large` |
| `uploadDocument` | `BidReviewUploadRequest { filename, contentBase64 }` | `BidReviewDocument { path }` | `filename-blank`、`filename-unsafe`、`content-invalid`、`document-too-large` |

`getLimits` 的存在使 Client 可以在把字节读进内存之前就拒绝超限文件。两种大小失败都返回 `maxBytes` 与 `actualBytes`；`uploadDocument` 先检查文件名再检查内容，因此同时存在两种缺陷的请求报告文件名。

## 模型体验

### 存储的资格与落盘的文件

#### 模型看到的内容

本包不注册任何内容。`ctx.bidReview` 不发布工具、提示词段落、模型可见上下文或 Session 事件；资格文本留在其 storage-domain global 槽中，上传的文件留在服务器磁盘上。只有当另一个具有独立文档的 Client 把二者组装成普通用户消息时，它们才会进入模型请求，而本服务从不知道 prompt 已被发送。

#### Token 影响

为零。本包的请求、记录、上限、存储路径、时间戳或失败都不会进入模型请求。Client 之后提交的字节由该 Client 的 prompt 计量，不在这里。

#### KV Cache 影响

相互独立。读取或替换资格记录、以及写入一个上传文件，都不会触碰模型请求前缀，因此二者都不会使本可复用的提供方缓存条目失效。

## 已知局限与延后工作

- **上传无上限地累积**——没有任何东西删除已落盘的文件，因此被放弃的上传或被替换的选择会把字节留在磁盘上。`maxDocumentBytes` 限制单个文件，但不限制其数量或聚合大小；GC 或配额需要一个「哪些文件仍被引用」的权威，而目前并不存在。
- **共享记录没有 compare-and-set**——`setQualifications` 不携带 version，因此两个并发编辑者都会成功，较晚提交者生效且不产生冲突信号。单记录、少编辑者的拓扑接受这一点；若情况变化，修复方式是引入 version token。
- **没有按会话的文件登记表**——Host 不记录哪个 Session 上传了哪个文件，也不会拒绝同一会话上的第二个文件。每个会话一份文件由拥有该会话的 Client 界面强制。
- **调用方边界受信任**——四个方法都不携带已认证的 actor 或审计身份，且 `bidReview` 面向 `trusted-host` 调用方挂载，因此局域网客户端可以写入共享记录与上传目录。在加入授权与归属信息前，部署方必须只通过受信任或另行认证的边界暴露 Host gateway。
- **不感知文件格式**——服务存储字节并返回路径。文件是否可读、以及标书格式有何要求，属于 Agent 自身的文件工具；损坏的上传会稍后表现为 Agent 读取失败，而不是上传拒绝。
- **净化有损且不可逆**——存储名记录的是净化后的派生名而非原始文件名，同一文件上传两次会产生两个不同路径。Client 保留原始名用于显示，并只在浏览器存储中持有该映射。

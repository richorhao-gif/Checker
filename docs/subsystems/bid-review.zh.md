# 标书审核

[English](bid-review.md) | 中文

[`@deepseek-ai/dsh-bid-review`](../../packages/bid/bid-review)拥有固定问题标书审核的服务端一半：一条所有用户共享的全公司资格记录，以及每个上传标书文件经净化后的落盘位置。它不创建 Session、不恢复 Agent、也不组装 prompt；消费这两条记录的审核请求由浏览器侧的一半负责。

来源：[`packages/bid/bid-review/src/types.ts`](../../packages/bid/bid-review/src/types.ts)

## 公开类型

```ts type-equiv
/** Deployment limits a Client reads before an upload or a qualifications save. */
interface BidReviewLimits {
  /** Maximum UTF-8 byte length accepted for the shared qualifications text. */
  readonly maxQualificationsBytes: number
  /** Maximum decoded byte length accepted for one uploaded bid document. */
  readonly maxDocumentBytes: number
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

## 共享记录与并发

资格文本是整个部署内所有调用方共享的一行记录。`updatedAt` 由 Host 分配，首次保存前为 `0`，因此 Client 能区分从未保存过的记录与内容为空的记录。`setQualifications` 替换整段文本并返回已提交记录，所以空字符串会清空它。

没有版本令牌，也没有 compare-and-set。并发保存在 storage-domain 写入链上串行化，最后提交者胜出，两个编辑方都收不到冲突信号。

## 上传落盘与文件名净化

`uploadDocument` 在配置的 `uploadsRoot` 下写入一个解码后的文件并返回其绝对 `path`，Agent 用自己的文件工具读取该路径。存储名为 `${randomUUID()}-${base}`：新 UUID 让并发上传无需预约往返即不冲突，且除净化后的 basename 之外没有任何客户端字符串进入路径。

净化会归一化反斜杠、取 POSIX basename 使客户端路径不贡献任何目录段、把 Windows 禁止集合 `<>:"|?*` 与 ASCII 控制字符区间替换为 `_`、去掉末尾的点与空格，并把结果截断到 200 字符。清理前为空是 `filename-blank`；清理后为空是 `filename-unsafe`。UUID 前缀同时保证净化后的名字不会指向保留设备名。

载荷通过重新编码来证明其确为 base64，因为 Node 的解码器会静默丢弃非法字符和过短的尾部；只有规范化往返才能判定 `content-invalid`。比较前先剥离空白，因为线路载荷可能带换行。大小检查读取解码缓冲区的 `byteLength` 而不是 base64 长度，所以 `document-too-large` 报告的是实际写入的字节数。

## 持久化与 Remote 约定

服务通过 `ctx.storageDomain` 在 `bid_review` 存储域中保存该记录。该域只声明一个 `global` 槽，形状为经 schema 校验的 `{text, updatedAt}`，且没有表，因此不存在按 Session 划分的行，Session disposal 也没有可级联的对象。Web Host 组合设置 `maxQualificationsBytes: 65536`、`maxDocumentBytes: 104857600` 和 `uploadsRoot: dshHomePath('bid-documents')`；三者都是无默认值的必填 Config 字段，因此部署自行声明大小与目录。json backend 把该域存放在 `dshHomePath('storages')` 下，这使记录天然位于服务端并被局域网用户共享。

该包通过 `TypertRemoteService` 与 `@Remote` 发布 Host `bidReview.getLimits`、`bidReview.getQualifications`、`bidReview.setQualifications` 和 `bidReview.uploadDocument` 一元 Remote 约定；下方生成的 Cordis API 是方法级权威。`getLimits` 的存在使 Client 能在把文件字节读入内存前拒绝超限文件。两个大小失败都返回 `maxBytes` 与 `actualBytes`，且 `uploadDocument` 先检查文件名再检查内容，因此同时带有两种缺陷的请求报告文件名问题。

## Web 界面

[`@deepseek-ai/dsh-client-ui-bid-review`](../../packages/client/ui-bid-review) 是浏览器侧消费方。`@deepseek-ai/dsh-api-remotes` 挂载生成的 `bidReview` 贡献，因此该插件调用 `ctx.remote.bidReview`，不接触传输层。这些方法不在仅限 loopback 的特权集合中，所以局域网浏览器通过与其余 Remote 界面相同的 `trusted-host` 网关访问它们。

该插件贡献 `ui-conversation` 声明的 single-kind `conversation.composer.bar` slot 中 `priority: -1` 的条目。single-kind slot 渲染优先级最低的条目，因此该条目替换自由文本 `InputBar` 而无需编辑那个包；它也不声明 `children`，所以命令菜单、图片栏、计划位与模型选择器缺失的原因是没有任何东西渲染它们。资格编辑器是围绕一个 textarea 的单个弹窗，带有对照 `maxQualificationsBytes` 的实时 UTF-8 字节计数。

提交把固定审核问题、上传文件的服务器绝对路径与共享资格文本组装为一个 prompt，并通过标准 input actions 发送，因此它是既有 `conversation.send` 路径上的一条普通用户消息。每会话一个文件是 Client 状态加 `sessionStorage`，Host 不保存按 Session 划分的登记表。

## 边界与限制

- 上传会累积。没有东西删除已落盘文件，因此被放弃的上传或被替换的选择会把字节留在磁盘上。`maxDocumentBytes` 限制单个文件，但不限制数量或聚合大小，而 GC 或配额需要一个「哪个文件仍被引用」的权威。
- 共享记录没有 compare-and-set，因此两个并发编辑方都会成功，后提交者胜出且没有冲突信号。
- Host 不记录哪个 Session 上传了哪个文件，也不会拒绝同一会话的第二个文件；该限制属于拥有会话的 Client 界面。
- 服务存储字节并返回路径。文件是否可读、以及标书格式要求什么，属于 Agent 自己的文件工具，因此损坏的上传会在稍后表现为 Agent 读取失败，而不是上传拒绝。
- 净化是有损且不可逆的：存储名记录的是净化后的派生名，不是原始文件名，同一文件的两次上传产生两个不同路径。
- 四个方法都不记录已认证的 actor 或审计身份，因此假设调用方边界可信。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbidreview--bidreviewservice"></a>

### `ctx.bidReview` — `BidReviewService`

Storage-domain service publishing the shared qualifications record and the document-upload landing. It never creates or resumes an Agent or Session.

```ts cordis-catalog
/**
 * Read the deployment limits a Client needs before an upload or a save.
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

Source: [`packages/bid/bid-review/src/index.ts:124`](../../packages/bid/bid-review/src/index.ts)
<!-- END GENERATED cordis-surface -->

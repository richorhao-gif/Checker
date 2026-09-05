# Agent Note: Fixed-question bid review over a shadowed composer bar

Status: implemented

[English](2026-09-04-bid-review-fixed-prompt-surface.md) | 中文

## Problem

一家公司在服务器上运行一个 Web Host，供多名局域网用户使用，而这些用户不得输入自由文本消息。唯一可受理的请求是：针对恰好一个上传的标书文件提出一个固定审核问题，并以全公司共享的一份资格文本作为判断依据。

Harness 中没有任何部分承载这一策略。composer bar 会渲染 textarea、图片栏、命令菜单、plan 座位与模型选择器，其中每一项都允许该部署所禁止的输入。资格文本没有服务端归属：浏览器本地存储会按用户分裂该记录，而 `settings.*` Remote 仅限 loopback，因此局域网用户既读不到也写不了它。上传的文件也没有落点能为 Agent 提供可用其自身文件工具读取的绝对路径，而任何客户端提供的字符串都不得进入该路径。

从产品中删除自由文本输入会移除 harness 的通用能力；另建一个应用则会重复本项目已经交付的 Session、agent 与转录机制。

## Decision

由两个新包承载该部署，且本文描述的 intake 不改变任何既有包的行为。`@deepseek-ai/dsh-bid-review` 是 Host 服务；`@deepseek-ai/dsh-client-ui-bid-review` 是 web Client 界面，其第二个条目——[审卷台](2026-09-05-bid-review-reviewing-desk.md)——持有对话视图格，并需要 `ui-conversation` 中一条页签投影规则。Client Remote 聚合把生成的 `bidReview` 面挂载在 `messageFeedback` 旁边。

Host 服务在 `bidReview` 命名空间下继承 `TypertRemoteService`，并发布四个一元 Remote 方法：`getLimits`、`getQualifications`、`setQualifications` 与 `uploadDocument`。业务拒绝以 `{ ok: true, value }` 或 `{ ok: false, error }` 返回；只有存储与生命周期故障才会 reject。`maxQualificationsBytes`、`maxDocumentBytes`、`uploadsRoot` 与 `companyName` 都是必填 Config 字段，因此部署方声明自己的策略与所审核的公司，而不是继承某个常量。Web bundle 设为 64 KiB、100 MiB、`dshHomePath('bid-documents')` 与空的公司名，后者由意见书用自己的红头文案回答。

资格文本存放在 `bid_review` 存储域的一个 global 槽 `{ text, updatedAt }` 中，其中 `updatedAt: 0` 标记从未保存过的记录。所有用户读写同一行，最后提交的保存生效。Web bundle 的 json backend 把它存放在 `dshHomePath('storages')` 下，因此该记录位于服务端并被共享是构造使然，而非依赖约定。

提交复用标准 input actions：先 `setDraft(buildBidReviewPrompt(path, qualifications))`，再 `submit()`。该 prompt 是既有 `conversation.send` 路径上的普通用户消息，因此不需要新的模型可见输入形态、新的 `SessionEventMap` 成员，也不需要改动 agent-loop。Agent 自己通过 tool-fs 与 shell 从服务端绝对路径读取文件；两个包都不解析、转换或检查任何标书格式。

约束只在 Client 侧。Host 的自由对话能力、preset、工具与 Remote 面保持不变，移除该 Client 条目即可恢复普通 composer。

## Composer shadowing and the one-document state

Client 条目通过 `ctx.slots.inject` 以 `priority: -1` 注册进 `conversation.composer.bar`。single-kind 槽渲染优先级最低的条目，因此该条目在不修改 InputBar 的情况下替换其 `priority: 0`；使用 injection 而非直接注册，使该贡献与声明槽的生命周期绑定。

该条目不声明 `children`。因此它不会获得 `renderSlot` kit，命令菜单、图片栏、plan 座位与模型选择器的缺失是因为没有任何东西渲染它们，而不是因为某个条件把它们隐藏了。owner 的 `disabled`、`blocked`、`variant`、`placeholder` 与 `footer` props 仍然被尊重，因此经由独立 `conversation.composer` chain 到达的审批或 ask-user 回合仍可使用。

`deriveSurface` 依据 Session 事实而非本地状态决定渲染形态：owner 的 inert 姿态渲染工作区触发器，已移除的 Session 渲染结束提示，`composerPhase: 'blank'` 渲染 intake，`'engaging'` 且首次 prompt 失败时仍停留在 intake 以便用同一份文件重试，其余情况渲染 locked。读取 `composerPhase` 而不是本地标记，使锁定状态在刷新后仍然存在并与 Host 一致。

每个会话恰好一份文件由 Client 状态保证：`pick`、`uploading`、`uploadError`、`ready`、`sending`。`sessionStorage` 在 `dsh-bid-doc:<sessionId>` 下保存 `{filename, bytes, path}`，因此提交前刷新可以恢复文件卡而无需重新上传；locked 形态会清除它，使该 Session id 上的后续会话从空开始。Host 不做按会话登记，也不会拒绝第二条 prompt。

## Upload landing and filename sanitization

上传落在 `join(uploadsRoot, randomUUID() + '-' + base)`。净化先把反斜杠规范化，取 POSIX base name，把 Windows 禁止字符集与 ASCII 控制字符替换为 `_`，去掉结尾的点与空格，并把结果截断到 200 字符。清理前为空即 `filename-blank`；清理后为空即 `filename-unsafe`。除该 base name 之外，没有任何客户端字符串进入路径，而新的 UUID 使并发上传无需预留往返即不冲突。

`decodeContent` 通过重新编码来证明载荷确实是 base64：Node 的解码器会静默丢弃非法字符与不完整的尾部，因此规范化往返是唯一能判定 `content-invalid` 的比较。先剥离空白，因为线路载荷可能带换行。大小检查读取解码后 buffer 的 `byteLength` 而非 base64 长度，因为 base64 会把内容放大约三分之一。

Client 在读取字节之前就拒绝超限选择：`uploadDocument` 先读取 limits，并依据 `file.size` 返回 `document-too-large`，因此一次被拒绝的 100 MiB 文件只花费一次 Remote 调用，而不是一个标签页容纳不下的 base64 字符串。上传经由既有 JSON-RPC 载体传输，其 160 MiB 请求体上限可容纳配置的 100 MiB 文件（编码后约 134 MiB）。

## Alternatives considered

**在 `ui-conversation` 的 InputBar 中增加受限模式。** 拒绝，因为这会把某个部署的产品策略放进每个 bundle 都挂载的 composer，需要在共享包上加配置开关，而且相比一个已经在同一槽中渲染的条目毫无收益。

**以相同优先级注册并依赖加载顺序。** 拒绝：single-kind 槽在优先级重复时会抛错，而可独立重载的插件之间的激活顺序不是契约。通过 `slots.inject` 显式使用更低优先级，使该替换在注册点即可审计。

**把资格存放在 `localStorage` 或 `settings.*`。** 拒绝：`localStorage` 会按浏览器分裂记录，而 settings Remote 仅限 loopback，局域网用户既读不到也写不了。storage-domain 的 global 槽位于服务端且共享，不会遇到这两种失败。

**在服务端维护按会话的文件登记表。** 本次改动拒绝。Client 已经持有它上传所得的路径，而登记表需要 persistence 并不提供的 Session 生命周期权限：detach 不是持久删除，也没有可供挂载级联的删除接口。

**用 base64 长度判断大小上限。** 拒绝：长度检查会放行超过 `maxDocumentBytes` 的文件，同时拒绝其中一些合规文件。解码后的 buffer 才是被测量的值。

**在 Client 或 Host 服务中解析或转换文件。** 拒绝：格式处理没有边界，Agent 已经拥有文件读取能力，而转换步骤会对模型看到的内容形成第二个权威。

**通过独立 HTTP endpoint 上传。** 拒绝：JSON-RPC 的 body 上限已经容纳配置的最大值，而第二种传输会需要自己的认证、错误词汇与 Client 管线。

## Testing

Host 包测试资格往返、两种大小拒绝、四种文件名情形、base64 证明，以及自定义 `uploadsRoot`。Client 包逐字锁定固定问题与 prompt 的字段顺序，用表格覆盖 `deriveSurface`，验证 `sessionStorage` 的恢复与清除路径，折叠两层 Remote 封装，并在 jsdom 中渲染 intake、locked、blocked 与弹窗姿态。两个包在仓库门禁下都报告完整的按文件覆盖率。

## Consequences

一个部署即可用单一资格记录与单一上传目录服务多名局域网用户，审核界面上没有自由文本入口。

遮蔽 composer bar 同时移除了图片栏、命令菜单、plan 座位与模型选择器，因为该条目不声明 children。模型选择由服务端 preset 配置决定，而被模型阻塞的 Session 无法在此界面解除；`blocked` 的原因仍会渲染。

上传会累积。没有任何东西删除已落盘的文件，因此被放弃的上传或重新选择会把字节留在磁盘上。UUID 前缀保证这不出错但没有上界；GC 或配额需要一个「哪些文件仍被引用」的归属方，而当前没有任何权威提供它。

`setQualifications` 没有 compare-and-set。两个并发编辑者都会成功，较晚提交者生效且不产生冲突信号；单记录、少编辑者的拓扑接受这一点，若情况变化，修复方式是引入 version token。

两个 Remote 都不携带已认证的 actor。部署方必须只通过其受信任边界暴露 Host gateway，否则任何能访问到它的人都可以写入共享记录与上传目录。

每个会话一份文件是产品界面而非持久不变量：它是 Client 状态加 `sessionStorage`，因此按浏览器标签页计，能在刷新后保留，但不能在另一个浏览器或清空存储后保留。

固定问题是 `prompt.ts` 中的字面产品文案而非词典条目，因为它以用户消息提交给模型；本地化它会改变每个部署的 Agent 所收到的内容。界面文案仍保留在双语 `bidReview` 词典中。

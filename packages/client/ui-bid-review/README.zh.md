# @deepseek-ai/dsh-client-ui-bid-review

[English](README.md) | 中文

固定问题标书审核插件，浏览器半：一个替换自由文本输入栏的单文件接收界面，外加编辑全公司共享资格记录的弹窗。它通过 `ctx.slots.inject` 向 `ui-conversation` 声明的 single-kind 槽 `conversation.composer.bar` 贡献 `priority: -1` 条目。single-kind 槽渲染优先级最低的条目，因此该条目在不修改 `ui-conversation` 的情况下替换 `InputBar` 的 `priority: 0`。

该条目不声明 `children`，因此不会获得 `renderSlot` kit，命令菜单、图片栏、plan 座位与模型选择器的缺失是因为没有任何东西渲染它们。owner 的 `disabled`、`blocked`、`variant`、`placeholder` 与 `footer` props 仍被尊重：经由独立 `conversation.composer` chain 到达的审批或 ask-user 回合会把其原因渲染在 intake 之上并禁用 intake。

每个会话恰好一份文件是 Client 状态，覆盖 `pick`、`uploading`、`uploadError`、`ready` 与 `sending`。`sessionStorage` 在 `dsh-bid-doc:<sessionId>` 下保存 `{filename, bytes, path}`，因此提交前刷新可以恢复文件卡而无需重新上传；locked 形态会清除它，使该 Session id 上的后续会话从空开始。一次选择或拖放只取提供的第一个文件，且文件输入不限制类型，因为格式处理属于 Agent 自身的文件工具。

`deriveSurface` 依据 Session 事实而非本地状态决定渲染形态：owner 的 inert 姿态渲染工作区触发器，已移除的 Session 渲染结束提示，`composerPhase: 'blank'` 渲染 intake，`'engaging'` 且首次 prompt 失败时仍停留在 intake 以便用同一份文件重试，其余情况渲染 locked。读取 `composerPhase` 而不是本地标记，使锁定状态在刷新后仍然存在并与 Host 一致。

提交复用标准 input actions：先 `setDraft(buildBidReviewPrompt(path, qualifications))`，再 `submit()`。因此该 prompt 是既有 `conversation.send` 路径上的普通用户消息，发送失败以 snapshot 的 `promptError` 到达，而不是抛出调用。

四个操作经由 `ctx.remote.bidReview` 执行。生成的面把每个业务结果包在 `RemoteResult` 中，而 Host 在其中返回自己的 `{ ok, value | error }` union，因此 [`src/client/remote.ts`](src/client/remote.ts) 把两层封装折叠成两个组件共同渲染的单一 `Outcome<T>`，并由 `failureText` 把每个 code 映射进 `bidReview` 词典。`uploadDocument` 先读取 limits 并依据 `file.size` 拒绝超限选择，因此一次被拒绝的文件只花费一次 Remote 调用，而不是一个标签页容纳不下的 base64 字符串。

`/client` 导出插件本体（`apply`/`inject`）、`BidReviewComposer` 与 `QualificationsEditor` 组件、固定问题与 `buildBidReviewPrompt`，以及注入面、surface、outcome 与 document 类型。界面文案保存在双语 `bidReview` 命名空间词典中。

## 模型体验

### 固定审核 prompt

#### 模型看到的内容

一条普通用户消息，由本包组装并通过标准 input actions 提交。[`src/client/prompt.ts`](src/client/prompt.ts) 拥有字面量 `BID_REVIEW_PRESET_QUESTION`；其后各字段按固定顺序排列，先是上传文件的服务器绝对路径，再是逐字的共享资格文本。Agent 自己用其文件工具从该路径读取文件。本包不注册任何工具、提示词段落或 Session 事件，模型也从不知道 composer 的本地步骤。

##### 审核按钮提交的 prompt 顺序

```markdown
{BID_REVIEW_PRESET_QUESTION}

标书文件：{absolute server path of the uploaded document}

公司资格：
{shared qualifications text, verbatim}
```

#### Token 影响

固定问题为 145 个字符（435 UTF-8 字节），因此其开销在每个会话与每个部署上都相同。资格文本是唯一增长的部分，并由 Host 的 `maxQualificationsBytes` 限制（Web bundle 中为 64 KiB）；空记录只贡献其标题与一个空行。文件路径增加一行，而文件自身内容从不由本包内联。

#### KV Cache 影响

该 prompt 是新会话开头的用户消息，因此构成该会话的前缀。共享同一份资格文本的两个会话可以复用该问题与该文本；两次会话之间的保存会改变前缀的尾部，从而改变自资格起的缓存条目。本包的任何行为都不会触碰进行中会话的历史。

## 已知局限与延后工作

- **该界面没有自由文本输入**——遮蔽 composer bar 同时移除了图片栏、命令菜单、plan 座位与模型选择器，因为该条目不声明 `children`。模型选择由服务端 preset 配置决定，而被模型阻塞的 Session 无法在此界面解除；其 `blocked` 原因仍会渲染。
- **一份文件是浏览器状态而非持久不变量**——该保证是 Client 状态加 `sessionStorage`，因此按浏览器标签页计，能在刷新后保留，但不能在另一个浏览器或清空存储后保留。Host 不做按会话登记，也不会拒绝第二条 prompt。
- **固定问题不可本地化**——它是字面产品文案而非词典条目，因为它以用户消息提交给模型，本地化它会改变每个部署的 Agent 所收到的内容。修改它是 `prompt.ts` 中的源码编辑。
- **共享记录没有跨标签页推送**——资格徽标在挂载时与弹窗关闭时刷新，因此另一个标签页的保存要到那时才可见；Host 不为该记录发布 live frame。
- **上传进度是不确定的**——intake 对整个 base64 编码加 JSON-RPC 往返只显示一个上传中状态，没有字节进度。慢速局域网上的 100 MiB 文件会在该状态停留到载体完成为止。
- **重新选择会遗留上一次上传**——提交前选择另一个文件会把第一个文件留在服务器磁盘上，因为没有任何东西追踪哪个已落盘文件仍被引用。

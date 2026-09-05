# @deepseek-ai/dsh-client-ui-bid-review

[English](README.md) | 中文

固定问题标书审核插件，浏览器半：一个替换自由文本输入栏的单文件接收界面、编辑全公司共享资格记录的弹窗，以及审核开始后替换转录的审卷台。它贡献两个遮蔽条目，都通过 `ctx.slots.inject` 以 `priority: -1` 注入 `ui-conversation` 声明的槽：single-kind 槽 `conversation.composer.bar`（渲染优先级最低的条目），以及 `conversation.view` list 槽的 `chat` 格（每格渲染优先级最低的条目）。因此 intake 替换 `InputBar` 的 `priority: 0`，审卷台替换对话渲染器，二者都不修改那个包；注入而非直接注册，使这两份贡献都绑定在声明槽的生命周期上。

composer 条目不声明 `children`，因此不会获得 `renderSlot` kit，命令菜单、图片栏、plan 座位与模型选择器的缺失是因为没有任何东西渲染它们。owner 的 `disabled`、`blocked`、`variant`、`placeholder` 与 `footer` props 仍被尊重：经由独立 `conversation.composer` chain 到达的审批或 ask-user 回合会把其原因渲染在 intake 之上并禁用 intake。审卷台条目带自己的 `label` thunk，因此它接管的页签跟随当前 locale，而 `chat` 格的框架职责——草稿镜像与已释放的 Session 图片——仍由声明它们的 owner 持有。

每个会话恰好一份文件是 Client 状态，覆盖 `pick`、`uploading`、`uploadError`、`ready` 与 `sending`。`sessionStorage` 在 `dsh-bid-doc:<sessionId>` 下保存 `{filename, bytes, path}`，因此提交前刷新可以恢复文件卡而无需重新上传；locked 形态会清除它，使该 Session id 上的后续会话从空开始。一次选择或拖放只取提供的第一个文件，且文件输入不限制类型，因为格式处理属于 Agent 自身的文件工具。

`deriveSurface` 依据 Session 事实而非本地状态决定渲染形态：owner 的 inert 姿态渲染工作区触发器，已移除的 Session 渲染结束提示，`composerPhase: 'blank'` 渲染 intake，`'engaging'` 且首次 prompt 失败时仍停留在 intake 以便用同一份文件重试，其余情况渲染 locked。读取 `composerPhase` 而不是本地标记，使锁定状态在刷新后仍然存在并与 Host 一致。

提交复用标准 input actions：先 `setDraft(buildBidReviewPrompt(path, qualifications))`，再 `submit()`。因此该 prompt 是既有 `conversation.send` 路径上的普通用户消息，发送失败以 snapshot 的 `promptError` 到达，而不是抛出调用。

四个操作经由 `ctx.remote.bidReview` 执行。生成的面把每个业务结果包在 `RemoteResult` 中，而 Host 在其中返回自己的 `{ ok, value | error }` union，因此 [`src/client/remote.ts`](src/client/remote.ts) 把两层封装折叠成两个组件共同渲染的单一 `Outcome<T>`，并由 `failureText` 把每个 code 映射进 `bidReview` 词典。`uploadDocument` 先读取 limits 并依据 `file.size` 拒绝超限选择，因此一次被拒绝的文件只花费一次 Remote 调用，而不是一个标签页容纳不下的 base64 字符串。

`/client` 导出插件本体（`apply`/`inject`）、`BidReviewComposer`、`QualificationsEditor` 与 `ReviewDesk` 组件、固定问题与 `buildBidReviewPrompt`、审卷台推导（`deriveDesk`，以及把 stage、verdict、wait 或 basis 读成词典键的文案决策），以及注入面、surface、desk、outcome 与 document 类型。界面文案保存在双语 `bidReview` 命名空间词典中。

## 审卷台

`deriveDesk` 把十个 Session snapshot 字段折叠成一个 `DeskView`，`ReviewDesk` 不再渲染别的东西，因此审卷台的状态不可能与日志不一致：Session 为空时 `hidden`，首个回合开始前 `waiting`，进行中给出正在运行的工具名与该回合在做什么（`tool`、`writing` 或 `thinking`），第一个待处理的审批或反问时 `paused`，有持久失败文案、或某个回合的流式 partial 冻结为 `interrupted` 时 `failed`，Host 已移除 Session 时 `ended`，窗口内最高回合带上结束时间后 `sealed`。没有任何 stage 从 prompt 文本里读出，也没有任何 stage 是编造的。页边标记每个对应一次已结算的工具调用，超过十二个后均匀抽样，因此每个标记仍指向一个真实的序号；计时器是进行中回合自身的跨度；暂停注记在提问者给出原因时携带该原因；纸面上的盲行是一个文件替身，其色调跟随已结算调用数，绝不是文件内部被测量的位置。审卷台只指出等待在哪——回答它的审批或反问面板仍在本包不遮蔽的 `conversation.composer` chain 上。

封卷的审卷台在批注页上落印，保持 1.8 秒，然后翻到意见书；`prefers-reduced-motion` 下立即翻面；两面都可以手动翻回。意见书页眉取 `getLimits().companyName`，部署未命名公司时回退到本包自己的文案。依据行说明被审文件与共享记录的保存时间，或直言记录读不到、为空、从未保存过，而不假装有依据。红头编号是 Session id 去掉 store 的 `session-` 铸造前缀、再截取八个字符。正文是最后一条带文本的 assistant 消息，`verdictOf` 从该文本里读出结论：出现任何「不符合」判为不通过，否则出现「符合」判为通过，两者都没说的报告让印章不落结论，而不是猜一个。

页眉与依据都是部署自己的文字，因此每次封卷审核通过注入的 `readLimits` 与 `readQualifications` 各读一次；在审卷台消失之后才返回的读取被丢弃。铅笔操作中，复制意见书走 `ui-primitives` 共享的 `writeClipboard`，宿主拒绝写入时按钮不宣称已复制；保存走 `downloadText`，落成一个以被审文件命名的 Markdown 文件，顺序与意见书自身的阅读顺序一致。

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
- **审卷台替换的是转录而非页签**——它注册在 `conversation.view` 的 `chat` 格上，因此该格保留自己的 id，旁边的 trajectory 页签不变，而在审卷台渲染期间对话转录完全不被挂载。会话自身的节点仍可在该 trajectory 视图中阅读。由于遮蔽转录也遮蔽了它的「加载更早」按钮，审卷台通过注入的 `loadOlder` 自行翻页，直到一个重开 Session 的提交 prompt 进入窗口。
- **进度是循环的，不是标书业务的**——每个 stage、每个标记与每处色调都来自 Session snapshot 的回合或工具调用事实，因为日志中没有任何东西区分「资格核对」与「提取评分准则」。要显示标书业务的阶段，得先把它们发布为 Session 事件；审卷台不从 prompt 或 assistant 文本里读阶段。
- **意见书是模型的收尾文本**——正文取最后一条带文本的 assistant 消息，因此以工具调用收尾的审核渲染「没有留下结论文本」的文案，而既未说「符合」也未说「不符合」的报告带着未落结论的印章。二者都不在此处纠正，因为编一个模型没有给出的结论会让意见书说谎。

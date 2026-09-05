# Agent Note: Catering-channel fork brand and pinned single workspace

Status: implemented

[English](2026-09-05-catering-channel-fork-brand-and-single-workspace.md) | 中文

## 问题

本仓库以私有局域网部署形态交付：它是面向益海嘉里·金龙鱼餐饮渠道的标书审核工具，而不是公开的 DeepSeek Harness 预览产品。继承下来的两项事实与该部署相冲突。

产品外壳仍携带上游身份——侧栏字标、空状态主视觉区的金鱼图形与「探索未至之境」标题及其 `Preview` 徽标、浏览器标题后缀、PWA manifest 与 favicon、启动 splash，以及首次使用的欢迎声明。操作者看到的是一个第三方预览产品，而不是交付给他们公司的工具。

出厂的 web-app 插件清单还挂载了双面目录选择器 `@deepseek-ai/dsh-host-directory-picker-auto`：它在启动时采样一次绑定主机与显示环境，并挂载相匹配的 native 或 browse 交互。在局域网或无显示环境的绑定下它解析为应用内 browse 面，于是任何远端操作者都能浏览服务器文件系统并把任意目录采纳为新工作区。一个共享的单一用途部署绝不能向用户暴露宿主机的目录树。

## 决策

产品以餐饮渠道标书审核工具的身份呈现，且部署钉死唯一一个服务器工作区。

### 品牌

图形是 `packages/client/ui-primitives/src/BrandMark.tsx`：一枚 24×24 的朱红印章圆盘（`#C8102E`），其上新增金色金龙鱼笔触（`#D9A441`），以固定的呈现色而非 `currentColor` 上色，使其在两套主题下都清晰可辨，并设为 `aria-hidden`。`BrandWordmark.tsx` 以 HTML 方式排布该图形，配上名称「益海嘉里 · 金龙鱼」与一块「餐饮渠道」徽牌；侧栏收窄态使用裸图形，展开态使用字标。

空状态主视觉区把该图形与标题「审之有据 · 落印为凭」/ "Reviewed with evidence, sealed with confidence" 以及渠道徽标「餐饮渠道 · 标书审核」/ "Catering Channel · Bid Review" 搭配呈现。徽标沿用 `Preview` 徽标确立的渲染方式——business-tertiary 背景上一枚等宽字体上标药丸，配可读的 label token，并存在于无障碍标题中——只改变它的 locale key 与身份（`hero.preview` → `hero.channel`，css `previewBadge` → `channelBadge`）。

其余外壳沿用同一身份：`apps/web/index.html` 把页面标题定为「金龙鱼餐饮渠道标书审核」（document-title 服务把会话名追加到这一基名之后），PWA manifest 与 favicon 携带公司名与印章图形，启动 splash 显示「金龙鱼 · 标书审核」，首次使用的欢迎声明改为公司中性文案并提升其 `WELCOME_NOTICE_VERSION`，使每位操作者都重新确认一次。

### 单一工作区

`packages/bundle/web-app/cordis.patch.yml` 中的 `directory-picker` 条目（`@deepseek-ai/dsh-host-directory-picker-auto`）被设为 `disabled: true`，并在其位置直接挂载 host 后端 `@deepseek-ai/dsh-host-directory-picker-browse`，但不挂载它的 client 呈现面 `@deepseek-ai/dsh-client-ui-directory-picker-browse`。`-auto` 会在启动时把后端与呈现面一起挂载为 Loader 条目；占用 ui-workspace 两个 `directoryFlow` 空洞的是呈现面，而「添加工作区…」入口仅在空洞被占用时渲染。只挂载后端会让两个空洞保持为空，于是侧栏浏览区与 hero 选择器两处都没有该入口。后端不能直接省掉：`@deepseek-ai/dsh-host-apiproxy` 把 `directoryPicker` 作为必需服务注入，若没有后端注册它，host 插件树就无法激活，`assertEntriesActivated` 会让启动失败；`-browse` 后端注册该服务，满足 apiproxy。这关闭的是面向用户的入口，而非能力本身——apiproxy 仍然暴露 `directoryPicker` RPC，因此手工构造的客户端仍可调用它；要一并移除该 RPC 面，就得把 apiproxy 的注入改为可选，那是超出本配置级钉死的代码改动。

`ui-workspace` 本身保持挂载：它注册了整个侧栏会话导航区（`sidebar.workspaces`）与 hero 选择器，移除它会删掉会话历史浏览。在运维上，部署以一个专用隔离的工作目录启动服务器，使唯一的默认工作区是一个命名清晰的服务器目录，而不是个人文件夹；该启动选择并不由上述配置强制。

## 曾考虑的替代方案

**移除 `ui-workspace` 清单条目以隐藏工作区。** 不予采纳：ui-workspace 注册的是整个侧栏会话导航区与 hero 工作区选择器，而不仅是一个添加工作区控件。移除它会删掉标书审核工具仍然需要的会话历史浏览。

**保留 `-auto` 目录选择器。** 不予采纳：在局域网或无显示环境的绑定下它解析为应用内 browse 面，会向每个远端操作者暴露服务器的目录树。

**通过 overlay 把选择器钉死为 `-native`。** 不予采纳：无显示环境的服务器上没有原生系统选择器可用，该交互会在使用点失败，而不是被隐藏。

**把品牌做成随部署变化的配置字段。** 不予采纳：品牌是每个部署唯一的一项产品身份，而不是操作者可调参数；`Preview` 徽标记录过的同一条理由适用于它的替代物。

## 后果

操作者遇到的每一处界面——侧栏、空状态主视觉区、浏览器标签页、安装后的应用名、启动 splash、欢迎声明——都呈现餐饮渠道标书审核身份，出厂 web 应用中的上游 DeepSeek Harness 产品标识全部消失。部署失去了多工作区切换：每个会话都继承那个钉死的服务器工作区，无法再添加另一个。这是共享工具为了不让用户浏览宿主文件系统而有意作出的取舍。指称 DeepSeek 为模型或搜索供应商的提供方字符串保留，因为它们陈述的是真实供应商，而不是产品字标。

## 测试

会话、侧栏、document-title、app-root 与欢迎声明组件测试固定了新字符串与标记；组装后的 Web 生命周期与引导快照固定真实 hero 中的英文标题与渠道徽标。出厂 web-app 组合以 `-browse` 后端替代 `-auto` 挂载启动，因此 apiproxy 必需的 `directoryPicker` 注入得以解析；浏览器 e2e 通道只通过它自己的 scaffold patch 补上 `-browse` 客户端呈现面——后端已随生产清单出厂，重复插入会让它的 loader 条目 id 重复——因此目录选择器的交互测试与快照仍能驱动应用内浏览对话框。

## 相关

[web-preview-product-badge](2026-08-05-web-preview-product-badge.md)——本 fork 把该 note 的 `Preview` 徽标身份替换为渠道徽标，同时原样继承其渲染理由；该取代是部分性的（在同一 hero 槽位换掉一种呈现），因此两份 note 都保持活跃并互相交叉引用。

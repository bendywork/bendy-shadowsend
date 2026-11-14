# 临时笨迪 (Temporary Bendy)

基于 **Next.js + PostgreSQL + Prisma** 的临时加密聊天室，前后端一体。
文本、图片、视频、音频、文档、压缩包和其他文件统一发送，房间保持短生命周期。

![首页创建/加入](public/2.png)

## 技术栈

- Next.js 16 App Router / TypeScript / React 19
- Prisma + PostgreSQL
- Tailwind CSS v4
- 固定的无鉴权 multipart 上传接口，返回纯文本文件 URL

## 快速开始

复制 `.env.example` 为 `.env`，只需填写 `DATABASE_URL`；升级时继续使用现有数据库。
新安装自动生成消息加密密钥并持久化到数据库，不需要存储账号、Bucket、Token 或 Cookie。

```bash
cp .env.example .env
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。BACS 共用机器上，安装、迁移验证、测试和构建
须先检查负载/可用内存，并在相关命令前加 `bacs-heavy`，按顺序运行。

## 文件上传

所有聊天附件、剪贴板文件和公告图片使用同一个接口：

```text
POST https://aa08cscht.yixiangmeiju.top/oss/aws/upload
multipart/form-data: file=<文件二进制>
响应: text/plain，直接返回文件 URL
```

浏览器直接上传，不经过应用服务器的大请求体。≤10 MiB 单请求，较大文件按 8 MiB/片上传，
通过数据库分片清单按顺序合并下载并校验 SHA-256。并发最多 3 个文件；网络/超时/限流/服务端
错误有限重试，失败消息可继续发送，已完成文件或分片不会重复上传。

逻辑单文件上限 10 GiB、公告图片上限 200 MiB；上游文档只确认单请求约 11 MB，
实际大文件下载还受网络与部署平台运行时长限制。下载保留原文件名，支持 Range 和视频预览。
详细协议、边界及复用数据库的升级步骤见 [统一上传文档](docs/unified-upload.md)。

## Vercel 部署与数据库升级

- 唯一必填配置是 `DATABASE_URL`，也兼容现有 `POSTGRES_PRISMA_URL` / `POSTGRES_URL` 数据库连接。
- `vercel.json` 使用 `npm run vercel-build`：生产环境检查并应用待执行迁移，再生成 Prisma Client 和构建。
- Preview 默认不执行共享数据库迁移；预览验证使用已迁移的隔离数据库。
- 现有加密消息首次升级时保留原 `CHAT_ENCRYPTION_KEY`，验证并导入数据库成功后可移除；
  缺失或错误的历史密钥会阻止初始化，避免破坏旧消息。空数据库无需该变量。
- 旧存储及预览配置已从运行时代码清除，可以从部署平台移除。旧附件记录保留，读取明确提示重新上传。
- 现有管理 auth 值留在数据库，`APP_AUTH` 仅兼容初始值；现有消息长度/公告数量可选 UI 配置仍可使用。
- 合并到 `master` 的正式发布必须同时推送对应 `-ver` tag，见 [发布规范](docs/release-tagging.md)。

## 验证命令

```bash
npm test -- --maxWorkers=2
npm run test:release-tag
npm run lint
npx tsc --noEmit
npm run build
```

GitHub CI 使用独立 PostgreSQL，验证增量迁移、测试、lint、类型检查与生产构建；
同一分支的新提交自动取消旧 run。共用 BACS 机器上的上述命令统一使用 `bacs-heavy`。

## 功能清单

- 房间是聊天最小单位，支持创建与加入。
- 房间号与门禁码分离：
  - 房间号：随机码，体现在 URL。
  - 门禁码：6 位纯数字，可选。
- 门禁码规则：
  - 门禁码无过期时间（除非房主手动修改或清空）。
  - 1 分钟内禁止创建相同门禁码的房间。
- 房间销毁规则：
  - 10 分钟无活跃自动销毁。
  - 数据库执行逻辑删除（`status=DELETED`）。
- 人数与配额限制：
  - 每个用户最多创建/加入 10 个房间。
  - 每个房间最多 20 人。
- 成员权限：
  - 房主：可踢人、可转让房主、可邀请、可审批再次加入。
  - 成员：可邀请、可查看公告，不可踢人。
- 房间顶部五按钮：
  - `邀请`：复制当前房间加入链接。
  - `二维码`：生成当前房间加入链接二维码，扫码后可在浏览器打开。
  - `公告`：成员可查看公告；房主可配置公告文本与图片。
  - `管理`：房主切换右侧成员管理面板显示/隐藏。
  - `解散`：房主确认后解散房间（逻辑删除）。
- 顶部广告条（文本轮播）：
  - 位于房间头部操作按钮下方，纵向滚动轮播。
  - 支持多条广告 JSON 存储，单条 `content` 最大长度为 `120` 字符。
  - 统一字号使用 `text-sm`（与房间头部文本一致）。
- 右侧管理区：
  - 房主可在最下方修改当前房间邀请码（门禁码）。
- 公告触达：
  - 房主配置公告后，后续新加入成员会弹窗提示一次公告内容。
- 再加入审批：
  - 首次加入无需审批（仅需通过门禁码或房间无门禁）。
  - 被踢后再次加入必须房主审批。
- 消息与文件：
  - 支持文本、任意文件发送。
  - 文本采用 AES-256-GCM 加密存储。
  - 图片/视频可预览，其他文件仅下载。
- 剪贴板体验：
  - 输入框支持直接粘贴文本/文件。
  - 支持“读取剪贴板”按钮。
- UI：
  - 首页中置创建/加入双 Tab。
  - 房间页三栏布局（左：房间树，中：聊天，右：成员）。
  - 左下展示版本、开源协议、房间在线、总在线、当前用户。

## 系统对外接口

> 这些接口为外部统一管理后台预留，不依赖本项目内置后台页面。

### 1) 获取系统信息 `/getInfo`

- 请求方式：`GET` / `POST`
- 参数：
  - `auth`：非必传
- 返回：
  - 不传 `auth`：仅返回 `title`、`version`
  - 传递 `auth` 且校验通过：返回完整信息，包括：
    - `onlineRooms`：当前在线房间数
    - `Rooms`：房间总数（包含逻辑删除和未删除）
    - `onlineUsers`：当前在线用户数
    - `serverAddress`：当前服务地址
    - 不输出文件服务凭据或部署配置
- 日志：每次调用都会在服务端打印记录。

### 2) 关闭应用 `/offline`

- 请求方式：`GET` / `POST`
- 参数：
  - `auth`：必传，不传或错误都返回认证失败
  - `time`：非必传，格式 `yyyy-MM-dd HH:mm:ss`
- 行为：
  - 不传 `time`：立即执行关闭
  - 传 `time`：校验通过后在指定时间执行关闭
- 日志：每次调用都会在服务端打印记录。

### 3) 更改鉴权参数 `/changeAuth`

- 请求方式：`GET` / `POST`
- 参数：
  - `old`：旧 auth（必传）
  - `new`：新 auth（必传，长度 1~32）
- 说明：
  - auth 配置持久化在数据库表 `bendy_shadowsend_app_auth_config`
  - 初始值由 `APP_AUTH` 提供，默认 `bendywork`
- 日志：每次修改都会在服务端打印请求记录。

## 广告数据结构

- 广告表：`bendy_shadowsend_advertisement`
- 字段：展示时间段（`startsAt` ~ `endsAt`）+ 广告内容 JSON（`content`）
- `content` 示例：

```json
[
  { "content": "XXXXXXXXXXXXXXX", "color": "#222333", "url": "https://ai.polofox.com" },
  { "content": "XXXXXXXXXXXXXXX", "color": "#222333", "url": "https://ai.polofox.com" },
  { "content": "XXXXXXXXXXXXXXX", "color": "#222333", "url": "https://ai.polofox.com" },
  { "content": "XXXXXXXXXXXXXXX", "color": "#222333", "url": "https://ai.polofox.com" },
  { "content": "XXXXXXXXXXXXXXX", "color": "#222333", "url": "https://ai.polofox.com" }
]
```

- 校验规则：
  - `content` 最大 120 字符
  - `color` 支持 `#RGB` 或 `#RRGGBB`
  - `url` 可为空；非空时需为合法 URL

## 目录结构

```text
src/
  app/
    api/                    # 后端接口（Next Route Handlers）
    room/[roomCode]/        # 房间页
    page.tsx                # 首页（创建/加入）
  components/chat/          # 聊天 UI 组件
  lib/                      # 核心逻辑（鉴权、加密、统一上传、规则）
  types/                    # 前端类型
prisma/
  schema.prisma             # 数据模型
```

## 数据模型概要

- `User`: 匿名用户信息（昵称、文字头像）
- `Room`: 房间信息、门禁码、活跃时间、逻辑删除状态
- `RoomMember`: 成员关系与状态（ACTIVE/PENDING/KICKED/LEFT）
- `JoinRequest`: 再加入审批记录
- `RoomInvite`: 邀请 token
- `Message`: 文本/文件消息（文本加密）
- `MessageAttachment`: 文件元数据、远端 URL 与分片清单
- `Presence`: 在线状态统计

## 数据库与升级

所有业务表和枚举使用 `bendy_shadowsend_` 前缀。升级只应用 `prisma/migrations` 的增量迁移，
继续使用现有数据；不要执行历史重初始化 SQL。存储枚举保留旧值作为数据兼容标记，
新附件仅写入 `REMOTE`，可空 `chunkManifest` 保存分片清单。

## 更新记录

> 本节记录历史迭代；早期上传方案已由 0.2.0 的统一接口替代，当前配置以文档上半部分为准。

### 2026-11-14

- `0.2.0` 统一所有文件上传并移除旧存储配置（REQ-202611-0097）。
- `175978d` 新增分片合并、SHA-256 与 Range；消息重试去重，已完成文件和分片复用。
- `175978d` 复用数据库，消息密钥持久化并兼容历史导入；新增增量迁移与独立数据库 CI。

> 维护约定：每次迭代（功能、修复、部署调整）都必须同步补充本节。
>
> 推荐格式：`日期 + commit + 变更摘要`。

### 2026-10-18

- `0.1.68` 全局反馈统一（REQ-202610-0475 / ui-12）：新增 `ApiRequestError`（携带 HTTP 状态与后端错误码）与 `src/lib/feedback.ts`，网络异常统一收敛为一条本地化文案，4xx 保留后端可读消息，5xx/解析失败/通用“请求失败”回落到调用方兜底文案；所有动作失败改走 `toastError`，同一错误由 Toast store 自动去重。
- 新增 `src/lib/form-validation.ts`、`FieldError` 与 `input[aria-invalid="true"]` 错误样式；首页、房间入口弹窗、房间设置统一使用 `noValidate` + 行内校验，控件带 `aria-invalid`/`aria-describedby`，修改字段即清除错误。
- 房间页初始加载失败改为页面级错误态并提供“重试”，轮询/同步/上传/发送/成员/审批/公告/设置等失败全部接入 Toast；移除残留的错误文本行与直接拼接 `error.message` 的写法；新增 `docs/design-system-feedback.md` 与 16 条反馈/校验单测（合计 24 条）。
- `0.1.67` 发布 tag 规范（REQ-202610-1374）：新增 `docs/release-tagging.md` 与 `scripts/release-tag.mjs`/测试，强制每次发布推送同步发布 `-ver` tag（正常 `<version>-ver`、修复 `<version>-fix-<次数>-ver`）；`package.json` / `src/lib/constants.ts` 版本同步至 `0.1.67`（无运行时行为变更）。
- `73258ff` `AGENTS.md` 增加发布 tag 强制规范；`README.md` 版本号管理补充发布 tag 流程；`package.json` 新增 `release:tag` / `test:release-tag` 脚本。
- `4a0dea6` `0.1.66` 提示体系统一（REQ-202610-0469 / ui-06）：新增全局 Toast（`src/lib/toast-store.ts` + `ToastProvider`），按 success 2400ms / info 3000ms / warning 3600ms / error 4800ms 停留，最多 3 条，相同 `variant + message` 去重并重置计时；房间页复制、成功、错误、网络异常反馈全部改走 Toast，移除 `hint` 提示条与 `alert()`。
- Tooltip 统一悬停延时 500ms、移出宽限 120ms，键盘聚焦立即可见，支持 Esc 关闭与 `aria-describedby`；Popover 补齐 `role="dialog"`、滚动锁定、焦点圈定/归还与遮罩/Esc 关闭。
- `globals.css` 新增 Toast/Popover 语义化样式与仅动 `opacity`/`transform` 的入场动画，`prefers-reduced-motion` 下全部关闭；新增 `docs/design-system-notifications.md` 说明触发时机、时长、用法与验收清单；新增 Vitest 配置与 8 条 toast store 单测。

### 2026-10-17

- `0.1.65` 设计令牌体系重建（REQ-202610-0464 / ui-01）：`globals.css` 重建 10 级中性灰 primitive ramp 与语义 surface/line/ink/action 令牌，补齐圆角、4px 间距、阴影、动效时长/缓动及 success/warning/danger 状态色；全部令牌经 `@theme inline` 暴露为 Tailwind 工具类。
- 删除浅色模式 9 组 `!important` 覆写与 `--color-zinc-*` 反色 hack，双主题只切换 primitive ramp；主按钮按 dc-02 采用反色（深色白底黑字 / 浅色黑底白字）。
- 首页、房间页、头像与弹层完成语义化迁移（210+ 处旧颜色工具类）；二维码颜色改读 `--ds-qr-*`，广告默认色改为继承主题，头像色池去除蓝灰值；新增 `.btn-secondary`/`.btn-ghost`/`.btn-danger`/`.menu-*`/`.notice`/`.chip` 等共享组件类。

### 2026-10-13

- `0.1.64` 决策回写（REQ-202610-0463）：7 项决策结论（dc-01 ~ dc-07）同步至路线图与平台需求卡——更新 15 张、关闭 7 张决策卡、新增 6 张（REQ-202610-0747 ~ REQ-202610-0752）；UI 清单 46 → 49 条、上传清单 9 → 12 条；实施顺序定为「先上传后 UI」。
- `47fb770` 更新 `docs/development-plan-2026-10-13-roadmap.md`（决策结论 + §4 架构改写为 Vercel 原生分片，不建 CF Worker）；`package.json` / `src/lib/constants.ts` 版本同步至 `0.1.64`（docs-only，无功能变更）。
- `0.1.63` 发展路线规划（REQ-202610-0463）：产出 UI 全面改版（46 条）与上传通道重构（9 条）路线图及 7 张决策卡（含 Jev 校准），需求已回填平台（REQ-202610-0464 ~ REQ-202610-0525）。
- `bd453b2` 新增 `docs/development-plan-2026-10-13-roadmap.md`（含 file.sang.pub / pic.sl.al 实测协议附录）；`package.json` / `src/lib/constants.ts` 版本同步至 `0.1.63`（docs-only，无功能变更）。

### 2026-09-24

- `0.1.62` i18n 外壳收尾：底栏统计/移动端跳转按钮/文件下载文案接入 `t()`；新增预水合内联脚本，在首帧前同步 `<html data-theme>`/`<html lang>`，消除主题/语言默认值闪烁（FOUC）。
- `6501e6b` `layout.tsx` 注入 `PREHYDRATION_INIT` 内联脚本（读 `tb:theme`/`tb:lang`，`<html>` 加 `suppressHydrationWarning`）；`messages.ts` 新增 `footer.*`/`nav.rooms`/`chat.download`（zh+en）；`FileAction` 增加 `label` 属性。
- `0.1.61` 底部输入区 composer 重设计：focus 高亮环、文件 chip 显示大小、工具栏图标化、字数上限色阶提示、空内容禁用发送；composer 文案接入 i18n。
- `209b315` composer 文案接入 i18n（`composer.*` + `common.on/off`，zh+en）；回车发送开关加 `CornerDownLeft` 图标，发送按钮在无文本且无文件时禁用（与 `send()` 空内容 no-op 一致）。
- `0.1.60` 聊天消息气泡组件化：抽出复用 `MessageBubble`/`MessageAttachmentCard`，合并已发送与发送中两处重复标记（约 250 行）；气泡、时间戳与附件预览打磨。
- `fa8f6ea` 新增模块级哑组件 `MessageBubble` 与 `MessageAttachmentCard`（图片/视频内联预览 + 文件信息 + 可选动作位）；已发送气泡传 Check/CheckCheck 回执与 `FileAction` 下载，发送中气泡传 sending%/失败状态与错误脚注。
- `fa8f6ea` 聊天外壳文案接入 i18n：`chat.empty/copy/copied/expand/collapse/sendFailed`（zh+en，parity 校验）；聊天正文与后端错误仍不做双语。
- `0.1.59` 左侧房间导航栏可折叠（偏好持久化）；「管理/加入」标签改为分级折叠菜单（两组各带标题/数量/展开收起与快捷按钮）。
- `a4c1c9d` 导航栏折叠用 `flex`/`hidden` 切换、网格按左右两栏可见性四态自适应；头部加导航开关（`PanelLeft`）、栏内头部加收起按钮（`PanelLeftClose`），折叠态存 `tb:nav-collapsed`。
- `a4c1c9d` 房间列表改为「管理的房间/加入的房间」两个可折叠分组（`tb:nav-group-*` 持久化），抽出共享 `handleToggleRoomMenu`，`RoomLinks` 增加 `emptyLabel`，导航文案接入 `t()`。
- `0.1.58` 右侧成员栏支持折叠（偏好持久化）；房主设置区改为头部按钮触发的弹层面板（Popover），设置项文案接入 i18n。
- `863e5f6` 成员栏折叠用 `flex`/`hidden` 切换而非卸载（始终挂载），折叠状态存 `tb:members-collapsed`（`usePersistentBoolean` + `useSyncExternalStore`）；成员栏头部加折叠按钮、房主标签页改 `.segmented`。
- `863e5f6` 房主设置从右栏内联块迁移为 `Popover`（portal 到 body，规避 `<main>` 的 `xl:overflow-hidden` 裁剪，且不再随成员栏折叠而消失）；`globals.css` 补 `.popover-panel`；设置卡片（房间名称/门禁码/加入策略/过期）文案接入 `t()`。
- `0.1.57` 聊天页顶部控件区优化：房间头部动作按钮改纯图标 + 悬停提示气泡，主题/语言切换移至头部右上角，新增中/英语言切换。
- `9ebc887` 新增轻量客户端 i18n（`messages` 表 + Context，`useSyncExternalStore` 读 localStorage 规避水合不匹配）与复用组件 `IconButton`/`Tooltip`/`LanguageToggle`，`globals.css` 补 `.icon-btn`/`.tooltip-bubble`。
- `9ebc887` 主题切换重构为纯图标置于右上角；头部动作按钮（邀请/二维码/公告/管理/解散）改纯图标 + 提示气泡并接入 i18n；移除右侧栏内重复的主题设置区。
- `0.1.56` 全局 UI 优化：重制设计体系，登录页降噪，整体向 macOS 质感靠拢。
- `bb641cc` 重构 `globals.css`：分层设计令牌、`-apple-system` 字体栈、统一圆角/阴影/聚焦环、精修滚动条。
- `bb641cc` 日间主题基于 Apple 中性灰 + 系统蓝重制，zinc 工具类走 `--color-zinc-*` 自适应，去掉冗余 `!important`。
- `bb641cc` 登录页 `page.tsx`：卡片 `.surface-card`、输入 `.field`、分段 `.segmented`、主按钮 `.btn-primary`，收敛标题与动画噪声。
- `bb641cc` 聊天页 `room/[roomCode]/page.tsx` 主发送按钮改为 accent 主按钮，与登录页统一。

### 2026-04-16

- `0.1.55` 修复白天模式房间二维码被浅色遮罩/弹窗背景冲淡的问题，二维码改为黑码点白底显示。
- `0.1.55` 将独立主题设置区标题从“设置”改为“主题”，避免和房主设置区重复。
- `0.1.54` 修复成员列表滚动问题（非房主和房主视角）并开放主题设置权限给所有成员。
- `0eaf770` 非房主成员列表改为 `flex-1 overflow-y-auto`，始终显示滚动条，最大化利用垂直空间。
- `0eaf770` 房主审批列表改为 `flex-1 overflow-y-auto`，确保可滚动。
- `0eaf770` 房主设置区域添加 `max-h-[24rem] overflow-y-auto pr-1`，防止选项被顶下去。
- `0eaf770` 主题设置移到 isOwner 块外，所有成员都可以设置主题。

### 2026-03-28

- `本次迭代` 修复 12MB 左右图片上传失败问题：优先使用 S3 预签名直传，后端中转上传上限调整为 200MB。

### 2026-03-25

- `0.1.53` 修复房间解散后跳转逻辑：多房间场景自动跳转到排序中的下一个未解散房间，仅在无可用房间时回首页。
- `0.1.52` 无广告内容时，房间头部广告区域自动隐藏（不再显示占位条）。
- `0.1.51` 设置区开关统一为黑白灰配色（允许申请加入、永不过期）。
- `0.1.51` 房间头部新增广告文本上下滚动轮播，数据来源 `bendy_shadowsend_advertisement`。
- `0.1.51` 新增系统接口：`/getInfo`、`/offline`、`/changeAuth`。
- `0.1.51` 新增 auth 持久化表：`bendy_shadowsend_app_auth_config`（初始值来自 `APP_AUTH`，默认 `bendywork`）。

### 2026-03-24

- `本次迭代` 房间导航移除未读红点及后端未读计算，仅保留当前房间绿色标记（边缘部署场景降低实时计算压力）。

### 2026-03-22

- `76051c4` 修复 `bendy_shadowsend_*` 表缺失问题。
- `0d8be5c` 修复房间过期处理与用户创建逻辑。
- `275d68f` 更新构建脚本，加入 `prisma generate`。
- `1766dbb` 合并上游分支改动。
- `本次迭代` 修复剪贴板图片上传 `Failed to fetch`：新增服务端中转上传兜底，直传失败时自动回退。
- `本次迭代` 新增附件预览 URL 通道：支持对接 `OSS_PREVIEW_RPC_URL`（JSON-RPC）并提供精简请求参数。
- `本次迭代` 修复 S3 `getaddrinfo ENOTFOUND`：对非 AWS endpoint 自动使用 path-style，避免 `<bucket>.<endpoint>` 解析失败。
- `本次迭代` 增强网络错误日志：前端 `apiFetch/upload` 与服务端上传相关路由均输出详细错误上下文，便于快速定位。
- `本次迭代` 调整预览交互：图片/视频在聊天历史中直接内联展示，不再依赖点击“预览”按钮触发请求。
- `本次迭代` 新增 DUFS 图片分流：`image/*` 上传到 DUFS，非图片继续走 S3；聊天气泡改为左右两侧并支持发送进度、单勾已发送、双勾已读。

### 2026-03-21

- `466a36c` 并行加载用户信息并增加降级显示逻辑。
- `ff27606` 房主可修改门禁码并移除过期限制。
- `c7d0654` 实现临时加密聊天室完整功能。
- `e96148b` 初始化 Next.js 项目骨架。

## 说明

- 当前在线数按最近 2 分钟心跳统计。
- 房间自动销毁通过接口请求时触发清理（生产建议配合定时任务调用清理端点）。
- 本项目聚焦临时协作，不包含传统账号密码体系。

## License

MIT © 临时笨迪 contributors

## 版本号管理

### 修改版本号流程

1. 修改 `package.json` 的 `version` 字段：

```json
{
  "name": "bendy-shadowsend",
  "version": "0.1.54"  // 修改这里
}
```

2. 运行同步脚本：

```bash
node scripts/sync-version.js
```

3. 验证同步结果：

```bash
grep "version" package.json src/lib/constants.ts
```

> **重要**：`scripts/sync-version.js` 会自动将 `package.json` 的版本号同步到 `src/lib/constants.ts` 的 `APP_VERSION_PARTS`。

### 为什么需要同步脚本

- 项目的前后端都使用 `APP_VERSION` 常量来显示版本号
- `package.json` 是 npm 包管理的标准位置
- `src/lib/constants.ts` 是运行时读取版本号的位置
- 同步脚本确保两处始终保持一致，避免手动修改出错

### 发布 Tag（强制）

每次发布推送（合并 `master` 触发 Vercel 部署）都必须发布对应 tag；本项目所有 tag 一律以 `-ver` 结尾。

- 正常版本：`<version>-ver`，例如 `0.1.1640-ver`
- 修复版本：`<version>-fix-<次数>-ver`，例如 `0.1.164-fix-210-ver`

```bash
# 正常发布
npm run release:tag

# 修复发布（次数可省略，脚本自动取下一个序号）
npm run release:tag -- --fix 210

# 校验 HEAD 是否已有发布 tag
npm run release:tag -- --check
```

详细规范与参数见 `docs/release-tagging.md`。

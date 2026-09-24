# 聊天页深度 UI 重构计划（P4）

> 需求：REQ-202609-0071 全局页面优化 · 聊天房间页深度重构
> 基调：macOS 质感、黑白灰极简、人文关怀、艺术美感
> 定稿：2026-09-24
> 前置：P1–P3 已完成（globals.css 设计令牌与 `.surface-card`/`.field`/`.btn-primary`/`.segmented`；登录页降噪；发送按钮）

## 用户确认的关键决策
- **语言范围 = 框架 + 外壳翻译**：搭建客户端 i18n 框架与「中/英」切换按钮，翻译界面外壳（按钮/标签/菜单/设置文案）；聊天正文与后端错误提示暂不覆盖。默认语种 中文 + English。
- **交付节奏 = 每阶段完成即推 master**（触发 Vercel 生产部署）。每个阶段必须是自洽、可用、可上线的完整状态，不推「改到一半」的界面。

## 现状要点（勘查结论）
- `src/app/room/[roomCode]/page.tsx` 为 2804 行单文件客户端组件；气泡标记在「已发送 / 发送中」两处重复（~250 行），无独立 MessageBubble。
- `.surface-card`/`.field`/`.segmented` 已定义但聊天页几乎未采用（~317 处裸 zinc 工具类，Tab/输入/卡片全手写）。
- 顶部操作按钮全部为 图标+文字（共享 `Btn`）；无纯图标+tooltip；仅原生 `title`。
- 主题控件位于右侧受 `showManage` 门控的 aside 内——房主隐藏管理面板会同时丢失主题切换（缺陷，需外提）。
- 无任何 i18n：全部中文硬编码（聊天页约 110–150 处外壳字符串）。
- 主题：`theme-toggle.tsx` 用 localStorage `tb:theme` + `data-theme`；派发的 `tb-theme-change` 事件无人监听；无预水合脚本 → 浅色首屏 FOUC。
- 浮层：房间菜单用 `createPortal`；成员菜单绝对定位；模态各自手写；无共享 Tooltip/Popover。
- 图标：lucide-react 具名导入，无中心封装。

## 分阶段实施
> 每阶段收尾统一：改版本号 + README 更新记录 + MAINTAIN.md，本地 `lint`+`build` 通过，推 master。

### 阶段 1 — 基础设施 + 顶部控件区
- CSS：新增 tooltip（悬停延时 ~1s）、icon-button、popover 面板、collapsible 复用类；补齐令牌。
- i18n：`src/lib/i18n/`（zh/en messages、LanguageProvider、`useT` hook），持久化 `tb:lang`，同步 `<html lang>`；客户端切换，不走路由。
- 新组件：`LanguageToggle`、`Tooltip`、`IconButton`。
- 顶部：主题切换外提到右上角控件簇（顺带修复房主隐藏面板丢主题的缺陷）+ 新增语言切换。
- 头部操作（邀请/二维码/公告/管理/解散）由 图标+文字 → 纯图标 + 悬停 tooltip。
- 本阶段触及的外壳字符串接入 `t()`。

### 阶段 2 — 右侧成员栏：可折叠 + 设置弹层
- 成员栏可折叠（折叠/展开按钮，状态持久化）。
- 房主「设置」收成单独按钮 → 弹出 popover 面板（portal，复用浮层模式）：房间名 / 门禁码 / 允许申请加入 / 永不过期。
- 成员 / 审批 Tab 迁移 `.segmented`。

### 阶段 3 — 左侧导航：分级 + 可折叠
- 左栏可折叠；「房间列表 / 管理加入」做成分区、分级菜单（分组可折叠），迁移 `.segmented` 与分区标题。

### 阶段 4 — 聊天区 + 消息气泡
- 抽出共享 `MessageBubble` 组件（合并已发送 / 发送中重复标记）。
- 美化气泡、时间戳、送达双勾、图片 / 视频 / 文件预览；黑白灰质感。

### 阶段 5 — 底部输入区（composer）
- 重做输入区：文件 chip、工具条（附件 / 剪贴板 / 回车发送 / 字数）、发送按钮；macOS 手感。

### 阶段 6 — i18n 外壳收尾 + 打磨
- 清扫聊天页剩余外壳字符串接入 `t()`，确保中 / 英外壳完整（聊天正文、后端错误按决策不覆盖）。
- 视觉一致性终检；补主题 / 语言预水合脚本修 FOUC。

## 约束
- 纯前端改动，不动线上 Vercel 配置与环境变量（新增 `tb:lang` 仅前端 localStorage）。
- 不改 API 契约、不动数据库、不改 master 以外的他人分支。
- 任何 token 不回显、不入提交。
- Next 16 有破坏性变更：改 layout / provider / 预水合脚本前先查 `node_modules/next/dist/docs/`。

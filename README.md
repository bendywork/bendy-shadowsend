# 临时笨迪 (Temporary Bendy)

基于 **Next.js + PostgreSQL + Prisma + S3** 的临时加密聊天室，前后端一体。

> 目标：临时传递信息（文本 + 文件），房间短生命周期，低心智负担，便于快速协作。

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
  - 房主：可踢人、可邀请、可审批再次加入。
  - 成员：可邀请，不可踢人。
- 房间顶部五按钮：
  - `邀请`：复制当前房间加入链接。
  - `二维码`：生成当前房间加入链接二维码，扫码后可在浏览器打开。
  - `公告`：房主可配置公告文本与图片。
  - `管理`：房主切换右侧成员管理面板显示/隐藏。
  - `解散`：房主确认后解散房间（逻辑删除）。
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

## 技术栈

- Next.js (App Router, TypeScript)
- React 19
- Prisma + PostgreSQL
- AWS SDK v3 (S3 兼容存储)
- Tailwind CSS v4

## 快速开始

## 1. 安装依赖

```bash
npm install
```

## 2. 配置环境变量

复制 `.env.example` 为 `.env` 并按实际环境修改：

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## 3. 初始化数据库

```bash
npm run prisma:generate
npm run prisma:migrate
```

## 4. 启动开发

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 目录结构

```text
src/
  app/
    api/                    # 后端接口（Next Route Handlers）
    room/[roomCode]/        # 房间页
    page.tsx                # 首页（创建/加入）
  components/chat/          # 聊天 UI 组件
  lib/                      # 核心逻辑（鉴权、加密、S3、规则）
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
- `MessageAttachment`: 文件元数据与 S3 Key
- `Presence`: 在线状态统计

## 数据库前缀与重置

- 所有业务表统一前缀：`bendy_shadowsend_`
- 所有业务枚举统一前缀：`bendy_shadowsend_`
- 已提供重初始化脚本（仅影响该前缀对象）：

```bash
npm run db:reinit:prefixed
```

## 说明

- 当前在线数按最近 2 分钟心跳统计。
- 房间自动销毁通过接口请求时触发清理（生产建议配合定时任务调用清理端点）。
- 本项目聚焦临时协作，不包含传统账号密码体系。

## License

MIT ? 临时笨迪 contributors


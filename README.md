# 临时笨迪 (Temporary Bendy)

基于 **Next.js + PostgreSQL + Prisma + S3** 的临时加密聊天室，前后端一体。

> 目标：临时传递信息（文本 + 文件），房间短生命周期，低心智负担，便于快速协作。

## 项目图

![首页创建/加入](public/2.png)

## 技术栈

- Next.js 16 (App Router, TypeScript)
- React 19
- Prisma + PostgreSQL
- AWS SDK v3 (S3 兼容存储)
- Tailwind CSS v4

## S3 配置教程（先配这个）

### 1. 准备对象存储

- 可使用 AWS S3、MinIO、Ceph、腾讯云 COS（S3 兼容模式）。
- 先创建一个 Bucket（例如 `bendy-temp`）。
- 创建访问密钥（Access Key / Secret Key），授予该 Bucket 的读写权限。

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填写以下 S3 变量：

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `S3_REGION` | 否 | 区域（可不填，默认空值） |
| `S3_ENDPOINT` | 是 | S3 API 地址，例如 `https://s3.amazonaws.com` 或 `https://<account>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | 是 | Bucket 名称 |
| `S3_ACCESS_KEY_ID` | 是 | 访问 Key |
| `S3_SECRET_ACCESS_KEY` | 是 | Secret Key |
| `S3_FORCE_PATH_STYLE` | 建议配置 | 示例：`true`（推荐给 MinIO/Ceph/自建 S3）；AWS S3 常用 `false` |
| `DUFS_BASE_URL` | 否 | 图片专用文件服务地址（DUFS），例如 `https://ykujzozhxkva.ap-southeast-1.clawcloudrun.com` |
| `DUFS_PUBLIC_BASE_URL` | 否 | 图片对外访问地址（默认等于 `DUFS_BASE_URL`） |
| `DUFS_PATH_PREFIX` | 否 | DUFS 路径前缀（例如部署在 `/dufs` 或需要写入 `/data` 时） |
| `DUFS_AUTH` | 否 | DUFS 上传鉴权头（完整 Authorization 值） |
| `OSS_PREVIEW_RPC_URL` | 否 | 预览 URL 的 JSON-RPC 接口地址（例如 `https://www.hi168.com/api/user/oss/preview/url`） |
| `OSS_PREVIEW_BUCKET_NAME` | 否 | 调用预览 RPC 时使用的 bucket（默认跟 `S3_BUCKET` 一致） |
| `OSS_PREVIEW_COOKIE` | 否 | 预览 RPC 鉴权 Cookie（不填时会转发当前请求 Cookie） |

> 说明：部分自建或兼容 S3 服务不要求 region，可直接不配置 `S3_REGION`。
> 
> `S3_FORCE_PATH_STYLE` 推荐先填 `true`（尤其是自建 S3 或 IP/内网 endpoint）；若你的服务要求虚拟主机风格再改为 `false`。
> 
> 若把 `S3_FORCE_PATH_STYLE=false` 用在非 AWS endpoint，可能触发 `getaddrinfo ENOTFOUND <bucket>.<endpoint>`。项目已对非 AWS endpoint 自动回退到 path-style，优先保证上传成功。
>
> 当前上传策略：
>
> - `image/*`：固定走后端中转上传接口（`/api/rooms/[roomCode]/upload`），并写入 DUFS（不走 S3）。
> - 非图片文件：
>   - 若已配置 S3：优先走 S3 预签名直传；失败时（且文件不超过 `200MB`）回退后端中转。
>   - 若未配置 S3 且已配置 DUFS：直接走 DUFS（经后端中转）。
> - 公告图片与普通图片文件使用同一套策略（即图片固定走 DUFS）。
>
> 单文件大小上限为 `10GB`（服务端会校验）。
>
> 若 DUFS 上传返回 `403 Forbidden`：优先检查 `dufs` 启动参数是否包含 `--allow-upload`，并确认账户权限是 `:rw`；若服务有路径前缀，请设置 `DUFS_PATH_PREFIX`。

### 3. 推荐配置样例

MinIO 本地：

```env
S3_REGION=
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=bendy-temp
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
DUFS_BASE_URL=
DUFS_PUBLIC_BASE_URL=
DUFS_PATH_PREFIX=
DUFS_AUTH=
```

AWS S3：

```env
S3_REGION=ap-southeast-1
S3_ENDPOINT=https://s3.ap-southeast-1.amazonaws.com
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
```

可选：第三方预览 URL（JSON-RPC）配置示例：

```env
OSS_PREVIEW_RPC_URL=https://www.hi168.com/api/user/oss/preview/url
OSS_PREVIEW_BUCKET_NAME=hi168-27979-3306shvc
OSS_PREVIEW_COOKIE=
```

精简后的请求（服务端实际只需这些）：

```bash
curl 'https://www.hi168.com/api/user/oss/preview/url' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'cookie: <your-cookie-if-needed>' \
  --data-raw '{"jsonrpc":"2.0","method":"call","params":{"bucket_name":"hi168-27979-3306shvc","file_key":"3_1.png","file_size":116292,"file_type":"image/png","file_name":"3_1.png"},"id":null}'
```

> 实测不带有效会话 Cookie 会返回 `Session Expired`，因此该接口通常需要登录态（`OSS_PREVIEW_COOKIE` 或转发当前请求 Cookie）。

### 4. 验证是否配置成功

- 启动项目后进入房间，上传任意文件。
- 文件消息能正常显示且可下载，说明 S3 签名 URL 与存储访问正常。
- 若报错 `S3_NOT_CONFIGURED`，说明必填项缺失或格式错误。
- 若前端提示 `Failed to fetch`：项目会自动回退到后端中转上传接口（`/api/rooms/[roomCode]/upload`），当前中转上限为 `200MB`。超过该大小请优先检查 S3 CORS 与网络策略，确保直传链路可用。
- 生产环境建议优先使用 `HTTPS` 的 `S3_ENDPOINT`，可减少浏览器混合内容拦截与 CORS 问题。
- 网络请求出错时：前端会在浏览器控制台输出 `apiFetch`/`upload` 详细上下文；服务端会在 Vercel Function Logs 打印路由级和 S3 级错误细节。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 3. 启动开发

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## Vercel 部署指南

### 1. 构建方式

- 项目已在 `vercel.json` 指定：

```json
{
  "buildCommand": "npm run vercel-build"
}
```

- `npm run vercel-build` 现在是智能流程（`scripts/vercel-build.mjs`）：
  - 先检查迁移状态（`prisma migrate status`）
  - 只有检测到待执行迁移时才运行 `prisma migrate deploy`
  - 若部署并发导致 advisory lock 超时，会自动重试并二次检查是否已被其他部署应用
  - 最后执行 `prisma generate` 和 `next build`

### 2. Vercel 需要配置的环境变量

至少在 **Production / Preview / Development** 三个环境都配置以下变量（`S3_REGION` 可选）：

| 变量名 | 必填 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | Prisma 数据库连接串 |
| `CHAT_ENCRYPTION_KEY` | 是 | 聊天消息加密 Key（至少 32 字符） |
| `S3_REGION` | 否 | S3 区域（可不填，默认空值） |
| `S3_ENDPOINT` | 是 | S3 兼容 API Endpoint |
| `S3_BUCKET` | 是 | Bucket 名称 |
| `S3_ACCESS_KEY_ID` | 是 | S3 Access Key |
| `S3_SECRET_ACCESS_KEY` | 是 | S3 Secret Key |
| `S3_FORCE_PATH_STYLE` | 建议 | 示例：`true`（自建 S3 常用）/ `false`（AWS S3 常用） |
| `DUFS_BASE_URL` | 可选 | 图片专用 DUFS 服务地址 |
| `DUFS_PUBLIC_BASE_URL` | 可选 | 图片公开访问地址（默认同 DUFS_BASE_URL） |
| `DUFS_PATH_PREFIX` | 可选 | DUFS 路径前缀（如 `/dufs` 或 `/data`） |
| `DUFS_AUTH` | 可选 | DUFS 上传 Authorization 头 |
| `OSS_PREVIEW_RPC_URL` | 可选 | 外部预览 URL 的 JSON-RPC 接口 |
| `OSS_PREVIEW_BUCKET_NAME` | 可选 | 外部预览接口使用的 bucket 名 |
| `OSS_PREVIEW_COOKIE` | 可选 | 外部预览接口鉴权 Cookie |
| `NEXT_PUBLIC_APP_VERSION` | 可选 | 前端展示版本号 |
| `FORCE_DB_MIGRATE` | 可选 | `true` 时强制执行迁移（默认不强制） |
| `PRISMA_MIGRATE_RETRIES` | 可选 | 迁移锁冲突重试次数（默认 `3`） |
| `PRISMA_MIGRATE_RETRY_DELAY_MS` | 可选 | 每次重试间隔毫秒（默认 `4000`） |

> 说明：项目运行时会优先读取 `DATABASE_URL`，若缺失会回退 `POSTGRES_PRISMA_URL` 或 `POSTGRES_URL`。生产环境仍建议显式配置 `DATABASE_URL`。
> 
> 默认部署策略是“无待执行迁移就跳过迁移”，仅在有新 migration 或你手动设置 `FORCE_DB_MIGRATE=true` 时修改数据库结构。

### 3. 部署步骤

1. 将仓库导入 Vercel。
2. 在 Vercel 项目设置中补齐上述环境变量（尤其是 S3 变量）。
3. 触发重新部署。
4. 部署成功后，创建房间并上传文件进行连通性验证。

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

## 更新记录

> 维护约定：每次迭代（功能、修复、部署调整）都必须同步补充本节。
>
> 推荐格式：`日期 + commit + 变更摘要`。

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

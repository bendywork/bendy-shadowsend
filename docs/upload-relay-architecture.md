# 上传服务端转发与分片编排（REQ-202610-0512 / up-03）

## 1. 范围

本迭代在 Vercel 应用内实现第三方上传通道的服务端转发与分片编排，不新增任何基础设施：

- 单请求文件（≤ 4MB）直接转发到 `file.sang.pub`（图片）或 `pic.sl.al`（非图片）。
- 超限文件按 4MB/片拆分，由浏览器逐片调用同一应用的路由，每片仍是一次 ≤ 4.5MB 的 Vercel 函数请求。
- 上传会话使用 HMAC-SHA256 签名的无状态 token，不新增数据库表。
- 完成时由客户端回传分片清单，服务端校验片数、顺序、大小与 URL 域名后返回 manifest。

本迭代只提供转发/编排层，不包含：前端上传 UI 接入（up-05）、附件持久化与 `AttachmentStorage` 枚举迁移（up-08）、合并下载（up-04/up-10）、并发续传（up-11）。这些任务可以直接复用本层的会话与 manifest 契约。

## 2. 数据流

```
浏览器
  │  ① POST /upload/forward（≤4MB，multipart file）
  │     或 POST /upload/sessions → ② 逐片 POST /upload/sessions/chunk（4MB/片）
  ▼
Next.js Route Handler（Vercel Function，请求体 ≤4.5MB）
  │  来源校验 → 用户/房间成员校验 → 限流 → 配额 → 类型/大小校验
  ▼
file.sang.pub /api/upload        或        pic.sl.al /api/upload-token + /api/upload
  │
  ▼
第三方直链（公网可读，接收方下载不经过本应用）
```

## 3. API

所有路由都位于 `/api/rooms/[roomCode]/upload` 下，只接受 `POST`。

### 3.1 单请求转发

`POST /api/rooms/[roomCode]/upload/forward`

- `Content-Type: multipart/form-data`
- 表单字段：`file`
- 成功响应：

```json
{
  "ok": true,
  "data": {
    "service": "sang",
    "storage": "SANG",
    "fileName": "photo.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 123456,
    "url": "https://xiuxiu-pro-new.meitudata.com/posters/xxx.png",
    "chunked": false
  }
}
```

- 文件 > 4MB 返回 `413 CHUNKED_UPLOAD_REQUIRED`，客户端应改用分片会话。

### 3.2 创建分片会话

`POST /api/rooms/[roomCode]/upload/sessions`

```json
{
  "fileName": "archive.zip",
  "mimeType": "application/zip",
  "sizeBytes": 104857600
}
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "session": "<base64url-payload>.<base64url-signature>",
    "service": "pic-sl",
    "storage": "PIC_SL",
    "chunkSize": 4194304,
    "totalChunks": 25,
    "lastChunkBytes": 4194304,
    "expiresAt": 1760000000000
  }
}
```

会话有效期 2 小时。会话 token 内含 `sid / roomId / userId / service / storage / fileName / mimeType / totalBytes / chunkSize / totalChunks / issuedAt / expiresAt`，服务端不保存会话状态。

### 3.3 上传分片

`POST /api/rooms/[roomCode]/upload/sessions/chunk`

- `Content-Type: multipart/form-data`
- 表单字段：
  - `session`：创建会话时返回的 token
  - `chunkIndex`：从 0 开始的十进制索引
  - `file`：该片内容
- 每片大小必须精确等于会话规划的 `chunkSize`，最后一片等于 `lastChunkBytes`。
- 成功响应：

```json
{
  "ok": true,
  "data": {
    "index": 0,
    "url": "https://pic.sl.al/f/pic/2026-10-18/xxx",
    "sizeBytes": 4194304
  }
}
```

分片在第三方服务上是独立文件，文件名由服务端生成：

- `sang`：`<stem>.part000`（不带原扩展名，避免落入 icve 的 HTML/HTM 黑名单）
- `pic-sl`：`<stem>.part000.<ext>`

### 3.4 完成并生成 manifest

`POST /api/rooms/[roomCode]/upload/sessions/complete`

```json
{
  "session": "<token>",
  "chunks": [
    { "index": 0, "url": "https://pic.sl.al/f/pic/.../a", "sizeBytes": 4194304 },
    { "index": 1, "url": "https://pic.sl.al/f/pic/.../b", "sizeBytes": 1000 }
  ]
}
```

服务端校验：

1. 会话签名、有效期、房间与用户归属；
2. 分片数量等于 `totalChunks`；
3. 索引必须从 0 连续递增且不重复；
4. 每片大小等于规划值；
5. 每片 URL 必须属于所选服务的允许域名（仅 HTTPS）。

通过后返回 `UploadManifest`：

```json
{
  "ok": true,
  "data": {
    "uploadId": "<session sid>",
    "service": "pic-sl",
    "storage": "PIC_SL",
    "fileName": "archive.zip",
    "mimeType": "application/zip",
    "sizeBytes": 104857600,
    "chunkSize": 4194304,
    "totalChunks": 25,
    "chunks": [{ "index": 0, "url": "https://...", "sizeBytes": 4194304 }]
  }
}
```

## 4. 校验与限额

| 项目 | 规则 |
| --- | --- |
| 单请求体 | ≤ 4MB（应用层），Vercel 硬上限 4.5MB |
| 分片大小 | 4MB |
| 最大分片数 | 50（对应 pic.sl.al 200MB） |
| sang 上限 | 100MB；meitu 通道仅 jpg/jpeg/png/gif/webp 且 ≤20MB |
| pic.sl.al 上限 | 200MB |
| 扩展名 | sang 拒绝 html/htm；pic-sl 拒绝可执行/脚本/活动内容扩展名 |
| 限流 | 每用户固定窗口 180 次/分钟（进程内） |
| 每日配额 | 每用户 2GB/24h（按已持久化附件累计） |
| 会话有效期 | 2 小时 |
| 第三方重试 | 最多 3 次，指数退避 400ms 起，尊重 `Retry-After`（上限 3s） |

## 5. 来源校验

上传路由要求请求携带 `Origin` 或 `Referer`，其 host 必须命中以下任一来源：

- 当前请求的 `Host`；
- `X-Forwarded-Host` 的第一个值；
- `UPLOAD_ALLOWED_ORIGINS` 中逗号分隔的额外来源。

`Sec-Fetch-Site: cross-site` 一律拒绝。该校验用于阻断跨站请求伪造与第三方页面盗用上传通道。

## 6. 配置

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `UPLOAD_ALLOWED_ORIGINS` | 否 | 额外允许的上传来源，逗号分隔，例如 `https://shadowsend.example.com` |
| `UPLOAD_SESSION_SECRET` | 否 | 会话签名密钥（≥16 字符）；未配置时回退 `CHAT_ENCRYPTION_KEY` |

生产环境建议单独配置 `UPLOAD_SESSION_SECRET`，避免与聊天加密密钥共用。

## 7. 已知边界

- **持久化**：路由返回 `storage`，由客户端连同 `s3Key` / `chunkManifest` 提交并写入 `MessageAttachment`；旧存储枚举已在 up-12 移除。
- **manifest 为客户端回传**：在无新增表的前提下，服务端只能校验结构与域名，无法证明某片确实由本服务上传；落库时应结合 up-08/up-10 的完整性校验。
- **每日配额统计**：当前聚合已持久化附件的 `sizeBytes`；在 up-08 落库前，新通道上传不会计入配额。落库后自动生效。
- **限流与 token 缓存是进程内状态**：Vercel 多实例下为近似限流；`pic.sl.al` token 按实例缓存（有效期 600s，提前 30s 刷新），不跨实例共享。
- **第三方无 SLA**：按 dc-06 只做同服务有限重试，失败时返回明确错误，不做跨服务兜底。

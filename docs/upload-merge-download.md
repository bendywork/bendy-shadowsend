# 接收方合并下载（REQ-202610-0513 / up-04）

## 1. 范围

本迭代在 up-03 的转发/分片编排之上，补齐「接收方合并下载端点」：

- `POST /upload/sessions/complete` 在返回 manifest 的同时签发合并下载令牌与下载地址。
- `GET /api/rooms/[roomCode]/attachments/merge?manifest=<token>` 按 manifest 顺序逐片拉取第三方分片，以流式响应拼接输出。
- 响应带 `Content-Disposition: attachment`，浏览器点击链接即可一键保存为原始文件名。
- 不新增数据库表、不引入新基础设施。

不在本迭代范围：

- 附件落库与 `AttachmentStorage` 枚举迁移（up-08）；
- 哈希/完整性校验与缺失补传（up-10）；
- 分片并发上传与断点续传（up-11）；
- 前端上传 UI 接入（up-05）。

## 2. 数据流

```
上传方
  │ complete(session, chunks[])
  ▼
complete 路由校验分片 → 生成 manifest → 签发 mergeToken → 返回 mergeUrl
  │
  │ mergeUrl 随消息/分享链接交给接收方
  ▼
接收方 GET /attachments/merge?manifest=<token>
  │ 房间成员校验 → 令牌验签 → 房间绑定校验
  ▼
按 chunks[0..n-1] 顺序 fetch 第三方直链
  │ 每片校验 content-length / 实际字节数
  ▼
ReadableStream 逐片 enqueue → 浏览器下载为原文件名
```

## 3. API

### 3.1 完成上传

`POST /api/rooms/[roomCode]/upload/sessions/complete`

请求与 up-03 相同。成功响应在 manifest 基础上新增：

```json
{
  "ok": true,
  "data": {
    "uploadId": "…",
    "service": "pic-sl",
    "storage": "PIC_SL",
    "fileName": "archive.zip",
    "mimeType": "application/zip",
    "sizeBytes": 104857600,
    "chunkSize": 4194304,
    "totalChunks": 25,
    "chunks": [{ "index": 0, "url": "https://…", "sizeBytes": 4194304 }],
    "mergeToken": "m1.…",
    "mergeUrl": "/api/rooms/<roomCode>/attachments/merge?manifest=m1.…"
  }
}
```

`mergeUrl` 是相对路径，前端可直接作为下载链接使用（同源、携带房间成员 Cookie）。

### 3.2 合并下载

`GET /api/rooms/[roomCode]/attachments/merge?manifest=<mergeToken>`

- 需要当前用户是房间成员（与既有附件下载一致）。
- 令牌中的 `roomId` 必须与路径中的房间一致。
- 成功：`200`，流式响应，头信息：

| Header | 值 |
| --- | --- |
| `Content-Type` | manifest 的 `mimeType` |
| `Content-Length` | manifest 的 `sizeBytes`（逐片校验后保证一致） |
| `Content-Disposition` | `attachment; filename="…"; filename*=UTF-8''…` |
| `Cache-Control` | `private, no-store` |
| `X-Content-Type-Options` | `nosniff` |

- 失败：统一 `{ ok: false, error: { code, message } }` JSON；若分片在响应开始后失败，流会被 `error` 终止，浏览器将下载标记为失败。

错误码：

| 场景 | HTTP | code |
| --- | --- | --- |
| 缺少令牌 | 400 | `MERGE_TOKEN_MISSING` |
| 令牌格式/签名/内容无效 | 400 | `MERGE_TOKEN_INVALID` / `MERGE_TOKEN_SIGNATURE` |
| 令牌与房间不匹配 | 403 | `MERGE_ROOM_MISMATCH` |
| 密钥未配置 | 503 | `MERGE_SECRET_MISSING` |
| 第三方分片不可用/长度不符 | 502 | `MERGE_CHUNK_*` |

## 4. 令牌格式

```
m1.<base64url(deflateRaw(JSON payload))>.<base64url(HMAC-SHA256("m1." + body, secret))>
```

payload：

```json
{
  "v": 1,
  "roomId": "<房间 ID>",
  "issuedAt": 1760000000000,
  "manifest": { "...": "UploadManifest" }
}
```

约束：

- 使用 `UPLOAD_SESSION_SECRET`（未配置时回退 `CHAT_ENCRYPTION_KEY`）。
- `timingSafeEqual` 验签；`inflateRawSync` 限制解压后 ≤64KB，防压缩炸弹。
- 令牌总长度 ≤16KB；50 片 200MB 的 manifest 压缩后远低于上限。
- 令牌不单独设置过期时间：下载能力与房间成员身份绑定，房间销毁后端点即不可用。轮换 `UPLOAD_SESSION_SECRET` 可使全部旧令牌失效。

## 5. 流式拼接与校验

1. 先拉取第 0 片，确认 HTTP 成功、最终 URL 仍在服务白名单内、`content-length`（若有）与 manifest 一致，再开始响应，尽量把错误暴露在响应头之前。
2. 按 `chunks` 顺序逐片 `fetch`，每片读完后校验实际字节数等于 manifest 的 `sizeBytes`；多读或少读都会终止流。
3. 单请求总长度等于 `manifest.sizeBytes`，与浏览器下载的文件大小一致。
4. 单分片超时 30s；客户端取消下载时通过 `AbortController` 中止当前上游请求。
5. 重定向使用 `redirect: "manual"`：先校验 `Location` 的域名白名单再跟随（最多 3 跳），并对最终响应 URL 复核，防止第三方把请求引到白名单外。

## 6. 安全边界

- 合并端点要求房间成员 Cookie，未登录/非成员无法下载。
- 令牌是 HMAC 签名的能力凭证；泄露令牌等价于泄露该文件的下载链接，但下载仍需房间成员身份。
- 分片 URL 只允许 `sang`（`meitudata.com` / `icve.com.cn` / `sang.pub`）或 `pic-sl`（`pic.sl.al`）的 HTTPS 地址。
- 文件名经 `sanitizeUploadFileName` 清洗，`Content-Disposition` 同时提供 ASCII 回退与 RFC 5987 编码，阻断响应头注入。
- 不缓存合并结果，避免多用户间串数据。

## 7. 已知边界

- **未落库**：本迭代不写 `MessageAttachment`，`mergeUrl` 由 complete 响应返回；持久化在 up-08 完成。
- **无哈希校验**：当前只校验片数/顺序/大小/域名；SHA-256 完整性校验与缺失补传属于 up-10。
- **无断点续传**：合并下载每次从头开始；上传侧并发/续传属于 up-11。
- **第三方可用性**：分片直链由第三方提供，无 SLA；失败时返回明确 502，不做跨服务回退（dc-06）。
- **令牌不可单独撤销**：只能通过轮换密钥整体失效；如需单文件撤销，需在 up-08 落库后增加状态位。

## 8. 测试

`src/lib/upload/merge.test.ts` 覆盖 21 条：

- 令牌往返、房间绑定、篡改/错误密钥/畸形/超长令牌；
- 50 片 200MB manifest 的令牌长度；
- manifest 片数、顺序、大小、服务限额、URL 白名单校验；
- `Content-Disposition` ASCII 回退、RFC 5987 编码与头注入清洗；
- 流式拼接顺序、首片失败、`content-length` 不符、截断、白名单内重定向、重定向越界与最终 URL 越界；
- `normalizeUploadError` 对合并错误的映射。

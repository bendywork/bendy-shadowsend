# 非图片上传接入 pic.sl.al（up-02）

> 需求：`REQ-202610-0511` · 阶段一 · 依据 `docs/development-plan-2026-10-13-roadmap.md` §4.5 / 附录 B
> 决策：dc-01 = B（不新建中转组件，token 获取与转发均在 Vercel 服务端完成）

## 1. 范围

- 非图片附件（文档、压缩包、音视频等）的主上传路径改为 `pic.sl.al`。
- 图片附件统一走 `file.sang.pub`；旧存储链路已在 up-12 移除。
- 本阶段单请求上限按 Vercel Functions 的 4.5MB 约束收敛为 **4MB**；超过 4MB 的文件明确报错，等待 up-04 分片编排，不做跨服务静默回退（dc-06 = A）。
- 新增 `AttachmentStorage.PIC_SL` 枚举值，`s3Key` 复用为 pic.sl.al 公网直链。

## 2. 协议封装

服务端实现：`src/lib/pic-sl.ts`；纯规则：`src/lib/pic-sl-rules.ts`。

### 2.1 两段式上传

1. `POST https://pic.sl.al/api/upload-token`
   - Header：`Referer: https://pic.sl.al/`、`X-Requested-With: XMLHttpRequest`、固定 `User-Agent`。
   - 响应：`{ ok: true, token, expires_in: 600 }`，同时下发 `__Host-imgsess` cookie。
   - JWT 与 `User-Agent` 绑定，换取 token 与上传必须使用同一个 UA。
2. `POST https://pic.sl.al/api/upload`
   - Header：`X-Filename`、`X-Upload-Token`、`X-Requested-With`、`Content-Type`、`Cookie`。
   - Body：原始文件字节（不能是 `multipart/form-data`，也不能让 `Content-Type` 回落为 `application/x-www-form-urlencoded`）。
   - 响应：`{ success: true, data: { url, file_id, path, ... } }`。

### 2.2 Token 与 cookie 处理

- 实测 token **一次性**：同一个 token 第二次上传返回 `403`；上传失败（含 415）也会消耗 token。因此：
  - 每次上传尝试都获取新 token；
  - 模块内只保留「未使用」的单次令牌槽位，取走即清空；
  - 取走令牌后预取下一枚，降低连续上传的等待时间；
  - `__Host-imgsess` cookie 在 token 请求与上传请求之间复用，由 token 响应持续刷新。
- token 过期时间取响应 `expires_in`（默认 600s），使用前预留 5s 余量。

### 2.3 远端文件名

`X-Filename` 只接受 ASCII。实测直接发送中文会变成乱码，URL 编码后又会把 `%E6...` 原样写进远端文件名。因此：

- 远端文件名由 `buildPicSlRemoteFileName()` 生成：保留原扩展名，主体清洗为 ASCII，追加时间戳与随机串；
- 原始文件名保存在本地 `MessageAttachment.fileName`，消息展示与下载仍使用原名。

### 2.4 重试

- 最大 3 次尝试，每次使用新 token。
- 可重试状态码：`408, 409, 429, 500, 502, 503, 504, 520, 522, 524`。
- `401/403` 视为 token 失效，换新 token 重试。
- 支持 `Retry-After`（秒数或 HTTP 日期），单次等待上限 10s；无该头时按 300ms 指数退避。
- `413/415` 不重试，直接返回明确错误。
- 网络异常与超时按可重试处理；上传请求超时 45s。

## 3. 服务端路由

`POST /api/rooms/[roomCode]/upload/pic-sl`

- 鉴权：与现有上传路由一致（房间 ACTIVE + 房间成员）。
- 请求头：
  - `X-File-Name`：`encodeURIComponent(原始文件名)`
  - `X-File-Type`：MIME（非法值回退 `application/octet-stream`）
  - `X-File-Size`：字节数
- 请求体：原始文件字节。
- 校验：
  1. 扩展名必须在 pic.sl.al 的 58 项白名单内；
  2. 声明大小 ≤ 200MB；
  3. 声明大小、`Content-Length`、实际读取大小均 ≤ 4MB；
  4. 声明大小与实际大小一致。
- 成功响应：

```json
{
  "ok": true,
  "data": {
    "s3Key": "https://pic.sl.al/f/pic/YYYY-MM-DD/fileid_xxx",
    "fileName": "原始文件名.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 12345,
    "storage": "PIC_SL",
    "previewUrl": null
  }
}
```

### 错误码

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `PIC_SL_FILE_NAME_MISSING` / `PIC_SL_FILE_NAME_INVALID` | 文件名缺失或编码非法 |
| 400 | `PIC_SL_FILE_SIZE_INVALID` / `PIC_SL_FILE_SIZE_MISMATCH` | 大小声明非法或与实际不一致 |
| 413 | `PIC_SL_CHUNK_REQUIRED` | 超过 4MB，等待 up-04 分片 |
| 413 | `PIC_SL_FILE_TOO_LARGE` | 超过 pic.sl.al 200MB 上限 |
| 415 | `PIC_SL_UNSUPPORTED_TYPE` | 扩展名不在白名单 |
| 429 | `PIC_SL_RATE_LIMITED` | 上游限流，已有限重试后仍失败 |
| 502 | `PIC_SL_TOKEN_ERROR` / `PIC_SL_TOKEN_INVALID` / `PIC_SL_NETWORK_ERROR` / `PIC_SL_UPSTREAM_ERROR` / `PIC_SL_INVALID_RESPONSE` | 上游故障或返回非法地址 |

## 4. 读取与兼容

- `AttachmentStorage.PIC_SL` 已加入 Prisma 枚举（迁移 `20261018130000_add_pic_sl_storage`）。
- 下载/预览：直接返回或 307 跳转 `s3Key` 中的 pic.sl.al 公网直链，不经中转层（roadmap §4.3「下载侧」）。
- 公告图片：若历史/异常数据为 `PIC_SL`，公告图片路由同样支持跳转。
- 旧 `S3` / `DUFS` 代码与配置已在 up-12 彻底移除。

## 5. 前端接入

- `src/app/room/[roomCode]/page.tsx` 的 `upload()`：`image/*` 走原链路；其余文件走 `uploadByPicSl()`。
- `uploadByPicSl()` 使用 XHR 发送原始文件体，复用现有进度回调；4MB/扩展名在客户端先校验并给出 i18n 提示。
- 新增文案：`toast.uploadUnsupportedType`、`toast.uploadChunkPending`。

## 6. 测试

- `src/lib/pic-sl-rules.test.ts`：58 项白名单、扩展名大小写、远端文件名 ASCII 化、直链校验、MIME 规范化。
- `src/lib/pic-sl.test.ts`：token/上传请求头、cookie 透传、UA 一致性、503 重试 + `Retry-After`、403 换 token、415 不重试、非法返回地址、`Retry-After` 解析。
- `src/lib/validators.test.ts`：`sendMessageSchema` 接受 `PIC_SL`。
- 2026-10-18 已用真实 pic.sl.al 完成一次端到端上传（`live-test.txt`），返回 `https://pic.sl.al/f/...` 且可公网直读。

## 7. 后续

- up-04：>4MB 文件按 ≈4MB/片分片，逐片转发后在接收端合并下载。
- up-05：上传进度/失败重试 UI 统一接入。
- up-06：上传前类型/大小/扩展名校验与服务规则对齐（本阶段已在客户端与服务端各做一层）。
- up-08：分片 manifest 存储设计。

# 接收端合并下载与完整性校验（REQ-202610-0750 / up-10）

## 1. 范围

在 up-04 的合并下载端点与 up-08 的 `chunkManifest` 落库之上，补齐接收端可靠性闭环：

- 一键下载并保存为原文件名（继续复用 `GET /attachments/merge` 流式拼接）。
- 每片 SHA-256 完整性校验：上传时计算、完成时签名进 manifest、合并时逐片复核。
- 缺失/损坏分片返回明确错误与分片序号，并支持原上传者补传单片后重试。
- 大文件下载进度提示（前端 `fetch` + `ReadableStream`，按已接收字节计算百分比）。
- 不新增数据库表；补传只更新 `MessageAttachment.chunkManifest` 与首片 `s3Key`。

## 2. 完整性链路

```
分片上传 POST /upload/sessions/chunk
  │ 服务端读取分片字节 → SHA-256 → 随响应返回 { index, url, sizeBytes, sha256 }
  ▼
完成上传 POST /upload/sessions/complete
  │ chunks[] 必须携带 sha256；缺失/格式错误 → 400 UPLOAD_CHUNK_HASH_INVALID
  │ manifest 内每片都带 sha256（全有或全无）
  ▼
附件落库 MessageAttachment.chunkManifest（含 sha256）
  │
接收端 GET /attachments/[id]/download
  │ 返回 { url: mergeUrl, chunked, totalChunks, chunkSize, integrity }
  ▼
GET /attachments/merge?manifest=<token>
  │ 逐片读取时同步计算 SHA-256，与 manifest 比对
  │ 不一致 → 流错误 MERGE_CHUNK_HASH_MISMATCH（响应头已发出）
  ▼
前端捕获中断 → GET /attachments/[id]/integrity?indexes=<候选片>
  │ 返回 failures[{ index, code, expectedSha256, actualSha256 }]
  ▼
原上传者 POST /attachments/[id]/repair（multipart: index + file）
  │ 校验大小与 SHA-256 → 上传单片 → 更新 manifest / s3Key → 返回新 mergeUrl
  ▼
前端自动重新下载
```

## 3. API

### 3.1 分片上传响应

`POST /api/rooms/[roomCode]/upload/sessions/chunk`（multipart）

新增响应字段：

```json
{
  "index": 0,
  "url": "https://pic.sl.al/…",
  "sizeBytes": 4194304,
  "sha256": "64-char lower-case hex"
}
```

`sha256` 由服务端对实际收到的分片字节计算，客户端无需自行计算。

### 3.2 完成上传

`POST /api/rooms/[roomCode]/upload/sessions/complete`

`chunks[]` 的每一项新增必填 `sha256`（64 位十六进制，大小写不敏感，统一转小写）。

- 缺片、顺序错误、大小不符的校验顺序不变。
- 任一分片缺少有效 `sha256` → `400 UPLOAD_CHUNK_HASH_INVALID`。
- 返回的 manifest / `mergeToken` / `mergeUrl` 与 up-04 相同，但 manifest 内含每片哈希。

### 3.3 附件下载元数据

`GET /api/rooms/[roomCode]/attachments/[attachmentId]/download`

分片附件不再返回 `409 CHUNKED_DOWNLOAD_PENDING`，而是返回：

```json
{
  "ok": true,
  "data": {
    "url": "/api/rooms/<roomCode>/attachments/merge?manifest=m1.…",
    "fileName": "archive.zip",
    "mimeType": "application/zip",
    "sizeBytes": 104857600,
    "chunked": true,
    "totalChunks": 25,
    "chunkSize": 4194304,
    "integrity": "sha256"
  }
}
```

`?raw=1` 仍可用：307 重定向到合并端点，供无法读取 JSON 的旧客户端一键下载。

非分片附件的响应保持原样（S3 / DUFS / 远端直链）。

### 3.4 合并下载响应头

在 up-04 头信息基础上新增：

| Header | 值 |
| --- | --- |
| `X-Merge-Integrity` | `sha256` 或 `none`（历史无哈希 manifest） |
| `X-Merge-Total-Chunks` | 分片总数 |
| `X-Merge-Chunk-Size` | 每片字节数 |

若任一分片哈希不符，流会以 `MERGE_CHUNK_HASH_MISMATCH` 终止，浏览器不会完成保存。

### 3.5 完整性检查

`GET /api/rooms/[roomCode]/attachments/[attachmentId]/integrity?indexes=0,2`

- 需要房间成员身份。
- `indexes` 可选，逗号分隔；缺省检查全部分片（会实际下载所有分片，慎用于大文件）。
- 返回：

```json
{
  "ok": true,
  "data": {
    "valid": false,
    "integrity": "sha256",
    "totalChunks": 25,
    "checkedChunks": 2,
    "failures": [
      {
        "index": 2,
        "code": "MERGE_CHUNK_HASH_MISMATCH",
        "message": "分片 3 SHA-256 校验失败",
        "expectedSize": 4194304,
        "actualSize": 4194304,
        "expectedSha256": "…",
        "actualSha256": "…"
      }
    ],
    "attachmentId": "…",
    "fileName": "archive.zip",
    "sizeBytes": 104857600,
    "chunkSize": 4194304,
    "canRepair": true
  }
}
```

`canRepair` 仅在当前用户是附件原上传者时为 `true`。

### 3.6 补传单片

`POST /api/rooms/[roomCode]/attachments/[attachmentId]/repair`（multipart）

| 字段 | 说明 |
| --- | --- |
| `index` | 分片序号（从 0 开始） |
| `file` | 该分片的原始字节，大小必须与 manifest 一致 |

校验：

- 仅原上传者（`uploaderId`）可调用，否则 `403 REPAIR_FORBIDDEN`。
- 来源校验与上传限流复用 up-03 的 `assertUploadOrigin` / `assertUploadRateLimit`。
- 大小不符 → `400 REPAIR_CHUNK_SIZE_MISMATCH`。
- manifest 含哈希时，补传字节的 SHA-256 必须与原值一致 → 否则 `400 REPAIR_CHUNK_HASH_MISMATCH`。
- 历史无哈希 manifest 保持无哈希模式，不会产生“部分有哈希”的清单。

成功响应：

```json
{
  "index": 2,
  "url": "https://…",
  "sizeBytes": 4194304,
  "sha256": "…",
  "integrity": "sha256",
  "mergeUrl": "/api/rooms/<roomCode>/attachments/merge?manifest=m1.…"
}
```

补传会更新 `chunkManifest.chunks[index]`；当 `index === 0` 时同步更新 `s3Key`（首片 URL）。

## 4. 前端行为

`src/lib/attachment-download.ts`：

- `downloadAttachment()` 先取下载元数据；分片附件使用 `fetch` + `ReadableStream` 读取，按字节数回调 `onProgress`，全部收齐后才生成 Blob 并触发保存。
- 下载中断时根据已接收字节推导候选分片（流停在片边界时同时检查前后两片），调用完整性接口定位失败片。
- 失败且 `canRepair` 时打开补传对话框；补传成功后自动重新下载。

`FileAction`：

- 下载中显示 `下载中 {percent}%`。
- 附件卡片展示分片数与 `SHA-256 校验` 徽标。
- 补传对话框只接受与目标分片大小一致的文件，并复用原文件名生成补传分片名。

## 5. 错误码

| 场景 | HTTP | code |
| --- | --- | --- |
| 完成上传缺少/非法哈希 | 400 | `UPLOAD_CHUNK_HASH_INVALID` |
| 分片清单哈希不完整 | 400 | `MERGE_MANIFEST_INVALID` |
| 合并时单片哈希不符 | 502 | `MERGE_CHUNK_HASH_MISMATCH` |
| 合并时单片长度/大小不符 | 502 | `MERGE_CHUNK_LENGTH_MISMATCH` / `MERGE_CHUNK_SIZE_MISMATCH` |
| 校验索引越界 | 400 | `MERGE_VERIFY_INDEX_INVALID` |
| 非分片附件调用完整性检查 | 409 | `CHUNKED_ATTACHMENT_STORAGE_INVALID` / `CHUNKED_MANIFEST_INVALID` |
| 清单大小与附件大小不一致 | 409 | `CHUNKED_MANIFEST_SIZE_MISMATCH` |
| 非上传者补传 | 403 | `REPAIR_FORBIDDEN` |
| 补传大小不符 | 400 | `REPAIR_CHUNK_SIZE_MISMATCH` |
| 补传哈希不符 | 400 | `REPAIR_CHUNK_HASH_MISMATCH` |
| 补传来源校验失败 | 403 | `UPLOAD_ORIGIN_REJECTED` |

## 6. 兼容性

- 历史 manifest 没有 `sha256` 时按 `integrity: "none"` 处理：仍可合并下载，只做片数/顺序/大小校验。
- 新完成的上传强制每片带哈希；同一 manifest 不允许“部分有哈希”。
- `mergeToken` 仍是自包含 HMAC 令牌；补传后旧令牌里的 URL 已过期，前端必须使用补传响应或重新请求下载元数据获取新令牌。

## 7. 测试

- `src/lib/upload/hash.test.ts`：哈希格式归一化、完整性判定。
- `src/lib/upload/manifest.test.ts`：完成上传必须提供有效 SHA-256、大小写归一化。
- `src/lib/upload/merge.test.ts`：哈希匹配时正常拼接、哈希不符时流错误、逐片校验报告、子集校验。
- `src/lib/attachment-storage.test.ts`：manifest 哈希解析、全有或全无、非法值拒绝。
- `src/lib/attachment-merge.test.ts`：持久化附件 → 合并 manifest 转换、大小一致性、SANG/PIC_SL 映射。
- `src/lib/attachment-download.test.ts`：失败分片推导与边界候选。

# 附件存储模型适配（最小迁移）

> 需求：REQ-202610-0517 · 阶段一 · up-08
> 范围：`MessageAttachment` 存储枚举扩展 + 分片清单（manifest）落库设计。

## 1. 目标与边界

- `MessageAttachment.storage` 从 `S3 | DUFS` 扩展为 `S3 | DUFS | SANG | PIC_SL`。
- `s3Key` 复用为「远端文件标识 / URL」：远端存储时直接保存第三方返回的公网 HTTPS 直链。
- 分片场景的清单（片数 / 片大小 / 各片远端标识）纳入本次最小迁移。
- **不新增表、不删除列**；本次只有一次迁移：两个枚举值 + 一个可空 JSONB 列。

## 2. 数据模型

### 2.1 枚举

```prisma
enum AttachmentStorage {
  S3
  DUFS
  SANG
  PIC_SL

  @@map("bendy_shadowsend_attachment_storage")
}
```

| 取值 | 含义 | `s3Key` 语义 |
| --- | --- | --- |
| `S3` | 原 S3 兼容存储 | 对象 key，读取时生成签名 URL |
| `DUFS` | 原 DUFS 中转存储 | DUFS 相对路径，读取时经服务端代理 |
| `SANG` | file.sang.pub（meitu / icve 通道） | 第三方返回的公网 HTTPS 直链 |
| `PIC_SL` | pic.sl.al | 第三方返回的公网 HTTPS 直链 |

### 2.2 分片清单字段

`MessageAttachment` 新增可空列：

```prisma
model MessageAttachment {
  // ...
  storage       AttachmentStorage
  chunkManifest Json?
  // ...
}
```

- `null` / 缺省：单文件附件（含全部存量数据与 SANG / PIC_SL 直传）。
- 非空：分片附件，`s3Key` 固定保存**第 0 片**的 URL，作为主远端标识与兼容读取入口；完整清单存 `chunkManifest`。

### 2.3 `chunkManifest` 结构

```jsonc
{
  "uploadId": "up-03 会话 ID（可选）",
  "chunkSize": 4194304,
  "totalChunks": 3,
  "sizeBytes": 8389632,
  "chunks": [
    { "index": 0, "url": "https://file.icve.com.cn/file_doc/chunk-0", "sizeBytes": 4194304 },
    { "index": 1, "url": "https://file.icve.com.cn/file_doc/chunk-1", "sizeBytes": 4194304 },
    { "index": 2, "url": "https://file.icve.com.cn/file_doc/chunk-2", "sizeBytes": 1024 }
  ]
}
```

字段说明：

| 字段 | 必填 | 约束 |
| --- | --- | --- |
| `chunkSize` | 是 | 正整数，单片字节数（≈4MB） |
| `totalChunks` | 是 | 正整数，`1 ≤ totalChunks ≤ 50` |
| `chunks` | 是 | 长度必须等于 `totalChunks`，`index` 必须等于数组下标 |
| `chunks[].url` | 是 | HTTPS，且 host 命中对应存储白名单 |
| `chunks[].sizeBytes` | 是 | 非末片必须等于 `chunkSize`；末片 `≤ chunkSize` |
| `sizeBytes` | 否 | 若提供，必须等于各片之和 |
| `uploadId` | 否 | 1–200 字符 |
| `storage` | 否 | 若提供，必须与附件 `storage` 一致 |

> 兼容 up-03 的 `UploadManifest`：`service` / `fileName` / `mimeType` 等额外字段会被忽略，只校验上述核心字段。

## 3. 远端 URL 白名单

仅允许 HTTPS，并按存储校验 host（含子域）：

- `SANG`：`meitudata.com`、`icve.com.cn`、`sang.pub`
- `PIC_SL`：`pic.sl.al`

白名单同时用于写入校验（`sendMessageSchema`）与读取跳转（下载 / 预览 / 公告图片），防止把任意 URL 当作附件地址造成开放重定向或 SSRF。

## 4. 迁移

迁移目录：`prisma/migrations/20261018150000_add_remote_storage_and_chunk_manifest/`

```sql
ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'SANG';
ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'PIC_SL';

ALTER TABLE "bendy_shadowsend_message_attachment"
  ADD COLUMN IF NOT EXISTS "chunkManifest" JSONB;
```

- `ADD VALUE IF NOT EXISTS` 保证与并行分支（0510 的 SANG、0511 的 PIC_SL）任意合并顺序下都可重复执行。
- 迁移只加枚举值与可空列，存量行无需回填，`prisma migrate deploy` 可安全在线执行。
- 回滚：应用层忽略 `chunkManifest` 即可；PostgreSQL 枚举值不支持直接删除，如需彻底回退需重建枚举（非本次范围）。

## 5. 读写路径

### 5.1 写入

`sendMessageSchema.attachments[]`：

- `storage` 接受 `S3 | DUFS | SANG | PIC_SL`。
- `SANG` / `PIC_SL` 的 `s3Key` 必须是白名单内 HTTPS URL。
- `chunkManifest` 只允许出现在 `SANG` / `PIC_SL`，且 `s3Key` 必须等于 `chunks[0].url`。
- 公告图片复用同一套远端存储校验。

### 5.2 读取

`resolveAttachmentReadMode(storage, chunkManifest)` 统一路由：

| 场景 | 行为 |
| --- | --- |
| `S3` | 生成签名 URL（沿用原逻辑） |
| `DUFS` | 服务端代理读取（沿用原逻辑） |
| `SANG` / `PIC_SL` 单文件 | 校验 URL 后 `307` 跳转公网直链；下载接口同时支持 `?raw=1` |
| `SANG` / `PIC_SL` 分片 | 返回 `409 CHUNKED_DOWNLOAD_PENDING` / `409 CHUNKED_PREVIEW_PENDING`，待 up-10 接收端合并实现 |

消息列表中的预览地址：远端单文件直接使用 `s3Key`；分片附件返回 `null`，由后续 UI 显示「分片附件」状态。

## 6. 测试

- `src/lib/attachment-storage.test.ts`（20）：存储值、URL 白名单、manifest 校验、读取模式路由。
- `src/lib/validators.test.ts`（10）：四种 storage、跨服务 URL 拒绝、manifest 与 `s3Key` 一致性、公告图片远端 URL。
- `src/lib/attachment-storage-schema.test.ts`（4）：schema 枚举、`chunkManifest Json?`、迁移目录与幂等 SQL、无 `DROP TABLE/COLUMN`。

## 7. 后续（不在本次范围）

- up-04 / up-10：分片上传编排、接收端合并下载、完整性校验。
- up-09：README 环境变量与旧存储配置清理。
- up-12：存量清零后移除 S3 / DUFS 代码与配置。

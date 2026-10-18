# 附件存储模型（up-08 / up-12 收敛后）

> 需求：REQ-202610-0517（模型适配）、REQ-202610-0752（旧存储下线）
> 最终状态：`AttachmentStorage` 仅保留 `SANG | PIC_SL`。

## 1. 数据模型

```prisma
enum AttachmentStorage {
  SANG
  PIC_SL

  @@map("bendy_shadowsend_attachment_storage")
}

model MessageAttachment {
  // ...
  s3Key         String
  storage       AttachmentStorage
  chunkManifest Json?
}
```

| 取值 | 含义 | `s3Key` 语义 |
| --- | --- | --- |
| `SANG` | file.sang.pub（meitu / icve 通道） | 第三方返回的公网 HTTPS 直链；分片时为第 0 片 URL |
| `PIC_SL` | pic.sl.al | 第三方返回的公网 HTTPS 直链；分片时为第 0 片 URL |

`chunkManifest` 为 `null` 表示单文件附件；非空表示分片附件，完整清单如下：

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

约束：`chunks.length === totalChunks`、`index` 必须等于数组下标、非末片 `sizeBytes === chunkSize`、末片 `<= chunkSize`、`s3Key === chunks[0].url`、`totalChunks <= 50`。

## 2. 远端 URL 白名单

仅允许 HTTPS，并按存储校验 host（含子域）：

- `SANG`：`meitudata.com`、`icve.com.cn`、`sang.pub`
- `PIC_SL`：`pic.sl.al`

白名单同时用于写入校验与读取跳转，防止开放重定向或 SSRF。

## 3. 迁移

- `20261018150000_add_remote_storage_and_chunk_manifest/`：新增 `SANG` / `PIC_SL` 枚举值与 `chunkManifest` JSONB 列。
- `20261018160000_remove_legacy_attachment_storage/`：
  - 迁移前检查 `MessageAttachment.storage` 与 `Room.announcementImageStorage` 是否仍存在 `S3` / `DUFS`，存在则 `RAISE EXCEPTION`；
  - 重建枚举为 `('SANG', 'PIC_SL')`，同时移除 `storage` 的旧默认值。

## 4. 读写路径

- 写入：`sendMessageSchema.attachments[]` 与公告 `newImages[]` 必须显式携带 `storage`；远端 URL 必须命中白名单；分片附件携带 `chunkManifest`。
- 读取：`resolveStoredRemoteAttachment()` 统一解析：
  - 无 `chunkManifest`：校验 `s3Key` 后 307 跳转远端直链；
  - 有 `chunkManifest`：校验分片与总大小后，按顺序拉取并合并为流式响应。
- 消息列表预览：单文件直接使用远端 URL；分片附件指向应用内 `/preview` 合并路由。
- 兼容：早期将完整 manifest JSON 序列化进 `s3Key` 的附件仍可读取；新数据不再写入该格式。

## 5. 测试

- `src/lib/attachment-storage.test.ts`：存储值、URL 白名单、manifest 校验、读取模式。
- `src/lib/validators.test.ts`：仅接受 `SANG` / `PIC_SL`、跨服务 URL 拒绝、manifest 与 `s3Key` 一致性。
- `src/lib/attachment-storage-schema.test.ts`：枚举、`chunkManifest` 列、两段迁移与存量检查。
- `src/lib/legacy-storage-removed.test.ts`：生产源码、环境变量、依赖与旧路由的无引用扫描。

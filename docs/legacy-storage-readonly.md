# 旧存储配置旁路与存量兼容（up-07 / REQ-202610-0516）

## 背景与决策

- 阶段二要求新上传全部走新通道：图片 `file.sang.pub`、非图片 `pic.sl.al`。
- 决策 **dc-05 = A**：旧 S3 / DUFS / OSS Preview 配置不再参与任何上传；只保留存量附件读取；存量清零后再由 up-12 彻底下线代码与配置。
- 本需求不删除旧读取代码，也不迁移存量对象。

## 写入策略（配了也不生效）

| 入口 | 处理 |
| --- | --- |
| `POST /api/rooms/[roomCode]/upload` | 仅保留图片 `file.sang.pub` 通道；非图片返回 `410 LEGACY_STORAGE_UPLOAD_DISABLED` |
| `POST /api/rooms/[roomCode]/upload-url` | 整体停用，返回 `410 LEGACY_STORAGE_UPLOAD_DISABLED`；不再签发 S3 预签名 URL |
| `POST /api/rooms/[roomCode]/upload/chunk` | 整体停用，返回 `410 LEGACY_STORAGE_UPLOAD_DISABLED`；不再写 DUFS |
| `DELETE /api/rooms/[roomCode]/upload/chunk` | 同步停用；不再删除 DUFS 对象 |
| `POST /api/rooms/[roomCode]/upload/pic-sl` | 非图片新通道（up-02），单请求 ≤4MB |

- `src/lib/storage-policy.ts` 是唯一策略来源：`LEGACY_STORAGE_UPLOAD_ENABLED = false`、`LEGACY_STORAGE_READ_ENABLED = true`。
- 前端 `upload()` 不再包含 S3 直传、DUFS 分片与旧配置回退：图片 ≤4MB 走 SANG；>4MB 明确提示等待 up-04 分片；非图片走 pic.sl.al。
- 即使部署环境仍保留 `S3_*`、`DUFS_*`、`OSS_PREVIEW_*`，上传路径也不会读取它们。

## 读取策略（存量继续可用）

| 存储 | 读取路径 | 行为 |
| --- | --- | --- |
| `S3` | `download` / `preview` / `announcement/image` / `attachment-preview` | 继续使用 S3 预签名 URL 或 OSS Preview JSON-RPC |
| `DUFS` | 同上 | 继续经服务端 `fetchDufsFile` 中转 |
| `SANG` | 同上 | 直接返回远端 URL 或 307 跳转 |
| `PIC_SL` | 同上 | 校验后直接返回远端 URL 或 307 跳转 |

- 读取函数（`createDownloadUrl`、`createInlineReadUrl`、`createAttachmentPreviewUrl`、`fetchDufsFile`）保持不变。
- 旧配置缺失只影响对应存量对象的读取，不影响新上传。

## 代码位置

- `src/lib/storage-policy.ts`：策略常量、410 错误构造与写入口守卫。
- `src/app/api/rooms/[roomCode]/upload/route.ts`：图片 SANG 通道；非图片 410。
- `src/app/api/rooms/[roomCode]/upload-url/route.ts`：S3 预签名入口 410。
- `src/app/api/rooms/[roomCode]/upload/chunk/route.ts`：DUFS 分片入口 410。
- `src/app/room/[roomCode]/page.tsx`：移除 `uploadDirectToS3` / `uploadByChunkedProxy` 与回退链。
- `src/lib/storage-policy.test.ts`：策略与错误契约测试。

## 验收清单

- [x] 配置 `S3_*` 后调用 `/upload-url` 仍返回 410，且不产生预签名 URL。
- [x] 配置 `DUFS_*` 后调用 `/upload/chunk` 仍返回 410，且不写 DUFS。
- [x] 非图片调用 `/upload` 返回 410，不再落入 S3/DUFS 分支。
- [x] 图片 ≤4MB 仍经 `/upload` 返回 `storage=SANG`。
- [x] S3 / DUFS 存量附件的下载、预览、公告图片读取保持可用。
- [x] `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 通过。

## 后续

- up-04：在新通道上重新接入分片上传（图片 >4MB、非图片 >4MB）。
- up-12：存量附件清零后，删除 S3 / DUFS / OSS 读取代码、环境变量与文档。

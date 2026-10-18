# 上传前置校验与服务规则对齐（REQ-202610-0515 / up-06）

上传前在浏览器与服务端共用同一套校验规则，避免旧 S3/DUFS 规则放行、直到新服务（file.sang.pub / pic.sl.al）才失败。实现位于 `src/lib/upload-preflight.ts`。

## 服务与限额

| 服务 | 适用文件 | 单文件上限 | 类型规则 |
| --- | --- | --- | --- |
| file.sang.pub `meitu` | 图片 | 20MB | `jpg` / `jpeg` / `png` / `gif` / `webp` |
| file.sang.pub `icve` | 图片 | 100MB | 拒绝 `html` / `htm`，其余扩展名放行 |
| pic.sl.al | 非图片 | 200MB | 58 项扩展名白名单（见 `PIC_SL_ALLOWED_EXTENSIONS`） |

图片判定同时参考 MIME（`image/*`）与扩展名；MIME 与实际扩展名冲突时仍按图片处理，但 HTML 始终被 sang 通道拒绝。

## 分片约束（dc-01）

- Vercel Functions 非流式请求体上限：4.5MB（`VERCEL_FUNCTION_BODY_LIMIT_BYTES`）。
- 新服务分片大小：4MB（`UPLOAD_CHUNK_SIZE_BYTES`），为 multipart 边界和协议头留出余量。
- 200MB ÷ 4MB = 50 片（`UPLOAD_MAX_CHUNKS`）。
- 旧 DUFS 分片链路仍使用 3MB（`DUFS_CHUNK_SIZE_BYTES`），通过 `createUploadChunkPlan(size, chunkSize)` 参数化复用。
- `createUploadChunkPlan` 预计算 `totalChunks` 与 `lastChunkBytes`；服务端分片接口逐片核对分片数与精确字节数，不再接受“不超过上限”的模糊分片。

## 错误码

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `UPLOAD_FILE_EMPTY` | 400 | 空文件 |
| `UPLOAD_SIZE_INVALID` | 400 | 大小非安全整数或为负 |
| `UPLOAD_TYPE_UNSUPPORTED` | 415 | 扩展名不在服务白名单 |
| `UPLOAD_SERVICE_LIMIT_EXCEEDED` | 413 | 超过 sang 100MB / pic.sl.al 200MB |
| `UPLOAD_CHUNK_COUNT_EXCEEDED` | 413 | 分片数超过 50 |

客户端错误对象同时携带 `messageKey` 与 `params`，由 i18n 渲染可读提示；服务端使用 `uploadPreflightErrorMessage` 生成中文消息，并通过 `ApiError` 返回同一错误码。

## 接入点

- `src/app/room/[roomCode]/page.tsx`：选择/粘贴文件时逐个预检，仅接受通过的文件；文件条展示分片数；上传前再次预检兜底。
- `POST /api/rooms/[roomCode]/upload`：读取 `File` 后、落存储前校验。
- `POST /api/rooms/[roomCode]/upload-url`：房间鉴权后、签发 S3 URL 前校验。
- `POST /api/rooms/[roomCode]/upload/chunk`：校验总大小与服务限额，核对 `totalChunks` 和当前分片字节数。

## 验收清单

- [x] 空文件、非法大小、非白名单扩展名、超服务限额、超分片数均返回明确错误码与提示。
- [x] 20MB 图片走 meitu；20MB+1 至 100MB 图片走 icve；超过 100MB 拒绝。
- [x] 非图片白名单文件最大 200MB，恰好 50 片；200MB+1 拒绝。
- [x] 单请求分片 4MB，低于 Vercel 4.5MB 上限。
- [x] 客户端与服务端共用同一模块，规则不会漂移。
- [x] `src/lib/upload-preflight.test.ts` 覆盖边界值与分片计算。

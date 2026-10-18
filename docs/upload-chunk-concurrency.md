# 分片并发上传与失败续传（REQ-202610-0751 / up-11）

## 1. 范围

本迭代在 up-03（服务端转发与分片编排）与 up-04（合并下载）的契约之上，补齐浏览器侧的分片上传能力：

- 有限并发：默认同时上传 4 个分片，顺序无关，先完成先记账。
- 分片级重试：按 dc-06 只做同服务有限重试，默认最多 3 次，指数退避 400ms / 800ms / 1600ms（上限 3s）。
- 失败暂停与续传：任一分片在重试耗尽或遇到不可重试错误后暂停整个文件；已完成分片写入 `localStorage`，再次上传同一文件时跳过，不重复上传。
- 残留清理：续传记录与会话同生命周期（2 小时），读取/保存时自动清理过期记录，最多保留 10 条；提供显式丢弃接口。
- 进度 UI 对接：`onProgress` 输出与 up-05 `UploadProgress` 完全一致的 `status / progress / attempt / maxAttempts / error` 结构。

本迭代不新增数据库表、不改变服务端 API 契约，也不依赖 up-05 的具体组件实现。若 up-05 尚未合入，调用方可以直接把 `onProgress` 的状态传给任意进度组件。

## 2. 模块结构

| 文件 | 职责 |
| --- | --- |
| `src/lib/upload/chunk-scheduler.ts` | 与传输层解耦的有限并发调度器：分片队列、并发上限、重试/退避、暂停/取消、进度聚合。 |
| `src/lib/upload/resume-store.ts` | `localStorage` 续传记录：指纹、校验、TTL 清理、LRU 上限、配额失败降级。 |
| `src/lib/upload/chunk-transport.ts` | 浏览器传输层：创建会话、XHR 上传分片（带上传进度）、完成合并；统一错误与响应校验。 |
| `src/lib/upload/chunk-uploader.ts` | 编排层：创建/复用会话、调度分片、逐片持久化、完成合并、失败保留记录、丢弃记录。 |

调用关系：

```
uploadFileChunkedWithResume
  ├─ resume-store（查找/保存/删除续传记录）
  ├─ chunk-transport（/sessions → /sessions/chunk → /sessions/complete）
  └─ chunk-scheduler（并发、重试、暂停、进度）
```

## 3. 调度器

### 3.1 并发模型

`runChunkScheduler` 启动固定数量的 worker（默认 `UPLOAD_CHUNK_CONCURRENCY = 4`，且不超过总分片数），每个 worker 从共享游标取下一个待传分片。分片完成顺序不影响结果：内部用 `Map<index, descriptor>` 记账，结束时按索引升序输出。

并发上限为 4 的原因：

- 200MB / 50 片的长传需要足够的并行度，避免 4MB 串行请求把总时长拖到不可接受；
- 浏览器同源连接池通常为 6 个，4 个分片 + 页面其他请求留有余量；
- 服务端每用户 180 次/分钟的限流下，4 并发不会造成瞬时突刺。

### 3.2 重试与暂停

- 每个分片独立计数，最多 `UPLOAD_CHUNK_MAX_ATTEMPTS = 3` 次。
- 默认可重试错误：`ChunkTransportError.retryable === true`（网络错误、408/409/425/429/5xx）。不可重试错误（4xx 参数/权限/大小错误、响应格式错误）立即暂停。
- 退避：`min(3000, 400 * 2^(attempt-1))`，即 400ms、800ms、1600ms。
- 任一分片最终失败时置 `paused`，不再领取新分片；已在途的分片允许完成并记账，避免浪费已上传流量。
- 取消（`AbortSignal`）会中止在途 XHR/fetch，返回 `aborted`，已完成的续传记录保留。

调度结果：

```ts
type ChunkSchedulerResult = {
  status: "done" | "paused" | "aborted";
  chunks: UploadChunkDescriptor[]; // 按 index 升序
  uploadedBytes: number;
  failedChunkIndex: number | null;
  error: unknown;
};
```

### 3.3 进度

调度器在以下时机发出进度：worker 启动/结束、分片内上传字节变化、进入/退出重试、暂停/取消、全部完成。

```ts
type ChunkSchedulerProgress = {
  status: "running" | "retrying" | "paused" | "done" | "aborted";
  completedChunks: number;
  totalChunks: number;
  uploadedBytes: number;
  totalBytes: number;
  percent: number; // 全部完成前最多 99，完成后 100
  activeChunks: number;
  attempt: number;
  maxAttempts: number;
  retryingChunkIndex: number | null;
  failedChunkIndex: number | null;
};
```

## 4. 续传记录

### 4.1 存储格式

单键 `bendy:upload-resume:v1`，值为一个 JSON 文档：

```json
{
  "v": 1,
  "records": [
    {
      "v": 1,
      "fingerprint": "f-1a2b3c4d",
      "roomCode": "ABCDEF",
      "fileName": "archive.zip",
      "mimeType": "application/zip",
      "sizeBytes": 104857600,
      "lastModified": 1760000000000,
      "session": "<base64url-payload>.<base64url-signature>",
      "service": "pic-sl",
      "storage": "PIC_SL",
      "chunkSize": 4194304,
      "totalChunks": 25,
      "lastChunkBytes": 4194304,
      "expiresAt": 1760007200000,
      "completedChunks": [
        { "index": 0, "url": "https://pic.sl.al/f/...", "sizeBytes": 4194304 }
      ],
      "createdAt": 1760000000000,
      "updatedAt": 1760000123456
    }
  ]
}
```

### 4.2 文件指纹

`fingerprint` 由 `roomCode + fileName + sizeBytes + lastModified` 做 FNV-1a 32 位哈希得到（`f-xxxxxxxx`）。它不是安全边界，只用于在同一浏览器的少量文件之间区分续传记录；会话本身仍由服务端 HMAC 签名校验。

### 4.3 校验与清理

读取时逐条校验：

- `v === 1`，服务/存储枚举合法且互相匹配；
- 数值字段为正整数，`totalChunks === ceil(sizeBytes / chunkSize)`；
- `lastChunkBytes` 与文件大小一致；
- 已完成分片索引不越界、不重复，且每片大小等于规划值；
- `expiresAt > now`。

损坏的 JSON、未知版本、字段非法的记录会被直接丢弃，不会阻塞上传。

清理策略：

- **TTL**：记录与会话同为 2 小时；`readUploadResumeRecords` 过滤过期项，`pruneUploadResumeRecords` 可把清理结果写回。
- **LRU 上限**：最多 10 条，超出时保留 `updatedAt` 最新的 10 条。
- **显式丢弃**：`discardChunkedUpload` / `removeUploadResumeRecord` 在用户取消或切换文件时删除记录。
- **会话失效自愈**：服务端返回 401/403 或 `UPLOAD_SESSION_*` 错误时，自动删除本地记录；下次上传创建新会话并重传，避免反复使用失效 token。
- **配额降级**：`localStorage.setItem` 抛错（QuotaExceeded）时先裁剪一半记录重试；仍失败则返回 `false`，上传继续但不具备跨刷新续传能力。

### 4.4 远端残留分片

分片被上传到 `file.sang.pub` / `pic.sl.al`，第三方没有公开的删除接口，因此**无法在客户端或本应用内删除已上传的远端分片**。本迭代的清理边界是：

1. 本地续传记录在会话过期后不再被读取，也不会再被用来合并；
2. 会话 token 2 小时后失效，残留分片无法通过本应用完成合并；
3. 第三方会按其自身策略清理孤立文件。

如果后续第三方提供删除 API，可在 `discardChunkedUpload` 中增加服务端代理删除；当前不做跨服务兜底（dc-06）。

## 5. 上传编排

`uploadFileChunkedWithResume` 的流程：

1. 校验文件大小为正；计算指纹。
2. 查找未过期的续传记录：
   - 命中且文件身份一致：复用记录中的签名会话与已完成分片；
   - 未命中：调用 `POST /upload/sessions` 创建新会话，写入空记录。
3. 校验服务端返回的 `chunkSize / totalChunks / lastChunkBytes` 与文件大小一致。
4. 调用 `runChunkScheduler`：
   - 只调度未完成分片；
   - 每片通过 `file.slice(start, end)` 切出，交给 `chunk-transport` 上传；
   - 每完成一片立即更新并保存续传记录。
5. 全部分片完成后调用 `POST /upload/sessions/complete`，最多重试 3 次。
6. 合并成功：删除续传记录，进度置为 `done/100`。
7. 合并失败：保留含全部分片的记录；下次重试只重新调用 complete，不重传分片。
8. 暂停/取消：保留记录，返回 `paused` / `aborted`。

返回值：

```ts
type ChunkedUploadResult = {
  status: "done" | "paused" | "aborted";
  upload: CompletedUpload | null; // manifest + mergeToken + mergeUrl
  completedChunks: number;
  totalChunks: number;
  uploadedBytes: number;
  totalBytes: number;
  failedChunkIndex: number | null;
  error: unknown;
  resumeRecord: UploadResumeRecord | null;
};
```

## 6. 与 up-05 进度 UI 对接

`onProgress` 的结构与 up-05 `UploadProgress` 的 props 对齐：

| 字段 | 说明 |
| --- | --- |
| `status` | `queued / uploading / retrying / done / failed` |
| `progress` | 0–100 的整数百分比（按已上传字节聚合，含在途分片的 XHR 进度） |
| `attempt` | 当前最大尝试次数（重试时 UI 可显示 `attempt/maxAttempts`） |
| `maxAttempts` | 默认 3 |
| `error` | 仅 `failed` 时提供可读错误文案 |

映射规则：

- 调度器 `running` / `done` → `uploading`（`done` 后紧接着调用 complete，最终再发 `done`）；
- 调度器 `retrying` → `retrying`；
- 调度器 `paused` / `aborted` → `failed`，并附带错误文案；
- 合并成功 → `done` + 100。

示例：

```ts
const controller = new AbortController();

const result = await uploadFileChunkedWithResume({
  roomCode,
  file,
  transport: createRelayChunkTransport(roomCode),
  signal: controller.signal,
  onProgress: (state) => setUploadState(state),
});

if (result.status === "paused") {
  // 展示“继续上传”按钮；再次调用同一函数即可跳过已完成分片。
}
```

页面初始化时可调用 `pruneUploadResumeRecords(localStorage)` 清理过期记录；选择文件后可调用 `findResumableUpload({ roomCode, file })` 判断是否显示“继续上传”。

## 7. API 契约

客户端只使用 up-03/up-04 已存在的三个端点：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/rooms/[roomCode]/upload/sessions` | 创建 2 小时签名会话，返回分片规划 |
| `POST` | `/api/rooms/[roomCode]/upload/sessions/chunk` | multipart：`session` + `chunkIndex` + `file` |
| `POST` | `/api/rooms/[roomCode]/upload/sessions/complete` | 提交有序分片清单，返回 manifest + mergeToken/mergeUrl |

响应统一为 `{ ok: true, data }` / `{ ok: false, error: { code, message } }`。传输层会校验 `ok`、HTTP 状态、会话字段、分片索引/大小、manifest 完整性；不合法响应按不可重试错误处理。

## 8. 测试

新增 4 个测试文件、39 条用例：

- `chunk-scheduler.test.ts`（9）：并发上限、乱序完成、重试退避、重试耗尽暂停、不可重试错误、续传跳过、取消、部分进度、非法计划/结果。
- `resume-store.test.ts`（12）：指纹稳定性与区分度、存取往返、损坏文档、过期清理、持久化清理、10 条 LRU、同指纹替换、非法布局、配额失败、删除/清空、不可变复制。
- `chunk-uploader.test.ts`（9）：完整上传、失败暂停后跳过已完成分片、合并失败只重试合并、重试进度、取消保留记录、会话规划不匹配、空文件、会话失效清理、显式丢弃。
- `chunk-transport.test.ts`（9）：创建会话、可重试服务端错误、存储标识校验、XHR 分片与进度、5xx 可重试、取消、完成合并、清单不完整、网络错误包装。

`npm test`：130/130 通过（16 个文件）。

## 9. 已知边界

- **依赖 `localStorage`**：无痕模式/禁用存储时续传降级为单次会话内有效，刷新后需重新上传；上传本身不受影响。
- **远端分片不可删除**：见 4.4；清理只覆盖本地记录与会话有效性。
- **会话过期**：超过 2 小时后旧记录被清理，续传会创建新会话并重传全部分片；这是服务端无状态会话的固有限制。
- **进度是字节级估算**：分片内进度来自 XHR `upload.onprogress`，服务端转发到第三方期间没有额外进度事件，最后一段可能短暂停在 99%。
- **合并失败重试**：complete 请求会重试 3 次；仍失败时保留全部分片记录，用户可稍后重试而无需重传。

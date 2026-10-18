# 上传进度 / 重试 / 失败提示 UI（REQ-202610-0514 / up-05）

## 目标

把 up-03 的服务端 relay 通道接入现有聊天 UI，让多文件上传具备：

- 有界并发（默认 3 个文件同时上传），避免一次选择大量文件时挤占带宽与连接；
- 文件级 + 消息级双层进度，进度条按字节加权，不因文件数量多而跳动；
- 明确的失败原因（网络、超时、服务端状态码、响应格式）；
- 单文件重试、失败文件批量重试、整条消息重发三个入口；
- 与消息气泡、附件卡片（ui-19 / ui-21）统一的视觉与语义。

## 数据流

```
选择文件
  └─ send()
       ├─ 生成本地 pending 消息（object URL 预览）
       ├─ createUploadQueue({ files, concurrency: 3, maxAttempts: 3 })
       │    ├─ uploadFileViaRelay()  ≤4MB → POST /upload/forward
       │    └─ uploadFileViaRelay()  >4MB → /upload/sessions → /sessions/chunk… → /sessions/complete
       ├─ onUpdate → applyQueueSnapshot() → 气泡总进度 + 每个附件卡片进度
       └─ 全部完成后 finalizePendingSend() → POST /messages
```

上传成功后 `RelayUploadResult.s3Key` 直接作为 `MessageAttachment.s3Key` 提交；分片文件保存的是
`UploadManifest` JSON（up-08 正式化前的过渡形态），下载/预览端通过
`resolveRemoteAttachment()` 识别并合并分片。

## 状态机

`UploadItemStatus`：`queued → uploading → done`，失败进入 `failed`，自动重试期间为
`retrying`。每个文件最多 3 次尝试，退避为 `min(3000ms, 400ms × 2^(attempt-1))`。

只有以下 HTTP 状态视为可重试：`408 / 409 / 429 / 500 / 502 / 503 / 504 / 520 / 522 / 524`。
网络错误（`UPLOAD_NETWORK_ERROR`）可重试；超时（`UPLOAD_TIMEOUT`）与非法响应
（`UPLOAD_INVALID_RESPONSE`）不自动重试，但保留手动重试入口。

失败策略遵循 dc-06：**同服务有限重试后明确报错，不做跨服务兜底，也不回退旧 S3/DUFS 自建通道。**

## UI 结构

- `src/components/chat/upload-progress.tsx`
  - `role="progressbar"` + `aria-valuenow/min/max`，状态文案同时作为 `aria-label`；
  - 进度条只用 `transform: scaleX()`，符合动效规范；
  - `failed` 状态显示错误原因与“重试”按钮；`retrying` 使用 `bg-danger`，其余使用 `bg-action`。
- 消息气泡：
  - `metaSlot` 显示整体进度（全部完成前最高 99%，消息落库后才消失）；
  - 附件卡片内显示该文件的状态、进度与失败原因；
  - 失败气泡 footer 显示汇总错误，并按失败阶段提供“重试失败文件”或“重试发送”。
- 所有文案走 i18n（`upload.*` / `chat.retry*`），中英文成对维护。

## 关键模块

| 模块 | 职责 |
| --- | --- |
| `src/lib/upload/queue.ts` | 有界并发、重试退避、快照订阅、整体加权进度 |
| `src/lib/upload/client.ts` | relay 请求封装：单请求 / 分片会话、XHR 进度、错误分类 |
| `src/lib/upload/stored-manifest.ts` | 校验并解析落库的 manifest JSON，输出下载/预览描述 |
| `src/lib/upload/remote-stream.ts` | 按 manifest 顺序拉取分片并合并为 `ReadableStream` |
| `src/lib/upload/attachment-response.ts` | URL 307 跳转 / manifest 流式响应 |
| `src/components/chat/upload-progress.tsx` | 可访问的进度与重试 UI |

## 测试

- `queue.test.ts`：并发上限、3 次重试、最终失败、不可重试错误、单文件重试、批量重试、加权进度、不可变快照。
- `client.test.ts`：单请求进度、分片会话、网络错误、超时、非法响应、可重试状态码。
- `stored-manifest.test.ts`：字段校验、服务/存储匹配、片数与索引、URL 白名单、大小一致性。
- `remote-stream.test.ts`：顺序合并、非法 URL、下载失败。
- `upload-progress.test.ts`：进度语义、失败原因、重试按钮、重试态配色。
- `validators.test.ts`：manifest 长 `s3Key` 与新增存储枚举。

## 验收清单

- [ ] 一次选择多个文件时最多 3 个并发，各卡片独立显示进度。
- [ ] 单文件失败后显示可读原因，可单独重试；全部失败时可一键重试失败文件。
- [ ] 上传全部成功但消息发送失败时，重试只重发消息，不重复上传。
- [ ] 重试成功后消息只落库一次，不产生重复气泡。
- [ ] 切换房间或卸载页面后 object URL 被回收。
- [ ] 进度条与重试按钮支持键盘操作与屏幕阅读器。

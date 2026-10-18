# 图片上传接入 file.sang.pub（up-01）

> 需求：`REQ-202610-0510`（up-01，阶段 1）
> 决策：dc-01 = B（不新增中转组件，经 Vercel 应用服务端路由转发，单请求 ≤4.5MB）
> 故障口径：dc-06 = A（明确报错 + 同服务有限重试 2–3 次，不跨服务回退）

## 1. 范围

本迭代将**图片上传主路径**从「S3 直传 / DUFS」切换为 `file.sang.pub`：

- 图片由浏览器先传到本项目后端路由，再由服务端调用 `file.sang.pub`，避免浏览器直连的 CORS 限制。
- 服务端负责通道选择、协议头拼装、响应校验与 URL 回写。
- 非图片上传保持原有 S3 直传 / 后端中转 / DUFS 逻辑不变。
- 超过单请求上限（4MB）的图片分片属于 up-04，本迭代暂沿用 DUFS 分片链路作为过渡。

## 2. 上游协议

```http
POST https://file.sang.pub/api/upload
X-Upload-Type: meitu | icve
X-File-Name: <encodeURIComponent(fileName)>
X-File-Size: <字节数>
Content-Type: application/octet-stream

<原始文件字节>
```

成功响应：

```json
{ "code": 200, "msg": "success", "data": "https://..." }
```

错误响应：

```json
{ "code": 400, "msg": "错误原因" }
```

服务端调用不需要 `Referer` 或鉴权；返回的 URL 可公网直读。

2026-10-18 复测：`meitu` 返回 `xiuxiu-pro-new.meitudata.com`，`icve` 返回 `file.icve.com.cn`，均与代码中的 URL 主机白名单一致。

## 3. 通道选择

| 通道 | 允许类型 | 大小上限 | 说明 |
| --- | --- | --- | --- |
| `meitu` | `.jpg` / `.jpeg` / `.png` / `.gif` / `.webp` | 20MB | 优先选择；返回美图图床 URL |
| `icve` | 除 `.html` / `.htm` 外的文件 | 100MB | meitu 不满足时的兜底通道（含大图片） |

选择逻辑位于 `src/lib/upload-rules.ts` 的 `selectSangChannel()`：

1. 文件为图片且扩展名在 meitu 白名单内、大小 ≤20MB → `meitu`；
2. 扩展名不是 html/htm 且大小 ≤100MB → `icve`；
3. 其余返回 `null`，路由返回 `400 SANG_CHANNEL_UNSUPPORTED`。

> 当前路由在通道选择前先执行 4MB 单请求校验；20–100MB 的通道能力为 up-04 分片预留。

## 4. 数据流

```
浏览器
  │  multipart/form-data（图片 ≤4MB）
  ▼
POST /api/rooms/[roomCode]/upload
  │  校验房间成员、文件大小、图片类型
  ▼
src/lib/sang.ts :: uploadToSang()
  │  POST file.sang.pub（原始字节 + 协议头）
  │  最多 3 次同服务重试（408/409/429/5xx/52x）
  ▼
返回 { s3Key: <远端 URL>, storage: "SANG", previewUrl: <远端 URL> }
```

- `MessageAttachment.s3Key` 复用为远端文件 URL；`storage` 记录为 `SANG`。
- 下载/预览直接使用远端直链，不再经过本项目中转（节省流量与函数配额）。
- 公告图片复用同一上传与读取链路。

## 5. 代码位置

| 文件 | 作用 |
| --- | --- |
| `src/lib/upload-rules.ts` | 通道常量、扩展名/MIME 判断、通道选择、可重试状态码 |
| `src/lib/sang.ts` | `uploadToSang()`：协议头、超时、有限重试、响应解析、URL 校验 |
| `src/app/api/rooms/[roomCode]/upload/route.ts` | 图片走 sang；非图片保持 S3/DUFS |
| `src/app/api/rooms/[roomCode]/upload-url/route.ts` | 拒绝图片预签名直传（`IMAGE_UPLOAD_USE_PROXY`） |
| `src/lib/attachment-preview.ts` | `SANG` 附件直接返回远端 URL |
| `attachments/[attachmentId]/download` | `SANG` 返回远端 URL / 307 跳转 |
| `attachments/[attachmentId]/preview` | `SANG` 307 跳转到远端 URL |
| `announcement/image` | `SANG` 公告图 307 跳转到远端 URL |
| `prisma/schema.prisma` + migration | `AttachmentStorage` 新增 `SANG` |

## 6. 失败与重试

- 网络错误、HTTP 408/409/429/500/502/503/504/520/522/524：最多 3 次，间隔约 400ms / 900ms。
- HTTP 4xx（除可重试项）、上游业务码 4xx、返回 URL 非法：不重试，直接返回 `502 SANG_UPLOAD_FAILED` 或 `400 SANG_CHANNEL_UNSUPPORTED`。
- 不跨服务回退到 S3/DUFS（dc-06）。
- 前端展示后端返回的具体错误文案；413 时优先展示服务端的 4MB 提示。

## 7. 环境变量

| 变量 | 必填 | 默认值 |
| --- | --- | --- |
| `SANG_UPLOAD_URL` | 否 | `https://file.sang.pub/api/upload` |

## 8. 验收清单

- [ ] 上传 1 张 ≤4MB 的 JPG/PNG，返回 `storage=SANG`，`s3Key` 为 `https://` 远端 URL，消息可正常预览。
- [ ] 上传 GIF/WebP 走 `meitu`；上传 PDF 等非图片仍走原有链路。
- [ ] 上传 >4MB 图片走 DUFS 分片（过渡行为），不报 413。
- [ ] 调用 `/upload-url` 上传图片返回 `400 IMAGE_UPLOAD_USE_PROXY`。
- [ ] 公告图片上传、展示、下载正常。
- [ ] 模拟 sang.pub 503：确认同服务重试后明确报错，不落 S3/DUFS。
- [ ] `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全绿。

## 9. 后续

- up-03/up-04：分片编排与接收端合并；届时 >4MB 图片改为约 4MB/片经服务端转发到 `file.sang.pub`，并写入分片清单。
- up-08：如分片清单需要持久化，再扩展附件模型（优先复用现有字段）。

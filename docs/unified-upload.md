# 统一上传与数据库配置（REQ-202611-0097，0.2.0）

## 运行配置

新安装只需配置 `DATABASE_URL`，复用现有 PostgreSQL。`.env.example` 不包含存储配置。
图片、视频、音频、文档、压缩包、无 MIME 类型的文件和公告图片都调用固定接口：

```text
POST https://aa08cscht.yixiangmeiju.top/oss/aws/upload
multipart/form-data，唯一字段 file
无 Token、Cookie 或其他鉴权头
成功响应为纯文本 HTTPS 文件地址，trim() 后使用
```

浏览器直接上传，不经过 Vercel Function 的请求体。浏览器生成 multipart boundary，
原文件名后缀保留。文件域名只接受文档中的 `s3v2.haikouer.top` 和实测的 `s3v2.lamen.top`；
未知域名会明确报错，需要确认上游协议后更新代码，不能把任意 URL 当作下载目标。

旧 S3、DUFS、OSS 预览配置、签名上传、服务端存储回退及 AWS SDK 已移除。
历史迁移里的枚举和现有记录保留；所有新写入只接受 `REMOTE`。
兼容字段 `s3Key` 保存单文件地址或第 0 片地址，不再是对象存储 key。

## 文件大小、重试与下载

- ≤10 MiB：一次 multipart 上传。
- >10 MiB：8 MiB/片，每片仍调用上述同一个接口，并保留原文件后缀。
- 逻辑附件上限沿用 10 GiB，公告图片上限 200 MiB。上游文档仅确认单请求约 11 MB；
  大文件的实际可用性还受网络和部署平台的运行时长影响，不能将业务上限视为实测结果。
- 文档未给出上游原生分片协议。本实现使用应用分片清单与合并下载，不猜测未提供的接口。
- 同时最多上传 3 个文件，文件内顺序上传。网络、超时、408、429、5xx 最多尝试 3 次，
  间隔 400/800 ms；参数、权限、非法响应直接失败。
- 当前页面保留已完成文件和分片；重试跳过它们。刷新后需重新选择文件。
  消息以 `clientMessageId` 去重，响应丢失后的重试不会重复落库。
- 分片清单保存到 `MessageAttachment.chunkManifest`，校验索引、大小、首片地址和 SHA-256。
  下载先验证一片再输出，按顺序流式合并，不把整个大文件放入内存。
- 下载和预览保留房间成员权限校验，支持单个 HTTP Range、原文件名和视频拖动。
  每片读取超时 90 秒；Vercel 路由最长运行时间配置为 300 秒。
- 图片/视频单文件直接使用校验后的预览地址；分片预览使用房间内的流式接口。
  无需旧的预览 RPC、Bucket、Cookie。

## 复用数据库的升级步骤

1. 保持当前 `DATABASE_URL`。执行 `npx prisma migrate deploy`，不要使用重初始化脚本。
   两个增量迁移仅增加枚举值、可空字段和重试去重索引，不清空业务数据。
2. 如果已有加密消息，首次升级时保留原 `CHAT_ENCRYPTION_KEY`。
   应用按原算法验证历史消息并把有效密钥导入现有 `AppAuthConfig.encryptionKey`。
   密钥缺失或不匹配时会拒绝初始化，不用新密钥覆盖历史消息。
3. 成功读写一条文本消息后，可仅查询初始化标志，避免输出密钥：

   ```sql
   SELECT "encryptionKey" IS NOT NULL AS initialized
   FROM "bendy_shadowsend_app_auth_config" WHERE id = 'default';
   ```

4. 初始化成功后移除 `CHAT_ENCRYPTION_KEY`；后续实例读取数据库密钥。
   空数据库自动生成随机 AES-256-GCM 密钥并原子持久化，多个实例使用同一密钥。
   现有管理 auth 值仍保留在数据库，`APP_AUTH` 仅是可选的初始值兼容入口。
5. 从部署平台移除所有 `S3_*`、`DUFS_*`、`OSS_PREVIEW_*` 及旧配置中心引导变量。
   这些变量不再被运行时代码读取，非法旧配置也不会阻止服务启动。
6. 历史对象 key 无法从新接口推导地址；记录保留，旧附件读取返回
   `410 ATTACHMENT_STORAGE_RETIRED`，需要原文件重新上传。旧公告图片不再尝试请求旧服务。

Vercel Preview 默认不迁移共享数据库，防止需求分支推送修改生产数据。
生产发布才自动执行增量迁移；Preview 应使用已迁移的隔离数据库，或由运维明确设置
`FORCE_DB_MIGRATE=true`。正式发布仍需按项目规范创建对应 `-ver` tag。

## 验证

本机测试、安装、构建前检查负载和可用内存，统一经 `bacs-heavy` 串行执行：

```bash
bacs-heavy npm ci --no-audit --no-fund
bacs-heavy npm run prisma:generate
bacs-heavy npx prisma migrate deploy
bacs-heavy npm test -- --maxWorkers=2
bacs-heavy npm run test:release-tag
bacs-heavy npm run lint
bacs-heavy npx tsc --noEmit
bacs-heavy npm run build
```

GitHub CI 使用独立 PostgreSQL，按分支取消旧 run，并依次执行迁移、测试、lint、类型检查和构建。
发布验收需检查文本、各种文件类型、>10 MiB 文件、公告图片、下载文件名、Range、
网络失败重试以及旧消息解密；第三方公网接口验证与单元测试结果分别记录。

本次交付验证（2026-11-14）：103 项单元测试、9 项发布工具测试、lint、类型检查和生产构建均通过。
隔离 PostgreSQL 上的 8 个迁移成功，带历史数据的升级与重启回归 17 项通过；缺失或错误旧密钥
不会覆盖数据，正确导入后移除环境密钥仍能解密。实际浏览器/API 联调 47 项通过，覆盖七类文件、
12 MiB 分片文件的 SHA-256 下载一致性、跨片 Range、公告多图失败重试、消息去重和非成员拒绝。
实际上传并发峰值为 3；390px 浏览器模拟无横向溢出、无 JavaScript 页面异常。
物理设备、10 GiB 文件及生产发布后的运行时长仍需验收。

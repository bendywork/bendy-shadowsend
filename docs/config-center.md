# 笨迪配置中心接入（双轨配置）

> 需求：REQ-202610-1400。目标是把运行时业务配置接到笨迪配置中心（Cloudflare Worker + D1），
> 同时保留 Vercel 环境变量作为兜底，配置中心故障不影响服务可用性。

## 1. 读取模型

业务代码只依赖 `src/lib/env.ts`，外部形状保持不变：

```ts
import { env, isS3Configured } from "@/lib/env";

env.appAuth;
env.encryptionKey;
env.s3.endpoint;
env.dufs.baseUrl;
isS3Configured();
```

每个字段都是 getter，读取时按以下顺序取值：

| 优先级 | 来源 | 条件 | 日志来源 |
| --- | --- | --- | --- |
| 1 | 配置中心内存快照 | 键存在、值非空、通过字段校验 | `Source: ConfigCenter` |
| 2 | Vercel 环境变量 | 环境变量存在、非空、通过字段校验 | `Source: VercelEnv` |
| 3 | 代码默认值 | 例如 `APP_AUTH=bendywork`、开发环境加密 Key | `Source: VercelEnv` |

以下情况会**逐键**回退到环境变量，而不是整份配置作废：

- 配置中心没有该键；
- 配置中心该键的值为空字符串；
- 配置中心的值未通过校验（例如 URL 字段不是合法 URL、`APP_AUTH` 超长、加密 Key 少于 32 字符）；
- 配置中心请求失败且进程内没有可用快照。

`getConfigValue` / `getConfigEntry` 同步返回，不会向业务层抛错。

## 2. 引导环境变量

引导参数本身必须来自环境变量（配置中心无法给自己提供连接信息）。

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `CONFIG_CENTER_URL` | 接入时必填 | 空 | 配置中心地址，例如 `https://bendywork-config-center.bendywork-base.workers.dev` |
| `CONFIG_CENTER_APP_KEY` | 接入时必填 | 空 | 应用 `app_key`（`ak_` 开头） |
| `CONFIG_CENTER_APP_SECRET` | 接入时必填 | 空 | 应用 `app_secret`（`as_` 开头），只存 Vercel 环境变量 |
| `CONFIG_CENTER_PROJECT` | 否 | `bendy-shadowsend` | 项目名 |
| `CONFIG_CENTER_ENVIRONMENT` | 否 | 按 `VERCEL_ENV` 映射 | `production → prod`、`preview → pre`、`development → dev`，其余 `dev` |
| `CONFIG_CENTER_GROUP` | 否 | `app-config` | 配置组名 |
| `CONFIG_CENTER_TIMEOUT_MS` | 否 | `2500` | 单次请求硬超时，收敛到 `500~10000` |
| `CONFIG_CENTER_TTL_MS` | 否 | `300000`（5 分钟） | 内存快照有效期，收敛到 `5000~3600000` |
| `CONFIG_CENTER_RETRY_MS` | 否 | `30000` | 首次失败后的重试间隔，指数退避，上限 5 分钟 |
| `CONFIG_CENTER_ENABLED` | 否 | 未设置（启用） | 设为 `false` 可整体关闭配置中心，强制走环境变量 |

四项连接信息（URL / APP_KEY / APP_SECRET / PROJECT）与环境、组名任一为空时，配置中心视为未配置，
直接走环境变量，不会发起任何请求。

## 3. 支持的内容格式

配置组内容按 `format` 字段解析：

- `json`：必须是 JSON 对象；嵌套对象用点号打平（`{"s3":{"bucket":"b"}}` → `s3.bucket`），
  数组序列化为 JSON 字符串，`null`/空对象视为空值；
- `properties` / `text`：`KEY=VALUE` 或 `KEY: VALUE`，忽略 `#`、`;` 注释行；
- `ini`：在 properties 基础上支持 `[section]`，键名为 `section.KEY`；
- `yaml` / `toml`：当前不解析，整次拉取按失败处理并回退环境变量（避免错误解析导致配置串味）。

本项目的配置组固定使用 `json`，键名即环境变量名（扁平结构，不嵌套）。

## 4. 超时、重试与缓存

- **启动预热**：`src/instrumentation.ts` 的 `register()` 在 Node.js runtime 启动时调用
  `initializeConfigCenter()`，最多等待一个超时周期；失败只记录警告，不阻塞服务启动。
- **后台刷新**：`startConfigAutoRefresh()` 按 `max(30s, TTL)` 定时强制刷新，定时器 `unref()`，
  不阻止进程退出。
- **懒刷新**：每次读取配置时若快照已过期，会在后台触发一次刷新；当前读取仍返回旧快照，
  不阻塞请求。
- **并发去重**：同一时刻只允许一个拉取请求，其余调用复用该 in-flight Promise。
- **失败退避**：首次失败后等待 `CONFIG_CENTER_RETRY_MS`，连续失败按 2 倍退避，上限 5 分钟；
  退避窗口内不再请求，避免配置中心宕机时产生请求风暴。
- **stale-on-error**：已有快照时刷新失败会继续使用旧快照（日志标记 `stale`）；
  进程刚启动且从未成功拉取时才完全回退环境变量。
- **实例级缓存**：快照保存在进程内存。Vercel 多实例各自拉取；实例休眠后由下次访问懒刷新。

## 5. 来源日志

日志只输出键名、来源、版本与错误码，**绝不输出配置值或 `app_secret`**。

```text
[config-center] Source: ConfigCenter { project, environment, group, version, keys, durationMs, ttlMs }
[config-center] Source: VercelEnv — config center unavailable { reason, attempts, nextRetryAt, ... }
[config-center] Source: ConfigCenter (stale) — refresh failed { reason, attempts, staleSince, nextRetryAt }
[config-center] key=S3_ENDPOINT Source: VercelEnv { reason: 'empty value in config center' }
```

逐键回退日志每个键只打印一次，避免高频读取刷屏。

## 6. 诊断接口

`GET /api/config/status`

- 不带参数：返回 `{ enabled, source, stale }`；
- 带 `?auth=<APP_AUTH>`：校验通过后返回完整状态（项目、环境、组、版本、键数量、
  加载/过期时间、最近错误码与下次重试时间）。

响应头 `Cache-Control: no-store`，且不包含任何配置值或密钥。

## 7. 配置中心侧资源

已在笨迪配置中心（`bendywork-config-center`）创建：

| 资源 | 名称 |
| --- | --- |
| 项目 | `bendy-shadowsend` |
| 环境 | `prod` / `pre` / `dev` |
| 配置组 | `app-config`（JSON，三个环境各一份） |
| 应用 | `bendy-shadowsend`（启用，已订阅三个 `app-config` 组） |

初始内容为 15 个受支持键，值全部为空字符串。这样在未填写任何值之前，所有配置仍按环境变量生效；
后续在配置中心填入非空值即可逐键覆盖，无需重新部署。

受支持键：

```text
APP_AUTH
CHAT_ENCRYPTION_KEY
S3_REGION
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
DUFS_BASE_URL
DUFS_PUBLIC_BASE_URL
DUFS_PATH_PREFIX
DUFS_AUTH
OSS_PREVIEW_RPC_URL
OSS_PREVIEW_BUCKET_NAME
OSS_PREVIEW_COOKIE
```

应用凭据（`app_key` / `app_secret`）只保存在服务器 root-only 文件
`/root/bacs-1400-config-center-credentials.env`，需要人工在 Vercel 项目
Production / Preview / Development 三个环境配置同名变量。**不要把凭据提交到仓库或贴进聊天记录。**

## 8. 边界：哪些配置不经过配置中心

| 配置 | 原因 |
| --- | --- |
| `DATABASE_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL` | Prisma 在模块加载期创建客户端，属于自举依赖；配置中心故障时不能影响数据库连接 |
| `NEXT_PUBLIC_MAX_MESSAGE_TEXT_CHARS` / `NEXT_PUBLIC_MAX_ANNOUNCEMENT_IMAGES` | `NEXT_PUBLIC_*` 在构建期内联到前端 bundle，运行时读取无效 |
| `FORCE_DB_MIGRATE` / `PRISMA_MIGRATE_*` | 仅部署构建脚本使用，运行时不读取 |
| Vercel 平台变量（`VERCEL_ENV` 等） | 平台注入，只用于推导配置中心环境名 |

另外两个运行时注意点：

- `APP_AUTH`：首次读取时由 `system-auth.ts` 以 create-only upsert 写入数据库
  `bendy_shadowsend_app_auth_config`。之后修改配置中心或环境变量都不会改变已有安装的鉴权值，
  运行时改鉴权请继续使用 `/changeAuth`。
- `CHAT_ENCRYPTION_KEY`：更换会导致历史消息无法解密，属于数据迁移操作，不要通过配置中心随意切换。

## 9. 验证

```bash
# 单元测试（解析、超时、退避、stale、逐键回退、env getter）
npm test

# 类型与 lint
npx tsc --noEmit
npm run lint

# 构建
npm run build
```

线上/本地验证：

1. 配置好 `CONFIG_CENTER_*` 后启动服务，日志应出现
   `[config-center] Source: ConfigCenter`，并带有 `version` 与 `keys`；
2. 访问 `/api/config/status`，`source` 应为 `ConfigCenter`；
3. 在配置中心把某个键改成非空值（例如 `S3_REGION`），等待一个 TTL 或重启实例后，
   `/getInfo?auth=...` 中对应字段应变化；
4. 把 `CONFIG_CENTER_URL` 改成不可达地址重启，服务应正常启动，
   日志出现 `Source: VercelEnv — config center unavailable`，业务读取仍走环境变量；
5. 把某个键在配置中心置空，对应字段应回退到环境变量值。

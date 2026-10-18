# 全局反馈规范（Toast + 行内校验）

> 适用版本：v0.1.68（REQ-202610-0475 / ui-12）
> 目标：所有操作结果与字段错误都有固定出口——动作结果走 Toast，字段错误走行内校验，不再各页面各写一套提示条、错误文案或 `alert`。

## 1. 反馈路由

| 场景 | 出口 | 是否持久 | 示例 |
| --- | --- | --- | --- |
| 动作成功 | `success` Toast | 否（2400ms） | 复制链接、保存房间名、移出成员 |
| 中性结果 / 等待态 | `info` Toast | 否（3000ms） | 加入申请已提交、识别到邀请链接 |
| 接近上限 / 输入被裁剪 | `warning` Toast | 否（3600ms） | 房间数上限、文件数上限 |
| 动作失败 / 网络异常 | `error` Toast | 否（4800ms） | 创建房间失败、上传失败、轮询失败 |
| 表单字段不合法 | 字段下方行内错误 | 是（直到修正） | 房间名为空、门禁码不是 6 位 |
| 页面初始加载失败 | 页面级错误态 + 重试按钮 | 是 | 房间快照拉取失败 |

判断口径：

- **动作已经发生，只需告知结果** → Toast。
- **用户还没提交成功，需要指出具体哪个字段** → 行内校验，不弹 Toast。
- **整页没有数据可渲染** → 页面级错误态，保留重试入口，不用会自动消失的 Toast。
- 同一次失败只播报一次：字段级错误不再额外弹 Toast；跨字段/服务端失败才用 Toast。

## 2. 错误文案分层

实现：`src/lib/feedback.ts` + `src/lib/client.ts`（`ApiRequestError`）

`apiFetch` 抛出的 `ApiRequestError` 携带 `status` 与后端 `code`，反馈层据此决定展示哪一层文案：

| 错误类型 | 判定 | 展示 |
| --- | --- | --- |
| 网络不可达 / 响应读取失败 | `code === "NETWORK_ERROR"` 或浏览器网络错误 | `toast.networkError`（统一文案，不暴露 URL/方法） |
| 后端业务错误（4xx） | `status < 500` 且有可读 `message` | 原样展示后端 `message` |
| 服务端内部错误 | `status >= 500` / `INTERNAL_SERVER_ERROR` | 调用方传入的本地化兜底文案 |
| 响应解析失败 | `code === "INVALID_RESPONSE"` | 调用方兜底文案 |
| 空消息 / 通用“请求失败” | 无有效信息 | 调用方兜底文案 |

用法：

```ts
import { toastError } from "@/lib/feedback";

try {
  await apiFetch("/api/rooms", { method: "POST", body });
} catch (error) {
  toastError(error, t("toast.createRoomFailed"), t);
}
```

- 所有 catch 分支统一走 `toastError(error, fallback, t)`，不再手写 `error instanceof Error ? error.message : "..."`。
- 需要同时把文案渲染到页面级错误态时，用 `resolveErrorMessage(error, fallback, t)` 取同一份文案，避免 Toast 与页面显示两套说法。
- 成功/警告/信息类反馈继续直接调用 `toast.success / warning / info`，文案一律走 `toast.*` i18n 键。

## 3. 行内校验

实现：`src/lib/form-validation.ts` + `src/components/ui/field-error.tsx`

- 校验函数返回 `MessageKey | null`，由调用方用当前语言翻译，保证首页、房间入口弹窗、房间设置三处文案一致。
- 共享规则：房间名必填且 ≤ 48 字符；门禁码为空或恰好 6 位数字；房间号 4–64 字符。
- 表单加 `noValidate`，由提交处理函数先校验再发请求；不要依赖浏览器原生气泡。
- 控件设置 `aria-invalid={true}` 与 `aria-describedby` 指向错误节点；错误节点 `role="alert"`。
- 用户修改该字段时立即清除对应错误，不等到下一次提交。
- 样式：`input[aria-invalid="true"]` 使用 `--ds-danger-border`，聚焦时 `--ds-danger` + `--ds-danger-soft` 光环；`.field-error` 使用 `--ds-danger`、12px/18px。

```tsx
const error = validateRoomName(name);

<input
  value={name}
  onChange={...}
  aria-invalid={error ? true : undefined}
  aria-describedby={error ? "room-name-error" : undefined}
/>
<FieldError id="room-name-error" message={error ? t(error) : undefined} />
```

## 4. 覆盖范围（v0.1.68）

- 首页：初始化失败、邀请链接识别、创建/加入房间失败、房间名/门禁码/房间号行内校验。
- 房间页：初始加载失败（页面级 + 重试）、消息轮询与房间同步失败、发送失败、上传失败（网络/超限/服务端）、剪贴板读取、下载、移出成员、转让房主、审批、快速创建/加入、退出、公告保存/已读、解散、房间名、门禁码、加入策略、永不过期。
- 房间入口弹窗与设置面板：与首页共用同一套校验函数与错误样式。
- `window.confirm` 暂不替换：危险操作确认体系属于 ui-28，不在本次范围内。

## 5. 验收清单

- [ ] 断网后创建/加入房间，只出现一条“网络异常”Toast，不出现 URL、方法名或 `Failed to fetch`。
- [ ] 后端 4xx 业务错误（如门禁码错误）展示后端可读文案；5xx 展示本地化兜底文案。
- [ ] 空房间名提交时，字段下方出现行内错误、边框变红、焦点字段带 `aria-invalid`，且不弹 Toast。
- [ ] 修改出错字段后错误立即消失；再次提交才重新校验。
- [ ] 首页、房间入口弹窗、房间设置对同一规则的错误文案一致。
- [ ] 房间初始加载失败时显示页面级错误与“重试”按钮；重试成功后正常渲染。
- [ ] 同一错误连续触发只保留一条 Toast（store 去重），不堆叠。
- [ ] 深色/浅色主题下错误色、边框与 Toast 均可读。

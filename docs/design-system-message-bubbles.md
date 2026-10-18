# 消息气泡体系规范

> 适用版本：v0.1.69（REQ-202610-0481 / ui-18）
> 目标：气泡形态、圆角与间距只有一套规则；时间、回执、发送中、失败四种状态信息各归其位，不再和正文抢层级。

## 1. 气泡解剖

实现：`src/components/chat/message-bubble.tsx`

```
article.message-row              data-own / data-status / data-group-position
├─ Avatar | avatar-spacer        （仅对方消息；组首显示头像）
└─ div.message-body
   ├─ div.message-sender         （仅对方消息组首显示昵称）
   ├─ div.message-bubble
   │  ├─ div.message-content
   │  │  ├─ p.message-text
   │  │  └─ div.message-actions  复制 / 展开，hover 或 focus-within 时出现
   │  ├─ div.message-attachments
   │  └─ div.message-progress    仅发送中显示
   └─ div.message-meta           time + 状态（已发送 / 已读 / 发送中 / 失败）
      p.message-error            仅失败且存在错误详情时显示
```

- 自己发送的消息右对齐，不显示头像与昵称；对方消息左对齐，头像固定 32px。
- 同一发送者连续消息构成一组，组内只出现一次头像和昵称。
- 正文与状态分离：状态永远在气泡外的 meta 行，不覆盖消息内容；meta 只在组末/单条消息出现，发送中与失败态例外，确保组内 4px 间距不被时间行撑开。
- 复制/展开为 meta 行内的图标按钮，桌面端 hover 或键盘 focus 时显现，触屏设备常驻。

## 2. 形态与间距

| 项 | 规则 |
| --- | --- |
| 圆角 | 16px（`--ds-radius-lg`） |
| 尾角 | 组末气泡靠发送者一侧下角 6px（`--ds-radius-xs`） |
| 内边距 | 10px 14px |
| 组内间距 | 4px（`--ds-space-1`） |
| 组间间距 | 16px（`--ds-space-4`） |
| 最大宽度 | 移动端 `min(82%, 42rem)`；≥640px `min(76%, 42rem)` |
| 对方气泡 | `--ds-surface-card` 背景 + `--ds-shadow-xs`，不依赖粗边框 |
| 自己气泡 | 反色 `--ds-action-bg` / `--ds-action-fg` |

分组窗口为 5 分钟，定义在 `src/lib/message-bubble.ts` 的 `MESSAGE_GROUP_WINDOW_MS`。跨发送者、超过窗口或时间戳非法都会断开分组。

## 3. 状态层级

| 状态 | 数据来源 | 呈现 |
| --- | --- | --- |
| `received` | 对方消息 | 仅显示时间，不显示回执 |
| `sent` | 自己消息，暂无其他成员 `lastSeenAt` 追上 | 单勾 + “已发送” |
| `read` | 任一其他成员 `lastSeenAt >= createdAt` | 双勾 + “已读”，使用 `--ds-success` |
| `sending` | 本地待发送消息 | 旋转图标 + “发送中 N%” + 气泡内 2px 进度条 |
| `failed` | 发送失败 | 危险色气泡边、X + “发送失败”、行内错误详情、重试按钮 |

- 进度条只动 `transform: scaleX()`，不修改宽度。
- 失败态使用 `role="alert"`；发送中使用 `role="status"` 与 `aria-live="polite"`。
- 重试会复用原始 `File[]` 与文本，状态回到 `sending`、进度归零。

## 4. 视觉与交互细节

- 气泡颜色全部来自 `--ds-*` 语义 token，不写死色值。
- 自己气泡内的附件卡、下载按钮通过 `--message-bubble-soft` / `--message-bubble-line` 继承反色上下文，保证深浅主题可读。
- 复制/展开按钮默认 `opacity: 0`，hover、`focus-within` 或触屏设备上显示；过渡只作用于 `opacity` 与 `transform`，不占据气泡内部高度。
- 附件图片最大高度 280px，视频保留原生 controls；双击图片打开查看器。
- 消息列表使用 `role="log"`、`aria-live="polite"`、`aria-relevant="additions"`，新消息可被辅助技术播报。
- `prefers-reduced-motion: reduce` 下关闭旋转、进度条过渡与按钮过渡。

## 5. 验收清单

- [ ] 连续同一发送者的消息组内只出现一次头像/昵称，组内 4px、组间 16px。
- [ ] 自己与对方气泡在深色/浅色主题下都有足够对比度，附件与下载按钮可读。
- [ ] 今天消息只显示时间，同年旧消息显示“月/日 时间”，跨年显示完整日期。
- [ ] 发送中可见百分比与进度条；成功后变为单勾“已发送”，被读取后变为双勾“已读”。
- [ ] 发送失败出现危险色提示、错误详情与重试按钮；重试成功后失败气泡消失。
- [ ] 仅附件消息不渲染复制/展开操作区。
- [ ] 键盘 Tab 可聚焦复制、展开、下载、重试按钮，并有可见 focus ring。
- [ ] 移动端气泡不超过 82% 宽度，桌面端不超过 76%，长文本与长文件名正确换行/截断。

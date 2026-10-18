<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 发布 Tag（强制规范）

- 每次发布推送（合并到 `master` 并触发 Vercel 部署）都必须同时创建并推送对应 tag；只推代码不推 tag 视为发布未完成。
- 本项目部署在 Vercel，所有 tag 必须以 `-ver` 结尾。
- 正常版本：`<version>-ver`（示例 `0.1.1640-ver`）；修复版本：`<version>-fix-<次数>-ver`（示例 `0.1.164-fix-210-ver`）。
- 使用 `npm run release:tag`（正常）或 `npm run release:tag -- --fix <次数>`（修复）创建并推送 tag；详细规范见 `docs/release-tagging.md`。

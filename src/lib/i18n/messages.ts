// 轻量客户端 i18n 文案表。仅覆盖界面外壳（按钮 / 标签 / 菜单 / 设置文案）；
// 聊天正文与后端错误提示按需求决策暂不做双语。
// 新增文案：在 zh 与 en 各补一行同名键即可，缺键会有编译期校验兜底。

export const messages = {
  zh: {
    "lang.name.zh": "中文",
    "lang.name.en": "English",
    "control.language": "语言",
    "control.appearance": "外观",
    "control.theme.toLight": "切换到浅色",
    "control.theme.toDark": "切换到深色",
    "header.invite": "邀请",
    "header.qr": "二维码",
    "header.announcement": "公告",
    "header.announcement.edit": "编辑公告",
    "header.announcement.view": "查看公告",
    "header.managePanel.show": "显示管理面板",
    "header.managePanel.hide": "隐藏管理面板",
    "header.dissolve": "解散房间",
    "header.dissolving": "解散中…",
    "header.members": "{count}/{max} 人",
  },
  en: {
    "lang.name.zh": "中文",
    "lang.name.en": "English",
    "control.language": "Language",
    "control.appearance": "Appearance",
    "control.theme.toLight": "Switch to light",
    "control.theme.toDark": "Switch to dark",
    "header.invite": "Invite",
    "header.qr": "QR code",
    "header.announcement": "Announcement",
    "header.announcement.edit": "Edit announcement",
    "header.announcement.view": "View announcement",
    "header.managePanel.show": "Show manage panel",
    "header.managePanel.hide": "Hide manage panel",
    "header.dissolve": "Dissolve room",
    "header.dissolving": "Dissolving…",
    "header.members": "{count}/{max} people",
  },
} as const;

export type Lang = keyof typeof messages;
export type MessageKey = keyof (typeof messages)["zh"];

export const LANGS = Object.keys(messages) as Lang[];
export const DEFAULT_LANG: Lang = "zh";
export const LANG_STORAGE_KEY = "tb:lang";
// 与 <html lang> 对应的取值
export const HTML_LANG: Record<Lang, string> = { zh: "zh-CN", en: "en" };

// 编译期校验：en 必须覆盖 zh 的全部键，缺键即报错。
type _EnParity = (typeof messages)["en"] extends Record<MessageKey, string> ? true : never;
const _enParity: _EnParity = true;
void _enParity;

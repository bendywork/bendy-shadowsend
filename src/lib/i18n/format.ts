import type { Lang } from "./messages";

const LOCALE: Record<Lang, string> = { zh: "zh-CN", en: "en-US" };

/** 按当前界面语言格式化日期时间；非法输入返回占位符。 */
export function formatDateTime(value: string, lang: Lang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(LOCALE[lang], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

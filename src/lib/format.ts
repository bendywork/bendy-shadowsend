// 统一的日期时间展示：聊天消息与成员/审批列表共用，避免各页面各写一套格式。
export function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

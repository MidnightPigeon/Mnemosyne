export function formatTimelineTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function relativeSaveState(value?: string, isDirty = false): string {
  if (isDirty) {
    return "有未保存更改";
  }

  if (!value) {
    return "尚未保存";
  }

  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds} 秒前已保存`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟前已保存`;
  }

  return "已保存";
}

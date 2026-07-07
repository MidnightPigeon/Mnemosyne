import type { UiLanguage } from "./summary";

export function formatTimelineTime(value: string, language: UiLanguage = "zh"): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function relativeSaveState(value?: string, isDirty = false, language: UiLanguage = "zh"): string {
  if (isDirty) {
    return language === "en" ? "Unsaved changes" : "有未保存更改";
  }

  if (!value) {
    return language === "en" ? "Not saved yet" : "尚未保存";
  }

  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) {
    if (language === "en") {
      return `Saved ${seconds}s ago`;
    }
    return `${seconds} 秒前已保存`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    if (language === "en") {
      return `Saved ${minutes}m ago`;
    }
    return `${minutes} 分钟前已保存`;
  }

  return language === "en" ? "Saved" : "已保存";
}

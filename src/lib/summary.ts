import type { Idea } from "../types/idea";

export type UiLanguage = "zh" | "en";

export function getIdeaTitle(idea: Pick<Idea, "kind" | "title" | "body" | "canvas" | "melody">, language: UiLanguage = "zh"): string {
  if (idea.title.trim()) {
    return idea.title.trim();
  }

  if (idea.kind === "melody") {
    return language === "en" ? "Untitled melody clip" : "未命名旋律片段";
  }

  return idea.kind === "pixel"
    ? language === "en"
      ? "Untitled pixel canvas"
      : "未命名像素画布"
    : language === "en"
      ? "Untitled text record"
      : "未命名文本记录";
}

export function getIdeaExcerpt(idea: Pick<Idea, "kind" | "body" | "canvas" | "melody">, language: UiLanguage = "zh"): string {
  if (idea.kind === "pixel") {
    const size = idea.canvas ? `${idea.canvas.width} x ${idea.canvas.height}` : language === "en" ? "No size" : "未设置尺寸";
    return `${language === "en" ? "Pixel canvas" : "像素画布"} · ${size}`;
  }

  if (idea.kind === "melody") {
    const tracks = idea.melody?.tracks.length ?? 0;
    const bars = idea.melody?.bars ?? 0;
    const notes = idea.melody?.tracks.reduce((sum, track) => sum + track.notes.length, 0) ?? 0;
    if (language === "en") {
      return `Melody clip · ${tracks} tracks · ${bars} bars · ${notes} notes`;
    }
    return `旋律片段 · ${tracks} 音轨 · ${bars} 小节 · ${notes} 音符`;
  }

  const normalized = idea.body.replace(/[#>*_`-]/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return language === "en" ? "Blank text record" : "空白文本记录";
  }

  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
}

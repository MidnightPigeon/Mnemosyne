import type { Idea } from "../types/idea";

export function getIdeaTitle(idea: Pick<Idea, "kind" | "title" | "body" | "canvas">): string {
  return idea.title.trim() || (idea.kind === "pixel" ? "未命名像素画布" : "未命名文本记录");
}

export function getIdeaExcerpt(idea: Pick<Idea, "kind" | "body" | "canvas">): string {
  if (idea.kind === "pixel") {
    const size = idea.canvas ? `${idea.canvas.width} x ${idea.canvas.height}` : "未设置尺寸";
    return `像素画布 · ${size}`;
  }

  const normalized = idea.body.replace(/[#>*_`-]/g, "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "空白文本记录";
  }

  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
}

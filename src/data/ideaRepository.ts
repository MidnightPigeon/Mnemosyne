import { invoke } from "@tauri-apps/api/core";
import { normalizeMelodyClip } from "../lib/midi";
import type { Idea, IdeaInput, PixelCanvas, StorageSettings } from "../types/idea";

type StoredIdea = Omit<Idea, "title"> & {
  title?: string;
};

export async function getStorageSettings(): Promise<StorageSettings> {
  return invoke<StorageSettings>("get_storage_settings");
}

export async function chooseStorageDir(): Promise<StorageSettings | null> {
  return invoke<StorageSettings | null>("choose_storage_dir");
}

export async function listIdeas(): Promise<Idea[]> {
  const ideas = await invoke<StoredIdea[]>("list_ideas");
  return ideas.map(normalizeIdea);
}

export async function upsertIdea(input: IdeaInput): Promise<Idea> {
  const idea = await invoke<StoredIdea>("save_idea", { input });
  return normalizeIdea(idea);
}

export async function deleteIdea(id: string): Promise<void> {
  return invoke<void>("delete_idea", { id });
}

export async function exportMarkdown(title: string, body: string): Promise<string | null> {
  return invoke<string | null>("export_markdown", { title, body });
}

export async function exportMarkdownPdf(title: string, body: string): Promise<string | null> {
  return invoke<string | null>("export_markdown_pdf", { title, body });
}

export async function exportLatexPdf(title: string, body: string): Promise<string | null> {
  return invoke<string | null>("export_latex_pdf", { title, body });
}

export async function exportCanvasPng(title: string, canvas: PixelCanvas): Promise<string | null> {
  return invoke<string | null>("export_canvas_png", { title, canvas });
}

export async function exportCanvasJpg(title: string, canvas: PixelCanvas): Promise<string | null> {
  return invoke<string | null>("export_canvas_jpg", { title, canvas });
}

export async function importMidiFile(): Promise<number[] | null> {
  return invoke<number[] | null>("import_midi_file");
}

export async function exportMidiFile(title: string, data: Uint8Array | number[]): Promise<string | null> {
  return invoke<string | null>("export_midi_file", { title, data: Array.from(data) });
}

export async function exportWavFile(title: string, data: Uint8Array | number[]): Promise<string | null> {
  return invoke<string | null>("export_wav_file", { title, data: Array.from(data) });
}

export async function importImageFile(): Promise<number[] | null> {
  return invoke<number[] | null>("import_image_file");
}

export async function importImageCanvas(width: number, height: number, crop: boolean): Promise<PixelCanvas | null> {
  return invoke<PixelCanvas | null>("import_image_canvas", { width, height, crop });
}

export async function resizeCanvas(canvas: PixelCanvas, width: number, height: number, crop: boolean): Promise<PixelCanvas> {
  return invoke<PixelCanvas>("resize_canvas", { canvas, width, height, crop });
}

// 兼容早期没有 title、program 或小节字段的 JSON。
function normalizeIdea(idea: StoredIdea): Idea {
  return {
    ...idea,
    title: idea.title?.trim() || fallbackTitle(idea),
    textFormat: idea.kind === "markdown" ? idea.textFormat ?? "markdown" : undefined,
    melody: idea.melody ? normalizeMelodyClip(idea.melody) : undefined
  };
}

function fallbackTitle(idea: StoredIdea): string {
  if (idea.kind === "melody") {
    return "未命名旋律片段";
  }

  if (idea.kind === "pixel") {
    return idea.body.trim() || "未命名像素画布";
  }

  const firstLine = idea.body
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);

  return firstLine || "未命名文本记录";
}

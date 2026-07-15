import { create } from "zustand";
import {
  chooseStorageDir,
  deleteIdea,
  getStorageSettings,
  listIdeas,
  upsertIdea
} from "../data/ideaRepository";
import { createDefaultMelody } from "../lib/midi";
import type { Idea, IdeaKind, MelodyClip, PixelCanvas, StorageSettings, TextFormat } from "../types/idea";

type CreateIdeaOptions =
  | { kind: "markdown" }
  | { kind: "pixel"; width: number; height: number }
  | { kind: "melody" };

type IdeaState = {
  allIdeas: Idea[];
  ideas: Idea[];
  selectedIdeaId?: string;
  draftTitle: string;
  draftBody: string;
  draftTextFormat: TextFormat;
  draftCanvas?: PixelCanvas;
  draftMelody?: MelodyClip;
  query: string;
  storage?: StorageSettings;
  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  error?: string;
  lastSavedAt?: string;
  bootstrap: () => Promise<void>;
  createIdea: (options: CreateIdeaOptions) => Promise<void>;
  selectIdea: (id: string) => Promise<void>;
  setDraftTitle: (title: string) => void;
  setDraftBody: (body: string) => void;
  setDraftTextFormat: (format: TextFormat) => void;
  setDraftCanvas: (canvas: PixelCanvas) => void;
  setDraftMelody: (melody: MelodyClip) => void;
  saveSelectedIdea: () => Promise<void>;
  setQuery: (query: string) => void;
  removeIdea: (id: string) => Promise<void>;
  removeSelectedIdea: () => Promise<void>;
  chooseStorageFolder: () => Promise<void>;
};

const initialMarkdown = "";

export const useIdeaStore = create<IdeaState>((set, get) => ({
  allIdeas: [],
  ideas: [],
  draftTitle: "新文本记录",
  draftBody: initialMarkdown,
  draftTextFormat: "markdown",
  query: "",
  isLoading: true,
  isSaving: false,
  isDirty: false,
  async bootstrap() {
    set({ isLoading: true, error: undefined });

    try {
      const [storage, loadedIdeas] = await Promise.all([getStorageSettings(), listIdeas()]);
      const ideas = loadedIdeas.sort(sortByUpdatedAt);
      const selected = ideas[0];

      set({
        allIdeas: ideas,
        ideas,
        storage,
        selectedIdeaId: selected?.id,
        draftTitle: selected?.title ?? "新文本记录",
        draftBody: selected?.body ?? initialMarkdown,
        draftTextFormat: selected?.textFormat ?? "markdown",
        draftCanvas: selected?.canvas,
        draftMelody: selected?.melody,
        lastSavedAt: selected?.updatedAt,
        isDirty: false,
        isLoading: false
      });

      if (!selected) {
        await get().createIdea({ kind: "markdown" });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "无法加载本地灵感文件夹。",
        isLoading: false
      });
    }
  },
  async createIdea(options) {
    await get().saveSelectedIdea();

    const now = new Date().toISOString();
    const canvas = options.kind === "pixel" ? createCanvas(options.width, options.height) : undefined;
    const melody = options.kind === "melody" ? createDefaultMelody() : undefined;
    const idea: Idea = {
      id: crypto.randomUUID(),
      kind: options.kind,
      textFormat: options.kind === "markdown" ? "markdown" : undefined,
      title: defaultTitle(options.kind),
      body: options.kind === "markdown" ? initialMarkdown : "",
      canvas,
      melody,
      createdAt: now,
      updatedAt: now
    };

    set({
      selectedIdeaId: idea.id,
      draftTitle: idea.title,
      draftBody: idea.body,
      draftTextFormat: idea.textFormat ?? "markdown",
      draftCanvas: idea.canvas,
      draftMelody: idea.melody,
      lastSavedAt: undefined,
      isDirty: true
    });

    await get().saveSelectedIdea();
  },
  async selectIdea(id) {
    if (id === get().selectedIdeaId) {
      return;
    }

    await get().saveSelectedIdea();

    const selected = get().allIdeas.find((idea) => idea.id === id);
    if (!selected) {
      return;
    }

    set({
      selectedIdeaId: id,
      draftTitle: selected.title,
      draftBody: selected.body,
      draftTextFormat: selected.textFormat ?? "markdown",
      draftCanvas: selected.canvas,
      draftMelody: selected.melody,
      lastSavedAt: selected.updatedAt,
      isDirty: false
    });
  },
  setDraftTitle(title) {
    set({ draftTitle: title, isDirty: true });
  },
  setDraftBody(body) {
    set({ draftBody: body, isDirty: true });
  },
  setDraftTextFormat(format) {
    set({ draftTextFormat: format, isDirty: true });
  },
  setDraftCanvas(canvas) {
    set({ draftCanvas: canvas, isDirty: true });
  },
  setDraftMelody(melody) {
    set({ draftMelody: melody, isDirty: true });
  },
  async saveSelectedIdea() {
    const { selectedIdeaId, draftTitle, draftBody, draftTextFormat, draftCanvas, draftMelody, allIdeas, isDirty } = get();
    if (!selectedIdeaId || !isDirty) {
      return;
    }

    const current = allIdeas.find((idea) => idea.id === selectedIdeaId);
    const kind: IdeaKind = current?.kind ?? (draftMelody ? "melody" : draftCanvas ? "pixel" : "markdown");

    set({ isSaving: true, error: undefined });

    try {
      const saved = await upsertIdea({
        id: selectedIdeaId,
        kind,
        textFormat: kind === "markdown" ? draftTextFormat : undefined,
        title: draftTitle.trim() || defaultTitle(kind),
        body: draftBody,
        canvas: kind === "pixel" ? draftCanvas : undefined,
        melody: kind === "melody" ? draftMelody : undefined,
        createdAt: current?.createdAt
      });
      const allIdeasNext = [saved, ...allIdeas.filter((idea) => idea.id !== saved.id)].sort(sortByUpdatedAt);

      set((state) => ({
        allIdeas: allIdeasNext,
        ideas: filterIdeas(allIdeasNext, state.query),
        selectedIdeaId: saved.id,
        draftTitle: saved.title,
        draftBody: saved.body,
        draftTextFormat: saved.textFormat ?? "markdown",
        draftCanvas: saved.canvas,
        draftMelody: saved.melody,
        isSaving: false,
        isDirty: false,
        lastSavedAt: saved.updatedAt
      }));
    } catch (error) {
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : "保存失败。"
      });
    }
  },
  setQuery(query) {
    set((state) => ({
      query,
      ideas: filterIdeas(state.allIdeas, query)
    }));
  },
  async removeIdea(id) {
    try {
      await deleteIdea(id);
      const allIdeas = get().allIdeas.filter((idea) => idea.id !== id);
      if (id !== get().selectedIdeaId) {
        set((state) => ({
          allIdeas,
          ideas: filterIdeas(allIdeas, state.query)
        }));
        return;
      }

      const selected = allIdeas[0];
      set((state) => ({
        allIdeas,
        ideas: filterIdeas(allIdeas, state.query),
        selectedIdeaId: selected?.id,
        draftTitle: selected?.title ?? "新文本记录",
        draftBody: selected?.body ?? initialMarkdown,
        draftTextFormat: selected?.textFormat ?? "markdown",
        draftCanvas: selected?.canvas,
        draftMelody: selected?.melody,
        lastSavedAt: selected?.updatedAt,
        isDirty: false
      }));

      if (!selected) {
        await get().createIdea({ kind: "markdown" });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "删除失败。"
      });
    }
  },
  async removeSelectedIdea() {
    const selectedIdeaId = get().selectedIdeaId;
    if (!selectedIdeaId) {
      return;
    }

    try {
      await deleteIdea(selectedIdeaId);
      const allIdeas = get().allIdeas.filter((idea) => idea.id !== selectedIdeaId);
      const selected = allIdeas[0];

      set((state) => ({
        allIdeas,
        ideas: filterIdeas(allIdeas, state.query),
        selectedIdeaId: selected?.id,
        draftTitle: selected?.title ?? "新文本记录",
        draftBody: selected?.body ?? initialMarkdown,
        draftTextFormat: selected?.textFormat ?? "markdown",
        draftCanvas: selected?.canvas,
        draftMelody: selected?.melody,
        lastSavedAt: selected?.updatedAt,
        isDirty: false
      }));

      if (!selected) {
        await get().createIdea({ kind: "markdown" });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "删除失败。"
      });
    }
  },
  async chooseStorageFolder() {
    await get().saveSelectedIdea();

    try {
      const storage = await chooseStorageDir();
      if (!storage) {
        return;
      }

      set({ storage });
      await get().bootstrap();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "无法切换存储文件夹。"
      });
    }
  }
}));

// 新建像素画布时限制尺寸，防止一次性创建过大的 JSON 文件。
function createCanvas(width: number, height: number): PixelCanvas {
  const safeWidth = clamp(Math.round(width), 4, 128);
  const safeHeight = clamp(Math.round(height), 4, 128);

  return {
    width: safeWidth,
    height: safeHeight,
    pixels: Array.from({ length: safeWidth * safeHeight }, () => "#00000000")
  };
}

function defaultTitle(kind: IdeaKind): string {
  if (kind === "pixel") {
    return "未命名像素画布";
  }
  if (kind === "melody") {
    return "未命名旋律片段";
  }
  return "新文本记录";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sortByUpdatedAt(a: Idea, b: Idea): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function filterIdeas(ideas: Idea[], query: string): Idea[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return ideas;
  }

  return ideas.filter((idea) => {
    const canvasText = idea.canvas ? `${idea.canvas.width} ${idea.canvas.height}` : "";
    const melodyText = idea.melody
      ? `${idea.melody.bpm} ${idea.melody.beats} ${idea.melody.tracks.map((track) => track.name).join(" ")}`
      : "";
    return `${idea.kind} ${idea.title} ${idea.body} ${canvasText} ${melodyText}`.toLocaleLowerCase().includes(normalized);
  });
}

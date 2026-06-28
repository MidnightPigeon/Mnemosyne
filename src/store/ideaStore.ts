import { create } from "zustand";
import {
  chooseStorageDir,
  deleteIdea,
  getStorageSettings,
  listIdeas,
  upsertIdea
} from "../data/ideaRepository";
import type { Idea, IdeaKind, PixelCanvas, StorageSettings } from "../types/idea";

type CreateIdeaOptions =
  | { kind: "markdown" }
  | { kind: "pixel"; width: number; height: number };

type IdeaState = {
  allIdeas: Idea[];
  ideas: Idea[];
  selectedIdeaId?: string;
  draftTitle: string;
  draftBody: string;
  draftCanvas?: PixelCanvas;
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
  setDraftCanvas: (canvas: PixelCanvas) => void;
  saveSelectedIdea: () => Promise<void>;
  setQuery: (query: string) => void;
  removeSelectedIdea: () => Promise<void>;
  chooseStorageFolder: () => Promise<void>;
};

const initialMarkdown = "";

export const useIdeaStore = create<IdeaState>((set, get) => ({
  allIdeas: [],
  ideas: [],
  draftTitle: "新文本记录",
  draftBody: initialMarkdown,
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
        draftCanvas: selected?.canvas,
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
    const idea: Idea = {
      id: crypto.randomUUID(),
      kind: options.kind,
      title: options.kind === "markdown" ? "新文本记录" : "未命名像素画布",
      body: options.kind === "markdown" ? initialMarkdown : "",
      canvas,
      createdAt: now,
      updatedAt: now
    };

    set({
      selectedIdeaId: idea.id,
      draftTitle: idea.title,
      draftBody: idea.body,
      draftCanvas: idea.canvas,
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
      draftCanvas: selected.canvas,
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
  setDraftCanvas(canvas) {
    set({ draftCanvas: canvas, isDirty: true });
  },
  async saveSelectedIdea() {
    const { selectedIdeaId, draftTitle, draftBody, draftCanvas, allIdeas, isDirty } = get();
    if (!selectedIdeaId || !isDirty) {
      return;
    }

    const current = allIdeas.find((idea) => idea.id === selectedIdeaId);
    const kind: IdeaKind = current?.kind ?? (draftCanvas ? "pixel" : "markdown");

    set({ isSaving: true, error: undefined });

    try {
      const saved = await upsertIdea({
        id: selectedIdeaId,
        kind,
        title: draftTitle.trim() || (kind === "pixel" ? "未命名像素画布" : "未命名文本记录"),
        body: draftBody,
        canvas: kind === "pixel" ? draftCanvas : undefined,
        createdAt: current?.createdAt
      });
      const allIdeasNext = [saved, ...allIdeas.filter((idea) => idea.id !== saved.id)].sort(sortByUpdatedAt);

      set((state) => ({
        allIdeas: allIdeasNext,
        ideas: filterIdeas(allIdeasNext, state.query),
        selectedIdeaId: saved.id,
        draftTitle: saved.title,
        draftBody: saved.body,
        draftCanvas: saved.canvas,
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
        draftCanvas: selected?.canvas,
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
    pixels: Array.from({ length: safeWidth * safeHeight }, () => "#ffffff")
  };
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
    return `${idea.kind} ${idea.title} ${idea.body} ${canvasText}`.toLocaleLowerCase().includes(normalized);
  });
}

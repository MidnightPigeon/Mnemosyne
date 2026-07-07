import { useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  exportCanvasPng,
  exportMarkdown,
  exportMidiFile,
  importImageCanvas,
  importMidiFile
} from "../data/ideaRepository";
import { renderMarkdown } from "../lib/markdown";
import {
  createMelodyTrack,
  gmInstruments,
  normalizeMelodyClip,
  parseMidi,
  playMelody,
  previewMelodyNote,
  writeMidi
} from "../lib/midi";
import {
  cropCanvasBounds,
  drawEllipse,
  drawLine,
  drawRect,
  floodFill,
  paintBrush,
  pointFromIndex,
  scaleCanvasPixels,
  spray,
  transparentPixel,
  type DrawOptions,
  type PixelPoint,
  type PixelTool,
  type SprayShape
} from "../lib/pixelTools";
import { getIdeaExcerpt, getIdeaTitle } from "../lib/summary";
import { formatTimelineTime, relativeSaveState } from "../lib/time";
import { useIdeaStore } from "../store/ideaStore";
import type { Idea, IdeaKind, MelodyClip, MelodyNote, PixelCanvas } from "../types/idea";

const themes = {
  sky: {
    label: "浅蓝",
    app: "bg-[#eef6ff]",
    panel: "bg-[#f7fbff]",
    side: "bg-[#e5f0fb]",
    border: "border-[#c9d8e8]",
    muted: "text-[#607384]",
    hover: "hover:bg-[#edf6ff]",
    selected: "border-[#6d9cc8] bg-[#f7fbff]",
    primary: "bg-[#245b82] hover:bg-[#1d4c70] text-white"
  },
  mint: {
    label: "薄荷",
    app: "bg-[#edf8f3]",
    panel: "bg-[#f8fffb]",
    side: "bg-[#e2f2eb]",
    border: "border-[#c7ded4]",
    muted: "text-[#5f766b]",
    hover: "hover:bg-[#eef8f3]",
    selected: "border-[#76a891] bg-[#f8fffb]",
    primary: "bg-[#286451] hover:bg-[#1f5343] text-white"
  },
  gray: {
    label: "浅灰",
    app: "bg-[#f3f5f7]",
    panel: "bg-[#fbfcfd]",
    side: "bg-[#e9edf2]",
    border: "border-[#d1d8e0]",
    muted: "text-[#66717d]",
    hover: "hover:bg-[#f4f7fa]",
    selected: "border-[#8aa0b5] bg-[#fbfcfd]",
    primary: "bg-[#34495f] hover:bg-[#2b3d50] text-white"
  },
  blush: {
    label: "淡粉",
    app: "bg-[#fff1f5]",
    panel: "bg-[#fffafd]",
    side: "bg-[#f8e5ec]",
    border: "border-[#e8c9d4]",
    muted: "text-[#7f6570]",
    hover: "hover:bg-[#fff4f8]",
    selected: "border-[#c9829b] bg-[#fffafd]",
    primary: "bg-[#8d3d59] hover:bg-[#743048] text-white"
  }
} as const;

type ThemeKey = keyof typeof themes;
type LanguageKey = "zh" | "en";

const pixelScaleFactors = [0.1, 0.25, 0.5, 0.75, 1.5, 2, 3, 4];

const authorUrl = "https://github.com/MidnightPigeon";

const uiText = {
  zh: {
    language: "语言",
    new: "新建",
    kindMarkdown: "文本记录",
    kindPixel: "像素画布",
    kindMelody: "旋律片段",
    width: "宽",
    height: "高",
    search: "搜索灵感...",
    loadingIdeas: "正在读取本地灵感...",
    chooseStorage: "选择存储文件夹",
    contactAuthor: "联系作者",
    authorAvatar: "作者头像",
    preparingStorage: "正在准备存储目录",
    noSelection: "未选择灵感",
    saving: "保存中...",
    collapseHelp: "收起提示",
    showHelp: "显示提示",
    save: "保存",
    export: "导出",
    delete: "删除",
    deleteConfirm: "确定删除当前灵感吗？这个操作会删除对应的本地 JSON 文件。",
    textTitle: "文本记录名称",
    textPlaceholder: "在这里记录正文。标题已经独立保存，不需要写在第一行。",
    markdownHelp: "Markdown 辅助",
    melodyTitle: "旋律片段名称",
    bars: "小节",
    beatsPerBar: "每小节拍",
    noteLength: "音符长度",
    sustain: "延音",
    stop: "停止",
    playAudio: "播放音频",
    playTrack: "播放当前音轨",
    importMidi: "导入 MIDI",
    addTrack: "添加音轨",
    deleteTrack: "删除音轨",
    instrument: "音色",
    volume: "音量",
    uiZoom: "界面缩放",
    timeline: "时间轴",
    playStart: "播放起点",
    barHeader: "小节",
    startFromCell: "从第",
    cell: "格开始播放",
    preview: "试听",
    missingCanvas: "画布数据缺失。",
    pixelTitle: "像素画布名称",
    color: "颜色",
    radius: "半径",
    circleArea: "圆形区域",
    squareArea: "方形区域",
    thickness: "粗细",
    filled: "实心",
    centerCrop: "居中裁剪",
    showGrid: "显示网格",
    importImage: "导入图片",
    cropBounds: "调整边界",
    scaleFactor: "倍率",
    scalePixels: "按倍率缩放",
    zoom: "缩放",
    palette: "存色区",
    selectColor: "选择",
    storeColor: "存入当前颜色",
    midiImportFailed: "MIDI 导入失败。",
    tools: {
      pencil: "画笔",
      eraser: "橡皮",
      line: "直线",
      rect: "矩形",
      ellipse: "椭圆",
      spray: "喷枪",
      fill: "填充"
    },
    themes: {
      sky: "浅蓝",
      mint: "薄荷",
      gray: "浅灰",
      blush: "淡粉"
    },
    markdownTips: [
      ["# 标题", "一级标题"],
      ["## 小标题", "二级标题"],
      ["**加粗**", "加粗文本"],
      ["*斜体*", "斜体文本"],
      ["- 条目", "无序列表"],
      ["1. 条目", "有序列表"],
      ["> 引用", "引用块"],
      ["`代码`", "行内代码"],
      ["```", "代码块"],
      ["[文字](链接)", "链接"]
    ]
  },
  en: {
    language: "Language",
    new: "New",
    kindMarkdown: "Text record",
    kindPixel: "Pixel canvas",
    kindMelody: "Melody clip",
    width: "Width",
    height: "Height",
    search: "Search ideas...",
    loadingIdeas: "Reading local ideas...",
    chooseStorage: "Choose storage folder",
    contactAuthor: "Contact author",
    authorAvatar: "Author avatar",
    preparingStorage: "Preparing storage folder",
    noSelection: "No idea selected",
    saving: "Saving...",
    collapseHelp: "Hide help",
    showHelp: "Show help",
    save: "Save",
    export: "Export",
    delete: "Delete",
    deleteConfirm: "Delete this idea? This will remove its local JSON file.",
    textTitle: "Text record name",
    textPlaceholder: "Write here. The title is saved separately, so it does not need to be the first line.",
    markdownHelp: "Markdown Help",
    melodyTitle: "Melody clip name",
    bars: "Bars",
    beatsPerBar: "Beats/bar",
    noteLength: "Note length",
    sustain: "Sustain",
    stop: "Stop",
    playAudio: "Play audio",
    playTrack: "Play current track",
    importMidi: "Import MIDI",
    addTrack: "Add track",
    deleteTrack: "Delete track",
    instrument: "Instrument",
    volume: "Volume",
    uiZoom: "UI zoom",
    timeline: "Timeline",
    playStart: "Play start",
    barHeader: "Bar",
    startFromCell: "Start from cell",
    cell: "",
    preview: "Preview",
    missingCanvas: "Canvas data is missing.",
    pixelTitle: "Pixel canvas name",
    color: "Color",
    radius: "Radius",
    circleArea: "Circle area",
    squareArea: "Square area",
    thickness: "Thickness",
    filled: "Filled",
    centerCrop: "Center crop",
    showGrid: "Show grid",
    importImage: "Import image",
    cropBounds: "Resize bounds",
    scaleFactor: "Scale",
    scalePixels: "Scale pixels",
    zoom: "Zoom",
    palette: "Palette",
    selectColor: "Select",
    storeColor: "Store current color",
    midiImportFailed: "MIDI import failed.",
    tools: {
      pencil: "Pencil",
      eraser: "Eraser",
      line: "Line",
      rect: "Rectangle",
      ellipse: "Ellipse",
      spray: "Spray",
      fill: "Fill"
    },
    themes: {
      sky: "Sky",
      mint: "Mint",
      gray: "Gray",
      blush: "Blush"
    },
    markdownTips: [
      ["# Heading", "Level 1 heading"],
      ["## Subheading", "Level 2 heading"],
      ["**Bold**", "Bold text"],
      ["*Italic*", "Italic text"],
      ["- Item", "Unordered list"],
      ["1. Item", "Ordered list"],
      ["> Quote", "Block quote"],
      ["`code`", "Inline code"],
      ["```", "Code block"],
      ["[Text](URL)", "Link"]
    ]
  }
} as const;

const instrumentNamesEn: Record<number, string> = {
  0: "Piano",
  4: "Electric piano",
  6: "Harpsichord",
  16: "Organ",
  24: "Nylon guitar",
  32: "Bass",
  48: "String ensemble",
  56: "Trumpet",
  73: "Flute",
  80: "Square lead",
  81: "Saw lead",
  88: "Warm pad"
};

type UiCopy = (typeof uiText)[LanguageKey];

export function App() {
  const {
    ideas,
    allIdeas,
    selectedIdeaId,
    draftTitle,
    draftBody,
    draftCanvas,
    draftMelody,
    query,
    storage,
    isLoading,
    isSaving,
    isDirty,
    error,
    lastSavedAt,
    bootstrap,
    createIdea,
    selectIdea,
    setDraftTitle,
    setDraftBody,
    setDraftCanvas,
    setDraftMelody,
    saveSelectedIdea,
    setQuery,
    removeSelectedIdea,
    chooseStorageFolder
  } = useIdeaStore();

  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    return (localStorage.getItem("mnemosyne-theme") as ThemeKey | null) ?? "sky";
  });
  const [newKind, setNewKind] = useState<IdeaKind>("markdown");
  const [canvasWidth, setCanvasWidth] = useState(24);
  const [canvasHeight, setCanvasHeight] = useState(24);
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(true);
  const [language, setLanguage] = useState<LanguageKey>(() => {
    return (localStorage.getItem("mnemosyne-language") as LanguageKey | null) ?? "zh";
  });

  const theme = themes[themeKey] ?? themes.sky;
  const ui = uiText[language];
  const selectedIdea = allIdeas.find((idea) => idea.id === selectedIdeaId);
  const selectedDraft: Idea | undefined = selectedIdea
    ? { ...selectedIdea, title: draftTitle, body: draftBody, canvas: draftCanvas, melody: draftMelody }
    : undefined;
  const preview = useMemo(() => renderMarkdown(draftBody), [draftBody]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    localStorage.setItem("mnemosyne-theme", themeKey);
  }, [themeKey]);

  useEffect(() => {
    localStorage.setItem("mnemosyne-language", language);
  }, [language]);

  useEffect(() => {
    const handle = window.setInterval(() => void saveSelectedIdea(), 5 * 60 * 1000);
    return () => window.clearInterval(handle);
  }, [saveSelectedIdea]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handle = window.setTimeout(() => void saveSelectedIdea(), 1500);
    return () => window.clearTimeout(handle);
  }, [isDirty, draftTitle, draftBody, draftCanvas, draftMelody, saveSelectedIdea]);

  useEffect(() => {
    const flush = () => void saveSelectedIdea();
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [saveSelectedIdea]);

  async function handleCreateIdea() {
    await createIdea(
      newKind === "pixel"
        ? { kind: "pixel", width: canvasWidth, height: canvasHeight }
        : newKind === "melody"
          ? { kind: "melody" }
          : { kind: "markdown" }
    );
  }

  async function handleDelete() {
    if (selectedIdeaId && window.confirm(ui.deleteConfirm)) {
      await removeSelectedIdea();
    }
  }

  async function handleExport() {
    if (!selectedDraft) {
      return;
    }

    if (selectedDraft.kind === "markdown") {
      await exportMarkdown(draftTitle, draftBody.trim() ? `# ${draftTitle}\n\n${draftBody}` : `# ${draftTitle}\n`);
      return;
    }

    if (selectedDraft.kind === "melody" && draftMelody) {
      await exportMidiFile(draftTitle, writeMidi(draftMelody));
      return;
    }

    if (draftCanvas) {
      await exportCanvasPng(draftTitle, draftCanvas);
    }
  }

  return (
    <main className={`flex h-screen w-screen overflow-hidden ${theme.app} text-[#17212b]`}>
      <aside className={`flex w-[360px] shrink-0 flex-col border-r ${theme.border} ${theme.side}`}>
        <div className={`border-b ${theme.border} px-5 py-4`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-none">Mnemosyne</h1>
              <p className={`mt-2 truncate text-sm ${theme.muted}`}>Capture first. Shape later.</p>
            </div>
            <label className="flex items-center gap-2 text-xs">
              {ui.language}
              <select
                className={`h-9 rounded-md border ${theme.border} ${theme.panel} px-2 text-sm outline-none`}
                onChange={(event) => setLanguage(event.target.value as LanguageKey)}
                value={language}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <select
              className={`h-10 w-full rounded-md border ${theme.border} ${theme.panel} px-3 text-sm outline-none`}
              onChange={(event) => setNewKind(event.target.value as IdeaKind)}
              value={newKind}
            >
              <option value="markdown">{ui.kindMarkdown}</option>
              <option value="pixel">{ui.kindPixel}</option>
              <option value="melody">{ui.kindMelody}</option>
            </select>
            <button className={`h-10 rounded-md px-3 text-sm font-medium ${theme.primary}`} onClick={handleCreateIdea}>
              {ui.new}
            </button>
          </div>

          {newKind === "pixel" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <NumberField label={ui.width} max={128} min={4} onChange={setCanvasWidth} value={canvasWidth} theme={theme} />
              <NumberField label={ui.height} max={128} min={4} onChange={setCanvasHeight} value={canvasHeight} theme={theme} />
            </div>
          ) : null}

          <input
            className={`mt-4 h-10 w-full rounded-md border ${theme.border} ${theme.panel} px-3 text-sm outline-none transition focus:ring-2 focus:ring-[#6d9cc8]/20`}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ui.search}
            value={query}
          />

          <div className="mt-3 flex items-center gap-2">
            {Object.entries(themes).map(([key, item]) => (
              <button
                className={`h-7 rounded-md border px-2 text-xs ${
                  key === themeKey ? "border-[#245b82] bg-white" : `${theme.border} ${theme.hover}`
                }`}
                key={key}
                onClick={() => setThemeKey(key as ThemeKey)}
                type="button"
              >
                {ui.themes[key as ThemeKey]}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {isLoading ? (
            <p className={`px-2 py-3 text-sm ${theme.muted}`}>{ui.loadingIdeas}</p>
          ) : (
            <ol className="space-y-2">
              {ideas.map((idea) => {
                const isSelected = idea.id === selectedIdeaId;
                return (
                  <li key={idea.id}>
                    <button
                      className={`w-full rounded-md border px-3 py-3 text-left transition ${
                        isSelected ? theme.selected : `border-transparent ${theme.hover}`
                      }`}
                      onClick={() => void selectIdea(idea.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{getIdeaTitle(idea, language)}</h2>
                        <time className={`shrink-0 text-xs ${theme.muted}`}>{formatTimelineTime(idea.updatedAt, language)}</time>
                      </div>
                      <p className={`mt-2 line-clamp-2 text-sm leading-5 ${theme.muted}`}>{getIdeaExcerpt(idea, language)}</p>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className={`border-t ${theme.border} px-5 py-3 text-xs ${theme.muted}`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <button className="underline" onClick={() => void chooseStorageFolder()} type="button">
              {ui.chooseStorage}
            </button>
            <button
              className="flex shrink-0 flex-col items-center gap-1 hover:underline"
              onClick={() => void openUrl(authorUrl)}
              title={ui.contactAuthor}
              type="button"
            >
              <img
                alt={ui.authorAvatar}
                className="h-7 w-7 rounded-md border border-[#c9d8e8]"
                src="https://github.com/MidnightPigeon.png?size=64"
              />
              <span>{ui.contactAuthor}</span>
            </button>
          </div>
          <p className="truncate" title={storage?.ideasDir}>
            {storage?.ideasDir ?? ui.preparingStorage}
          </p>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className={`flex h-14 shrink-0 items-center justify-between border-b ${theme.border} ${theme.panel} px-5`}>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selectedDraft ? getIdeaTitle(selectedDraft, language) : ui.noSelection}</p>
            <p className={`mt-0.5 text-xs ${theme.muted}`}>{isSaving ? ui.saving : relativeSaveState(lastSavedAt, isDirty, language)}</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedDraft?.kind === "markdown" ? (
              <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => setShowMarkdownHelp(!showMarkdownHelp)} type="button">
                {showMarkdownHelp ? ui.collapseHelp : ui.showHelp}
              </button>
            ) : null}
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void saveSelectedIdea()} type="button">
              {ui.save}
            </button>
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleExport()} type="button">
              {ui.export}
            </button>
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleDelete()} type="button">
              {ui.delete}
            </button>
          </div>
        </header>

        {error ? <div className="border-b border-[#e2b6a8] bg-[#fff1ec] px-5 py-3 text-sm text-[#8c3d2b]">{error}</div> : null}

        {selectedDraft?.kind === "pixel" ? (
          <PixelEditor canvas={draftCanvas} onCanvasChange={setDraftCanvas} onTitleChange={setDraftTitle} theme={theme} title={draftTitle} ui={ui} />
        ) : selectedDraft?.kind === "melody" ? (
          <MelodyEditor language={language} melody={draftMelody} onMelodyChange={setDraftMelody} onTitleChange={setDraftTitle} theme={theme} title={draftTitle} ui={ui} />
        ) : (
          <TextEditor
            body={draftBody}
            onBodyChange={setDraftBody}
            onTitleChange={setDraftTitle}
            preview={preview}
            showHelp={showMarkdownHelp}
            theme={theme}
            title={draftTitle}
            ui={ui}
          />
        )}
      </section>
    </main>
  );
}

function TextEditor({
  body,
  onBodyChange,
  onTitleChange,
  preview,
  showHelp,
  theme,
  title,
  ui
}: {
  body: string;
  onBodyChange: (body: string) => void;
  onTitleChange: (title: string) => void;
  preview: string;
  showHelp: boolean;
  theme: (typeof themes)[ThemeKey];
  title: string;
  ui: UiCopy;
}) {
  const gridColumns = showHelp
    ? "minmax(260px, 1fr) minmax(260px, 1fr) minmax(220px, 260px)"
    : "minmax(260px, 1fr) minmax(260px, 1fr)";

  return (
    <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: gridColumns }}>
      <section className={`min-w-0 border-r ${theme.border} ${theme.panel}`}>
        <div className={`flex items-center gap-2 border-b ${theme.border} p-4`}>
          <input
            className={`h-10 min-w-0 flex-1 rounded-md border ${theme.border} bg-white px-3 text-sm font-medium outline-none`}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder={ui.textTitle}
            value={title}
          />
        </div>
        <textarea
          className="h-[calc(100%-73px)] w-full resize-none bg-transparent p-6 font-mono text-[15px] leading-7 text-[#17212b] outline-none"
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder={ui.textPlaceholder}
          spellCheck={false}
          value={body}
        />
      </section>
      <section className={`min-w-0 overflow-y-auto ${showHelp ? `border-r ${theme.border}` : ""} ${theme.app} p-6`}>
        <article className="markdown-preview mx-auto max-w-3xl text-[15px] leading-7" dangerouslySetInnerHTML={{ __html: preview }} />
      </section>
      {showHelp ? (
        <aside className={`min-w-0 overflow-y-auto ${theme.panel}`}>
          <div className={`flex h-12 items-center border-b ${theme.border} px-4`}>
            <h2 className="text-sm font-semibold">{ui.markdownHelp}</h2>
          </div>
          <div className="space-y-3 p-4 text-sm">
            {ui.markdownTips.map(([syntax, effect]) => (
              <div className={`rounded-md border ${theme.border} bg-white p-3`} key={syntax}>
                <code className="text-xs">{syntax}</code>
                <p className={`mt-1 text-xs ${theme.muted}`}>{effect}</p>
              </div>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function MelodyEditor({
  language,
  melody,
  onMelodyChange,
  onTitleChange,
  theme,
  title,
  ui
}: {
  language: LanguageKey;
  melody?: MelodyClip;
  onMelodyChange: (melody: MelodyClip) => void;
  onTitleChange: (title: string) => void;
  theme: (typeof themes)[ThemeKey];
  title: string;
  ui: UiCopy;
}) {
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [stopPlayback, setStopPlayback] = useState<(() => void) | null>(null);
  const [playStartStep, setPlayStartStep] = useState(0);
  const [playheadStep, setPlayheadStep] = useState<number | null>(null);
  const [hoverNote, setHoverNote] = useState<{ pitch: number; start: number } | null>(null);
  const [noteLength, setNoteLength] = useState(1);
  const [rollZoom, setRollZoom] = useState(1);
  const playbackRef = useRef<{ id: number; stop?: () => void; timeout?: number }>({ id: 0 });
  const clip = normalizeMelodyClip(melody);
  const steps = Math.max(4, Math.min(768, clip.bars * clip.beatsPerBar * clip.stepsPerBeat));
  const cellWidth = Math.round(28 * rollZoom);
  const rowHeight = Math.round(22 * rollZoom);
  const timelineHeight = Math.round(24 * rollZoom);
  const barHeight = Math.round(28 * rollZoom);
  const pitches = useMemo(() => Array.from({ length: 37 }, (_, index) => 84 - index), []);
  const activeTrack = clip.tracks[Math.min(activeTrackIndex, clip.tracks.length - 1)] ?? clip.tracks[0];

  useEffect(() => {
    return () => {
      playbackRef.current.stop?.();
      if (playbackRef.current.timeout !== undefined) {
        window.clearTimeout(playbackRef.current.timeout);
      }
    };
  }, []);

  function updateClip(next: MelodyClip) {
    onMelodyChange(normalizeMelodyClip(next));
  }

  function updateTrack(trackId: string, updater: (track: MelodyClip["tracks"][number]) => MelodyClip["tracks"][number]) {
    updateClip({ ...clip, tracks: clip.tracks.map((track) => (track.id === trackId ? updater(track) : track)) });
  }

  function toggleNote(pitch: number, start: number) {
    if (!activeTrack) {
      return;
    }

    updateTrack(activeTrack.id, (track) => {
      const existing = track.notes.find((note) => note.pitch === pitch && note.start === start);
      if (existing) {
        previewMelodyNote(pitch, track.program, 1);
        return { ...track, notes: track.notes.filter((note) => note.id !== existing.id) };
      }

      const note: MelodyNote = { id: crypto.randomUUID(), pitch, start, duration: noteLength, velocity: 96 };
      previewMelodyNote(pitch, track.program, 1);
      return { ...track, notes: [...track.notes, note] };
    });
  }

  function addTrack() {
    if (clip.tracks.length >= 5) {
      return;
    }
    const nextTrack = createMelodyTrack(clip.tracks.length);
    updateClip({ ...clip, tracks: [...clip.tracks, nextTrack] });
    setActiveTrackIndex(clip.tracks.length);
  }

  function removeActiveTrack() {
    if (clip.tracks.length <= 1 || !activeTrack) {
      return;
    }
    const nextTracks = clip.tracks.filter((track) => track.id !== activeTrack.id);
    updateClip({ ...clip, tracks: nextTracks });
    setActiveTrackIndex(Math.max(0, activeTrackIndex - 1));
  }

  async function handleImportMidi() {
    const data = await importMidiFile();
    if (!data) {
      return;
    }
    try {
      updateClip(parseMidi(new Uint8Array(data)));
      setActiveTrackIndex(0);
      setPlayStartStep(0);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : ui.midiImportFailed);
    }
  }

  function startPlayback(trackId?: string) {
    playbackRef.current.stop?.();
    if (playbackRef.current.timeout !== undefined) {
      window.clearTimeout(playbackRef.current.timeout);
    }
    const playbackId = playbackRef.current.id + 1;
    setPlayheadStep(playStartStep);
    const stop = playMelody(clip, { startStep: playStartStep, trackId, onStep: setPlayheadStep });
    playbackRef.current = { id: playbackId, stop };
    setStopPlayback(() => stop);
    const totalSteps = clip.bars * clip.beatsPerBar * clip.stepsPerBeat;
    const timeout = window.setTimeout(
      () => {
        if (playbackRef.current.id !== playbackId) {
          return;
        }
        playbackRef.current = { id: playbackId };
        setStopPlayback(null);
        setPlayheadStep(null);
      },
      Math.ceil((60 / clip.bpm / clip.stepsPerBeat) * Math.max(1, totalSteps - playStartStep) * 1000) + 300
    );
    playbackRef.current.timeout = timeout;
  }

  function stopCurrentPlayback() {
    playbackRef.current.stop?.();
    if (playbackRef.current.timeout !== undefined) {
      window.clearTimeout(playbackRef.current.timeout);
    }
    playbackRef.current = { id: playbackRef.current.id + 1 };
    setStopPlayback(null);
    setPlayheadStep(null);
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${theme.app}`}>
      <div className={`flex flex-wrap items-center gap-3 border-b ${theme.border} ${theme.panel} px-5 py-3`}>
        <input
          className={`h-9 w-56 rounded-md border ${theme.border} bg-white px-3 text-sm outline-none`}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={ui.melodyTitle}
          value={title}
        />
        <NumberControl label="BPM" max={240} min={40} onChange={(value) => updateClip({ ...clip, bpm: value })} value={clip.bpm} />
        <NumberControl label={ui.bars} max={64} min={1} onChange={(value) => updateClip({ ...clip, bars: value })} value={clip.bars} />
        <NumberControl label={ui.beatsPerBar} max={12} min={1} onChange={(value) => updateClip({ ...clip, beatsPerBar: value })} value={clip.beatsPerBar} />
        <NumberControl label={ui.noteLength} max={16} min={1} onChange={setNoteLength} value={noteLength} />
        <label className="flex items-center gap-2 text-sm">
          <input checked={clip.sustain} onChange={(event) => updateClip({ ...clip, sustain: event.target.checked })} type="checkbox" />
          {ui.sustain}
        </label>
        {stopPlayback ? (
          <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={stopCurrentPlayback} type="button">
            {ui.stop}
          </button>
        ) : (
          <>
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => startPlayback()} type="button">
              {ui.playAudio}
            </button>
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => startPlayback(activeTrack?.id)} type="button">
              {ui.playTrack}
            </button>
          </>
        )}
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleImportMidi()} type="button">
          {ui.importMidi}
        </button>
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={addTrack} type="button">
          {ui.addTrack}
        </button>
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} disabled={clip.tracks.length <= 1} onClick={removeActiveTrack} type="button">
          {ui.deleteTrack}
        </button>
      </div>

      <div className={`flex flex-wrap gap-2 border-b ${theme.border} ${theme.panel} px-5 py-2`}>
        {clip.tracks.map((track, index) => (
          <button
            className={`h-8 rounded-md border px-3 text-xs ${index === activeTrackIndex ? "bg-white" : theme.hover}`}
            key={track.id}
            onClick={() => setActiveTrackIndex(index)}
            style={{ borderColor: track.color, color: track.color }}
            type="button"
          >
            {track.name}
          </button>
        ))}
        {activeTrack ? (
          <>
            <label className="ml-2 flex items-center gap-2 text-sm">
              {ui.instrument}
              <select
                className={`h-8 rounded-md border ${theme.border} bg-white px-2 text-xs`}
                onChange={(event) => updateTrack(activeTrack.id, (track) => ({ ...track, program: Number(event.target.value) }))}
                value={activeTrack.program}
              >
                {gmInstruments.map((instrument) => (
                  <option key={instrument.program} value={instrument.program}>
                    {language === "en" ? instrumentNamesEn[instrument.program] ?? instrument.name : instrument.name}
                  </option>
                ))}
              </select>
            </label>
            <NumberControl
              label={ui.volume}
              max={240}
              min={1}
              onChange={(value) => updateTrack(activeTrack.id, (track) => ({ ...track, volume: value }))}
              value={activeTrack.volume}
            />
          </>
        ) : null}
        <label className="ml-auto flex items-center gap-2 text-sm">
          {ui.uiZoom}
          <input
            className="w-28"
            max={1.8}
            min={0.7}
            onChange={(event) => setRollZoom(Number(event.target.value))}
            step={0.1}
            type="range"
            value={rollZoom}
          />
          <span className={`w-10 text-xs ${theme.muted}`}>{Math.round(rollZoom * 100)}%</span>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-5 pr-5">
        <div
          className="grid w-max rounded-md border border-[#9badbd] bg-white shadow-sm"
          style={{
            gridTemplateColumns: `72px repeat(${steps}, ${cellWidth}px)`,
            gridTemplateRows: `${timelineHeight}px ${barHeight}px repeat(${pitches.length}, ${rowHeight}px)`
          }}
        >
          <div className="sticky left-0 top-0 z-40 border-b border-r border-[#8fb3d9] bg-[#245b82] px-2 text-xs text-white shadow-[2px_0_0_rgba(0,0,0,0.12)]" style={{ lineHeight: `${timelineHeight}px` }}>
            {ui.timeline}
          </div>
          {Array.from({ length: steps }, (_, step) => (
            <button
              className={`border-b border-r border-[#8fb3d9] text-[10px] ${
                playheadStep === step ? "bg-[#17212b]" : step === playStartStep ? "bg-[#3b82c4]" : "bg-[#d9ecff]"
              }`}
              key={`timeline-${step}`}
              onClick={() => setPlayStartStep(step)}
              title={`${ui.playStart}: ${step + 1}`}
              type="button"
            />
          ))}
          <div
            className="sticky left-0 z-30 border-b border-r border-[#d8e1ea] bg-[#f8fbff] px-2 text-xs shadow-[2px_0_0_rgba(0,0,0,0.08)]"
            style={{ lineHeight: `${barHeight}px` }}
          >
            {ui.barHeader}
          </div>
          {Array.from({ length: steps }, (_, step) => (
            <button
              className={`border-b border-r border-[#d8e1ea] text-center text-[10px] ${
                step === playStartStep
                  ? "bg-[#cfe6ff] font-semibold text-[#245b82]"
                  : step % (clip.beatsPerBar * clip.stepsPerBeat) === 0
                    ? "bg-[#eaf4ff] font-semibold text-[#245b82]"
                    : "bg-[#f8fbff] text-[#8aa0b5]"
              }`}
              key={`bar-${step}`}
              onClick={() => setPlayStartStep(step)}
              style={{ lineHeight: `${barHeight}px` }}
              title={language === "en" ? `${ui.startFromCell} ${step + 1}` : `${ui.startFromCell} ${step + 1} ${ui.cell}`}
              type="button"
            >
              {step % (clip.beatsPerBar * clip.stepsPerBeat) === 0 ? step / (clip.beatsPerBar * clip.stepsPerBeat) + 1 : ""}
            </button>
          ))}

          {pitches.map((pitch) => (
            <MelodyRow
              activeTrackId={activeTrack?.id}
              activeTrackProgram={activeTrack?.program ?? 0}
              clip={clip}
              hoverNote={hoverNote}
              key={pitch}
              noteLength={noteLength}
              pitch={pitch}
              playheadStep={playheadStep}
              setHoverNote={setHoverNote}
              steps={steps}
              rowHeight={rowHeight}
              theme={theme}
              toggleNote={toggleNote}
              ui={ui}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MelodyRow({
  activeTrackId,
  activeTrackProgram,
  clip,
  hoverNote,
  noteLength,
  pitch,
  playheadStep,
  rowHeight,
  setHoverNote,
  steps,
  theme,
  toggleNote,
  ui
}: {
  activeTrackId?: string;
  activeTrackProgram: number;
  clip: MelodyClip;
  hoverNote: { pitch: number; start: number } | null;
  noteLength: number;
  pitch: number;
  playheadStep: number | null;
  rowHeight: number;
  setHoverNote: (note: { pitch: number; start: number } | null) => void;
  steps: number;
  theme: (typeof themes)[ThemeKey];
  toggleNote: (pitch: number, start: number) => void;
  ui: UiCopy;
}) {
  const blackKey = isBlackKey(pitch);
  const holdTimerRef = useRef<number>();
  const holdStopRef = useRef<(() => void) | null>(null);
  const longPressRef = useRef(false);

  function startHoldPreview() {
    longPressRef.current = false;
    if (holdTimerRef.current !== undefined) {
      window.clearTimeout(holdTimerRef.current);
    }
    holdTimerRef.current = window.setTimeout(() => {
      longPressRef.current = true;
      holdStopRef.current = previewMelodyNote(pitch, activeTrackProgram, 1, true);
    }, 280);
  }

  function endHoldPreview() {
    if (holdTimerRef.current !== undefined) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = undefined;
    }
    holdStopRef.current?.();
    holdStopRef.current = null;
  }

  return (
    <>
      <div
        className={`sticky left-0 z-30 cursor-pointer border-b border-r ${theme.border} px-2 text-xs shadow-[2px_0_0_rgba(0,0,0,0.08)] ${
          blackKey ? "bg-[#17212b] text-white" : "bg-white text-[#17212b]"
        }`}
        onClick={() => {
          if (!longPressRef.current) {
            previewMelodyNote(pitch, activeTrackProgram, 2);
          }
        }}
        onMouseDown={startHoldPreview}
        onMouseLeave={endHoldPreview}
        onMouseUp={endHoldPreview}
        style={{ lineHeight: `${rowHeight}px` }}
        title={`${ui.preview} ${pitchName(pitch)}`}
      >
        {pitchName(pitch)}
      </div>
      {Array.from({ length: steps }, (_, step) => {
        const notes = clip.tracks.flatMap((track) =>
          track.notes
            .filter((note) => note.pitch === pitch && step >= note.start && step < note.start + note.duration)
            .map((note) => ({ note, track }))
        );
        const active = notes.find((entry) => entry.track.id === activeTrackId);
        const background = active?.track.color ?? notes[0]?.track.color;
        const visible = active ?? notes[0];
        const isNoteStart = Boolean(visible && visible.note.start === step);
        const isContinuation = Boolean(visible && visible.note.start < step);
        const isHoverPreview =
          hoverNote?.pitch === pitch && step >= hoverNote.start && step < Math.min(steps, hoverNote.start + noteLength);

        return (
          <button
            className={`border-b border-r border-[#e3ebf2] ${
              step === playheadStep
                ? "bg-[#dbeafe]"
                : step % (clip.beatsPerBar * clip.stepsPerBeat) === 0
                  ? "bg-[#eef6ff]"
                  : step % clip.stepsPerBeat === 0
                    ? "bg-[#f7fbff]"
                    : "bg-white"
            }`}
            key={`${pitch}-${step}`}
            onClick={(event) => {
              if (longPressRef.current) {
                event.preventDefault();
                return;
              }
              toggleNote(pitch, step);
            }}
            onMouseEnter={() => setHoverNote({ pitch, start: step })}
            onMouseLeave={() => {
              setHoverNote(null);
            }}
            style={{
              backgroundColor: background
                ? hexWithAlpha(background, isContinuation ? 0.48 : active ? 0.86 : 0.35)
                : isHoverPreview
                  ? "rgba(36, 91, 130, 0.16)"
                  : undefined,
              boxShadow: [
                isHoverPreview ? "inset 0 0 0 2px rgba(36, 91, 130, 0.85)" : undefined,
                isNoteStart && visible ? `inset 4px 0 0 ${visible.track.color}` : undefined,
                active ? `inset 0 0 0 2px ${active.track.color}` : undefined
              ]
                .filter(Boolean)
                .join(", ")
            }}
            title={`${pitchName(pitch)} / ${step + 1}`}
            type="button"
          />
        );
      })}
    </>
  );
}

function PixelEditor({
  canvas,
  onCanvasChange,
  onTitleChange,
  theme,
  title,
  ui
}: {
  canvas?: PixelCanvas;
  onCanvasChange: (canvas: PixelCanvas) => void;
  onTitleChange: (title: string) => void;
  theme: (typeof themes)[ThemeKey];
  title: string;
  ui: UiCopy;
}) {
  const [tool, setTool] = useState<PixelTool>("pencil");
  const [color, setColor] = useState("#245b82");
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [thickness, setThickness] = useState(1);
  const [filled, setFilled] = useState(false);
  const [sprayRadius, setSprayRadius] = useState(4);
  const [sprayShape, setSprayShape] = useState<SprayShape>("circle");
  const [showPixelGrid, setShowPixelGrid] = useState(true);
  const [storedColors, setStoredColors] = useState<Array<string | null>>(() => Array.from({ length: 12 }, () => null));
  const [targetWidth, setTargetWidth] = useState(canvas?.width ?? 64);
  const [targetHeight, setTargetHeight] = useState(canvas?.height ?? 64);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [cropImage, setCropImage] = useState(true);
  const [dragStart, setDragStart] = useState<PixelPoint | null>(null);
  const [hoverPoint, setHoverPoint] = useState<PixelPoint | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const drawOptions: DrawOptions = { color, thickness, filled, sprayRadius, sprayShape };
  const previewCanvas = useMemo(() => {
    if (!canvas || !dragStart || !hoverPoint || !isPreviewTool(tool)) {
      return canvas;
    }
    if (tool === "line") {
      return drawLine(canvas, dragStart, hoverPoint, color, thickness);
    }
    if (tool === "rect") {
      return drawRect(canvas, dragStart, hoverPoint, drawOptions);
    }
    if (tool === "ellipse") {
      return drawEllipse(canvas, dragStart, hoverPoint, drawOptions);
    }
    return canvas;
  }, [canvas, color, dragStart, drawOptions, hoverPoint, thickness, tool]);

  const cursorPreviewIndices = useMemo(() => {
    if (!canvas || !hoverPoint || isDragging || tool === "fill") {
      return new Set<number>();
    }
    return tool === "spray"
      ? collectSprayPreview(canvas, hoverPoint, sprayRadius, sprayShape)
      : collectBrushPreview(canvas, hoverPoint, thickness);
  }, [canvas, hoverPoint, isDragging, sprayRadius, sprayShape, thickness, tool]);

  useEffect(() => {
    if (!canvas) {
      return;
    }
    setTargetWidth(canvas.width);
    setTargetHeight(canvas.height);
  }, [canvas?.width, canvas?.height]);

  if (!canvas) {
    return <div className="p-6 text-sm">{ui.missingCanvas}</div>;
  }
  const currentCanvas = canvas;
  const pixelSize = Math.round(18 * canvasZoom);

  function applyImmediate(index: number) {
    const point = pointFromIndex(index, currentCanvas.width);
    if (tool === "pencil") {
      onCanvasChange(paintBrush(currentCanvas, point, color, thickness));
    } else if (tool === "eraser") {
      onCanvasChange(paintBrush(currentCanvas, point, transparentPixel, thickness));
    } else if (tool === "spray") {
      onCanvasChange(spray(currentCanvas, point, drawOptions));
    } else if (tool === "fill") {
      onCanvasChange(floodFill(currentCanvas, point, color));
    }
  }

  function handlePointerDown(index: number) {
    const point = pointFromIndex(index, currentCanvas.width);
    setIsDragging(true);
    setHoverPoint(point);
    if (isPreviewTool(tool)) {
      setDragStart(point);
      return;
    }
    applyImmediate(index);
  }

  function handlePointerEnter(index: number) {
    const point = pointFromIndex(index, currentCanvas.width);
    setHoverPoint(point);
    if (isDragging && (tool === "pencil" || tool === "eraser" || tool === "spray")) {
      applyImmediate(index);
    }
  }

  function handlePointerUp(index: number) {
    const point = pointFromIndex(index, currentCanvas.width);
    setIsDragging(false);
    setHoverPoint(null);
    if (!dragStart) {
      return;
    }
    if (tool === "line") {
      onCanvasChange(drawLine(currentCanvas, dragStart, point, color, thickness));
    } else if (tool === "rect") {
      onCanvasChange(drawRect(currentCanvas, dragStart, point, drawOptions));
    } else if (tool === "ellipse") {
      onCanvasChange(drawEllipse(currentCanvas, dragStart, point, drawOptions));
    }
    setDragStart(null);
  }

  async function handleImportImage() {
    const imported = await importImageCanvas(targetWidth, targetHeight, cropImage);
    if (imported) {
      onCanvasChange(imported);
    }
  }

  function handleCropCanvas() {
    onCanvasChange(cropCanvasBounds(currentCanvas, targetWidth, targetHeight));
  }

  function handleScaleCanvas() {
    onCanvasChange(scaleCanvasPixels(currentCanvas, scaleFactor));
  }

  function handleStoredColor(index: number) {
    const stored = storedColors[index];
    if (stored) {
      setColor(stored);
      return;
    }
    setStoredColors((colors) => colors.map((item, itemIndex) => (itemIndex === index ? color : item)));
  }

  function handleStoreCurrentColor(index: number) {
    setStoredColors((colors) => colors.map((item, itemIndex) => (itemIndex === index ? color : item)));
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${theme.app}`}>
      <div className={`flex flex-wrap items-center gap-3 border-b ${theme.border} ${theme.panel} px-5 py-3`}>
        <input
          className={`h-9 w-56 rounded-md border ${theme.border} bg-white px-3 text-sm outline-none`}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={ui.pixelTitle}
          value={title}
        />
        <ToolSelect tool={tool} onToolChange={setTool} theme={theme} ui={ui} />
        <label className="flex items-center gap-2 text-sm">
          {ui.color}
          <input onChange={(event) => setColor(event.target.value)} type="color" value={color} />
        </label>
        {tool === "spray" ? (
          <>
            <NumberControl label={ui.radius} max={24} min={1} onChange={setSprayRadius} value={sprayRadius} />
            <select className={`h-9 rounded-md border ${theme.border} bg-white px-2 text-sm`} onChange={(event) => setSprayShape(event.target.value as SprayShape)} value={sprayShape}>
              <option value="circle">{ui.circleArea}</option>
              <option value="square">{ui.squareArea}</option>
            </select>
          </>
        ) : tool !== "fill" ? (
          <NumberControl label={ui.thickness} max={12} min={1} onChange={setThickness} value={thickness} />
        ) : null}
        {tool === "rect" || tool === "ellipse" ? (
          <label className="flex items-center gap-2 text-sm">
            <input checked={filled} onChange={(event) => setFilled(event.target.checked)} type="checkbox" />
            {ui.filled}
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input checked={cropImage} onChange={(event) => setCropImage(event.target.checked)} type="checkbox" />
          {ui.centerCrop}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input checked={showPixelGrid} onChange={(event) => setShowPixelGrid(event.target.checked)} type="checkbox" />
          {ui.showGrid}
        </label>
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleImportImage()} type="button">
          {ui.importImage}
        </button>
        <div className="flex basis-full items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <NumberControl label={ui.width} max={512} min={4} onChange={setTargetWidth} value={targetWidth} />
            <NumberControl label={ui.height} max={512} min={4} onChange={setTargetHeight} value={targetHeight} />
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={handleCropCanvas} type="button">
              {ui.cropBounds}
            </button>
            <label className="flex items-center gap-2 text-sm">
              {ui.scaleFactor}
              <select className={`h-9 rounded-md border ${theme.border} bg-white px-2 text-sm`} onChange={(event) => setScaleFactor(Number(event.target.value))} value={scaleFactor}>
                {pixelScaleFactors.map((factor) => (
                  <option key={factor} value={factor}>
                    {factor}x
                  </option>
                ))}
              </select>
            </label>
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={handleScaleCanvas} type="button">
              {ui.scalePixels}
            </button>
          </div>
          <span className={`text-xs ${theme.muted}`}>{canvas.width} x {canvas.height}</span>
          <label className="flex items-center gap-2 text-sm">
            {ui.zoom}
            <input
              className="w-32"
              max={3}
              min={0.5}
              onChange={(event) => setCanvasZoom(Number(event.target.value))}
              step={0.1}
              type="range"
              value={canvasZoom}
            />
            <span className={`w-10 text-xs ${theme.muted}`}>{Math.round(canvasZoom * 100)}%</span>
          </label>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" onMouseLeave={() => { setIsDragging(false); setHoverPoint(null); }}>
          <div
            className="inline-grid border border-[#9badbd] bg-white bg-[linear-gradient(45deg,#d9e3ec_25%,transparent_25%),linear-gradient(-45deg,#d9e3ec_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d9e3ec_75%),linear-gradient(-45deg,transparent_75%,#d9e3ec_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] shadow-sm"
            style={{ gridTemplateColumns: `repeat(${canvas.width}, ${pixelSize}px)`, gridTemplateRows: `repeat(${canvas.height}, ${pixelSize}px)` }}
          >
            {(previewCanvas ?? canvas).pixels.map((pixel, index) => (
              <button
                aria-label={`pixel-${index}`}
                className={showPixelGrid ? "border border-[#d8e1ea]" : "border-0"}
                key={index}
                onMouseDown={() => handlePointerDown(index)}
                onMouseEnter={() => handlePointerEnter(index)}
                onMouseUp={() => handlePointerUp(index)}
                style={{
                  backgroundColor: pixel,
                  boxShadow: cursorPreviewIndices.has(index) ? "inset 0 0 0 2px rgba(36, 91, 130, 0.9)" : undefined,
                  width: pixelSize,
                  height: pixelSize
                }}
                type="button"
              />
            ))}
          </div>
        </div>
        <aside className={`flex w-24 shrink-0 flex-col items-center border-l ${theme.border} ${theme.panel} px-3 py-4`}>
          <span className={`mb-3 text-xs ${theme.muted}`}>{ui.palette}</span>
          <div className="grid grid-cols-2 gap-2">
            {storedColors.map((storedColor, index) => (
              <button
                className={`h-8 w-8 rounded border ${theme.border} bg-white bg-[linear-gradient(45deg,#d9e3ec_25%,transparent_25%),linear-gradient(-45deg,#d9e3ec_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d9e3ec_75%),linear-gradient(-45deg,transparent_75%,#d9e3ec_75%)] bg-[length:10px_10px] bg-[position:0_0,0_5px,5px_-5px,-5px_0]`}
                key={index}
                onClick={() => handleStoredColor(index)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  handleStoreCurrentColor(index);
                }}
                style={{ backgroundColor: storedColor ?? undefined }}
                title={storedColor ? `${ui.selectColor} ${storedColor}` : ui.storeColor}
                type="button"
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ToolSelect({ tool, onToolChange, theme, ui }: { tool: PixelTool; onToolChange: (tool: PixelTool) => void; theme: (typeof themes)[ThemeKey]; ui: UiCopy }) {
  const tools: PixelTool[] = ["pencil", "eraser", "line", "rect", "ellipse", "spray", "fill"];

  return (
    <div className="flex flex-wrap gap-1">
      {tools.map((value) => (
        <button className={`h-8 rounded-md border px-2 text-xs ${tool === value ? "border-[#245b82] bg-white" : `${theme.border} ${theme.hover}`}`} key={value} onClick={() => onToolChange(value)} type="button">
          {ui.tools[value]}
        </button>
      ))}
    </div>
  );
}

function NumberControl({ label, max, min, onChange, value }: { label: string; max: number; min: number; onChange: (value: number) => void; value: number }) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit(nextText: string) {
    const nextValue = Number(nextText);
    if (!Number.isFinite(nextValue)) {
      return;
    }
    if (nextText.trim() === "") {
      return;
    }
    onChange(Math.min(max, Math.max(min, Math.round(nextValue))));
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      {label}
      <input
        className="h-8 w-16 rounded-md border border-[#c9d8e8] bg-white px-2 text-sm outline-none"
        max={max}
        min={min}
        onBlur={() => {
          commit(text);
          if (text.trim() === "") {
            setText(String(value));
          }
        }}
        onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(text);
            event.currentTarget.blur();
          }
        }}
        type="number"
        value={text}
      />
    </label>
  );
}

function NumberField({ label, max, min, onChange, theme, value }: { label: string; max: number; min: number; onChange: (value: number) => void; theme: (typeof themes)[ThemeKey]; value: number }) {
  return (
    <label className="text-xs">
      {label}
      <input className={`mt-1 h-9 w-full rounded-md border ${theme.border} ${theme.panel} px-2 text-sm outline-none`} max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} type="number" value={value} />
    </label>
  );
}

function isPreviewTool(tool: PixelTool): boolean {
  return tool === "line" || tool === "rect" || tool === "ellipse";
}

function collectBrushPreview(canvas: PixelCanvas, center: PixelPoint, thickness: number): Set<number> {
  const indices = new Set<number>();
  const size = Math.max(1, Math.round(thickness));
  const before = Math.floor((size - 1) / 2);
  const after = Math.ceil((size - 1) / 2);
  for (let y = center.y - before; y <= center.y + after; y += 1) {
    for (let x = center.x - before; x <= center.x + after; x += 1) {
      const index = pointToIndexSafe(canvas, x, y);
      if (index !== undefined) {
        indices.add(index);
      }
    }
  }
  return indices;
}

function collectSprayPreview(canvas: PixelCanvas, center: PixelPoint, radius: number, shape: SprayShape): Set<number> {
  const indices = new Set<number>();
  const safeRadius = Math.max(1, Math.round(radius));
  for (let y = center.y - safeRadius; y <= center.y + safeRadius; y += 1) {
    for (let x = center.x - safeRadius; x <= center.x + safeRadius; x += 1) {
      const dx = x - center.x;
      const dy = y - center.y;
      if (shape === "circle" && dx * dx + dy * dy > safeRadius * safeRadius) {
        continue;
      }
      const index = pointToIndexSafe(canvas, x, y);
      if (index !== undefined) {
        indices.add(index);
      }
    }
  }
  return indices;
}

function pointToIndexSafe(canvas: PixelCanvas, x: number, y: number): number | undefined {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return undefined;
  }
  return y * canvas.width + x;
}

function pitchName(pitch: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}

function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitch % 12);
}

function hexWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value) || normalized.length !== 6) {
    return hex;
  }
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

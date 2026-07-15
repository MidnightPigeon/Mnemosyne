import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { audioExamples } from "../data/audioExamples";
import {
  exportCanvasJpg,
  exportCanvasPng,
  exportMarkdown,
  exportMarkdownPdf,
  exportLatexPdf,
  exportMidiFile,
  exportWavFile,
  importImageFile,
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
  renderMelodyWav,
  writeMidi,
  type PlaybackControls
} from "../lib/midi";
import { renderLatexPreview } from "../lib/latex";
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
import type { Idea, IdeaKind, MelodyClip, MelodyNote, PixelCanvas, TextFormat } from "../types/idea";

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
  },
  starlight: {
    label: "星空",
    app: "bg-[#eef7ff] bg-[radial-gradient(circle_at_14%_18%,rgba(255,245,184,0.55)_0_1px,transparent_2px),radial-gradient(circle_at_82%_22%,rgba(255,250,205,0.45)_0_1px,transparent_2px),linear-gradient(180deg,#eef7ff_0%,#f8fcff_54%,#fff9df_100%)]",
    panel: "bg-[#fbfdff]/95",
    side: "bg-[#e8f4ff]",
    border: "border-[#bed4ea]",
    muted: "text-[#65798a]",
    hover: "hover:bg-[#f4faff]",
    selected: "border-[#7caed4] bg-[#fbfdff]",
    primary: "bg-[#2f6f9f] hover:bg-[#275f88] text-white"
  },
  dream: {
    label: "梦幻",
    app: "bg-[#f3f0ff] bg-[radial-gradient(circle_at_20%_18%,rgba(186,230,253,0.55),transparent_34%),radial-gradient(circle_at_78%_28%,rgba(221,214,254,0.62),transparent_38%),linear-gradient(180deg,#f8fbff_0%,#f3f0ff_58%,#eef7ff_100%)]",
    panel: "bg-[#fbfaff]/95",
    side: "bg-[#ececff]",
    border: "border-[#d1cdec]",
    muted: "text-[#716b88]",
    hover: "hover:bg-[#f7f5ff]",
    selected: "border-[#a9a1d8] bg-[#fbfaff]",
    primary: "bg-[#6b5ca8] hover:bg-[#5a4d92] text-white"
  }
} as const;

type ThemeKey = keyof typeof themes;
type LanguageKey = "zh" | "en";

const pixelScaleFactors = [0.1, 0.25, 0.5, 0.75, 1.5, 2, 3, 4];
const maxMelodyBars = 256;
const melodyMinPitch = 21; // A0，标准 88 键最低音。
const melodyMaxPitch = 108; // C8，覆盖常见小提琴高音写作上沿。

const authorUrl = "https://github.com/MidnightPigeon";

const uiText = {
  zh: {
    appName: "星忆",
    appTagline: "记录，而后雕琢。",
    language: "语言",
    theme: "主题选择",
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
    hideSidebar: "收起工作栏",
    showSidebar: "展开工作栏",
    open: "打开",
    saving: "保存中...",
    collapseHelp: "收起提示",
    showHelp: "显示提示",
    save: "保存",
    export: "导出",
    exportMarkdown: "导出 MD",
    exportPdf: "导出 PDF",
    exportJpg: "导出 JPG",
    exportPng: "导出 PNG",
    exportMidi: "导出 MIDI",
    exportWav: "导出 WAV",
    exportLatexPdf: "导出 LaTeX PDF",
    delete: "删除",
    deleteConfirm: "确定删除当前灵感吗？这个操作会删除对应的本地 JSON 文件。",
    textTitle: "文本记录名称",
    textPlaceholder: "在这里记录正文。标题已经独立保存，不需要写在第一行。",
    textFormat: "文本格式",
    markdownFormat: "Markdown",
    latexFormat: "LaTeX",
    markdownHelp: "Markdown 辅助",
    latexHelp: "LaTeX 辅助",
    melodyTitle: "旋律片段名称",
    bars: "小节",
    beatsPerBar: "每小节拍",
    noteLength: "音符长度",
    freeEdit: "自由编辑",
    stop: "停止",
    pause: "暂停",
    resume: "继续",
    playAudio: "播放音频",
    visualPlay: "可视化演奏",
    playTrack: "播放当前音轨",
    importMidi: "导入 MIDI",
    addTrack: "添加音轨",
    deleteTrack: "删除音轨",
    audioExample: "音频示例",
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
    showGrid: "显示网格",
    importImage: "导入图片",
    importApply: "导入到画布",
    importCancel: "取消导入",
    cropBounds: "调整边界",
    scaleFactor: "倍率",
    scalePixels: "按倍率缩放",
    zoom: "缩放",
    palette: "存色区",
    selectColor: "选择",
    storeColor: "存入当前颜色",
    randomFill: "画面随机填色",
    stopRandomFill: "停止",
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
      blush: "淡粉",
      starlight: "星空",
      dream: "梦幻"
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
    ],
    latexTips: [
      ["\\section{标题}", "一级章节"],
      ["\\subsection{小节}", "二级章节"],
      ["\\textbf{加粗}", "加粗文本"],
      ["\\emph{斜体}", "强调文本"],
      ["\\begin{itemize}", "无序列表"],
      ["\\begin{enumerate}", "有序列表"],
      ["\\begin{quote}", "引用块"],
      ["\\begin{verbatim}", "代码块"],
      ["$a^2 + b^2 = c^2$", "行内公式"],
      ["\\[ x = \\frac{-b}{2a} \\]", "展示公式"]
    ]
  },
  en: {
    appName: "Mnemosyne",
    appTagline: "Capture first. Shape later.",
    language: "Language",
    theme: "Theme",
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
    hideSidebar: "Collapse sidebar",
    showSidebar: "Expand sidebar",
    open: "Open",
    saving: "Saving...",
    collapseHelp: "Hide help",
    showHelp: "Show help",
    save: "Save",
    export: "Export",
    exportMarkdown: "Export MD",
    exportPdf: "Export PDF",
    exportJpg: "Export JPG",
    exportPng: "Export PNG",
    exportMidi: "Export MIDI",
    exportWav: "Export WAV",
    exportLatexPdf: "Export LaTeX PDF",
    delete: "Delete",
    deleteConfirm: "Delete this idea? This will remove its local JSON file.",
    textTitle: "Text record name",
    textPlaceholder: "Write here. The title is saved separately, so it does not need to be the first line.",
    textFormat: "Text format",
    markdownFormat: "Markdown",
    latexFormat: "LaTeX",
    markdownHelp: "Markdown Help",
    latexHelp: "LaTeX Help",
    melodyTitle: "Melody clip name",
    bars: "Bars",
    beatsPerBar: "Beats/bar",
    noteLength: "Note length",
    freeEdit: "Free edit",
    stop: "Stop",
    pause: "Pause",
    resume: "Resume",
    playAudio: "Play audio",
    visualPlay: "Visual performance",
    playTrack: "Play current track",
    importMidi: "Import MIDI",
    addTrack: "Add track",
    deleteTrack: "Delete track",
    audioExample: "Audio example",
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
    showGrid: "Show grid",
    importImage: "Import image",
    importApply: "Import to canvas",
    importCancel: "Cancel import",
    cropBounds: "Resize bounds",
    scaleFactor: "Scale",
    scalePixels: "Scale pixels",
    zoom: "Zoom",
    palette: "Palette",
    selectColor: "Select",
    storeColor: "Store current color",
    randomFill: "Random fill",
    stopRandomFill: "Stop",
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
      blush: "Blush",
      starlight: "Starlight",
      dream: "Dream"
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
    ],
    latexTips: [
      ["\\section{Heading}", "Level 1 section"],
      ["\\subsection{Subheading}", "Level 2 section"],
      ["\\textbf{Bold}", "Bold text"],
      ["\\emph{Italic}", "Emphasis"],
      ["\\begin{itemize}", "Unordered list"],
      ["\\begin{enumerate}", "Ordered list"],
      ["\\begin{quote}", "Quote block"],
      ["\\begin{verbatim}", "Code block"],
      ["$a^2 + b^2 = c^2$", "Inline math"],
      ["\\[ x = \\frac{-b}{2a} \\]", "Display math"]
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
    draftTextFormat,
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
    setDraftTextFormat,
    setDraftCanvas,
    setDraftMelody,
    saveSelectedIdea,
    setQuery,
    removeIdea,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("mnemosyne-sidebar-collapsed") === "true");
  const [ideaMenu, setIdeaMenu] = useState<{ ideaId: string; x: number; y: number } | null>(null);
  const [language, setLanguage] = useState<LanguageKey>(() => {
    return (localStorage.getItem("mnemosyne-language") as LanguageKey | null) ?? "zh";
  });

  const theme = themes[themeKey] ?? themes.sky;
  const ui = uiText[language];
  const selectedIdea = allIdeas.find((idea) => idea.id === selectedIdeaId);
  const selectedDraft: Idea | undefined = selectedIdea
    ? { ...selectedIdea, title: draftTitle, body: draftBody, textFormat: draftTextFormat, canvas: draftCanvas, melody: draftMelody }
    : undefined;
  const contextIdea = ideaMenu ? allIdeas.find((idea) => idea.id === ideaMenu.ideaId) : undefined;
  const contextDraft = contextIdea && selectedDraft?.id === contextIdea.id ? selectedDraft : contextIdea;
  const preview = useMemo(() => (draftTextFormat === "markdown" ? renderMarkdown(draftBody) : renderLatexPreview(draftBody)), [draftBody, draftTextFormat]);

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
    localStorage.setItem("mnemosyne-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

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
  }, [isDirty, draftTitle, draftBody, draftTextFormat, draftCanvas, draftMelody, saveSelectedIdea]);

  useEffect(() => {
    const flush = () => void saveSelectedIdea();
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [saveSelectedIdea]);

  useEffect(() => {
    if (!ideaMenu) {
      return;
    }
    const closeMenu = () => setIdeaMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [ideaMenu]);

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

  function handleIdeaContextMenu(event: ReactMouseEvent, idea: Idea) {
    event.preventDefault();
    setIdeaMenu({
      ideaId: idea.id,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 260)
    });
  }

  async function openContextIdea(idea: Idea) {
    setIdeaMenu(null);
    await selectIdea(idea.id);
  }

  async function deleteContextIdea(idea: Idea) {
    setIdeaMenu(null);
    if (window.confirm(ui.deleteConfirm)) {
      await removeIdea(idea.id);
    }
  }

  function resolveExportIdea(idea: Idea): Idea {
    return selectedDraft && selectedDraft.id === idea.id ? selectedDraft : idea;
  }

  async function exportIdeaAs(idea: Idea, format: "md" | "pdf" | "jpg" | "png" | "midi" | "wav") {
    setIdeaMenu(null);
    const target = resolveExportIdea(idea);
    const title = getIdeaTitle(target, language);

    if (target.kind === "markdown") {
      if (format === "md" && (target.textFormat ?? "markdown") === "markdown") {
        await exportMarkdown(title, target.body.trim() ? `# ${title}\n\n${target.body}` : `# ${title}\n`);
      } else if (format === "pdf" && (target.textFormat ?? "markdown") === "latex") {
        await exportLatexPdf(title, target.body);
      } else if (format === "pdf") {
        await exportMarkdownPdf(title, target.body.trim() ? `# ${title}\n\n${target.body}` : `# ${title}\n`);
      }
      return;
    }

    if (target.kind === "pixel" && target.canvas) {
      if (format === "png") {
        await exportCanvasPng(title, target.canvas);
      } else if (format === "jpg") {
        await exportCanvasJpg(title, target.canvas);
      }
      return;
    }

    if (target.kind === "melody" && target.melody) {
      if (format === "midi") {
        await exportMidiFile(title, writeMidi(target.melody));
      } else if (format === "wav") {
        await exportWavFile(title, await renderMelodyWav(target.melody));
      }
    }
  }

  async function handleExport() {
    if (!selectedDraft) {
      return;
    }

    if (selectedDraft.kind === "markdown" && draftTextFormat === "markdown") {
      await exportMarkdown(draftTitle, draftBody.trim() ? `# ${draftTitle}\n\n${draftBody}` : `# ${draftTitle}\n`);
      return;
    }

    if (selectedDraft.kind === "melody" && draftMelody) {
      await exportMidiFile(draftTitle, writeMidi(draftMelody));
      return;
    }

    if (selectedDraft.kind === "pixel" && draftCanvas) {
      await exportCanvasJpg(draftTitle, draftCanvas);
      return;
    }
  }

  async function handleExportPng() {
    if (draftCanvas) {
      await exportCanvasPng(draftTitle, draftCanvas);
    }
  }

  async function handleExportPdf() {
    if (selectedDraft?.kind === "markdown") {
      if (draftTextFormat === "latex") {
        await exportLatexPdf(draftTitle, draftBody);
        return;
      }
      await exportMarkdownPdf(draftTitle, draftBody.trim() ? `# ${draftTitle}\n\n${draftBody}` : `# ${draftTitle}\n`);
    }
  }

  async function handleExportWav() {
    if (!draftMelody) {
      return;
    }
    await exportWavFile(draftTitle, await renderMelodyWav(draftMelody));
  }

  return (
    <main className={`flex h-screen w-screen overflow-hidden ${theme.app} text-[#17212b]`}>
      <aside className={`flex shrink-0 flex-col border-r ${theme.border} ${theme.side} ${sidebarCollapsed ? "w-14" : "w-[360px]"}`}>
        {sidebarCollapsed ? (
          <div className="flex h-full flex-col items-center gap-3 px-2 py-3">
            <button
              aria-label={ui.showSidebar}
              className={`h-9 w-9 rounded-md border ${theme.border} ${theme.panel} text-sm ${theme.hover}`}
              onClick={() => setSidebarCollapsed(false)}
              title={ui.showSidebar}
              type="button"
            >
              ≡
            </button>
            <button
              aria-label={ui.new}
              className={`h-9 w-9 rounded-md text-sm font-medium ${theme.primary}`}
              onClick={handleCreateIdea}
              title={ui.new}
              type="button"
            >
              +
            </button>
            <div className={`mt-1 h-px w-8 ${theme.border} border-t`} />
            <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto">
              {ideas.map((idea) => {
                const isSelected = idea.id === selectedIdeaId;
                return (
                  <button
                    className={`h-8 w-8 rounded-md border text-xs font-semibold ${isSelected ? theme.selected : `border-transparent ${theme.hover}`}`}
                    key={idea.id}
                    onClick={() => void selectIdea(idea.id)}
                    onContextMenu={(event) => handleIdeaContextMenu(event, idea)}
                    title={getIdeaTitle(idea, language)}
                    type="button"
                  >
                    {idea.kind === "pixel" ? "□" : idea.kind === "melody" ? "♪" : "T"}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
        <div className={`border-b ${theme.border} px-5 py-4`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-none">{ui.appName}</h1>
              <p className={`mt-2 truncate text-sm ${theme.muted}`}>{ui.appTagline}</p>
            </div>
            <button
              className={`h-9 rounded-md border ${theme.border} px-2 text-sm ${theme.hover}`}
              onClick={() => setSidebarCollapsed(true)}
              title={ui.hideSidebar}
              type="button"
            >
              ‹
            </button>
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

          <label className="mt-3 flex items-center gap-2 text-xs">
            {ui.theme}
            <select
              className={`h-8 flex-1 rounded-md border ${theme.border} ${theme.panel} px-2 text-sm outline-none`}
              onChange={(event) => setThemeKey(event.target.value as ThemeKey)}
              value={themeKey}
            >
              {Object.keys(themes).map((key) => (
                <option key={key} value={key}>
                  {ui.themes[key as ThemeKey]}
                </option>
              ))}
            </select>
          </label>
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
                      onContextMenu={(event) => handleIdeaContextMenu(event, idea)}
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
          </>
        )}
      </aside>

      {ideaMenu && contextDraft ? (
        <div
          className={`fixed z-[100] w-52 overflow-hidden rounded-md border ${theme.border} ${theme.panel} py-1 text-sm shadow-xl`}
          onClick={(event) => event.stopPropagation()}
          style={{ left: ideaMenu.x, top: ideaMenu.y }}
        >
          <button className={`block w-full px-3 py-2 text-left ${theme.hover}`} onClick={() => void openContextIdea(contextDraft)} type="button">
            {ui.open}
          </button>
          {contextDraft.kind === "markdown" ? (
            <>
              {(contextDraft.textFormat ?? "markdown") === "markdown" ? (
                <button className={`block w-full px-3 py-2 text-left ${theme.hover}`} onClick={() => void exportIdeaAs(contextDraft, "md")} type="button">
                  {ui.exportMarkdown}
                </button>
              ) : null}
              <button className={`block w-full px-3 py-2 text-left ${theme.hover}`} onClick={() => void exportIdeaAs(contextDraft, "pdf")} type="button">
                {(contextDraft.textFormat ?? "markdown") === "latex" ? ui.exportLatexPdf : ui.exportPdf}
              </button>
            </>
          ) : contextDraft.kind === "pixel" ? (
            <>
              <button className={`block w-full px-3 py-2 text-left ${theme.hover}`} onClick={() => void exportIdeaAs(contextDraft, "jpg")} type="button">
                {ui.exportJpg}
              </button>
              <button className={`block w-full px-3 py-2 text-left ${theme.hover}`} onClick={() => void exportIdeaAs(contextDraft, "png")} type="button">
                {ui.exportPng}
              </button>
            </>
          ) : contextDraft.kind === "melody" ? (
            <>
              <button className={`block w-full px-3 py-2 text-left ${theme.hover}`} onClick={() => void exportIdeaAs(contextDraft, "midi")} type="button">
                {ui.exportMidi}
              </button>
              <button className={`block w-full px-3 py-2 text-left ${theme.hover}`} onClick={() => void exportIdeaAs(contextDraft, "wav")} type="button">
                {ui.exportWav}
              </button>
            </>
          ) : null}
          <div className={`my-1 border-t ${theme.border}`} />
          <button className="block w-full px-3 py-2 text-left text-[#9c3d2c] hover:bg-[#fff1ec]" onClick={() => void deleteContextIdea(contextDraft)} type="button">
            {ui.delete}
          </button>
        </div>
      ) : null}

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
            {selectedDraft?.kind === "melody" ? (
              <>
                <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleExport()} type="button">
                  {ui.exportMidi}
                </button>
                <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleExportWav()} type="button">
                  {ui.exportWav}
                </button>
              </>
            ) : selectedDraft?.kind === "pixel" ? (
              <>
                <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleExport()} type="button">
                  {ui.exportJpg}
                </button>
                <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleExportPng()} type="button">
                  {ui.exportPng}
                </button>
              </>
            ) : selectedDraft?.kind === "markdown" ? (
              <>
                {draftTextFormat === "markdown" ? (
                  <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleExport()} type="button">
                    {ui.exportMarkdown}
                  </button>
                ) : null}
                <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleExportPdf()} type="button">
                  {ui.exportPdf}
                </button>
              </>
            ) : (
              <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleExport()} type="button">
                {ui.export}
              </button>
            )}
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleDelete()} type="button">
              {ui.delete}
            </button>
          </div>
        </header>

        {error ? <div className="border-b border-[#e2b6a8] bg-[#fff1ec] px-5 py-3 text-sm text-[#8c3d2b]">{error}</div> : null}

        {selectedDraft?.kind === "pixel" ? (
          <PixelEditor canvas={draftCanvas} onCanvasChange={setDraftCanvas} onTitleChange={setDraftTitle} theme={theme} title={draftTitle} ui={ui} />
        ) : selectedDraft?.kind === "melody" ? (
          <MelodyEditor key={selectedDraft.id} language={language} melody={draftMelody} onMelodyChange={setDraftMelody} onTitleChange={setDraftTitle} theme={theme} title={draftTitle} ui={ui} />
        ) : (
          <TextEditor
            body={draftBody}
            format={draftTextFormat}
            onBodyChange={setDraftBody}
            onFormatChange={setDraftTextFormat}
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
  format,
  onBodyChange,
  onFormatChange,
  onTitleChange,
  preview,
  showHelp,
  theme,
  title,
  ui
}: {
  body: string;
  format: TextFormat;
  onBodyChange: (body: string) => void;
  onFormatChange: (format: TextFormat) => void;
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
  const helpTitle = format === "latex" ? ui.latexHelp : ui.markdownHelp;
  const helpTips = format === "latex" ? ui.latexTips : ui.markdownTips;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function insertHelpSyntax(syntax: string) {
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? body.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const selectedText = body.slice(selectionStart, selectionEnd);
    const insertion = buildTextFormatInsertion(format, syntax, selectedText);
    const nextBody = `${body.slice(0, selectionStart)}${insertion.text}${body.slice(selectionEnd)}`;
    const nextSelectionStart = selectionStart + insertion.selectionStart;
    const nextSelectionEnd = selectionStart + insertion.selectionEnd;

    onBodyChange(nextBody);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  }

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
          <label className="flex items-center gap-2 text-xs">
            {ui.textFormat}
            <select
              className={`h-10 rounded-md border ${theme.border} bg-white px-2 text-sm outline-none`}
              onChange={(event) => onFormatChange(event.target.value as TextFormat)}
              value={format}
            >
              <option value="markdown">{ui.markdownFormat}</option>
              <option value="latex">{ui.latexFormat}</option>
            </select>
          </label>
        </div>
        <textarea
          className="h-[calc(100%-73px)] w-full resize-none bg-transparent p-6 font-mono text-[15px] leading-7 text-[#17212b] outline-none"
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder={ui.textPlaceholder}
          ref={textareaRef}
          spellCheck={false}
          value={body}
        />
      </section>
      <section className={`min-w-0 overflow-y-auto ${showHelp ? `border-r ${theme.border}` : ""} ${theme.app} p-6`}>
        <article className="markdown-preview latex-preview mx-auto max-w-3xl text-[15px] leading-7" dangerouslySetInnerHTML={{ __html: preview }} />
      </section>
      {showHelp ? (
        <aside className={`min-w-0 overflow-y-auto ${theme.panel}`}>
          <div className={`flex h-12 items-center border-b ${theme.border} px-4`}>
            <h2 className="text-sm font-semibold">{helpTitle}</h2>
          </div>
          <div className="space-y-3 p-4 text-sm">
            {helpTips.map(([syntax, effect]) => (
              <button
                className={`block w-full rounded-md border ${theme.border} bg-white p-3 text-left transition ${theme.hover}`}
                key={syntax}
                onClick={() => insertHelpSyntax(syntax)}
                title={effect}
                type="button"
              >
                <code className="text-xs">{syntax}</code>
                <p className={`mt-1 text-xs ${theme.muted}`}>{effect}</p>
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function buildTextFormatInsertion(format: TextFormat, syntax: string, selectedText: string): { text: string; selectionStart: number; selectionEnd: number } {
  return format === "latex" ? buildLatexInsertion(syntax, selectedText) : buildMarkdownInsertion(syntax, selectedText);
}

function buildMarkdownInsertion(syntax: string, selectedText: string): { text: string; selectionStart: number; selectionEnd: number } {
  const selected = selectedText || "";
  if (syntax.startsWith("## ")) {
    return prefixedLineInsertion("## ", selected);
  }
  if (syntax.startsWith("# ")) {
    return prefixedLineInsertion("# ", selected);
  }
  if (syntax.startsWith("- ")) {
    return prefixedLineInsertion("- ", selected);
  }
  if (syntax.startsWith("1. ")) {
    return prefixedLineInsertion("1. ", selected);
  }
  if (syntax.startsWith("> ")) {
    return prefixedLineInsertion("> ", selected);
  }
  if (syntax.startsWith("**")) {
    return wrappedInsertion("**", "**", selected, markdownPlaceholder(syntax, "bold"));
  }
  if (syntax.startsWith("*")) {
    return wrappedInsertion("*", "*", selected, markdownPlaceholder(syntax, "italic"));
  }
  if (syntax.startsWith("`") && syntax !== "```") {
    return wrappedInsertion("`", "`", selected, markdownPlaceholder(syntax, "code"));
  }
  if (syntax === "```") {
    const content = selected || "code";
    return selected ? selectionAtEnd(`\`\`\`\n${content}\n\`\`\``) : selectedRange(`\`\`\`\n${content}\n\`\`\``, 4, 4 + content.length);
  }
  if (syntax.startsWith("[")) {
    const label = selected || markdownPlaceholder(syntax, "Text");
    const text = `[${label}](URL)`;
    return selected ? selectedRange(text, label.length + 3, label.length + 6) : selectedRange(text, 1, 1 + label.length);
  }
  return selectionAtEnd(syntax);
}

function buildLatexInsertion(syntax: string, selectedText: string): { text: string; selectionStart: number; selectionEnd: number } {
  const selected = selectedText || "";
  if (syntax.startsWith("\\section")) {
    return latexCommandInsertion("section", selected, latexPlaceholder(syntax, "Heading"));
  }
  if (syntax.startsWith("\\subsection")) {
    return latexCommandInsertion("subsection", selected, latexPlaceholder(syntax, "Subheading"));
  }
  if (syntax.startsWith("\\textbf")) {
    return latexCommandInsertion("textbf", selected, latexPlaceholder(syntax, "Bold"));
  }
  if (syntax.startsWith("\\emph")) {
    return latexCommandInsertion("emph", selected, latexPlaceholder(syntax, "Italic"));
  }
  if (syntax.startsWith("\\begin{itemize}")) {
    return latexEnvironmentInsertion("itemize", selected);
  }
  if (syntax.startsWith("\\begin{enumerate}")) {
    return latexEnvironmentInsertion("enumerate", selected);
  }
  if (syntax.startsWith("\\begin{quote}")) {
    return latexBlockInsertion("quote", selected || "Quote");
  }
  if (syntax.startsWith("\\begin{verbatim}")) {
    return latexBlockInsertion("verbatim", selected || "code");
  }
  if (syntax.startsWith("$")) {
    return wrappedInsertion("$", "$", selected, latexPlaceholder(syntax, "a^2 + b^2 = c^2"));
  }
  if (syntax.startsWith("\\[")) {
    const content = selected || "x = \\frac{-b}{2a}";
    return selected ? selectionAtEnd(`\\[\n${content}\n\\]`) : selectedRange(`\\[\n${content}\n\\]`, 3, 3 + content.length);
  }
  return selectionAtEnd(syntax);
}

function prefixedLineInsertion(prefix: string, selectedText: string): { text: string; selectionStart: number; selectionEnd: number } {
  if (!selectedText) {
    return selectionAtEnd(prefix);
  }
  return selectionAtEnd(selectedText.split(/\r?\n/).map((line) => `${prefix}${line}`).join("\n"));
}

function wrappedInsertion(prefix: string, suffix: string, selectedText: string, placeholder: string): { text: string; selectionStart: number; selectionEnd: number } {
  const content = selectedText || placeholder;
  const text = `${prefix}${content}${suffix}`;
  return selectedText ? selectionAtEnd(text) : selectedRange(text, prefix.length, prefix.length + content.length);
}

function latexCommandInsertion(command: string, selectedText: string, placeholder: string): { text: string; selectionStart: number; selectionEnd: number } {
  const content = selectedText || placeholder;
  const prefix = `\\${command}{`;
  const text = `${prefix}${content}}`;
  return selectedText ? selectionAtEnd(text) : selectedRange(text, prefix.length, prefix.length + content.length);
}

function latexEnvironmentInsertion(environment: "itemize" | "enumerate", selectedText: string): { text: string; selectionStart: number; selectionEnd: number } {
  const content = selectedText
    ? selectedText.split(/\r?\n/).map((line) => `  \\item ${line}`).join("\n")
    : "  \\item item";
  const text = `\\begin{${environment}}\n${content}\n\\end{${environment}}`;
  return selectedText ? selectionAtEnd(text) : selectedRange(text, `\\begin{${environment}}\n  \\item `.length, `\\begin{${environment}}\n  \\item `.length + 4);
}

function latexBlockInsertion(environment: "quote" | "verbatim", content: string): { text: string; selectionStart: number; selectionEnd: number } {
  const text = `\\begin{${environment}}\n${content}\n\\end{${environment}}`;
  return selectedRange(text, `\\begin{${environment}}\n`.length, `\\begin{${environment}}\n`.length + content.length);
}

function markdownPlaceholder(syntax: string, fallback: string): string {
  if (syntax.startsWith("[") && syntax.includes("]")) {
    return syntax.slice(1, syntax.indexOf("]")) || fallback;
  }
  return syntax.replace(/[`*_]/g, "").trim() || fallback;
}

function latexPlaceholder(syntax: string, fallback: string): string {
  const match = /\{(.+?)\}/.exec(syntax);
  return match?.[1] || fallback;
}

function selectedRange(text: string, selectionStart: number, selectionEnd: number): { text: string; selectionStart: number; selectionEnd: number } {
  return { text, selectionStart, selectionEnd };
}

function selectionAtEnd(text: string): { text: string; selectionStart: number; selectionEnd: number } {
  return selectedRange(text, text.length, text.length);
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
  const [playbackControl, setPlaybackControl] = useState<PlaybackControls | null>(null);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [playStartStep, setPlayStartStep] = useState(0);
  const [playheadStep, setPlayheadStep] = useState<number | null>(null);
  const [visualPlayback, setVisualPlayback] = useState(false);
  const [noteLength, setNoteLength] = useState(1);
  const [freeEdit, setFreeEdit] = useState(false);
  const [rollZoom, setRollZoom] = useState(1);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackName, setEditingTrackName] = useState("");
  const [selectedAudioExampleId, setSelectedAudioExampleId] = useState(audioExamples[0]?.id ?? "");
  const playbackRef = useRef<{ id: number; control?: PlaybackControls }>({ id: 0 });
  const rollScrollRef = useRef<HTMLDivElement | null>(null);
  const rollScrollPositionRef = useRef({ left: 0, top: 0 });
  const clip = useMemo(() => normalizeMelodyClip(melody), [melody]);
  const steps = Math.max(4, Math.min(maxMelodyBars * clip.beatsPerBar * clip.stepsPerBeat, clip.bars * clip.beatsPerBar * clip.stepsPerBeat));
  const cellWidth = Math.round(28 * rollZoom);
  const rowHeight = Math.round(22 * rollZoom);
  const timelineHeight = Math.round(24 * rollZoom);
  const barHeight = Math.round(28 * rollZoom);
  const pitches = useMemo(() => Array.from({ length: melodyMaxPitch - melodyMinPitch + 1 }, (_, index) => melodyMaxPitch - index), []);
  const activeTrack = clip.tracks[Math.min(activeTrackIndex, clip.tracks.length - 1)] ?? clip.tracks[0];

  useEffect(() => {
    return () => {
      playbackRef.current.control?.stop();
    };
  }, []);

  useEffect(() => {
    if (playheadStep === null || visualPlayback) {
      return;
    }
    const container = rollScrollRef.current;
    if (!container) {
      return;
    }
    const labelWidth = 72;
    const targetLeft = labelWidth + playheadStep * cellWidth;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;
    if (targetLeft + cellWidth > visibleRight - cellWidth * 2) {
      container.scrollTo({ left: Math.max(0, targetLeft - labelWidth), behavior: "smooth" });
    } else if (targetLeft < visibleLeft + labelWidth) {
      container.scrollTo({ left: Math.max(0, targetLeft - labelWidth), behavior: "smooth" });
    }
  }, [cellWidth, playheadStep, visualPlayback]);

  useEffect(() => {
    if (playStartStep >= steps) {
      setPlayStartStep(Math.max(0, steps - 1));
    }
  }, [playStartStep, steps]);

  useEffect(() => {
    if (visualPlayback) {
      return;
    }
    const container = rollScrollRef.current;
    if (!container) {
      return;
    }
    container.scrollLeft = rollScrollPositionRef.current.left;
    container.scrollTop = rollScrollPositionRef.current.top;
  }, [visualPlayback]);

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

  function commitFreeNote(pitch: number, start: number, duration: number) {
    if (!activeTrack) {
      return;
    }

    const safeStart = clampNumber(Math.round(start), 0, steps - 1);
    const safeDuration = clampNumber(Math.round(duration), 1, steps - safeStart);
    const safeEnd = safeStart + safeDuration;

    updateTrack(activeTrack.id, (track) => {
      const clickedNote =
        safeDuration === 1
          ? track.notes.find((note) => note.pitch === pitch && safeStart >= note.start && safeStart < note.start + note.duration)
          : undefined;
      if (clickedNote) {
        previewMelodyNote(pitch, track.program, 1);
        return { ...track, notes: track.notes.filter((note) => note.id !== clickedNote.id) };
      }

      const notes = track.notes.filter((note) => {
        if (note.pitch !== pitch) {
          return true;
        }
        const noteEnd = note.start + note.duration;
        return noteEnd <= safeStart || note.start >= safeEnd;
      });
      return {
        ...track,
        notes: [
          ...notes,
          {
            id: crypto.randomUUID(),
            pitch,
            start: safeStart,
            duration: safeDuration,
            velocity: 96
          }
        ]
      };
    });
    previewMelodyNote(pitch, activeTrack.program, Math.min(safeDuration, 16));
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
    setEditingTrackId(null);
    setActiveTrackIndex(Math.max(0, activeTrackIndex - 1));
  }

  function beginTrackNameEdit(track: MelodyClip["tracks"][number]) {
    setEditingTrackId(track.id);
    setEditingTrackName(track.name);
  }

  function commitTrackNameEdit() {
    if (!editingTrackId) {
      return;
    }
    const nextName = editingTrackName.trim();
    updateTrack(editingTrackId, (track) => ({ ...track, name: nextName || track.name }));
    setEditingTrackId(null);
  }

  function loadSelectedAudioExample() {
    const example = audioExamples.find((candidate) => candidate.id === selectedAudioExampleId) ?? audioExamples[0];
    if (!example) {
      return;
    }

    stopCurrentPlayback();
    onTitleChange(example.title);
    updateClip(example.melody);
    setActiveTrackIndex(0);
    setEditingTrackId(null);
    setPlayStartStep(0);
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

  function startPlayback(trackId?: string, visual = false) {
    playbackRef.current.control?.stop();
    const playbackId = playbackRef.current.id + 1;
    if (visual && rollScrollRef.current) {
      rollScrollPositionRef.current = {
        left: rollScrollRef.current.scrollLeft,
        top: rollScrollRef.current.scrollTop
      };
    }
    setVisualPlayback(visual);
    setPlaybackPaused(false);
    setPlayheadStep(playStartStep);
    const control = playMelody(clip, {
      startStep: playStartStep,
      trackId,
      onStep: visual ? undefined : setPlayheadStep,
      onEnded: () => {
        if (playbackRef.current.id !== playbackId) {
          return;
        }
        playbackRef.current = { id: playbackId };
        setPlaybackControl(null);
        setPlaybackPaused(false);
        setPlayheadStep(null);
        setVisualPlayback(false);
      }
    });
    playbackRef.current = { id: playbackId, control };
    setPlaybackControl(control);
  }

  function stopCurrentPlayback() {
    playbackRef.current.control?.stop();
    playbackRef.current = { id: playbackRef.current.id + 1 };
    setPlaybackControl(null);
    setPlaybackPaused(false);
    setPlayheadStep(null);
    setVisualPlayback(false);
  }

  function togglePlaybackPause() {
    const control = playbackRef.current.control;
    if (!control) {
      return;
    }
    if (control.isPaused()) {
      control.resume();
      setPlaybackPaused(false);
      return;
    }
    control.pause();
    setPlaybackPaused(true);
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
        <NumberControl label={ui.bars} max={maxMelodyBars} min={1} onChange={(value) => updateClip({ ...clip, bars: value })} value={clip.bars} />
        <NumberControl label={ui.beatsPerBar} max={12} min={1} onChange={(value) => updateClip({ ...clip, beatsPerBar: value })} value={clip.beatsPerBar} />
        <NumberControl disabled={freeEdit} label={ui.noteLength} max={16} min={1} onChange={setNoteLength} value={noteLength} />
        <label className="flex items-center gap-2 text-sm">
          <input checked={freeEdit} onChange={(event) => setFreeEdit(event.target.checked)} type="checkbox" />
          {ui.freeEdit}
        </label>
      </div>

      <div className={`flex flex-wrap items-center gap-3 border-b ${theme.border} ${theme.panel} px-5 py-2`}>
        {playbackControl ? (
          <>
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={stopCurrentPlayback} type="button">
              {ui.stop}
            </button>
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={togglePlaybackPause} type="button">
              {playbackPaused ? ui.resume : ui.pause}
            </button>
          </>
        ) : (
          <>
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => startPlayback(undefined, true)} type="button">
              {ui.visualPlay}
            </button>
            <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => startPlayback()} type="button">
              {ui.playAudio}
            </button>
          </>
        )}
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} disabled={!activeTrack || Boolean(playbackControl)} onClick={() => startPlayback(activeTrack?.id)} type="button">
          {ui.playTrack}
        </button>
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleImportMidi()} type="button">
          {ui.importMidi}
        </button>
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={addTrack} type="button">
          {ui.addTrack}
        </button>
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} disabled={clip.tracks.length <= 1} onClick={removeActiveTrack} type="button">
          {ui.deleteTrack}
        </button>
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={loadSelectedAudioExample} type="button">
          {ui.audioExample}
        </button>
        <select
          className={`h-9 max-w-64 rounded-md border ${theme.border} bg-white px-2 text-sm outline-none`}
          onChange={(event) => setSelectedAudioExampleId(event.target.value)}
          value={selectedAudioExampleId}
        >
          {audioExamples.map((example) => (
            <option key={example.id} value={example.id}>
              {example.title}
            </option>
          ))}
        </select>
      </div>

      <div className={`flex flex-wrap gap-2 border-b ${theme.border} ${theme.panel} px-5 py-2`}>
        {clip.tracks.map((track, index) => {
          const isActiveTrack = index === activeTrackIndex;
          const isEditingTrack = editingTrackId === track.id;
          return isEditingTrack ? (
            <input
              autoFocus
              className="h-8 min-w-24 max-w-40 rounded-md border bg-white px-3 text-xs outline-none"
              key={track.id}
              onBlur={commitTrackNameEdit}
              onChange={(event) => setEditingTrackName(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitTrackNameEdit();
                } else if (event.key === "Escape") {
                  setEditingTrackId(null);
                }
              }}
              style={{ borderColor: track.color, color: track.color }}
              value={editingTrackName}
            />
          ) : (
            <button
              className={`h-8 max-w-40 truncate rounded-md border px-3 text-xs ${isActiveTrack ? "bg-white" : theme.hover}`}
              key={track.id}
              onClick={() => {
                if (isActiveTrack) {
                  beginTrackNameEdit(track);
                  return;
                }
                setEditingTrackId(null);
                setActiveTrackIndex(index);
              }}
              style={{ borderColor: track.color, color: track.color }}
              title={track.name}
              type="button"
            >
              {track.name}
            </button>
          );
        })}
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
            <label className="relative ml-1 flex h-8 w-8 cursor-pointer items-center justify-center" title={ui.color}>
              <span
                className="h-5 w-5 rounded-full border border-white shadow-[0_0_0_1px_rgba(23,33,43,0.25)]"
                style={{ backgroundColor: activeTrack.color }}
              />
              <input
                aria-label={ui.color}
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => updateTrack(activeTrack.id, (track) => ({ ...track, color: event.target.value }))}
                type="color"
                value={activeTrack.color}
              />
            </label>
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

      {visualPlayback ? (
        <MelodyVisualPlayer clip={clip} paused={playbackPaused} playheadStep={playheadStep ?? playStartStep} startStep={playStartStep} trackId={undefined} />
      ) : (
      <div className="min-h-0 flex-1 overflow-auto pb-5 pr-5" ref={rollScrollRef}>
        <div
          className="relative grid w-max rounded-md border border-[#9badbd]/80 bg-transparent shadow-sm"
          style={{
            gridTemplateColumns: `72px repeat(${steps}, ${cellWidth}px)`,
            gridTemplateRows: `${timelineHeight}px ${barHeight}px repeat(${pitches.length}, ${rowHeight}px)`
          }}
        >
          {playheadStep !== null ? (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-50 w-0 border-l-2 border-[#17212b] shadow-[0_0_0_1px_rgba(255,255,255,0.65),0_0_12px_rgba(23,33,43,0.28)]"
              style={{ left: `${72 + playheadStep * cellWidth}px` }}
            />
          ) : null}
          <div className="sticky left-0 top-0 z-[70] border-b border-r border-[#8fb3d9] bg-[#245b82] px-2 text-xs text-white shadow-[2px_0_0_rgba(0,0,0,0.12)]" style={{ lineHeight: `${timelineHeight}px` }}>
            {ui.timeline}
          </div>
          <div className="sticky top-0 z-[60] col-span-full border-b border-[#8fb3d9]/70 bg-[#eaf4ff]" style={{ gridColumn: `2 / span ${steps}` }}>
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[#7faad2]" />
            {Array.from({ length: steps + 1 }, (_, step) => {
              const marker = timelineMarkerKind(step, clip);
              const selectableStep = Math.min(step, steps - 1);
              const selected = selectableStep === playStartStep;
              const playing = step === playheadStep;
              return (
                <button
                  aria-label={`${ui.playStart}: ${selectableStep + 1}`}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition"
                  key={`timeline-${step}`}
                  onClick={() => setPlayStartStep(selectableStep)}
                  style={{
                    left: `${step * cellWidth}px`,
                    width: playing ? 12 : selected ? 11 : marker === "bar" ? 8 : marker === "beat" ? 5 : 3,
                    height: playing ? 12 : selected ? 11 : marker === "bar" ? 8 : marker === "beat" ? 5 : 3,
                    backgroundColor: playing ? "#17212b" : selected ? "#245b82" : marker === "bar" ? "#ffffff" : "#9fbfe0",
                    borderColor: playing || selected ? "#17212b" : marker === "bar" ? "#5c8fbd" : "#8fb3d9"
                  }}
                  title={`${ui.playStart}: ${selectableStep + 1}`}
                  type="button"
                />
              );
            })}
          </div>
          <div
            className="sticky left-0 z-30 border-b border-r border-[#d8e1ea] bg-[#f8fbff] px-2 text-xs shadow-[2px_0_0_rgba(0,0,0,0.08)]"
            style={{ lineHeight: `${barHeight}px` }}
          >
            {ui.barHeader}
          </div>
          {Array.from({ length: steps }, (_, step) => (
            <button
              className={`border-b text-center text-[10px] ${gridBorderClass(step, clip)} ${
                step === playStartStep
                  ? "border-l-2 border-l-[#245b82] font-semibold text-[#245b82]"
                  : step % (clip.beatsPerBar * clip.stepsPerBeat) === 0
                    ? "font-semibold text-[#245b82]"
                    : "text-[#8aa0b5]"
              }`}
              key={`bar-${step}`}
              onClick={() => setPlayStartStep(step)}
              style={{
                backgroundColor:
                  step === playStartStep ? "rgba(207, 230, 255, 0.66)" : step % (clip.beatsPerBar * clip.stepsPerBeat) === 0 ? "rgba(234, 244, 255, 0.48)" : "rgba(248, 251, 255, 0.2)",
                lineHeight: `${barHeight}px`
              }}
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
              commitFreeNote={commitFreeNote}
              freeEdit={freeEdit}
              key={pitch}
              noteLength={noteLength}
              pitch={pitch}
              playStartStep={playStartStep}
              steps={steps}
              rowHeight={rowHeight}
              theme={theme}
              toggleNote={toggleNote}
              ui={ui}
            />
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

function MelodyVisualPlayer({
  clip,
  paused,
  playheadStep,
  startStep,
  trackId
}: {
  clip: MelodyClip;
  paused: boolean;
  playheadStep: number;
  startStep: number;
  trackId?: string;
}) {
  const normalized = useMemo(() => normalizeMelodyClip(clip), [clip]);
  const secondsPerStep = 60 / normalized.bpm / normalized.stepsPerBeat;
  const [visualStep, setVisualStep] = useState(playheadStep);
  const visualAnchorRef = useRef({ step: playheadStep, time: performance.now() });
  const visualStepRef = useRef(playheadStep);

  useEffect(() => {
    visualStepRef.current = visualStep;
  }, [visualStep]);

  useEffect(() => {
    if (paused) {
      visualAnchorRef.current = { step: visualStepRef.current, time: performance.now() };
      return;
    }

    let frame = 0;
    const maxStep = normalized.bars * normalized.beatsPerBar * normalized.stepsPerBeat;
    visualAnchorRef.current = { step: visualStepRef.current, time: performance.now() };

    function tick(now: number) {
      const elapsedSteps = (now - visualAnchorRef.current.time) / 1000 / secondsPerStep;
      const nextStep = Math.min(maxStep, visualAnchorRef.current.step + elapsedSteps);
      visualStepRef.current = nextStep;
      setVisualStep(nextStep);
      frame = window.requestAnimationFrame(tick);
    }

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [normalized.bars, normalized.beatsPerBar, normalized.stepsPerBeat, paused, secondsPerStep]);

  const visibleSteps = Math.max(16, normalized.stepsPerBeat * 8);
  const tracks = trackId ? normalized.tracks.filter((track) => track.id === trackId) : normalized.tracks;
  const notes = tracks.flatMap((track) =>
    track.notes
      .filter((note) => note.start + note.duration >= visualStep && note.start <= visualStep + visibleSteps)
      .map((note) => ({ note, track }))
  );
  const activeNotes = notes.filter(({ note }) => note.start <= visualStep && note.start + note.duration > visualStep);
  const activePitches = new Set(activeNotes.map(({ note }) => note.pitch));
  const activePitchColors = new Map(activeNotes.map(({ note, track }) => [note.pitch, track.color]));
  const keys = useMemo(() => Array.from({ length: melodyMaxPitch - melodyMinPitch + 1 }, (_, index) => melodyMinPitch + index), []);
  const starFieldStyle = {
    backgroundImage:
      "radial-gradient(circle at 12% 18%, rgba(255,255,255,0.9) 0 1px, transparent 1.5px), radial-gradient(circle at 28% 62%, rgba(186,230,253,0.85) 0 1px, transparent 1.5px), radial-gradient(circle at 42% 31%, rgba(255,255,255,0.8) 0 1px, transparent 1.5px), radial-gradient(circle at 65% 12%, rgba(219,234,254,0.9) 0 1px, transparent 1.5px), radial-gradient(circle at 78% 44%, rgba(255,255,255,0.75) 0 1px, transparent 1.5px), radial-gradient(circle at 91% 76%, rgba(186,230,253,0.8) 0 1px, transparent 1.5px), linear-gradient(180deg, #071326 0%, #0b1930 44%, #050b15 100%)",
    backgroundSize: "180px 180px, 240px 240px, 210px 210px, 260px 260px, 230px 230px, 300px 300px, 100% 100%"
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#08111f]">
      <div className="absolute inset-x-0 top-0 h-[calc(100%-88px)] overflow-hidden">
        <div className="absolute inset-0" style={starFieldStyle} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,11,21,0.05)_0%,rgba(14,46,82,0.24)_58%,rgba(5,11,21,0.2)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 top-0 mx-auto max-w-[1180px]">
          {notes.map(({ note, track }) => {
            const left = pitchToVisualPercent(note.pitch);
            const noteStartY = 100 - ((note.start - visualStep) / visibleSteps) * 100;
            const noteEndY = 100 - ((note.start + Math.max(1, note.duration) - visualStep) / visibleSteps) * 100;
            const top = Math.max(-24, Math.min(100, noteEndY));
            const bottom = Math.max(top + 2, Math.min(100, noteStartY));
            const height = bottom - top;
            const isActive = note.start <= visualStep && note.start + note.duration > visualStep;
            const fillAlpha = visualNoteFillAlpha(note.duration, visibleSteps, isActive);
            return (
              <div
                className="absolute rounded-sm border"
                key={`${track.id}-${note.id}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${100 / 88}%`,
                  height: `${height}%`,
                  backgroundColor: hexWithAlpha(track.color, fillAlpha),
                  borderColor: track.color,
                  boxShadow: isActive ? `0 0 0 1px ${track.color}, 0 0 18px ${track.color}` : undefined,
                  transform: "translateX(-50%)"
                }}
              />
            );
          })}
          {activeNotes.map(({ note, track }) => (
            <div
              className="absolute bottom-0 h-[5px] rounded-t-sm"
              key={`hit-${track.id}-${note.id}`}
              style={{
                left: `${pitchToVisualPercent(note.pitch)}%`,
                width: `${visualKeyWidthPercent()}%`,
                backgroundColor: track.color,
                boxShadow: `0 -4px 18px ${track.color}`,
                transform: "translateX(-50%)"
              }}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-[#bae6fd]/80 shadow-[0_0_12px_rgba(125,211,252,0.7)]" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[88px] border-t border-[#4d6f91] bg-[#0f172a]">
        <div className="relative mx-auto h-full w-full max-w-[1180px]">
          <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
            {keys.map((pitch) => {
              const black = isBlackKey(pitch);
              const activeColor = activePitchColors.get(pitch);
              return (
                <div
                  className={`relative border-r border-[#9fb0c2] ${black ? "bg-[#111827]" : "bg-[#f8fafc]"} ${
                    activePitches.has(pitch) ? "shadow-[inset_0_0_0_2px_#38bdf8,inset_0_10px_20px_rgba(56,189,248,0.35)] brightness-125" : ""
                  }`}
                  key={pitch}
                  style={activeColor ? { borderTopColor: activeColor } : undefined}
                  title={pitchName(pitch)}
                >
                  {pitch % 12 === 0 ? (
                    <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] ${black ? "text-white" : "text-[#475569]"}`}>{pitchName(pitch)}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="absolute left-4 top-4 rounded border border-[#35597a] bg-[#0f2138]/80 px-3 py-1 text-xs text-[#dbeafe]">
        {pitchName(melodyMinPitch)} - {pitchName(melodyMaxPitch)} · {Math.max(0, Math.floor(visualStep) - startStep)}
      </div>
    </div>
  );
}

function MelodyRow({
  activeTrackId,
  activeTrackProgram,
  clip,
  commitFreeNote,
  freeEdit,
  noteLength,
  pitch,
  playStartStep,
  rowHeight,
  steps,
  theme,
  toggleNote,
  ui
}: {
  activeTrackId?: string;
  activeTrackProgram: number;
  clip: MelodyClip;
  commitFreeNote: (pitch: number, start: number, duration: number) => void;
  freeEdit: boolean;
  noteLength: number;
  pitch: number;
  playStartStep: number;
  rowHeight: number;
  steps: number;
  theme: (typeof themes)[ThemeKey];
  toggleNote: (pitch: number, start: number) => void;
  ui: UiCopy;
}) {
  const blackKey = isBlackKey(pitch);
  const [hoverNote, setHoverNote] = useState<{ start: number; duration?: number } | null>(null);
  const holdTimerRef = useRef<number>();
  const holdStopRef = useRef<(() => void) | null>(null);
  const longPressRef = useRef(false);
  const freeEditDragRef = useRef<{ anchor: number; current: number } | null>(null);
  const finishFreeEditRef = useRef<() => void>(() => undefined);
  const rowSlots = useMemo(() => {
    const slots: Array<{
      active?: { note: MelodyNote; track: MelodyClip["tracks"][number] };
      visible?: { note: MelodyNote; track: MelodyClip["tracks"][number] };
    }> = Array.from({ length: steps }, () => ({}));

    for (const track of clip.tracks) {
      const isActiveTrack = track.id === activeTrackId;
      for (const note of track.notes) {
        if (note.pitch !== pitch) {
          continue;
        }
        const start = clampNumber(note.start, 0, steps - 1);
        const end = clampNumber(note.start + note.duration, start + 1, steps);
        const entry = { note, track };
        for (let step = start; step < end; step += 1) {
          if (isActiveTrack) {
            slots[step].active = entry;
            slots[step].visible = entry;
          } else if (!slots[step].visible) {
            slots[step].visible = entry;
          }
        }
      }
    }

    return slots;
  }, [activeTrackId, clip.tracks, pitch, steps]);

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

  function updateFreeEditPreview(anchor: number, current: number) {
    const start = Math.min(anchor, current);
    const duration = Math.abs(current - anchor) + 1;
    setHoverNote({ start, duration });
  }

  function startFreeEdit(event: ReactPointerEvent<HTMLButtonElement>, step: number) {
    if (!freeEdit) {
      return;
    }
    event.preventDefault();
    freeEditDragRef.current = { anchor: step, current: step };
    updateFreeEditPreview(step, step);
  }

  function updateFreeEdit(step: number) {
    const drag = freeEditDragRef.current;
    if (!freeEdit || !drag) {
      return;
    }
    drag.current = step;
    updateFreeEditPreview(drag.anchor, drag.current);
  }

  function finishFreeEdit(step: number) {
    const drag = freeEditDragRef.current;
    if (!freeEdit || !drag) {
      return;
    }
    drag.current = step;
    const start = Math.min(drag.anchor, drag.current);
    const duration = Math.abs(drag.current - drag.anchor) + 1;
    freeEditDragRef.current = null;
    setHoverNote(null);
    commitFreeNote(pitch, start, duration);
  }

  finishFreeEditRef.current = () => {
    const drag = freeEditDragRef.current;
    if (!drag) {
      return;
    }
    finishFreeEdit(drag.current);
  };

  useEffect(() => {
    function finishDrag() {
      finishFreeEditRef.current();
    }

    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, []);

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
        const active = rowSlots[step].active;
        const visible = rowSlots[step].visible;
        const background = active?.track.color ?? visible?.track.color;
        const isNoteStart = Boolean(visible && visible.note.start === step);
        const isContinuation = Boolean(visible && visible.note.start < step);
        const previewDuration = hoverNote?.duration ?? noteLength;
        const isHoverPreview = hoverNote !== null && step >= hoverNote.start && step < Math.min(steps, hoverNote.start + previewDuration);

        return (
          <button
            className={`border-b border-[#d6e4ef]/55 ${step === playStartStep ? "border-l-2 border-l-[#245b82]" : ""} ${gridBorderClass(step, clip)}`}
            key={`${pitch}-${step}`}
            onClick={(event) => {
              if (freeEdit) {
                event.preventDefault();
                return;
              }
              if (longPressRef.current) {
                event.preventDefault();
                return;
              }
              toggleNote(pitch, step);
            }}
            onPointerDown={(event) => startFreeEdit(event, step)}
            onPointerEnter={() => {
              updateFreeEdit(step);
              if (!freeEditDragRef.current) {
                setHoverNote({ start: step });
              }
            }}
            onPointerUp={() => finishFreeEdit(step)}
            onPointerCancel={() => {
              freeEditDragRef.current = null;
              setHoverNote(null);
            }}
            onMouseLeave={() => {
              if (!freeEditDragRef.current) {
                setHoverNote(null);
              }
            }}
            style={{
              backgroundColor: background
                ? hexWithAlpha(background, isContinuation ? 0.48 : active ? 0.86 : 0.35)
                : isHoverPreview
                  ? "rgba(36, 91, 130, 0.16)"
                  : melodyCellBackground(step, clip),
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
  const [importDraft, setImportDraft] = useState<ImageImportDraft | null>(null);
  const [dragStart, setDragStart] = useState<PixelPoint | null>(null);
  const [hoverPoint, setHoverPoint] = useState<PixelPoint | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [randomFillRunning, setRandomFillRunning] = useState(false);
  const randomFillCanvasRef = useRef<PixelCanvas | undefined>(canvas);

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

  useEffect(() => {
    randomFillCanvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    if (!randomFillRunning) {
      return;
    }

    const handle = window.setInterval(() => {
      const base = randomFillCanvasRef.current;
      if (!base) {
        setRandomFillRunning(false);
        return;
      }

      const blankIndices: number[] = [];
      base.pixels.forEach((pixel, index) => {
        if (isBlankPixel(pixel)) {
          blankIndices.push(index);
        }
      });

      if (blankIndices.length === 0) {
        setRandomFillRunning(false);
        return;
      }

      const index = blankIndices[Math.floor(Math.random() * blankIndices.length)];
      const pixels = [...base.pixels];
      pixels[index] = randomHexColor();
      const nextCanvas = { ...base, pixels };
      randomFillCanvasRef.current = nextCanvas;
      onCanvasChange(nextCanvas);
    }, 250);

    return () => window.clearInterval(handle);
  }, [onCanvasChange, randomFillRunning]);

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
    setRandomFillRunning(false);
    const bytes = await importImageFile();
    if (!bytes) {
      return;
    }
    const blob = new Blob([new Uint8Array(bytes)]);
    const url = URL.createObjectURL(blob);
    const image = await loadImageElement(url);
    setImportDraft((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return {
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cropScale: 1,
        cropX: 0.5,
        cropY: 0.5
      };
    });
  }

  async function applyImageImport() {
    if (!importDraft) {
      return;
    }
    const imported = await cropImageDraftToCanvas(importDraft, targetWidth, targetHeight);
    URL.revokeObjectURL(importDraft.url);
    setImportDraft(null);
    onCanvasChange(imported);
  }

  function cancelImageImport() {
    if (importDraft) {
      URL.revokeObjectURL(importDraft.url);
    }
    setImportDraft(null);
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
          {importDraft ? (
            <ImageImportPanel
              draft={importDraft}
              onApply={() => void applyImageImport()}
              onCancel={cancelImageImport}
              onDraftChange={setImportDraft}
              targetHeight={targetHeight}
              targetWidth={targetWidth}
              theme={theme}
              ui={ui}
            />
          ) : (
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
          )}
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
          <button
            className={`mt-auto min-h-9 w-full rounded-md border px-2 py-2 text-xs ${
              randomFillRunning ? "border-[#9c3d2c] bg-[#fff1ec] text-[#9c3d2c]" : `${theme.border} ${theme.hover}`
            } disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={Boolean(importDraft)}
            onClick={() => setRandomFillRunning((running) => !running)}
            type="button"
          >
            {randomFillRunning ? ui.stopRandomFill : ui.randomFill}
          </button>
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

type ImageImportDraft = {
  url: string;
  width: number;
  height: number;
  cropScale: number;
  cropX: number;
  cropY: number;
};

type ImportDragState = {
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startPointerX: number;
  startPointerY: number;
  startCrop: { x: number; y: number; width: number; height: number };
};

const cropHandles = [
  { key: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
  { key: "n", className: "left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize" },
  { key: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
  { key: "e", className: "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize" },
  { key: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
  { key: "s", className: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize" },
  { key: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
  { key: "w", className: "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize" }
];

function ImageImportPanel({
  draft,
  onApply,
  onCancel,
  onDraftChange,
  targetHeight,
  targetWidth,
  theme,
  ui
}: {
  draft: ImageImportDraft;
  onApply: () => void;
  onCancel: () => void;
  onDraftChange: (draft: ImageImportDraft) => void;
  targetHeight: number;
  targetWidth: number;
  theme: (typeof themes)[ThemeKey];
  ui: UiCopy;
}) {
  const dragRef = useRef<ImportDragState | null>(null);
  const crop = getImageCropRect(draft, targetWidth, targetHeight);
  const maxPreviewWidth = 420;
  const maxPreviewHeight = 420;
  const previewScale = Math.min(maxPreviewWidth / draft.width, maxPreviewHeight / draft.height, 1);
  const previewWidth = Math.max(1, Math.round(draft.width * previewScale));
  const previewHeight = Math.max(1, Math.round(draft.height * previewScale));
  const scaleX = previewWidth / draft.width;
  const scaleY = previewHeight / draft.height;
  const cropStyle = {
    left: crop.x * scaleX,
    top: crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY
  };

  function startDrag(event: ReactPointerEvent, mode: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const stage = (event.currentTarget as HTMLElement).closest("[data-crop-stage]") as HTMLElement | null;
    const stageRect = stage?.getBoundingClientRect();
    dragRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPointerX: stageRect ? (event.clientX - stageRect.left) / scaleX : crop.x + crop.width / 2,
      startPointerY: stageRect ? (event.clientY - stageRect.top) / scaleY : crop.y + crop.height / 2,
      startCrop: crop
    };
  }

  function updateDrag(event: ReactPointerEvent) {
    const state = dragRef.current;
    if (!state) {
      return;
    }

    const deltaX = (event.clientX - state.startClientX) / scaleX;
    const deltaY = (event.clientY - state.startClientY) / scaleY;

    if (state.mode === "move") {
      onDraftChange(draftFromCropRect(draft, targetWidth, targetHeight, {
        ...state.startCrop,
        x: state.startCrop.x + deltaX,
        y: state.startCrop.y + deltaY
      }));
      return;
    }

    const centerX = state.startCrop.x + state.startCrop.width / 2;
    const centerY = state.startCrop.y + state.startCrop.height / 2;
    const pointerX = state.startPointerX + deltaX;
    const pointerY = state.startPointerY + deltaY;
    const aspect = Math.max(0.01, targetWidth / targetHeight);
    const base = getBaseImageCropSize(draft, targetWidth, targetHeight);
    const widthFromX = Math.abs(pointerX - centerX) * 2;
    const widthFromY = Math.abs(pointerY - centerY) * 2 * aspect;
    const nextWidth = Math.max(8, Math.min(base.width, Math.max(widthFromX, widthFromY)));
    const nextHeight = nextWidth / aspect;
    onDraftChange(draftFromCropRect(draft, targetWidth, targetHeight, {
      x: centerX - nextWidth / 2,
      y: centerY - nextHeight / 2,
      width: nextWidth,
      height: nextHeight
    }));
  }

  function endDrag(event: ReactPointerEvent) {
    if (dragRef.current) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }

  return (
    <div className={`max-w-[560px] rounded-md border ${theme.border} ${theme.panel} p-4 shadow-sm`}>
      <div className="relative overflow-hidden rounded border border-[#9badbd] bg-[#17212b]" data-crop-stage>
        <img alt="" className="block object-contain" src={draft.url} style={{ width: previewWidth, height: previewHeight }} />
        <div
          className="absolute cursor-move touch-none border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.42),0_0_0_1px_rgba(36,91,130,0.9)_inset]"
          onPointerDown={(event) => startDrag(event, "move")}
          onPointerMove={updateDrag}
          onPointerCancel={endDrag}
          onPointerUp={endDrag}
          style={cropStyle}
        >
          {cropHandles.map((handle) => (
            <span
              className={`absolute h-3 w-3 touch-none rounded-full border border-[#245b82] bg-white ${handle.className}`}
              key={handle.key}
              onPointerDown={(event) => startDrag(event, "resize")}
              onPointerMove={updateDrag}
              onPointerCancel={endDrag}
              onPointerUp={endDrag}
            />
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={onCancel} type="button">
          {ui.importCancel}
        </button>
        <button className={`h-9 rounded-md px-3 text-sm font-medium ${theme.primary}`} onClick={onApply} type="button">
          {ui.importApply}
        </button>
      </div>
    </div>
  );
}

function NumberControl({
  disabled = false,
  label,
  max,
  min,
  onChange,
  value
}: {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
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
    <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : ""}`}>
      {label}
      <input
        className="h-8 w-16 rounded-md border border-[#c9d8e8] bg-white px-2 text-sm outline-none disabled:cursor-not-allowed"
        disabled={disabled}
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

function isBlankPixel(pixel: string): boolean {
  const normalized = pixel.trim().toLowerCase();
  if (normalized === transparentPixel || normalized === "transparent") {
    return true;
  }
  if (normalized.startsWith("#") && (normalized.length === 5 || normalized.length === 9)) {
    return normalized.endsWith("00");
  }
  if (normalized.startsWith("rgba(")) {
    const parts = normalized.split(",");
    const alpha = parts[parts.length - 1]?.replace(")", "").trim();
    return alpha === "0" || alpha === "0.0";
  }
  return false;
}

function randomHexColor(): string {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}

function melodyCellBackground(step: number, clip: MelodyClip): string {
  if (step % (clip.beatsPerBar * clip.stepsPerBeat) === 0) {
    return "rgba(238, 246, 255, 0.26)";
  }
  if (step % clip.stepsPerBeat === 0) {
    return "rgba(247, 251, 255, 0.18)";
  }
  return "rgba(255, 255, 255, 0.08)";
}

function timelineMarkerKind(step: number, clip: MelodyClip): "bar" | "beat" | "step" {
  if (step % (clip.beatsPerBar * clip.stepsPerBeat) === 0) {
    return "bar";
  }
  if (step % clip.stepsPerBeat === 0) {
    return "beat";
  }
  return "step";
}

function gridBorderClass(step: number, clip: MelodyClip): string {
  const marker = timelineMarkerKind(step + 1, clip);
  if (marker === "bar") {
    return "border-r-2 border-r-[#7faad2]";
  }
  if ((step + 1) % clip.stepsPerBeat === 0) {
    return "border-r border-r-[#b9cfe4]";
  }
  return "border-r border-r-[#e8f0f8]";
}

function pitchToVisualPercent(pitch: number): number {
  return ((pitch - melodyMinPitch + 0.5) / (melodyMaxPitch - melodyMinPitch + 1)) * 100;
}

function visualKeyWidthPercent(): number {
  return 100 / (melodyMaxPitch - melodyMinPitch + 1);
}

function visualNoteFillAlpha(duration: number, visibleSteps: number, isActive: boolean): number {
  const normalizedDuration = Math.max(0, duration) / Math.max(1, visibleSteps);
  const alpha = 0.18 + 0.58 * Math.exp(-3.2 * normalizedDuration);
  return clampNumber(isActive ? alpha + 0.1 : alpha, 0.16, 0.82);
}

function getImageCropRect(draft: ImageImportDraft, targetWidth: number, targetHeight: number) {
  const base = getBaseImageCropSize(draft, targetWidth, targetHeight);
  let width = base.width;
  let height = base.height;

  width = Math.max(1, width * draft.cropScale);
  height = Math.max(1, height * draft.cropScale);

  return {
    x: (draft.width - width) * draft.cropX,
    y: (draft.height - height) * draft.cropY,
    width,
    height
  };
}

function getBaseImageCropSize(draft: Pick<ImageImportDraft, "width" | "height">, targetWidth: number, targetHeight: number) {
  const aspect = Math.max(0.01, targetWidth / targetHeight);
  let width = draft.width;
  let height = width / aspect;
  if (height > draft.height) {
    height = draft.height;
    width = height * aspect;
  }
  return { width, height };
}

function draftFromCropRect(draft: ImageImportDraft, targetWidth: number, targetHeight: number, rect: { x: number; y: number; width: number; height: number }): ImageImportDraft {
  const base = getBaseImageCropSize(draft, targetWidth, targetHeight);
  const safeWidth = clampNumber(rect.width, 8, base.width);
  const safeHeight = clampNumber(rect.height, 8, base.height);
  const cropScale = clampNumber(Math.min(safeWidth / base.width, safeHeight / base.height), 0.01, 1);
  const width = base.width * cropScale;
  const height = base.height * cropScale;
  const xRange = Math.max(0, draft.width - width);
  const yRange = Math.max(0, draft.height - height);
  const x = clampNumber(rect.x, 0, xRange);
  const y = clampNumber(rect.y, 0, yRange);

  return {
    ...draft,
    cropScale,
    cropX: xRange === 0 ? 0.5 : x / xRange,
    cropY: yRange === 0 ? 0.5 : y / yRange
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed."));
    image.src = url;
  });
}

async function cropImageDraftToCanvas(draft: ImageImportDraft, targetWidth: number, targetHeight: number): Promise<PixelCanvas> {
  const image = await loadImageElement(draft.url);
  const safeWidth = Math.max(4, Math.min(512, Math.round(targetWidth)));
  const safeHeight = Math.max(4, Math.min(512, Math.round(targetHeight)));
  const crop = getImageCropRect(draft, safeWidth, safeHeight);
  const canvas = document.createElement("canvas");
  canvas.width = safeWidth;
  canvas.height = safeHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas context unavailable.");
  }
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, safeWidth, safeHeight);
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, safeWidth, safeHeight);
  const imageData = context.getImageData(0, 0, safeWidth, safeHeight).data;
  const pixels: string[] = [];
  for (let index = 0; index < imageData.length; index += 4) {
    const red = imageData[index];
    const green = imageData[index + 1];
    const blue = imageData[index + 2];
    const alpha = imageData[index + 3];
    pixels.push(alpha === 255 ? toHexColor(red, green, blue) : `${toHexColor(red, green, blue)}${alpha.toString(16).padStart(2, "0")}`);
  }
  return { width: safeWidth, height: safeHeight, pixels };
}

function toHexColor(red: number, green: number, blue: number): string {
  return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
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


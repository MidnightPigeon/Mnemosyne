import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown } from "../lib/markdown";
import { exportCanvasJpeg, exportMarkdown, importImageCanvas, resizeCanvas } from "../data/ideaRepository";
import {
  drawEllipse,
  drawLine,
  drawRect,
  floodFill,
  paintBrush,
  pointFromIndex,
  spray,
  type DrawOptions,
  type PixelPoint,
  type PixelTool,
  type SprayShape
} from "../lib/pixelTools";
import { getIdeaExcerpt, getIdeaTitle } from "../lib/summary";
import { formatTimelineTime, relativeSaveState } from "../lib/time";
import { useIdeaStore } from "../store/ideaStore";
import type { Idea, IdeaKind, PixelCanvas } from "../types/idea";

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

const markdownTips = [
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
];

const authorUrl = "https://github.com/MidnightPigeon";

export function App() {
  const {
    ideas,
    allIdeas,
    selectedIdeaId,
    draftTitle,
    draftBody,
    draftCanvas,
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

  const theme = themes[themeKey] ?? themes.sky;
  const selectedIdea = allIdeas.find((idea) => idea.id === selectedIdeaId);
  const selectedDraft: Idea | undefined = selectedIdea
    ? { ...selectedIdea, title: draftTitle, body: draftBody, canvas: draftCanvas }
    : undefined;
  const preview = useMemo(() => renderMarkdown(draftBody), [draftBody]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    localStorage.setItem("mnemosyne-theme", themeKey);
  }, [themeKey]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      void saveSelectedIdea();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(handle);
  }, [saveSelectedIdea]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handle = window.setTimeout(() => {
      void saveSelectedIdea();
    }, 1500);

    return () => window.clearTimeout(handle);
  }, [isDirty, draftTitle, draftBody, draftCanvas, saveSelectedIdea]);

  useEffect(() => {
    const flush = () => {
      void saveSelectedIdea();
    };

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
        : { kind: "markdown" }
    );
  }

  async function handleDelete() {
    if (!selectedIdeaId) {
      return;
    }

    const confirmed = window.confirm("确定删除当前灵感吗？这个操作会删除对应的本地 JSON 文件。");
    if (confirmed) {
      await removeSelectedIdea();
    }
  }

  async function handleExport() {
    if (!selectedDraft) {
      return;
    }

    if (selectedDraft.kind === "markdown") {
      const markdown = draftBody.trim() ? `# ${draftTitle}\n\n${draftBody}` : `# ${draftTitle}\n`;
      await exportMarkdown(draftTitle, markdown);
      return;
    }

    if (draftCanvas) {
      await exportCanvasJpeg(draftTitle, draftCanvas);
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
            <button className={`h-9 rounded-md px-3 text-sm font-medium ${theme.primary}`} onClick={handleCreateIdea}>
              新建
            </button>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <select
              className={`h-10 rounded-md border ${theme.border} ${theme.panel} px-3 text-sm outline-none`}
              onChange={(event) => setNewKind(event.target.value as IdeaKind)}
              value={newKind}
            >
              <option value="markdown">文本记录</option>
              <option value="pixel">像素画布</option>
            </select>
            <button
              className={`h-10 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`}
              onClick={() => void saveSelectedIdea()}
              type="button"
            >
              保存
            </button>
          </div>

          {newKind === "pixel" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <NumberField label="宽" max={128} min={4} onChange={setCanvasWidth} value={canvasWidth} theme={theme} />
              <NumberField label="高" max={128} min={4} onChange={setCanvasHeight} value={canvasHeight} theme={theme} />
            </div>
          ) : null}

          <input
            className={`mt-4 h-10 w-full rounded-md border ${theme.border} ${theme.panel} px-3 text-sm outline-none transition focus:ring-2 focus:ring-[#6d9cc8]/20`}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索灵感..."
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
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {isLoading ? (
            <p className={`px-2 py-3 text-sm ${theme.muted}`}>正在读取本地灵感...</p>
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
                        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{getIdeaTitle(idea)}</h2>
                        <time className={`shrink-0 text-xs ${theme.muted}`}>{formatTimelineTime(idea.updatedAt)}</time>
                      </div>
                      <p className={`mt-2 line-clamp-2 text-sm leading-5 ${theme.muted}`}>{getIdeaExcerpt(idea)}</p>
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
            选择存储文件夹
          </button>
            <button
              className="flex shrink-0 flex-col items-center gap-1 hover:underline"
              onClick={() => void openUrl(authorUrl)}
              title="作者主页"
              type="button"
            >
              <img
                alt="作者头像"
                className="h-7 w-7 rounded-md border border-[#c9d8e8]"
                src="https://github.com/MidnightPigeon.png?size=64"
              />
              <span>联系作者</span>
            </button>
          </div>
          <p className="truncate" title={storage?.ideasDir}>
            {storage?.ideasDir ?? "正在准备存储目录"}
          </p>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className={`flex h-14 shrink-0 items-center justify-between border-b ${theme.border} ${theme.panel} px-5`}>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selectedDraft ? getIdeaTitle(selectedDraft) : "未选择灵感"}</p>
            <p className={`mt-0.5 text-xs ${theme.muted}`}>
              {isSaving ? "保存中..." : relativeSaveState(lastSavedAt, isDirty)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedDraft?.kind === "markdown" ? (
              <button
                className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`}
                onClick={() => setShowMarkdownHelp(!showMarkdownHelp)}
                type="button"
              >
                {showMarkdownHelp ? "收起提示" : "显示提示"}
              </button>
            ) : null}
            <button
              className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`}
              onClick={() => void handleExport()}
              type="button"
            >
              导出
            </button>
            <button
              className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`}
              onClick={() => void handleDelete()}
              type="button"
            >
              删除
            </button>
          </div>
        </header>

        {error ? <div className="border-b border-[#e2b6a8] bg-[#fff1ec] px-5 py-3 text-sm text-[#8c3d2b]">{error}</div> : null}

        {selectedDraft?.kind === "pixel" ? (
          <PixelEditor
            canvas={draftCanvas}
            onCanvasChange={setDraftCanvas}
            onTitleChange={setDraftTitle}
            theme={theme}
            title={draftTitle}
          />
        ) : (
          <TextEditor
            body={draftBody}
            onBodyChange={setDraftBody}
            onTitleChange={setDraftTitle}
            preview={preview}
            showHelp={showMarkdownHelp}
            theme={theme}
            title={draftTitle}
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
  title
}: {
  body: string;
  onBodyChange: (body: string) => void;
  onTitleChange: (title: string) => void;
  preview: string;
  showHelp: boolean;
  theme: (typeof themes)[ThemeKey];
  title: string;
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
            placeholder="文本记录名称"
            value={title}
          />
        </div>
        <textarea
          className="h-[calc(100%-73px)] w-full resize-none bg-transparent p-6 font-mono text-[15px] leading-7 text-[#17212b] outline-none"
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder="在这里记录正文。标题已经独立保存，不需要写在第一行。"
          spellCheck={false}
          value={body}
        />
      </section>

      <section className={`min-w-0 overflow-y-auto ${showHelp ? `border-r ${theme.border}` : ""} ${theme.app} p-6`}>
        <article
          className="markdown-preview mx-auto max-w-3xl text-[15px] leading-7"
          dangerouslySetInnerHTML={{ __html: preview }}
        />
      </section>

      {showHelp ? (
        <aside className={`min-w-0 overflow-y-auto ${theme.panel}`}>
          <div className={`flex h-12 items-center border-b ${theme.border} px-4`}>
            <h2 className="text-sm font-semibold">Markdown 辅助</h2>
          </div>
          <div className="space-y-3 p-4 text-sm">
            {markdownTips.map(([syntax, effect]) => (
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

function PixelEditor({
  canvas,
  onCanvasChange,
  onTitleChange,
  theme,
  title
}: {
  canvas?: PixelCanvas;
  onCanvasChange: (canvas: PixelCanvas) => void;
  onTitleChange: (title: string) => void;
  theme: (typeof themes)[ThemeKey];
  title: string;
}) {
  const [tool, setTool] = useState<PixelTool>("pencil");
  const [color, setColor] = useState("#245b82");
  const [zoom, setZoom] = useState(18);
  const [thickness, setThickness] = useState(1);
  const [filled, setFilled] = useState(false);
  const [sprayRadius, setSprayRadius] = useState(4);
  const [sprayShape, setSprayShape] = useState<SprayShape>("circle");
  const [targetSize, setTargetSize] = useState(canvas?.width ?? 64);
  const [cropImage, setCropImage] = useState(true);
  const [dragStart, setDragStart] = useState<PixelPoint | null>(null);
  const [hoverPoint, setHoverPoint] = useState<PixelPoint | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const drawOptions: DrawOptions = {
    color,
    thickness,
    filled,
    sprayRadius,
    sprayShape
  };

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
  }, [canvas, color, dragStart, drawOptions, filled, hoverPoint, isDragging, sprayRadius, sprayShape, thickness, tool]);

  const cursorPreviewIndices = useMemo(() => {
    if (!canvas || !hoverPoint || isDragging || tool === "fill") {
      return new Set<number>();
    }

    if (tool === "spray") {
      return collectSprayPreview(canvas, hoverPoint, sprayRadius, sprayShape);
    }

    return collectBrushPreview(canvas, hoverPoint, thickness);
  }, [canvas, hoverPoint, isDragging, sprayRadius, sprayShape, thickness, tool]);

  if (!canvas) {
    return <div className="p-6 text-sm">画布数据缺失。</div>;
  }

  function applyImmediate(index: number) {
    const point = pointFromIndex(index, canvas!.width);
    if (tool === "pencil") {
      onCanvasChange(paintBrush(canvas!, point, color, thickness));
    } else if (tool === "eraser") {
      onCanvasChange(paintBrush(canvas!, point, "#ffffff", thickness));
    } else if (tool === "spray") {
      onCanvasChange(spray(canvas!, point, drawOptions));
    } else if (tool === "fill") {
      onCanvasChange(floodFill(canvas!, point, color));
    }
  }

  function handlePointerDown(index: number) {
    const point = pointFromIndex(index, canvas!.width);
    setIsDragging(true);
    setHoverPoint(point);

    if (isPreviewTool(tool)) {
      setDragStart(point);
      return;
    }

    applyImmediate(index);
  }

  function handlePointerEnter(index: number) {
    const point = pointFromIndex(index, canvas!.width);
    setHoverPoint(point);

    if (!isDragging || (tool !== "pencil" && tool !== "eraser" && tool !== "spray")) {
      return;
    }

    applyImmediate(index);
  }

  function handlePointerUp(index: number) {
    const point = pointFromIndex(index, canvas!.width);
    setIsDragging(false);
    setHoverPoint(null);

    if (!dragStart) {
      return;
    }

    if (tool === "line") {
      onCanvasChange(drawLine(canvas!, dragStart, point, color, thickness));
    } else if (tool === "rect") {
      onCanvasChange(drawRect(canvas!, dragStart, point, drawOptions));
    } else if (tool === "ellipse") {
      onCanvasChange(drawEllipse(canvas!, dragStart, point, drawOptions));
    }

    setDragStart(null);
  }

  async function handleImportImage() {
    const imported = await importImageCanvas(targetSize, cropImage);
    if (imported) {
      onCanvasChange(imported);
    }
  }

  async function handleResizeCanvas() {
    if (!canvas) {
      return;
    }

    const resized = await resizeCanvas(canvas, targetSize, cropImage);
    onCanvasChange(resized);
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${theme.app}`}>
      <div className={`flex flex-wrap items-center gap-3 border-b ${theme.border} ${theme.panel} px-5 py-3`}>
        <input
          className={`h-9 w-56 rounded-md border ${theme.border} bg-white px-3 text-sm outline-none`}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="像素画布名称"
          value={title}
        />
        <ToolSelect tool={tool} onToolChange={setTool} theme={theme} />
        <label className="flex items-center gap-2 text-sm">
          颜色
          <input onChange={(event) => setColor(event.target.value)} type="color" value={color} />
        </label>
        {tool === "spray" ? (
          <>
            <NumberControl label="半径" max={24} min={1} onChange={setSprayRadius} value={sprayRadius} />
            <select
              className={`h-9 rounded-md border ${theme.border} bg-white px-2 text-sm`}
              onChange={(event) => setSprayShape(event.target.value as SprayShape)}
              value={sprayShape}
            >
              <option value="circle">圆形区域</option>
              <option value="square">方形区域</option>
            </select>
          </>
        ) : tool !== "fill" ? (
          <NumberControl label="粗细" max={12} min={1} onChange={setThickness} value={thickness} />
        ) : null}
        {tool === "rect" || tool === "ellipse" ? (
          <label className="flex items-center gap-2 text-sm">
            <input checked={filled} onChange={(event) => setFilled(event.target.checked)} type="checkbox" />
            实心
          </label>
        ) : null}
        <NumberControl label="尺寸" max={512} min={4} onChange={setTargetSize} value={targetSize} />
        <label className="flex items-center gap-2 text-sm">
          <input checked={cropImage} onChange={(event) => setCropImage(event.target.checked)} type="checkbox" />
          居中裁剪
        </label>
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleImportImage()}>
          导入图片
        </button>
        <button className={`h-9 rounded-md border ${theme.border} px-3 text-sm ${theme.hover}`} onClick={() => void handleResizeCanvas()}>
          调整画布
        </button>
        <span className={`text-xs ${theme.muted}`}>
          {canvas.width} x {canvas.height}
        </span>
        <div className="ml-auto">
          <NumberControl label="缩放" max={32} min={8} onChange={setZoom} value={zoom} />
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto p-6"
        onMouseLeave={() => {
          setIsDragging(false);
          setHoverPoint(null);
        }}
      >
        <div
          className="inline-grid border border-[#9badbd] bg-white shadow-sm"
          style={{
            gridTemplateColumns: `repeat(${canvas.width}, ${zoom}px)`,
            gridTemplateRows: `repeat(${canvas.height}, ${zoom}px)`
          }}
        >
          {(previewCanvas ?? canvas).pixels.map((pixel, index) => (
            <button
              aria-label={`pixel-${index}`}
              className="border border-[#d8e1ea]"
              key={index}
              onMouseDown={() => handlePointerDown(index)}
              onMouseEnter={() => handlePointerEnter(index)}
              onMouseUp={() => handlePointerUp(index)}
              style={{
                backgroundColor: pixel,
                boxShadow: cursorPreviewIndices.has(index) ? "inset 0 0 0 2px rgba(36, 91, 130, 0.9)" : undefined,
                width: zoom,
                height: zoom
              }}
              type="button"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolSelect({
  tool,
  onToolChange,
  theme
}: {
  tool: PixelTool;
  onToolChange: (tool: PixelTool) => void;
  theme: (typeof themes)[ThemeKey];
}) {
  const tools: Array<[PixelTool, string]> = [
    ["pencil", "画笔"],
    ["eraser", "橡皮"],
    ["line", "直线"],
    ["rect", "矩形"],
    ["ellipse", "椭圆"],
    ["spray", "喷枪"],
    ["fill", "填充"]
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {tools.map(([value, label]) => (
        <button
          className={`h-8 rounded-md border px-2 text-xs ${
            tool === value ? "border-[#245b82] bg-white" : `${theme.border} ${theme.hover}`
          }`}
          key={value}
          onClick={() => onToolChange(value)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NumberControl({
  label,
  max,
  min,
  onChange,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      {label}
      <input
        className="h-8 w-16 rounded-md border border-[#c9d8e8] bg-white px-2 text-sm outline-none"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  theme,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  theme: (typeof themes)[ThemeKey];
  value: number;
}) {
  return (
    <label className="text-xs">
      {label}
      <input
        className={`mt-1 h-9 w-full rounded-md border ${theme.border} ${theme.panel} px-2 text-sm outline-none`}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
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
      const index = pointToIndex(canvas, x, y);
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

      const index = pointToIndex(canvas, x, y);
      if (index !== undefined) {
        indices.add(index);
      }
    }
  }

  return indices;
}

function pointToIndex(canvas: PixelCanvas, x: number, y: number): number | undefined {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return undefined;
  }

  return y * canvas.width + x;
}

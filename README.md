# Mnemosyne

Mnemosyne 是一款本地优先的个人创作工作台，用来快速保存、整理和回看灵感。它面向个人创作者，核心思路是“先记录，后整理；先积累，后创作”。

当前重点是稳定可用的基础功能：文本记录、像素画布、旋律片段、本地 JSON 存储、自动保存、导入导出和时间线浏览。

*本产品后续可能由“北京京晨聚码教育科技有限公司”发布。*

## 中文说明

### 当前功能

- 文本记录：独立标题、Markdown 编辑、实时预览和 Markdown 辅助提示。
- 像素画布：自定义尺寸、透明背景、网格开关、颜色存储、画笔、橡皮、直线、矩形、椭圆、喷枪和填充。
- 图像导入导出：支持导入 `.jpg`、`.jpeg`、`.png`，导入时可拖动裁剪框选择区域；默认导出 JPG，也可导出保留透明背景的 PNG。
- 旋律片段：支持钢琴卷帘、1 到 5 条音轨、采样音色、BPM、小节、音量、延音、试听和播放。
- 音频导入导出：支持 MIDI 导入，支持 MIDI 和 WAV 导出。
- 本地存储：每条灵感保存为 `ideas/*.json` 文件，存储目录可自定义。
- 其他：全文搜索、多主题、中文/英文界面、作者联系入口。

### 开发

依赖：

- Node.js 和 npm
- Rust 和 Cargo
- Windows 上的 Visual Studio Build Tools C++ 工具链

常用命令：

```bash
npm install
npm run tauri:dev
npm run tauri:build
```

如果项目目录中存在便携 Node.js 运行时，也可以使用：

```powershell
.\scripts\dev.ps1
.\scripts\build.ps1
```

### 隐私与版本控制

灵感 JSON、数据库文件、环境变量、本地设置、便携工具和构建产物已加入 `.gitignore`。如果使用者选择仓库外的存储目录，该目录不会被 Git 跟踪。

### 音源许可

内置音源来自 `gleitz/midi-js-soundfonts` 的 FluidR3_GM 预渲染 MP3 采样子集。该来源项目标注 FluidR3_GM 使用 Creative Commons Attribution 3.0 许可。Mnemosyne 只内置当前旋律编辑器需要的少量乐器和根音采样。

## English

Mnemosyne is a local-first creative workspace for capturing, organizing, and reviewing personal ideas. It is designed for individual creators and follows the principle of capturing first, organizing later.

### Features

- Text records: independent title, Markdown editing, live preview, and Markdown helper panel.
- Pixel canvas: custom size, transparent background, grid toggle, color palette, pencil, eraser, line, rectangle, ellipse, spray, and fill.
- Image import/export: imports `.jpg`, `.jpeg`, and `.png`; import uses a draggable crop box. JPG is the default export format, while PNG remains available for transparency.
- Melody clips: piano-roll editing, 1 to 5 tracks, sampled instruments, BPM, bars, volume, sustain, preview, and playback.
- Audio import/export: MIDI import, plus MIDI and WAV export.
- Local storage: each idea is saved as an `ideas/*.json` file, with a configurable storage folder.
- Other: full-text search, themes, Chinese/English UI, and author contact entry.

### Development

Prerequisites:

- Node.js and npm
- Rust and Cargo
- Visual Studio Build Tools with the C++ toolchain on Windows

Common commands:

```bash
npm install
npm run tauri:dev
npm run tauri:build
```

Portable runtime helper scripts:

```powershell
.\scripts\dev.ps1
.\scripts\build.ps1
```

### Privacy And Git

Idea JSON files, database files, environment variables, local settings, portable tools, and build outputs are ignored by Git. A custom storage folder outside the repository will not be tracked by Git.

### Sound Source License

Bundled sounds come from the FluidR3_GM pre-rendered MP3 subset in `gleitz/midi-js-soundfonts`. The source project notes FluidR3_GM as Creative Commons Attribution 3.0. Mnemosyne only bundles the small set of instruments and root-note samples used by the melody editor.

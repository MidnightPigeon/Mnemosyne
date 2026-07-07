# Mnemosyne

Mnemosyne 是一款本地优先的个人创作工作台，用来快速保存、整理和回看灵感。它面向个人创作者，核心思路是“先记录，后整理；先积累，后创作”。

当前版本仍是测试版，重点放在可稳定使用的基础功能上：文本记录、像素画布、旋律片段、本地 JSON 存储、自动保存、导入导出和时间线浏览。

## 中文说明

### 当前功能

- 文本记录：独立标题、Markdown 编辑、实时预览、可收起的 Markdown 辅助提示。
- 文本导出：文本记录可以通过“导出”另存为 `.md` 文件。
- 像素画布：自定义尺寸、缩放、颜色选择、画笔、橡皮、直线、矩形、椭圆、喷枪和填充。
- 绘画预览：画笔、橡皮、直线、矩形、椭圆和喷枪会显示操作范围或拖拽预览。
- 图像导入：支持导入 `.jpg`、`.jpeg`、`.png`，可按目标宽高处理，并选择居中裁剪或透明补齐。
- 画布调整：可以将当前像素画布重采样为新的等比例尺寸。
- 图像导出：像素画布可以通过“导出”另存为 PNG 图像，并保留透明背景。
- 旋律片段：支持钢琴卷帘编辑、1 到 5 条音轨、不同音轨颜色区分、BPM、小节数、每小节拍数、音符长度、延音和音轨音量调整。
- 旋律播放：支持全轨播放、当前音轨单独播放、时间轴播放起点、播放头显示，以及点击音符格或音高区域试听。
- 音色选择：每条旋律音轨可选择采样音色，导出 MIDI 时会写入 Program Change。
- 内置采样音源：旋律试听和播放使用随应用打包的 FluidR3_GM 采样子集，不使用基础波形模拟乐器。
- MIDI 导入导出：旋律片段在应用内保存为 JSON，同时可以导入 `.mid` / `.midi`，并通过“导出”另存为 MIDI 文件。
- 本地存储：每条灵感保存为 `ideas/*.json` 文件。
- 存储目录：默认使用系统应用数据目录，也可以在侧边栏选择自定义文件夹。
- 保存策略：支持手动保存、切换或新建前保存、关闭前保存，以及每 5 分钟自动保存。
- 搜索：支持在标题、正文、画布尺寸和旋律信息中进行本地搜索。
- 主题：提供浅蓝、薄荷、浅灰、淡粉几种背景风格。
- 作者联系：侧边栏左下角头像可通过默认浏览器打开作者主页。

### 开发环境

依赖：

- Node.js 和 npm
- Rust 和 Cargo
- Windows 上的 Visual Studio Build Tools C++ 工具链

安装依赖：

```bash
npm install
```

启动桌面开发模式：

```bash
npm run tauri:dev
```

仅启动前端：

```bash
npm run dev
```

如果项目目录中存在便携 Node.js 运行时，可以使用脚本：

```powershell
.\scripts\dev.ps1
.\scripts\build.ps1
```

构建产物位置：

- `src-tauri/target/release/mnemosyne.exe`
- `src-tauri/target/release/bundle/nsis/Mnemosyne_0.2.2_x64-setup.exe`

### 隐私与版本控制

灵感 JSON、数据库文件、环境变量、本地设置、便携工具和构建产物已加入 `.gitignore`。如果使用者选择仓库外的存储目录，该目录不会被 Git 跟踪。

### 音源许可

内置音源来自 `gleitz/midi-js-soundfonts` 的 FluidR3_GM 预渲染 MP3 采样子集。该来源项目标注 FluidR3_GM 使用 Creative Commons Attribution 3.0 许可。Mnemosyne 只内置当前旋律编辑器需要的少量乐器和根音采样。

## English

Mnemosyne is a local-first creative workspace for capturing, organizing, and reviewing personal ideas. It is designed for individual creators and follows the principle of capturing first, organizing later.

This is still a test version. The current focus is a stable foundation: text records, pixel canvases, melody clips, local JSON storage, autosave, import/export, and timeline browsing.

### Features

- Text records: independent title, Markdown editor, live preview, and collapsible Markdown helper panel.
- Text export: text records can be exported as `.md` files.
- Pixel canvas: custom size, zoom, color picker, pencil, eraser, line, rectangle, ellipse, spray, and fill.
- Drawing preview: brush, eraser, line, rectangle, ellipse, and spray tools show the affected area or drag preview.
- Image import: supports `.jpg`, `.jpeg`, and `.png`, with target width/height selection and centered crop or transparent padding.
- Canvas resize: resample the current pixel canvas to a new square size.
- Image export: pixel canvases can be exported as PNG images with transparency preserved.
- Melody clips: piano-roll editing, 1 to 5 tracks, track colors, BPM, bar count, beats per bar, note-length, sustain, and per-track volume control.
- Melody playback: full playback, active-track playback, timeline start selection, playhead display, and note preview from both cells and pitch labels.
- Instrument selection: each melody track can use a sampled instrument, exported as MIDI Program Change.
- Bundled sampled instruments: melody preview and playback use a bundled FluidR3_GM sample subset instead of raw oscillator imitation.
- MIDI import/export: melody clips are saved as JSON inside the app and can import/export `.mid` / `.midi` files.
- Local storage: each idea is saved as an `ideas/*.json` file.
- Storage folder: defaults to the system app-data directory and can be changed from the sidebar.
- Save behavior: manual save, save before switching/creating, save before close, and autosave every 5 minutes.
- Search: local search across title, body, canvas size, and melody metadata.
- Themes: sky, mint, gray, and blush.
- Author contact: the avatar in the lower-left sidebar opens the author page in the default browser.

### Development

Prerequisites:

- Node.js and npm
- Rust and Cargo
- Visual Studio Build Tools with the C++ toolchain on Windows

Install dependencies:

```bash
npm install
```

Run the desktop app:

```bash
npm run tauri:dev
```

Run the web UI only:

```bash
npm run dev
```

If a portable Node.js runtime exists in the project directory, these helper scripts can be used:

```powershell
.\scripts\dev.ps1
.\scripts\build.ps1
```

Build outputs:

- `src-tauri/target/release/mnemosyne.exe`
- `src-tauri/target/release/bundle/nsis/Mnemosyne_0.2.2_x64-setup.exe`

### Privacy And Git

Idea JSON files, database files, environment variables, local settings, portable tools, and build outputs are ignored by Git. A custom storage folder outside the repository will not be tracked by Git.

### Sound Source License

Bundled sounds come from the FluidR3_GM pre-rendered MP3 subset in `gleitz/midi-js-soundfonts`. The source project notes FluidR3_GM as Creative Commons Attribution 3.0. Mnemosyne only bundles the small set of instruments and root-note samples used by the melody editor.

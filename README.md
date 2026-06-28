# Mnemosyne

其实是自己的灵感太碎片化导致的，需要一个能快速创作和记录的本地集成工作台，于是vibe了这么一个小玩意。功能都是自己需要的，协议是MIT，有需要可以自行改动。后续还会有更新。

## 中文说明

Mnemosyne 是一个本地优先的个人创作工作台，用来快速保存、整理和回看灵感。当前版本聚焦基础可用性：文本记录、像素画布、本地文件夹存储、自动保存、导入导出和时间线浏览。

### 当前功能

- 文本记录：独立标题、Markdown 编辑、实时预览、可收起的 Markdown 辅助提示。
- 文本导出：文本记录可以通过“导出”另存为 `.md` 文件。
- 像素画布：自定义尺寸、缩放、颜色选择、画笔、橡皮、直线、矩形、椭圆、喷枪、填充。
- 绘画预览：直线、矩形和椭圆在拖拽时会显示预览，松开鼠标后写入画布。
- 图像导入：支持导入 `.jpg`、`.jpeg`、`.png`，可按目标边长等比例处理，并选择居中裁剪或留白补齐。
- 画布调整：可以将当前像素画布重采样为新的等比例尺寸。
- 图像导出：像素画布可以通过“导出”另存为 JPEG 图像。
- 本地存储：每条灵感保存为 `ideas/*.json`。
- 存储目录：默认使用系统应用数据目录，也可以在侧边栏选择自定义文件夹。
- 保存策略：手动保存、切换/新建前保存、关闭前保存、每 5 分钟自动保存。
- 搜索：在标题、正文和画布尺寸中进行本地搜索。
- 主题：浅蓝、薄荷、浅灰、淡粉。

### 开发环境

依赖：

- Node.js 与 npm
- Rust 与 Cargo
- Windows 上的 Visual Studio Build Tools C++ 工具链

安装依赖：

```bash
npm install
```

启动开发模式：

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
- `src-tauri/target/release/bundle/msi/Mnemosyne_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Mnemosyne_0.1.0_x64-setup.exe`

### 隐私与版本控制

灵感 JSON、数据库文件、环境变量、本地设置、便携工具、构建产物都已加入 `.gitignore`。如果用户选择仓库外的存储目录，该目录不会被 Git 跟踪。

## English

Mnemosyne is a local-first creative workspace for capturing, organizing, and reviewing personal ideas. The current version focuses on a reliable foundation: text records, pixel canvases, local folder storage, autosave, import/export, and timeline browsing.

### Features

- Text records: independent title, Markdown editor, live preview, and collapsible Markdown helper panel.
- Text export: text records can be exported as `.md` files.
- Pixel canvas: custom size, zoom, color picker, pencil, eraser, line, rectangle, ellipse, spray, and fill.
- Drawing preview: lines, rectangles, and ellipses preview while dragging and apply on mouse release.
- Image import: supports `.jpg`, `.jpeg`, and `.png`, with target size selection and centered crop or padded fit.
- Canvas resize: resample the current pixel canvas to a new square size.
- Image export: pixel canvases can be exported as JPEG images.
- Local storage: each idea is saved as an `ideas/*.json` file.
- Storage folder: defaults to the system app-data directory and can be changed from the sidebar.
- Save behavior: manual save, save before switching/creating, save before close, and autosave every 5 minutes.
- Search: local search across title, body, and canvas size.
- Themes: sky, mint, gray, and blush.

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
- `src-tauri/target/release/bundle/msi/Mnemosyne_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Mnemosyne_0.1.0_x64-setup.exe`

### Privacy And Git

Idea JSON files, database files, environment variables, local settings, portable tools, and build outputs are ignored by Git. A custom storage folder outside the repository will not be tracked by Git.

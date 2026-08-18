# Mnemosyne Architecture

## Scope

Mnemosyne is a local-first creative workspace centered on individual ideas. The current app supports:

- Markdown and LaTeX text ideas with preview and MD/PDF export.
- Pixel canvas ideas with custom sizes, palette slots, image import, JPG/PNG export, zoom, and drawing shortcuts.
- Melody ideas with piano-roll editing, sampled playback, visual performance, MIDI import/export, and WAV export.
- Bundled examples for melody clips and pixel canvases.
- Autosave, full-text search, local JSON persistence, configurable storage, themes, and bilingual UI.

Project, tag, sync, collaboration, and review workflows remain outside the current product layer.

## Modules

- `src/ui` contains React views, editors, settings, and interaction layout.
- `src/store` contains application state and user actions through Zustand.
- `src/data` contains Tauri command access and bundled example data.
- `src/lib` contains UI-independent helpers for Markdown, LaTeX, MIDI, pixel drawing, summaries, and time formatting.
- `src/types` contains shared domain types.
- `src-tauri` contains the Tauri desktop host, local file commands, import/export dialogs, and native export helpers.
- `public/soundfonts` contains the small bundled FluidR3 GM sample subset used by the melody editor.

## Data Model

The system is centered on `Idea`.

```ts
type Idea = {
  id: string;
  kind: "markdown" | "pixel" | "melody";
  textFormat?: "markdown" | "latex";
  title: string;
  body: string;
  canvas?: PixelCanvas;
  melody?: MelodyClip;
  createdAt: string;
  updatedAt: string;
};
```

The storage layer writes each idea as a JSON file under an `ideas` folder. The app creates a default folder in platform app data and lets the user choose a custom storage folder from settings.

Text ideas store title, body, and optional text format. Pixel ideas store title plus a `PixelCanvas` containing width, height, and one color value per pixel. Melody ideas store title plus a `MelodyClip` with tracks, notes, timing, playback settings, and instrument programs.

## Native Boundary

The frontend owns editing behavior and most format conversion logic. Tauri commands are reserved for local persistence, file dialogs, and native file writes:

- Idea storage: get settings, choose storage folder, list, save, and delete ideas.
- Text export: Markdown, Markdown PDF, and LaTeX PDF.
- Pixel export/import: JPG/PNG export and image file selection.
- Melody import/export: MIDI file selection, MIDI export, and WAV export.

## Development Rule

New features should extend `Idea`, add focused helper modules, or compose around the existing editors. Avoid adding project management, tagging, account sync, or collaboration infrastructure until the local creative workspace layer remains independently usable.

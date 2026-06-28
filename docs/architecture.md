# Mnemosyne Architecture

## Scope

Version 0.1 implements only the Idea-centered MVP:

- Text Ideas
- Markdown editor and preview
- Autosave
- Timeline browsing
- Text search
- Local folder persistence

Project, Tag, Audio Idea, sync, and review workflows are intentionally outside this phase.

## Modules

- `src/ui` contains React views and interaction layout.
- `src/store` contains application state and user actions through Zustand.
- `src/data` contains Tauri command access for local folder persistence.
- `src/lib` contains UI-independent helpers such as Markdown rendering, summaries, and time formatting.
- `src/types` contains shared domain types.
- `src-tauri` contains the Tauri desktop host and local file commands.

## Data Model

The system is centered on `Idea`.

```ts
type Idea = {
  id: string;
  kind: "markdown" | "pixel";
  title: string;
  body: string;
  canvas?: PixelCanvas;
  createdAt: string;
  updatedAt: string;
};
```

The storage layer writes each Idea as a JSON file under an `ideas` folder. The app creates a default folder in the platform app-data directory and lets the user choose a custom storage folder from the sidebar.

Text Ideas store their title separately from Markdown body text. Pixel Ideas store the title separately and use `canvas` for width, height, and one color value per pixel.

## Development Rule

Each future feature should extend Idea or compose around Idea. Do not add Project, Tag, media capture, or sync infrastructure until the current layer remains independently usable.

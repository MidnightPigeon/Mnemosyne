export type IdeaKind = "markdown" | "pixel";

export type PixelCanvas = {
  width: number;
  height: number;
  pixels: string[];
};

export type Idea = {
  id: string;
  kind: IdeaKind;
  title: string;
  body: string;
  canvas?: PixelCanvas;
  createdAt: string;
  updatedAt: string;
};

export type IdeaInput = {
  id: string;
  kind: IdeaKind;
  title: string;
  body: string;
  canvas?: PixelCanvas;
  createdAt?: string;
};

export type StorageSettings = {
  storageDir: string;
  ideasDir: string;
};

export type IdeaKind = "markdown" | "pixel" | "melody";

export type PixelCanvas = {
  width: number;
  height: number;
  pixels: string[];
};

export type MelodyNote = {
  id: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
};

export type MelodyTrack = {
  id: string;
  name: string;
  color: string;
  program: number;
  volume: number;
  notes: MelodyNote[];
};

export type MelodyClip = {
  bpm: number;
  bars: number;
  beatsPerBar: number;
  beats: number;
  stepsPerBeat: number;
  sustain: boolean;
  tracks: MelodyTrack[];
};

export type Idea = {
  id: string;
  kind: IdeaKind;
  title: string;
  body: string;
  canvas?: PixelCanvas;
  melody?: MelodyClip;
  createdAt: string;
  updatedAt: string;
};

export type IdeaInput = {
  id: string;
  kind: IdeaKind;
  title: string;
  body: string;
  canvas?: PixelCanvas;
  melody?: MelodyClip;
  createdAt?: string;
};

export type StorageSettings = {
  storageDir: string;
  ideasDir: string;
};

import nightHeronSalemExample from "./nightHeronSalemPixelExample.json";
import type { PixelCanvas } from "../types/idea";

export type PixelExample = {
  id: string;
  title: string;
  description: string;
  canvas: PixelCanvas;
};

function cloneCanvas(canvas: PixelCanvas): PixelCanvas {
  return JSON.parse(JSON.stringify(canvas)) as PixelCanvas;
}

export const pixelExamples: PixelExample[] = [
  {
    id: "night-heron-salem",
    title: "夜鹭撒冷",
    description: "教堂彩绘玻璃背景中的夜鹭像素画示例。",
    canvas: cloneCanvas(nightHeronSalemExample as PixelCanvas)
  }
];

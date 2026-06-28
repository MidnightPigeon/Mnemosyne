import type { PixelCanvas } from "../types/idea";

export type PixelPoint = {
  x: number;
  y: number;
};

export type PixelTool = "pencil" | "eraser" | "line" | "rect" | "ellipse" | "spray" | "fill";

export type SprayShape = "circle" | "square";

export type DrawOptions = {
  color: string;
  thickness: number;
  filled: boolean;
  sprayRadius: number;
  sprayShape: SprayShape;
};

export function pointFromIndex(index: number, width: number): PixelPoint {
  return {
    x: index % width,
    y: Math.floor(index / width)
  };
}

export function paintBrush(canvas: PixelCanvas, point: PixelPoint, color: string, thickness: number): PixelCanvas {
  return mutatePixels(canvas, (pixels) => {
    forEachBrushPoint(canvas, point, thickness, (index) => {
      pixels[index] = color;
    });
  });
}

export function spray(canvas: PixelCanvas, point: PixelPoint, options: DrawOptions): PixelCanvas {
  return mutatePixels(canvas, (pixels) => {
    const radius = Math.max(1, Math.round(options.sprayRadius));
    const attempts = radius * radius * 2;

    for (let i = 0; i < attempts; i += 1) {
      const dx = randomInt(-radius, radius);
      const dy = randomInt(-radius, radius);
      if (options.sprayShape === "circle" && dx * dx + dy * dy > radius * radius) {
        continue;
      }

      if (Math.random() > 0.42) {
        continue;
      }

      const index = toIndex(canvas, point.x + dx, point.y + dy);
      if (index !== undefined) {
        pixels[index] = options.color;
      }
    }
  });
}

export function floodFill(canvas: PixelCanvas, point: PixelPoint, color: string): PixelCanvas {
  const start = toIndex(canvas, point.x, point.y);
  if (start === undefined || canvas.pixels[start] === color) {
    return canvas;
  }

  return mutatePixels(canvas, (pixels) => {
    const target = pixels[start];
    const queue = [point];
    const visited = new Set<number>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const index = toIndex(canvas, current.x, current.y);
      if (index === undefined || visited.has(index) || pixels[index] !== target) {
        continue;
      }

      visited.add(index);
      pixels[index] = color;
      queue.push(
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 }
      );
    }
  });
}

export function drawLine(canvas: PixelCanvas, start: PixelPoint, end: PixelPoint, color: string, thickness: number): PixelCanvas {
  return mutatePixels(canvas, (pixels) => {
    // Bresenham 直线适合像素网格，结果稳定且没有额外依赖。
    let x0 = start.x;
    let y0 = start.y;
    const x1 = end.x;
    const y1 = end.y;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;

    while (true) {
      forEachBrushPoint(canvas, { x: x0, y: y0 }, thickness, (index) => {
        pixels[index] = color;
      });

      if (x0 === x1 && y0 === y1) {
        break;
      }

      const nextError = 2 * error;
      if (nextError >= dy) {
        error += dy;
        x0 += sx;
      }
      if (nextError <= dx) {
        error += dx;
        y0 += sy;
      }
    }
  });
}

export function drawRect(canvas: PixelCanvas, start: PixelPoint, end: PixelPoint, options: DrawOptions): PixelCanvas {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  return mutatePixels(canvas, (pixels) => {
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const onEdge =
          x - minX < options.thickness ||
          maxX - x < options.thickness ||
          y - minY < options.thickness ||
          maxY - y < options.thickness;
        if (options.filled || onEdge) {
          const index = toIndex(canvas, x, y);
          if (index !== undefined) {
            pixels[index] = options.color;
          }
        }
      }
    }
  });
}

export function drawEllipse(canvas: PixelCanvas, start: PixelPoint, end: PixelPoint, options: DrawOptions): PixelCanvas {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const rx = Math.max(1, (maxX - minX) / 2);
  const ry = Math.max(1, (maxY - minY) / 2);
  const cx = minX + rx;
  const cy = minY + ry;
  const edgeWidth = Math.max(0.04, options.thickness / Math.max(rx, ry));

  return mutatePixels(canvas, (pixels) => {
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const value = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);
        const shouldPaint = options.filled ? value <= 1 : value <= 1 && value >= 1 - edgeWidth;
        if (shouldPaint) {
          const index = toIndex(canvas, x, y);
          if (index !== undefined) {
            pixels[index] = options.color;
          }
        }
      }
    }
  });
}

function mutatePixels(canvas: PixelCanvas, mutator: (pixels: string[]) => void): PixelCanvas {
  const pixels = [...canvas.pixels];
  mutator(pixels);
  return { ...canvas, pixels };
}

function forEachBrushPoint(canvas: PixelCanvas, center: PixelPoint, thickness: number, paint: (index: number) => void): void {
  const radius = Math.max(0, Math.floor((Math.max(1, thickness) - 1) / 2));
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      const index = toIndex(canvas, x, y);
      if (index !== undefined) {
        paint(index);
      }
    }
  }
}

function toIndex(canvas: PixelCanvas, x: number, y: number): number | undefined {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return undefined;
  }

  return y * canvas.width + x;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

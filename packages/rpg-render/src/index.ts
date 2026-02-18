export interface GridToken {
  id: string;
  x: number;
  y: number;
  color?: string;
}

export interface Scene2DFrame {
  width: number;
  height: number;
  gridSize: number;
  tokens: GridToken[];
}

export function renderScene2D(canvas: HTMLCanvasElement, frame: Scene2DFrame): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  canvas.width = frame.width;
  canvas.height = frame.height;

  ctx.clearRect(0, 0, frame.width, frame.height);
  ctx.fillStyle = "#faf8f2";
  ctx.fillRect(0, 0, frame.width, frame.height);

  ctx.strokeStyle = "#d7d2c1";
  for (let x = 0; x <= frame.width; x += frame.gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, frame.height);
    ctx.stroke();
  }
  for (let y = 0; y <= frame.height; y += frame.gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(frame.width, y);
    ctx.stroke();
  }

  for (const token of frame.tokens) {
    ctx.beginPath();
    ctx.fillStyle = token.color ?? "#222";
    ctx.arc(token.x, token.y, Math.max(8, frame.gridSize / 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface Scene3DAdapter {
  mount(container: HTMLElement): void;
  loadScene(sceneId: string): Promise<void>;
  unmount(): void;
}

export class NullScene3DAdapter implements Scene3DAdapter {
  mount(container: HTMLElement): void {
    container.innerHTML = "<div style='font-family:monospace;padding:12px;border:1px dashed #999'>3D scene adapter not configured.</div>";
  }

  async loadScene(_sceneId: string): Promise<void> {
    return;
  }

  unmount(): void {
    return;
  }
}

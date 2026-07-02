import { emitScene } from "./emit";
import { parseCoverage, parseFigure } from "./parse";
import type { Scene } from "./types";

export type SyncBridge = {
  pushCanvasToCode: (scene: Scene) => void;
  pushCodeToCanvas: (code: string) => Scene;
  getParseHint: (code: string) => string;
};

export function createSyncBridge(handlers: {
  setFigureCode: (code: string) => void;
  getFigureCode: () => string;
  setCanvasScene: (scene: Scene) => void;
}): SyncBridge {
  let syncing = false;

  return {
    pushCanvasToCode(scene: Scene): void {
      if (syncing) return;
      syncing = true;
      try {
        handlers.setFigureCode(emitScene(scene));
      } finally {
        syncing = false;
      }
    },

    pushCodeToCanvas(code: string): Scene {
      if (syncing) return parseFigure(code);
      syncing = true;
      try {
        const scene = parseFigure(code);
        handlers.setCanvasScene(scene);
        return scene;
      } finally {
        syncing = false;
      }
    },

    getParseHint(code: string): string {
      const { parsed, total } = parseCoverage(code);
      if (total === 0) return "";
      if (parsed === total) return `代码已全部映射到画布（${total} 行）`;
      return `画布已映射 ${parsed}/${total} 行（其余为复杂语句，仅保留在代码中）`;
    },
  };
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

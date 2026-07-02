import type { Scene } from "./types";

export function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene;
}

export class SceneHistory {
  private undoStack: Scene[] = [];
  private redoStack: Scene[] = [];
  private readonly limit: number;

  constructor(limit = 60) {
    this.limit = limit;
  }

  /** Call before mutating the scene (saves current state for undo). */
  record(scene: Scene): void {
    this.undoStack.push(cloneScene(scene));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(current: Scene): Scene | null {
    if (!this.undoStack.length) return null;
    this.redoStack.push(cloneScene(current));
    return this.undoStack.pop() ?? null;
  }

  redo(current: Scene): Scene | null {
    if (!this.redoStack.length) return null;
    this.undoStack.push(cloneScene(current));
    return this.redoStack.pop() ?? null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

import { sceneBounds } from "../scene/emit";
import { circumcircle, dirAngleToPoint, pointToDirAngle } from "../scene/geom";
import { addOffset, labelPlacementOffset, parseMpLabelStatement } from "../scene/label-format";
import { parseCoordToken } from "../scene/mp-coords";
import { distanceToMpath, mpathToSvgD } from "../scene/mpath-spline";
import { getHandles, moveShape, setHandle, type HandleId } from "../scene/transform";
import { snapPoint } from "../scene/units";
import type { LPoint, MPathNode, PrimitiveShape, Scene, Shape, ShapeStyle } from "../scene/types";
import { newId } from "../scene/types";
import type { SketchBackground, SketchBounds, SketchInput } from "./sketch";
import {
  fitSketchInBounds,
  hasSketchBounds,
  initSketchInReference,
  scaleSketchBounds,
  translateSketchBounds,
} from "./sketch";
import type { DrawTool } from "./tools";

const GRID_MAJOR_STEP = 5;

export type CanvasEditorOptions = {
  snapStep: number;
  snapEnabled: boolean;
  onSceneChange: (scene: Scene) => void;
  onSelectionChange: (id: string | null) => void;
  onEditStart?: (scene: Scene) => void;
  onSketchChange?: (sketch: SketchBackground) => void;
};

type DragMode = "none" | "translate" | "handle" | "pan";
type PanTarget = "view" | "sketch";

export class CanvasEditor {
  readonly root: HTMLElement;
  private svg: SVGSVGElement;
  private scene: Scene = { shapes: [] };
  private tool: DrawTool = "select";
  private selectedId: string | null = null;
  private opts: CanvasEditorOptions;
  private draft: LPoint[] = [];
  private draftMpath: MPathNode[] = [];
  private mpathDirDrag = false;
  private mpathDirPreview: LPoint | null = null;
  private dragging: LPoint | null = null;
  private padding = 1.5;
  private editGesture = false;
  private dragMode: DragMode = "none";
  private dragHandleId: HandleId | null = null;
  private lastDragPoint: LPoint | null = null;
  private cursorPos: LPoint | null = null;
  private cursorVisible = false;
  private dragMoved = false;
  private readonly dragThreshold = 0.08;
  private rulerY: HTMLElement;
  private rulerX: HTMLElement;
  private lastRulerBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private rulerResizeObserver: ResizeObserver;
  /** 用户缩放后的视口；null 表示自动适应图元范围 */
  private viewWindow: { minX: number; maxX: number; minY: number; maxY: number } | null =
    null;
  private readonly minViewSpan = 2;
  private readonly maxViewSpan = 240;
  private readonly zoomFactor = 1.12;
  private sketch: SketchBackground | null = null;
  private sketchEditMode = false;
  private plot: HTMLElement;
  /** 按住空格时拖动画布平移视口（Mac 触控板友好） */
  private spaceHeld = false;
  private panStart: {
    pointer: LPoint;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
  } | null = null;
  private panTarget: PanTarget = "view";

  constructor(parent: HTMLElement, opts: CanvasEditorOptions) {
    this.opts = opts;
    this.root = document.createElement("div");
    this.root.className = "canvas-root";

    const corner = document.createElement("div");
    corner.className = "canvas-ruler-corner";

    this.rulerY = document.createElement("div");
    this.rulerY.className = "canvas-ruler-y";

    const plot = document.createElement("div");
    plot.className = "canvas-plot";
    this.plot = plot;

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.classList.add("canvas-svg");
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    plot.appendChild(this.svg);

    this.rulerX = document.createElement("div");
    this.rulerX.className = "canvas-ruler-x";

    this.root.append(corner, this.rulerY, plot, this.rulerX);

    this.svg.addEventListener("pointerdown", this.onPointerDown);
    this.svg.addEventListener("pointermove", this.onPointerMove);
    this.svg.addEventListener("pointerup", this.onPointerUp);
    this.svg.addEventListener("pointerleave", this.onPointerLeave);
    this.svg.addEventListener("dblclick", this.onDblClick);
    plot.addEventListener("wheel", this.onWheel, { passive: false });

    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onWindowBlur);

    parent.appendChild(this.root);

    this.rulerResizeObserver = new ResizeObserver(() => {
      const b = this.lastRulerBounds;
      if (b.maxX > b.minX && b.maxY > b.minY) {
        this.updateHtmlRulers(b.minX, b.maxX, b.minY, b.maxY);
      }
    });
    this.rulerResizeObserver.observe(plot);
    this.rulerResizeObserver.observe(this.root);

    this.render();
  }

  setSketchBackground(sketch: SketchInput | null): void {
    if (sketch) {
      const needsInit =
        !hasSketchBounds(sketch) ||
        sketch.maxX <= sketch.minX ||
        sketch.maxY <= sketch.minY;
      this.sketch = needsInit
        ? initSketchInReference(sketch, this.getActiveBounds())
        : (sketch as SketchBackground);
    } else {
      this.sketch = null;
    }
    if (!sketch) this.sketchEditMode = false;
    this.updatePanCursor();
    this.render();
  }

  getSketchBackground(): SketchBackground | null {
    return this.sketch ? { ...this.sketch } : null;
  }

  setSketchEditMode(enabled: boolean): void {
    this.sketchEditMode = enabled && !!this.sketch;
    if (this.sketchEditMode) {
      this.selectedId = null;
      this.opts.onSelectionChange(null);
      this.endDrag();
    }
    this.updatePanCursor();
    this.render();
  }

  getSketchEditMode(): boolean {
    return this.sketchEditMode;
  }

  resetSketchToView(): void {
    if (!this.sketch) return;
    const next = {
      ...this.sketch,
      ...fitSketchInBounds(
        this.sketch.naturalWidth,
        this.sketch.naturalHeight,
        this.getActiveBounds(),
        0,
      ),
    };
    this.sketch = next;
    this.opts.onSketchChange?.(next);
    this.render();
  }

  private sketchBounds(): SketchBounds | null {
    if (!this.sketch || !hasSketchBounds(this.sketch)) return null;
    return {
      minX: this.sketch.minX,
      minY: this.sketch.minY,
      maxX: this.sketch.maxX,
      maxY: this.sketch.maxY,
    };
  }

  private applySketchBounds(bounds: SketchBounds): void {
    if (!this.sketch) return;
    const next = { ...this.sketch, ...bounds };
    this.sketch = next;
    this.opts.onSketchChange?.(next);
    this.render();
  }

  private panTargetForGesture(): PanTarget {
    return this.sketchEditMode && this.sketch ? "sketch" : "view";
  }

  /** 当前视口数学坐标范围（含缩放），用于草图对齐。 */
  getViewBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const { minX, maxX, minY, maxY } = this.getActiveBounds();
    return { minX, maxX, minY, maxY };
  }

  setTool(tool: DrawTool): void {
    this.tool = tool;
    this.draft = [];
    this.draftMpath = [];
    this.mpathDirDrag = false;
    this.mpathDirPreview = null;
    this.dragging = null;
    this.endDrag();
    this.render();
  }

  setScene(scene: Scene, opts?: { resetView?: boolean }): void {
    this.scene = { shapes: [...scene.shapes] };
    if (opts?.resetView) this.viewWindow = null;
    if (this.selectedId && !this.scene.shapes.some((s) => s.id === this.selectedId)) {
      this.selectedId = null;
      this.opts.onSelectionChange(null);
    }
    this.render();
  }

  setSnap(enabled: boolean, step?: number): void {
    this.opts.snapEnabled = enabled;
    if (step !== undefined) this.opts.snapStep = step;
  }

  getScene(): Scene {
    return { shapes: [...this.scene.shapes] };
  }

  getSelectedShape(): Shape | null {
    if (!this.selectedId) return null;
    return this.scene.shapes.find((s) => s.id === this.selectedId) ?? null;
  }

  updateShapeStyle(id: string, style: ShapeStyle): void {
    const idx = this.scene.shapes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const s = this.scene.shapes[idx];
    if (s.layer !== "primitive") return;
    this.beginEdit();
    const next: ShapeStyle = { ...s.style };
    if (style.withpen !== undefined) {
      if (style.withpen) next.withpen = style.withpen;
      else delete next.withpen;
    }
    if (style.label !== undefined) {
      if (style.label) next.label = style.label;
      else delete next.label;
    }
    if (style.fill !== undefined) {
      if (style.fill) next.fill = true;
      else delete next.fill;
    }
    this.scene.shapes[idx] = { ...s, style: next };
    this.commit();
  }

  updateMpathNodes(id: string, nodes: MPathNode[]): void {
    if (nodes.length < 2) return;
    const idx = this.scene.shapes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const s = this.scene.shapes[idx];
    if (s.layer !== "primitive" || s.kind !== "mpath") return;
    this.beginEdit();
    this.scene.shapes[idx] = {
      ...s,
      nodes: nodes.map((n) => ({
        p: { ...n.p },
        dir: n.dir,
      })),
    };
    this.commit();
  }

  updateShapeGeometry(id: string, next: PrimitiveShape): void {
    const idx = this.scene.shapes.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const s = this.scene.shapes[idx];
    if (s.layer !== "primitive" || next.layer !== "primitive") return;
    this.beginEdit();
    this.scene.shapes[idx] = {
      ...next,
      id: s.id,
      style: s.style,
    };
    this.propagatePointRefsFromShape(this.scene.shapes[idx] as PrimitiveShape);
    this.commit();
  }

  deleteSelected(): void {
    if (!this.selectedId) return;
    this.beginEdit();
    this.scene.shapes = this.scene.shapes.filter((s) => s.id !== this.selectedId);
    this.selectedId = null;
    this.opts.onSelectionChange(null);
    this.commit();
  }

  private beginEdit(): void {
    if (!this.editGesture) {
      this.editGesture = true;
      this.opts.onEditStart?.(this.getScene());
    }
  }

  private endEditGesture(): void {
    this.editGesture = false;
  }

  private endDrag(): void {
    this.dragMode = "none";
    this.dragHandleId = null;
    this.lastDragPoint = null;
    this.dragMoved = false;
  }

  private syncSharedPointRef(ref: string, p: LPoint, excludeId?: string): void {
    this.scene.shapes = this.scene.shapes.map((shape) => {
      if (shape.layer !== "primitive" || shape.id === excludeId || !shape.pointRefs) return shape;
      let next = shape;
      for (const [handle, pointRef] of Object.entries(shape.pointRefs)) {
        if (pointRef === ref) next = setHandle(next, handle, p);
      }
      return next;
    });
  }

  private propagatePointRefsFromShape(shape: PrimitiveShape): void {
    if (!shape.pointRefs) return;
    for (const handle of getHandles(shape)) {
      const ref = shape.pointRefs[handle.id];
      if (ref) this.syncSharedPointRef(ref, handle.p, shape.id);
    }
  }

  private commit(): void {
    this.endEditGesture();
    this.opts.onSceneChange(this.getScene());
    this.render();
  }

  resetView(): void {
    this.viewWindow = null;
    this.render();
  }

  private computeAutoBounds(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    const b = sceneBounds(this.scene);
    let minX = Math.min(b.minX, -6) - this.padding;
    let maxX = Math.max(b.maxX, 6) + this.padding;
    let minY = Math.min(b.minY, -6) - this.padding;
    let maxY = Math.max(b.maxY, 6) + this.padding;
    let w = maxX - minX;
    let h = maxY - minY;
    if (w < h) {
      const pad = (h - w) / 2;
      minX -= pad;
      maxX += pad;
    } else if (h < w) {
      const pad = (w - h) / 2;
      minY -= pad;
      maxY += pad;
    }
    return { minX, maxX, minY, maxY };
  }

  private getActiveBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    return this.viewWindow ?? this.computeAutoBounds();
  }

  private ensureViewWindow(): { minX: number; maxX: number; minY: number; maxY: number } {
    if (!this.viewWindow) {
      this.viewWindow = { ...this.computeAutoBounds() };
    }
    return this.viewWindow;
  }

  private panByLogicalDelta(dx: number, dy: number): void {
    const b = this.ensureViewWindow();
    this.viewWindow = {
      minX: b.minX - dx,
      maxX: b.maxX - dx,
      minY: b.minY - dy,
      maxY: b.maxY - dy,
    };
    this.render();
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest("input, textarea, select, .cm-editor, [contenteditable='true']");
  }

  private updatePanCursor(): void {
    const sketchPan = this.sketchEditMode && !!this.sketch;
    this.plot.classList.toggle("canvas-sketch-edit", sketchPan);
    this.plot.classList.toggle(
      "canvas-pan-ready",
      (this.spaceHeld || sketchPan) && this.dragMode !== "pan",
    );
    this.plot.classList.toggle("canvas-pan-active", this.dragMode === "pan");
  }

  private onKeyDown = (evt: KeyboardEvent): void => {
    if (evt.code !== "Space" || evt.repeat || this.isTypingTarget(evt.target)) return;
    if (!this.spaceHeld) {
      this.spaceHeld = true;
      this.updatePanCursor();
    }
    evt.preventDefault();
  };

  private onKeyUp = (evt: KeyboardEvent): void => {
    if (evt.code !== "Space") return;
    this.spaceHeld = false;
    if (this.dragMode === "pan") {
      this.endPan();
    }
    this.updatePanCursor();
  };

  private onWindowBlur = (): void => {
    this.spaceHeld = false;
    if (this.dragMode === "pan") {
      this.endPan();
    }
    this.updatePanCursor();
  };

  private endPan(pointerId?: number): void {
    this.panStart = null;
    this.dragMode = "none";
    this.updatePanCursor();
    if (pointerId !== undefined) {
      try {
        this.svg.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }
    this.render();
  }

  private onWheel = (evt: WheelEvent): void => {
    if (this.sketchEditMode && this.sketch) {
      evt.preventDefault();
      const bounds = this.sketchBounds();
      if (!bounds) return;

      if (evt.ctrlKey || evt.metaKey) {
        const anchor = this.clientToLogicalRaw(evt);
        const scale = evt.deltaY < 0 ? this.zoomFactor : 1 / this.zoomFactor;
        this.applySketchBounds(scaleSketchBounds(bounds, scale, anchor));
        return;
      }

      if (evt.deltaX === 0 && evt.deltaY === 0) return;
      const b = this.getActiveBounds();
      const kx = (b.maxX - b.minX) / Math.max(this.plot.clientWidth, 1);
      const ky = (b.maxY - b.minY) / Math.max(this.plot.clientHeight, 1);
      this.applySketchBounds(
        translateSketchBounds(bounds, -evt.deltaX * kx, -evt.deltaY * ky),
      );
      return;
    }

    if (evt.ctrlKey || evt.metaKey) {
      evt.preventDefault();

      const b = this.getActiveBounds();
      const p = this.clientToLogicalRaw(evt);
      const span = b.maxX - b.minX;
      const scale = evt.deltaY < 0 ? this.zoomFactor : 1 / this.zoomFactor;
      let newSpan = span / scale;
      newSpan = Math.max(this.minViewSpan, Math.min(this.maxViewSpan, newSpan));

      const viewCy = b.minY + b.maxY - p.y;
      const fx = span > 0 ? (p.x - b.minX) / span : 0.5;
      const fy = span > 0 ? (viewCy - b.minY) / span : 0.5;

      const newMinX = p.x - fx * newSpan;
      const newMinY = viewCy - fy * newSpan;

      this.viewWindow = {
        minX: newMinX,
        maxX: newMinX + newSpan,
        minY: newMinY,
        maxY: newMinY + newSpan,
      };
      this.render();
      return;
    }

    if (evt.deltaX === 0 && evt.deltaY === 0) return;
    evt.preventDefault();
    const b = this.ensureViewWindow();
    const kx = (b.maxX - b.minX) / Math.max(this.plot.clientWidth, 1);
    const ky = (b.maxY - b.minY) / Math.max(this.plot.clientHeight, 1);
    this.panByLogicalDelta(evt.deltaX * kx, evt.deltaY * ky);
  };

  private viewYToMath(viewY: number): number {
    const vb = this.svg.viewBox.baseVal;
    const midY = vb.y + vb.height / 2;
    return midY * 2 - viewY;
  }

  private mathYToView(yMath: number): number {
    const vb = this.svg.viewBox.baseVal;
    const midY = vb.y + vb.height / 2;
    return midY * 2 - yMath;
  }

  /** 将数学坐标映射到屏幕像素（用于标尺对齐）。 */
  private mathToScreen(x: number, yMath: number): { x: number; y: number } | null {
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return null;
    const pt = this.svg.createSVGPoint();
    pt.x = x;
    pt.y = this.mathYToView(yMath);
    const s = pt.matrixTransform(ctm);
    return { x: s.x, y: s.y };
  }

  private clientToLogicalRaw(evt: { clientX: number; clientY: number }): LPoint {
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: this.viewYToMath(svgPt.y) };
  }

  private clientToLogical(evt: { clientX: number; clientY: number }): LPoint {
    return snapPoint(
      this.clientToLogicalRaw(evt),
      this.opts.snapStep,
      this.opts.snapEnabled,
    );
  }

  private shapeById(id: string): Shape | undefined {
    return this.scene.shapes.find((s) => s.id === id);
  }

  private startPan(evt: PointerEvent): void {
    evt.preventDefault();
    this.panTarget = this.panTargetForGesture();
    const bounds =
      this.panTarget === "sketch"
        ? this.sketchBounds()!
        : { ...this.ensureViewWindow() };
    this.panStart = { pointer: this.clientToLogicalRaw(evt), bounds: { ...bounds } };
    this.dragMode = "pan";
    this.updatePanCursor();
    this.svg.setPointerCapture(evt.pointerId);
  }

  private onPointerDown = (evt: PointerEvent): void => {
    if (this.sketchEditMode && this.sketch && evt.button === 0) {
      this.startPan(evt);
      return;
    }

    if (this.spaceHeld || evt.button === 1) {
      if (evt.button !== 0 && evt.button !== 1) return;
      this.startPan(evt);
      return;
    }
    if (evt.button !== 0) return;
    const p = this.clientToLogical(evt);

    if (this.tool === "select") {
      const hit = this.hitTestShape(p);
      const candidateIds = [...new Set([hit, this.selectedId].filter(Boolean) as string[])];
      for (const id of candidateIds) {
        const shape = this.shapeById(id);
        if (shape?.layer !== "primitive") continue;
        const handle = this.hitHandle(p, shape);
        if (handle) {
          this.selectedId = id;
          this.opts.onSelectionChange(id);
          this.beginEdit();
          this.dragMode = "handle";
          this.dragHandleId = handle;
          this.dragMoved = false;
          this.lastDragPoint = p;
          this.svg.setPointerCapture(evt.pointerId);
          this.render();
          return;
        }
      }

      this.selectedId = hit;
      this.opts.onSelectionChange(hit);
      this.dragMoved = false;

      if (hit) {
        const shape = this.shapeById(hit);
        if (shape?.layer === "primitive") {
          this.dragMode = "translate";
          this.lastDragPoint = p;
          this.svg.setPointerCapture(evt.pointerId);
        }
      } else {
        this.endDrag();
      }
      this.render();
      return;
    }

    if (this.tool === "dot") {
      this.beginEdit();
      this.scene.shapes.push({
        id: newId(),
        layer: "primitive",
        kind: "dot",
        p,
        style: { withpen: "pencircle scaled 1pt" },
      });
      this.commit();
      return;
    }

    if (this.tool === "point") {
      this.beginEdit();
      this.scene.shapes.push({ id: newId(), layer: "primitive", kind: "point", p });
      this.commit();
      return;
    }

    if (this.tool === "polyline") {
      if (this.draft.length === 0) this.beginEdit();
      this.draft.push(p);
      this.render();
      return;
    }

    if (this.tool === "mpath") {
      if (evt.altKey && this.draftMpath.length > 0) {
        if (!this.editGesture) this.beginEdit();
        this.mpathDirDrag = true;
        this.mpathDirPreview = p;
        this.svg.setPointerCapture(evt.pointerId);
        this.render();
        return;
      }
      if (this.draftMpath.length === 0) this.beginEdit();
      this.draftMpath.push({ p });
      this.render();
      return;
    }

    if (this.tool === "circle3") {
      if (this.draft.length === 0) this.beginEdit();
      this.draft.push(p);
      if (this.draft.length === 3) {
        const [a, b, c] = this.draft;
        this.scene.shapes.push({
          id: newId(),
          layer: "primitive",
          kind: "circle3",
          a,
          b,
          c,
        });
        this.draft = [];
        this.commit();
      } else {
        this.render();
      }
      return;
    }

    if (this.tool === "bezier") {
      if (this.draft.length === 0) this.beginEdit();
      this.draft.push(p);
      if (this.draft.length === 4) {
        const [a, b, c, d] = this.draft;
        this.scene.shapes.push({
          id: newId(),
          layer: "primitive",
          kind: "bezier",
          a,
          b,
          c,
          d,
        });
        this.draft = [];
        this.commit();
      } else {
        this.render();
      }
      return;
    }

    if (this.draft.length === 0) {
      this.beginEdit();
      this.draft = [p];
      this.dragging = p;
    }
    this.render();
  };

  private onPointerMove = (evt: PointerEvent): void => {
    const p = this.clientToLogical(evt);
    this.cursorPos = p;
    this.cursorVisible = true;

    if (this.dragMode === "pan" && this.panStart) {
      const p = this.clientToLogicalRaw(evt);
      const dx = p.x - this.panStart.pointer.x;
      const dy = p.y - this.panStart.pointer.y;
      const b = this.panStart.bounds;
      const next = {
        minX: b.minX - dx,
        maxX: b.maxX - dx,
        minY: b.minY - dy,
        maxY: b.maxY - dy,
      };
      if (this.panTarget === "sketch") {
        this.applySketchBounds(next);
      } else {
        this.viewWindow = next;
        this.render();
      }
      return;
    }

    if (this.dragMode === "translate" && this.selectedId && this.lastDragPoint) {
      const shape = this.shapeById(this.selectedId);
      if (shape?.layer === "primitive") {
        const dx = p.x - this.lastDragPoint.x;
        const dy = p.y - this.lastDragPoint.y;
        if (dx !== 0 || dy !== 0) {
          if (Math.hypot(dx, dy) >= this.dragThreshold) {
            if (!this.editGesture) this.beginEdit();
            this.dragMoved = true;
          }
          if (this.dragMoved) {
            const idx = this.scene.shapes.findIndex((s) => s.id === this.selectedId);
            const moved = moveShape(shape, dx, dy);
            this.scene.shapes[idx] = moved;
            this.propagatePointRefsFromShape(moved);
            this.lastDragPoint = p;
            this.render();
          }
        }
      }
      return;
    }

    if (this.dragMode === "handle" && this.selectedId && this.dragHandleId) {
      const shape = this.shapeById(this.selectedId);
      if (shape?.layer === "primitive") {
        const idx = this.scene.shapes.findIndex((s) => s.id === this.selectedId);
        const prev = getHandles(shape).find((h) => h.id === this.dragHandleId)?.p;
        const next = setHandle(shape, this.dragHandleId, p);
        this.scene.shapes[idx] = next;
        const ref = shape.pointRefs?.[this.dragHandleId];
        if (ref) this.syncSharedPointRef(ref, p, shape.id);
        if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= this.dragThreshold) {
          if (!this.editGesture) this.beginEdit();
          this.dragMoved = true;
        }
        this.render();
      }
      return;
    }

    if (this.mpathDirDrag) {
      this.mpathDirPreview = p;
      this.render();
      return;
    }

    if (this.dragging) {
      this.dragging = p;
      this.render();
      return;
    }

    this.render();
  };

  private onPointerLeave = (): void => {
    this.cursorVisible = false;
    this.render();
  };

  private onPointerUp = (evt: PointerEvent): void => {
    if (this.dragMode === "pan") {
      this.endPan(evt.pointerId);
      return;
    }

    if (this.mpathDirDrag) {
      const p = this.clientToLogicalRaw(evt);
      const last = this.draftMpath[this.draftMpath.length - 1];
      const dx = p.x - last.p.x;
      const dy = p.y - last.p.y;
      if (Math.hypot(dx, dy) > 0.08) {
        this.draftMpath[this.draftMpath.length - 1] = {
          ...last,
          dir: pointToDirAngle(last.p, p),
        };
      }
      this.mpathDirDrag = false;
      this.mpathDirPreview = null;
      try {
        this.svg.releasePointerCapture(evt.pointerId);
      } catch {
        /* ignore */
      }
      this.render();
      return;
    }

    if (this.dragMode !== "none") {
      const hadEdit = this.dragMoved;
      this.endDrag();
      if (hadEdit) {
        this.commit();
      } else {
        this.endEditGesture();
        this.render();
      }
      try {
        this.svg.releasePointerCapture(evt.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (
      this.tool === "select" ||
      this.tool === "dot" ||
      this.tool === "point" ||
      this.tool === "bezier" ||
      this.tool === "circle3" ||
      this.tool === "mpath"
    )
      return;

    const p = this.clientToLogical(evt);
    if (this.draft.length === 0) return;
    if (this.tool === "polyline") return;

    const start = this.draft[0];
    this.draft = [];
    this.dragging = null;

    if (this.tool === "segment") {
      this.scene.shapes.push({
        id: newId(),
        layer: "primitive",
        kind: "segment",
        a: start,
        b: p,
      });
    } else if (this.tool === "arrow") {
      this.scene.shapes.push({
        id: newId(),
        layer: "primitive",
        kind: "arrow",
        a: start,
        b: p,
      });
    } else if (this.tool === "circle") {
      const r = Math.hypot(p.x - start.x, p.y - start.y);
      if (r > 0.05) {
        this.scene.shapes.push({
          id: newId(),
          layer: "primitive",
          kind: "circle",
          center: start,
          r,
        });
      }
    } else if (this.tool === "ellipse") {
      const rx = Math.abs(p.x - start.x);
      const ry = Math.abs(p.y - start.y);
      if (rx > 0.05 && ry > 0.05) {
        this.scene.shapes.push({
          id: newId(),
          layer: "primitive",
          kind: "ellipse",
          center: start,
          rx,
          ry,
        });
      }
    } else if (this.tool === "rect") {
      this.scene.shapes.push({
        id: newId(),
        layer: "primitive",
        kind: "rect",
        a: start,
        b: p,
      });
    }

    this.commit();
  };

  private onDblClick = (): void => {
    if (this.tool === "polyline" && this.draft.length >= 2) {
      this.scene.shapes.push({
        id: newId(),
        layer: "primitive",
        kind: "polyline",
        pts: [...this.draft],
      });
      this.draft = [];
      this.commit();
      return;
    }
    if (this.tool === "mpath" && this.draftMpath.length >= 2) {
      this.finishMpath();
    }
  };

  finishPolyline(): void {
    if (this.tool !== "polyline" || this.draft.length < 2) return;
    if (!this.editGesture) this.beginEdit();
    this.scene.shapes.push({
      id: newId(),
      layer: "primitive",
      kind: "polyline",
      pts: [...this.draft],
    });
    this.draft = [];
    this.commit();
  }

  finishMpath(): void {
    if (this.tool !== "mpath" || this.draftMpath.length < 2) return;
    if (!this.editGesture) this.beginEdit();
    this.scene.shapes.push({
      id: newId(),
      layer: "primitive",
      kind: "mpath",
      nodes: this.draftMpath.map((n) => ({
        p: { ...n.p },
        dir: n.dir,
      })),
    });
    this.draftMpath = [];
    this.mpathDirPreview = null;
    this.commit();
  }

  private hitHandle(p: LPoint, shape: Shape): HandleId | null {
    const tol = 0.5;
    for (const h of getHandles(shape)) {
      if (Math.hypot(h.p.x - p.x, h.p.y - p.y) < tol) return h.id;
    }
    return null;
  }

  private hitTestShape(p: LPoint): string | null {
    for (let i = this.scene.shapes.length - 1; i >= 0; i--) {
      const s = this.scene.shapes[i];
      if (s.layer === "macro") continue;
      if (s.previewOnly) continue;
      if (this.shapeNearPoint(s, p)) return s.id;
    }
    return null;
  }

  private shapeNearPoint(s: Shape, p: LPoint, tol = 0.35): boolean {
    if (s.layer === "macro") return false;
    const near = (a: LPoint, b: LPoint) => Math.hypot(a.x - b.x, a.y - b.y) < tol;
    switch (s.kind) {
      case "dot":
      case "point":
        return near(s.p, p);
      case "circle3": {
        const cc = circumcircle(s.a, s.b, s.c);
        if (!cc) return false;
        return Math.abs(Math.hypot(p.x - cc.center.x, p.y - cc.center.y) - cc.r) < tol;
      }
      case "segment":
      case "arrow":
        return this.distToSegment(p, s.a, s.b) < tol;
      case "polyline": {
        for (let i = 0; i < s.pts.length - 1; i++) {
          if (this.distToSegment(p, s.pts[i], s.pts[i + 1]) < tol) return true;
        }
        if (s.closed && s.pts.length >= 3) {
          const last = s.pts[s.pts.length - 1];
          if (this.distToSegment(p, last, s.pts[0]) < tol) return true;
        }
        return false;
      }
      case "mpath":
        return distanceToMpath(p, s.nodes, s.closed ?? false) < tol;
      case "circle":
        return Math.abs(Math.hypot(p.x - s.center.x, p.y - s.center.y) - s.r) < tol;
      case "ellipse": {
        const v =
          ((p.x - s.center.x) / s.rx) ** 2 + ((p.y - s.center.y) / s.ry) ** 2;
        return Math.abs(v - 1) < 0.15;
      }
      case "rect": {
        const minX = Math.min(s.a.x, s.b.x);
        const maxX = Math.max(s.a.x, s.b.x);
        const minY = Math.min(s.a.y, s.b.y);
        const maxY = Math.max(s.a.y, s.b.y);
        const onEdge =
          (Math.abs(p.x - minX) < tol || Math.abs(p.x - maxX) < tol) &&
          p.y >= minY - tol &&
          p.y <= maxY + tol;
        const onHor =
          (Math.abs(p.y - minY) < tol || Math.abs(p.y - maxY) < tol) &&
          p.x >= minX - tol &&
          p.x <= maxX + tol;
        return onEdge || onHor;
      }
      case "bezier":
        return [s.a, s.b, s.c, s.d].some((pt) => near(pt, p));
      default:
        return false;
    }
  }

  private distToSegment(p: LPoint, a: LPoint, b: LPoint): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  private render(): void {
    const { minX, maxX, minY, maxY } = this.getActiveBounds();
    const w = maxX - minX;
    const h = maxY - minY;
    const midY = (minY + maxY) / 2;
    this.svg.setAttribute("viewBox", `${minX} ${minY} ${w} ${h}`);
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.svg.innerHTML = "";

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    // 绕视口垂直中心翻转，使数学原点 (0,0) 落在画布中心
    g.setAttribute("transform", `translate(0, ${midY}) scale(1, -1) translate(0, ${-midY})`);
    if (this.sketch) this.drawSketchBackground(this.sketch);
    this.svg.appendChild(g);

    this.drawGrid(g, minX, maxX, minY, maxY);

    for (const shape of this.scene.shapes) {
      if (shape.layer === "macro") continue;
      const sel = shape.id === this.selectedId;
      this.drawShape(g, shape, sel);
      if (sel) this.drawHandles(g, shape);
    }

    this.drawDraft(g);
    if (this.cursorVisible && this.cursorPos) {
      this.drawCursorGuide(g, this.cursorPos, minX, maxX, minY, maxY);
    }

    this.lastRulerBounds = { minX, maxX, minY, maxY };
    requestAnimationFrame(() => this.updateHtmlRulers(minX, maxX, minY, maxY));
  }

  /** HTML 标尺：按 SVG 实际像素映射定位（与 meet 等比缩放一致）。 */
  private updateHtmlRulers(
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
  ): void {
    this.rulerX.replaceChildren();
    this.rulerY.replaceChildren();
    if (maxX <= minX || maxY <= minY) return;

    const midY = (minY + maxY) / 2;
    const xRef = this.rulerX.getBoundingClientRect();
    const yRef = this.rulerY.getBoundingClientRect();

    const firstX = Math.ceil(minX / GRID_MAJOR_STEP) * GRID_MAJOR_STEP;
    for (let i = firstX; i <= maxX; i += GRID_MAJOR_STEP) {
      const px = this.mathToScreen(i, midY);
      if (!px) continue;
      const tick = document.createElement("span");
      tick.className = "canvas-ruler-mark canvas-ruler-mark-x";
      tick.textContent = String(i);
      tick.style.left = `${px.x - xRef.left}px`;
      this.rulerX.appendChild(tick);
    }

    const firstY = Math.ceil(minY / GRID_MAJOR_STEP) * GRID_MAJOR_STEP;
    for (let j = firstY; j <= maxY; j += GRID_MAJOR_STEP) {
      const px = this.mathToScreen(minX, j);
      if (!px) continue;
      const tick = document.createElement("span");
      tick.className = "canvas-ruler-mark canvas-ruler-mark-y";
      tick.textContent = String(j);
      tick.style.top = `${px.y - yRef.top}px`;
      this.rulerY.appendChild(tick);
    }
  }

  private drawCursorGuide(
    g: SVGGElement,
    p: LPoint,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
  ): void {
    const guideG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    guideG.setAttribute("class", "cursor-guide");

    const v = document.createElementNS("http://www.w3.org/2000/svg", "line");
    v.setAttribute("x1", String(p.x));
    v.setAttribute("y1", String(minY));
    v.setAttribute("x2", String(p.x));
    v.setAttribute("y2", String(maxY));
    v.setAttribute("class", "cursor-guide-major");
    guideG.appendChild(v);

    const h = document.createElementNS("http://www.w3.org/2000/svg", "line");
    h.setAttribute("x1", String(minX));
    h.setAttribute("y1", String(p.y));
    h.setAttribute("x2", String(maxX));
    h.setAttribute("y2", String(p.y));
    h.setAttribute("class", "cursor-guide-major");
    guideG.appendChild(h);

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(p.x));
    dot.setAttribute("cy", String(p.y));
    dot.setAttribute("r", "0.12");
    dot.setAttribute("class", "cursor-guide-dot");
    guideG.appendChild(dot);

    g.appendChild(guideG);
  }

  private drawHandles(g: SVGGElement, shape: Shape): void {
    for (const h of getHandles(shape)) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", String(h.p.x));
      c.setAttribute("cy", String(h.p.y));
      c.setAttribute("r", h.id.startsWith("d") ? "0.16" : "0.22");
      c.setAttribute(
        "class",
        h.id.startsWith("d") ? "handle-point handle-dir" : "handle-point",
      );
      g.appendChild(c);
      if (h.id.startsWith("d")) {
        const baseId = h.id.slice(1);
        const base = getHandles(shape).find((x) => x.id === `p${baseId}`);
        if (base) {
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", String(base.p.x));
          line.setAttribute("y1", String(base.p.y));
          line.setAttribute("x2", String(h.p.x));
          line.setAttribute("y2", String(h.p.y));
          line.setAttribute("class", "handle-dir-line");
          g.insertBefore(line, c);
        }
      }
    }
  }

  private drawSketchBackground(sketch: SketchBackground): void {
    const { naturalWidth: imgW, naturalHeight: imgH } = sketch;
    if (imgW <= 0 || imgH <= 0 || !hasSketchBounds(sketch)) return;

    const { minX, minY, maxX, maxY } = sketch;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;

    // 画在未翻转的 SVG 层，避免 Y 轴镜像导致草图上下颠倒
    const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
    img.setAttributeNS("http://www.w3.org/1999/xlink", "href", sketch.href);
    img.setAttribute("href", sketch.href);
    img.setAttribute("x", String(minX));
    img.setAttribute("y", String(this.mathYToView(maxY)));
    img.setAttribute("width", String(w));
    img.setAttribute("height", String(h));
    img.setAttribute("opacity", String(sketch.opacity));
    img.setAttribute("preserveAspectRatio", "none");
    img.setAttribute("pointer-events", "none");
    img.classList.add("canvas-sketch-bg");
    if (this.sketchEditMode) {
      img.classList.add("canvas-sketch-bg-active");
    }
    this.svg.appendChild(img);
  }

  private drawGrid(
    g: SVGGElement,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
  ): void {
    const gridG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gridG.setAttribute("class", "canvas-grid");
    for (let i = Math.floor(minX); i <= Math.ceil(maxX); i++) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(i));
      line.setAttribute("y1", String(minY));
      line.setAttribute("x2", String(i));
      line.setAttribute("y2", String(maxY));
      line.setAttribute("class", i % GRID_MAJOR_STEP === 0 ? "grid-major" : "grid-minor");
      gridG.appendChild(line);
    }
    for (let j = Math.floor(minY); j <= Math.ceil(maxY); j++) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(minX));
      line.setAttribute("y1", String(j));
      line.setAttribute("x2", String(maxX));
      line.setAttribute("y2", String(j));
      line.setAttribute("class", j % GRID_MAJOR_STEP === 0 ? "grid-major" : "grid-minor");
      gridG.appendChild(line);
    }
    const axisX = document.createElementNS("http://www.w3.org/2000/svg", "line");
    axisX.setAttribute("x1", String(minX));
    axisX.setAttribute("y1", "0");
    axisX.setAttribute("x2", String(maxX));
    axisX.setAttribute("y2", "0");
    axisX.setAttribute("class", "grid-axis");
    gridG.appendChild(axisX);
    const axisY = document.createElementNS("http://www.w3.org/2000/svg", "line");
    axisY.setAttribute("x1", "0");
    axisY.setAttribute("y1", String(minY));
    axisY.setAttribute("x2", "0");
    axisY.setAttribute("y2", String(maxY));
    axisY.setAttribute("class", "grid-axis");
    gridG.appendChild(axisY);
    g.appendChild(gridG);
  }

  private drawShape(g: SVGGElement, s: Shape, selected: boolean): void {
    if (s.layer === "macro") return;
    const cls = selected ? "shape shape-selected" : "shape";
    const filled = s.style?.fill;
    switch (s.kind) {
      case "dot":
      case "point": {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", String(s.p.x));
        c.setAttribute("cy", String(s.p.y));
        c.setAttribute("r", s.kind === "dot" ? "0.08" : "0.12");
        c.setAttribute("class", cls);
        g.appendChild(c);
        break;
      }
      case "segment":
      case "arrow":
        this.drawLine(g, s.a, s.b, cls, s.kind === "arrow", !!s.style?.dashed);
        break;
      case "polyline": {
        const closed = s.closed && s.pts.length >= 3;
        const dashed = !!s.style?.dashed;
        if (closed && filled) {
          const d =
            s.pts
              .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
              .join(" ") + " Z";
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", d);
          path.setAttribute("class", cls);
          path.setAttribute("fill", "rgba(61,139,253,0.15)");
          g.appendChild(path);
        }
        for (let i = 0; i < s.pts.length - 1; i++) {
          this.drawLine(g, s.pts[i], s.pts[i + 1], cls, false, dashed);
        }
        if (closed) {
          this.drawLine(g, s.pts[s.pts.length - 1], s.pts[0], cls, false, dashed);
        }
        break;
      }
      case "mpath": {
        this.drawSmoothMpath(g, s.nodes, s.closed ?? false, cls, !!filled);
        for (const n of s.nodes) {
          if (n.dir === undefined) continue;
          const tip = dirAngleToPoint(n.p, n.dir);
          this.drawLine(g, n.p, tip, "shape-dir", false);
        }
        break;
      }
      case "bezier": {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute(
          "d",
          `M ${s.a.x} ${s.a.y} C ${s.b.x} ${s.b.y} ${s.c.x} ${s.c.y} ${s.d.x} ${s.d.y}`,
        );
        path.setAttribute("class", cls);
        path.setAttribute("fill", filled ? "rgba(61,139,253,0.15)" : "none");
        g.appendChild(path);
        break;
      }
      case "circle": {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", String(s.center.x));
        c.setAttribute("cy", String(s.center.y));
        c.setAttribute("r", String(s.r));
        c.setAttribute("class", cls);
        c.setAttribute("fill", filled ? "rgba(61,139,253,0.15)" : "none");
        g.appendChild(c);
        break;
      }
      case "circle3": {
        const cc = circumcircle(s.a, s.b, s.c);
        if (cc) {
          const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          c.setAttribute("cx", String(cc.center.x));
          c.setAttribute("cy", String(cc.center.y));
          c.setAttribute("r", String(cc.r));
          c.setAttribute("class", cls);
          c.setAttribute("fill", filled ? "rgba(61,139,253,0.15)" : "none");
          g.appendChild(c);
        }
        for (const pt of [s.a, s.b, s.c]) {
          const m = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          m.setAttribute("cx", String(pt.x));
          m.setAttribute("cy", String(pt.y));
          m.setAttribute("r", "0.06");
          m.setAttribute("class", "draft-point");
          g.appendChild(m);
        }
        break;
      }
      case "ellipse": {
        const e = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        e.setAttribute("cx", String(s.center.x));
        e.setAttribute("cy", String(s.center.y));
        e.setAttribute("rx", String(s.rx));
        e.setAttribute("ry", String(s.ry));
        e.setAttribute("class", cls);
        e.setAttribute("fill", filled ? "rgba(61,139,253,0.15)" : "none");
        g.appendChild(e);
        break;
      }
      case "rect": {
        const x = Math.min(s.a.x, s.b.x);
        const y = Math.min(s.a.y, s.b.y);
        const rw = Math.abs(s.b.x - s.a.x);
        const rh = Math.abs(s.b.y - s.a.y);
        const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        r.setAttribute("x", String(x));
        r.setAttribute("y", String(y));
        r.setAttribute("width", String(rw));
        r.setAttribute("height", String(rh));
        r.setAttribute("class", cls);
        r.setAttribute("fill", filled ? "rgba(61,139,253,0.15)" : "none");
        g.appendChild(r);
        break;
      }
    }
    if (s.kind === "dot" && s.dotlabel) this.drawMpLabel(s.dotlabel, s.p);
    if (s.style?.label) this.drawMpLabel(s.style.label, this.shapeLabelAnchor(s));
  }

  private shapeLabelAnchor(s: PrimitiveShape): LPoint {
    switch (s.kind) {
      case "dot":
      case "point":
        return s.p;
      case "segment":
      case "arrow":
        return { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      case "polyline":
        return s.pts[Math.floor(s.pts.length / 2)] ?? { x: 0, y: 0 };
      case "mpath":
        return s.nodes[Math.floor(s.nodes.length / 2)]?.p ?? { x: 0, y: 0 };
      case "bezier":
        return { x: (s.a.x + s.d.x) / 2, y: (s.a.y + s.d.y) / 2 };
      case "circle":
      case "ellipse":
        return s.center;
      case "circle3": {
        const cc = circumcircle(s.a, s.b, s.c);
        return cc?.center ?? s.a;
      }
      case "rect":
        return { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    }
  }

  private drawMpLabel(raw: string, fallback: LPoint): void {
    const parsed = parseMpLabelStatement(raw);
    if (!parsed || !parsed.text) return;
    const labelPoint = parseCoordToken(parsed.pointArg) ?? fallback;
    const placement = labelPlacementOffset(parsed.placement);
    const p = addOffset(labelPoint, placement);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(p.x));
    text.setAttribute("y", String(this.mathYToView(p.y)));
    text.setAttribute("class", "shape-label");
    text.setAttribute("text-anchor", placement.textAnchor);
    text.setAttribute("dominant-baseline", "middle");
    text.textContent = parsed.text;
    this.svg.appendChild(text);
  }

  private drawSmoothMpath(
    g: SVGGElement,
    nodes: MPathNode[],
    closed: boolean,
    cls: string,
    filled: boolean,
  ): void {
    const d = mpathToSvgD(nodes, closed);
    if (!d) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", cls);
    path.setAttribute("fill", filled ? "rgba(61,139,253,0.15)" : "none");
    g.appendChild(path);
  }

  private drawLine(
    g: SVGGElement,
    a: LPoint,
    b: LPoint,
    cls: string,
    arrow: boolean,
    dashed = false,
  ): void {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("class", dashed ? `${cls} shape-dashed` : cls);
    if (arrow) line.setAttribute("marker-end", "url(#arrowhead)");
    g.appendChild(line);
    if (arrow && !this.svg.querySelector("#arrowhead")) {
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      defs.innerHTML = `<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#3d8bfd"/></marker>`;
      this.svg.insertBefore(defs, this.svg.firstChild);
    }
  }

  private drawDraft(g: SVGGElement): void {
    if (this.tool === "mpath") {
      if (this.draftMpath.length === 0 && !this.mpathDirPreview) return;
      for (const n of this.draftMpath) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", String(n.p.x));
        c.setAttribute("cy", String(n.p.y));
        c.setAttribute("r", "0.1");
        c.setAttribute("class", "draft-point");
        g.appendChild(c);
        if (n.dir !== undefined) {
          const tip = dirAngleToPoint(n.p, n.dir);
          this.drawLine(g, n.p, tip, "draft-dir", false);
        }
      }
      if (this.draftMpath.length >= 2) {
        this.drawSmoothMpath(g, this.draftMpath, false, "draft-line", false);
      }
      if (this.mpathDirDrag && this.mpathDirPreview && this.draftMpath.length > 0) {
        const last = this.draftMpath[this.draftMpath.length - 1];
        this.drawLine(g, last.p, this.mpathDirPreview, "draft-dir", false);
      }
      return;
    }

    if (this.draft.length === 0 && !this.dragging) return;
    const pts = [...this.draft];
    if (this.dragging && pts.length > 0) pts.push(this.dragging);
    for (const p of pts) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", "0.1");
      c.setAttribute("class", "draft-point");
      g.appendChild(c);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      this.drawLine(g, pts[i], pts[i + 1], "draft-line", false);
    }
  }
}

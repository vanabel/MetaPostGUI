export type SketchBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type SketchBackground = {
  href: string;
  opacity: number;
  /** 原图像素宽 */
  naturalWidth: number;
  naturalHeight: number;
  /** 草图在数学坐标中的位置（独立于视口平移/缩放） */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type SketchInput = Pick<
  SketchBackground,
  "href" | "opacity" | "naturalWidth" | "naturalHeight"
> &
  Partial<SketchBounds>;

export const SKETCH_STORAGE_KEY = "metapostgui-sketch-v1";
export const MAX_SKETCH_PERSIST_BYTES = 2_500_000;

export function hasSketchBounds(
  s: Partial<SketchBackground>,
): s is Pick<SketchBackground, "href" | "opacity" | "naturalWidth" | "naturalHeight"> &
  SketchBounds {
  return (
    typeof s.minX === "number" &&
    typeof s.minY === "number" &&
    typeof s.maxX === "number" &&
    typeof s.maxY === "number" &&
    Number.isFinite(s.minX) &&
    Number.isFinite(s.minY) &&
    Number.isFinite(s.maxX) &&
    Number.isFinite(s.maxY)
  );
}

export function fitSketchInBounds(
  imgW: number,
  imgH: number,
  bounds: SketchBounds,
  marginFraction = 0,
): SketchBounds {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const mx = spanX * marginFraction;
  const my = spanY * marginFraction;
  const inner = {
    minX: bounds.minX + mx,
    maxX: bounds.maxX - mx,
    minY: bounds.minY + my,
    maxY: bounds.maxY - my,
  };
  const innerW = inner.maxX - inner.minX;
  const innerH = inner.maxY - inner.minY;
  if (innerW <= 0 || innerH <= 0 || imgW <= 0 || imgH <= 0) {
    return { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
  }
  const scale = Math.min(innerW / imgW, innerH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  const cx = (inner.minX + inner.maxX) / 2;
  const cy = (inner.minY + inner.maxY) / 2;
  return {
    minX: cx - w / 2,
    minY: cy - h / 2,
    maxX: cx + w / 2,
    maxY: cy + h / 2,
  };
}

export function translateSketchBounds(
  bounds: SketchBounds,
  dx: number,
  dy: number,
): SketchBounds {
  return {
    minX: bounds.minX + dx,
    minY: bounds.minY + dy,
    maxX: bounds.maxX + dx,
    maxY: bounds.maxY + dy,
  };
}

export function scaleSketchBounds(
  bounds: SketchBounds,
  factor: number,
  anchor: { x: number; y: number },
  minSpan = 0.5,
): SketchBounds {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (w <= 0 || h <= 0 || factor <= 0) return bounds;
  const fx = (anchor.x - bounds.minX) / w;
  const fy = (anchor.y - bounds.minY) / h;
  let newW = w * factor;
  let newH = h * factor;
  if (newW < minSpan) {
    const s = minSpan / newW;
    newW = minSpan;
    newH *= s;
  }
  if (newH < minSpan) {
    const s = minSpan / newH;
    newH = minSpan;
    newW *= s;
  }
  const minX = anchor.x - fx * newW;
  const minY = anchor.y - fy * newH;
  return { minX, minY, maxX: minX + newW, maxY: minY + newH };
}

export function initSketchInReference(
  partial: Pick<SketchBackground, "href" | "opacity" | "naturalWidth" | "naturalHeight">,
  reference: SketchBounds,
): SketchBackground {
  return {
    ...partial,
    ...fitSketchInBounds(partial.naturalWidth, partial.naturalHeight, reference, 0),
  };
}

export function loadImageSize(href: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("无法解码图片"));
    img.src = href;
  });
}

export function loadPersistedSketch(): SketchInput | null {
  try {
    const raw = localStorage.getItem(SKETCH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SketchBackground>;
    if (!data.href || typeof data.opacity !== "number") return null;
    const base: SketchInput = {
      href: data.href,
      opacity: data.opacity,
      naturalWidth: data.naturalWidth ?? 0,
      naturalHeight: data.naturalHeight ?? 0,
    };
    if (!hasSketchBounds(data)) return base;
    return {
      ...base,
      minX: data.minX,
      minY: data.minY,
      maxX: data.maxX,
      maxY: data.maxY,
    };
  } catch {
    return null;
  }
}

export function persistSketch(sketch: SketchBackground | null): void {
  if (!sketch) {
    localStorage.removeItem(SKETCH_STORAGE_KEY);
    return;
  }
  const bytes = new Blob([JSON.stringify(sketch)]).size;
  if (bytes > MAX_SKETCH_PERSIST_BYTES) {
    console.warn("草图过大，未写入 localStorage");
    return;
  }
  localStorage.setItem(SKETCH_STORAGE_KEY, JSON.stringify(sketch));
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 768;
const DEFAULT_SCALE = 2;
const DEFAULT_MAX_SIDE = 8192;

export type SvgRasterSize = {
  width: number;
  height: number;
};

type SvgRasterSizeInput = {
  widthAttr?: string | null;
  heightAttr?: string | null;
  viewBox?: string | null;
  scale?: number;
  maxSide?: number;
};

type ViewBoxSize = {
  width: number;
  height: number;
};

const LENGTH_UNITS: Record<string, number> = {
  "": 1,
  px: 1,
  pt: 96 / 72,
  bp: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
};

export function svgLengthToPx(raw: string | null | undefined): number | null {
  const value = raw?.trim();
  if (!value || value.endsWith("%")) return null;
  const match = value.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z]*)$/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const ratio = LENGTH_UNITS[unit];
  if (!Number.isFinite(amount) || amount <= 0 || ratio === undefined) return null;
  return amount * ratio;
}

function parseViewBox(raw: string | null | undefined): ViewBoxSize | null {
  const parts = raw
    ?.trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part));
  if (!parts || parts.length !== 4) return null;
  const [, , width, height] = parts;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function resolveSvgRasterSize(input: SvgRasterSizeInput): SvgRasterSize {
  const viewBox = parseViewBox(input.viewBox);
  const widthAttr = svgLengthToPx(input.widthAttr);
  const heightAttr = svgLengthToPx(input.heightAttr);
  const aspect = viewBox && viewBox.width > 0 ? viewBox.height / viewBox.width : null;
  const baseWidth = widthAttr ?? (heightAttr && aspect ? heightAttr / aspect : viewBox?.width ?? DEFAULT_WIDTH);
  const baseHeight =
    heightAttr ?? (widthAttr && aspect ? widthAttr * aspect : viewBox?.height ?? DEFAULT_HEIGHT);
  const requestedScale = input.scale ?? DEFAULT_SCALE;
  const scale = Number.isFinite(requestedScale) && requestedScale > 0 ? requestedScale : DEFAULT_SCALE;
  let width = Math.max(1, Math.round(baseWidth * scale));
  let height = Math.max(1, Math.round(baseHeight * scale));
  const maxSide = input.maxSide ?? DEFAULT_MAX_SIDE;
  const longest = Math.max(width, height);
  if (longest > maxSide) {
    const downscale = maxSide / longest;
    width = Math.max(1, Math.round(width * downscale));
    height = Math.max(1, Math.round(height * downscale));
  }
  return { width, height };
}

export function pngFilenameFromLabel(label: string, fallback = "metapost-figure"): string {
  const base = label
    .trim()
    .replace(/\.png$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || fallback}.png`;
}

function cloneSvgForRaster(svg: SVGSVGElement, size: SvgRasterSize): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", XLINK_NS);
  clone.setAttribute("width", String(size.width));
  clone.setAttribute("height", String(size.height));
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return clone;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("无法读取 SVG 预览图"));
    img.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("浏览器未能生成 PNG"));
    }, "image/png");
  });
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadSvgElementAsPng(
  svg: SVGSVGElement,
  filename: string,
): Promise<SvgRasterSize> {
  const size = resolveSvgRasterSize({
    widthAttr: svg.getAttribute("width"),
    heightAttr: svg.getAttribute("height"),
    viewBox: svg.getAttribute("viewBox"),
  });
  const clone = cloneSvgForRaster(svg, size);
  const source = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 canvas PNG 导出");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const pngBlob = await canvasToPngBlob(canvas);
    downloadBlob(filename, pngBlob);
    return size;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCoverage, parseFigure, unparsedDrawMacros } from "./parse";
import { emitScene } from "./emit";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..", "..", "..");
const MANIFEST_PATH = join(ROOT, "examples", "manifest.json");
const REPORT_PATH = join(ROOT, "examples", "reports", "parse-coverage.json");

type ManifestExample = {
  id: string;
  title?: string;
  tier?: string;
  source?: string;
  figure?: string;
  figure_file?: string;
  featured_level?: "basic" | "intermediate" | "advanced";
  featured_order?: number;
  featured_reason?: string;
  expect?: {
    compile?: string;
    parse_coverage_min?: number;
    canvas_sync?: string;
  };
};

type Manifest = {
  examples: ManifestExample[];
};

function loadManifest(): Manifest {
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw) as Manifest;
}

function resolveFigure(ex: ManifestExample): string {
  if (ex.figure) return ex.figure;
  if (ex.figure_file) {
    return readFileSync(join(ROOT, "examples", ex.figure_file), "utf-8");
  }
  return "";
}

function macroLines(figure: string): string[] {
  const scene = parseFigure(figure);
  return scene.shapes.filter((s) => s.layer === "macro").map((s) => s.raw);
}

const FEATURED_COUNTS = {
  basic: 6,
  intermediate: 5,
  advanced: 5,
} as const;

const PREVIEW_MACROS = new Set(["drawgrid", "coordtwo", "arrow_label", "angle_mark"]);

function macroName(raw: string): string {
  const m = raw.trim().match(/^([A-Za-z_]\w*)\s*\(/);
  return m?.[1] ?? "";
}

function isPreservedDeclarationOrAssignment(raw: string): boolean {
  const t = raw.trim();
  return (
    /^(pair|numeric|path|color)\b/i.test(t) ||
    /^[A-Za-z_]\w*(?:\[\d+\])?\s*(?::=|=)\s*.+$/.test(t)
  );
}

function unsupportedFeaturedMacros(scene: ReturnType<typeof parseFigure>): string[] {
  return scene.shapes
    .filter((s) => s.layer === "macro")
    .map((s) => s.raw)
    .filter((raw) => {
      if (isPreservedDeclarationOrAssignment(raw)) return false;
      const name = macroName(raw);
      if (!PREVIEW_MACROS.has(name)) return true;
      return !scene.shapes.some(
        (s) => s.layer === "primitive" && s.previewOnly && s.sourceMacro === raw,
      );
    });
}

function primitiveCount(scene: ReturnType<typeof parseFigure>): number {
  return scene.shapes.filter((s) => s.layer === "primitive").length;
}

describe("examples corpus — parse coverage", () => {
  const manifest = loadManifest();
  const entries = manifest.examples.filter((e) => e.tier === "A" || e.tier === "B");
  const featured = manifest.examples.filter((e) => e.featured_level);

  it("keeps the default featured examples to 6 basic, 5 intermediate, 5 advanced", () => {
    expect(featured).toHaveLength(16);
    for (const [level, count] of Object.entries(FEATURED_COUNTS)) {
      expect(
        featured.filter((ex) => ex.featured_level === level).length,
        `featured ${level} count`,
      ).toBe(count);
    }
    const orders = featured.map((ex) => ex.featured_order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(featured.every((ex) => ex.expect?.canvas_sync === "required")).toBe(true);
  });

  for (const ex of featured) {
    it(`featured ${ex.id} syncs to canvas primitives`, () => {
      const figure = resolveFigure(ex);
      const scene = parseFigure(figure);
      const unsupported = unsupportedFeaturedMacros(scene);
      const unparsed = unparsedDrawMacros(figure);

      expect(primitiveCount(scene), `${ex.id} produced no canvas primitives`).toBeGreaterThan(0);
      expect(unparsed, `${ex.id} unparsed draws:\n${unparsed.join("\n")}`).toEqual([]);
      expect(
        unsupported,
        `${ex.id} unsupported macros:\n${unsupported.join("\n")}`,
      ).toEqual([]);

      const emitted = emitScene(scene);
      expect(primitiveCount(parseFigure(emitted))).toBe(primitiveCount(scene));
    });
  }

  it("generates parse-coverage.json report", () => {
    const rows = manifest.examples.map((ex) => {
      const figure = resolveFigure(ex);
      const { parsed, total } = parseCoverage(figure);
      const ratio = total > 0 ? parsed / total : 1;
      return {
        id: ex.id,
        tier: ex.tier,
        source: ex.source,
        parsed,
        total,
        ratio: Math.round(ratio * 1000) / 1000,
        macro_samples: macroLines(figure).slice(0, 3),
      };
    });
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify({ examples: rows }, null, 2) + "\n");
    expect(rows.length).toBeGreaterThan(0);
  });

/** Tier A examples that still need full MetaPost (transforms, pictures, etc.). */
const TIER_A_DRAW_EXEMPT = new Set([
  "tlhiv-038", // mixed -- and .. in one path
  "tlhiv-072", // draw p shifted …
  "tlhiv-074", // draw p xscaled …
  "tlhiv-084", // draw p transformed T
  "tlhiv-086", // read file - might be similar
  "tlhiv-090", // picture / currentpicture
  "tlhiv-104", // whatever / angle geometry
  "tlhiv-203", // draw btex … shifted (geometry draws may parse)
  "tlhiv-205",
  "tlhiv-206",
  "tlhiv-207",
]);

  for (const ex of manifest.examples.filter((e) => e.tier === "A")) {
    it(`tier A ${ex.id} draw lines resolve to canvas primitives`, () => {
      if (TIER_A_DRAW_EXEMPT.has(ex.id)) return;
      const figure = resolveFigure(ex);
      const unparsed = unparsedDrawMacros(figure);
      expect(
        unparsed,
        `${ex.id} unparsed draws:\n${unparsed.join("\n")}`,
      ).toEqual([]);
    });
  }

  for (const ex of entries.filter((e) => e.source === "curated")) {
    it(`curated ${ex.id} meets parse_coverage_min`, () => {
      const figure = resolveFigure(ex);
      const { parsed, total } = parseCoverage(figure);
      const ratio = total > 0 ? parsed / total : 1;
      const min = ex.expect?.parse_coverage_min ?? 0;
      expect(ratio, `${ex.id} coverage ${ratio} < ${min}`).toBeGreaterThanOrEqual(min);
    });
  }

  for (const ex of manifest.examples.filter(
    (e) => e.expect?.canvas_sync === "required",
  )) {
    it(`round-trip ${ex.id}`, () => {
      const figure = resolveFigure(ex);
      const scene = parseFigure(figure);
      const emitted = emitScene(scene);
      const again = parseFigure(emitted);
      const prim = (s: typeof scene) =>
        s.shapes.filter((sh) => sh.layer === "primitive").length;
      expect(prim(again)).toBe(prim(scene));
    });
  }
});

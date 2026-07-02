import { describe, expect, it } from "vitest";
import { lineIntersection } from "./geom";
import { buildJournal, journalBounds } from "./eval";
import { parseFigure } from "./parse";

describe("lineIntersection", () => {
  it("finds intersection of two non-parallel lines", () => {
    const p = lineIntersection({ x: 2, y: 4 }, { x: -4, y: 0 }, { x: 4, y: -2 }, { x: 4, y: 0 });
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(4, 5);
    expect(p!.y).toBeCloseTo(16 / 3, 5);
  });

  it("returns null for parallel lines", () => {
    expect(
      lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }),
    ).toBeNull();
  });
});

describe("geometry journal", () => {
  it("bounds include whatever-constructed auxiliary lines", () => {
    const src = `z0=(2u,4u);
z1=(-4u,0);
z2=(4u,-2u);
z3=(4u,0);
draw z0--z1--z2--z3--cycle;
pair A,B,C,D;
A=whatever[z0,z1]=whatever[z2,z3];
B=whatever[z0,z3]=whatever[z1,z2];
C=whatever[A,B]=whatever[z1,z3];
D=whatever[A,B]=whatever[z0,z2];
draw A--D withpen pencircle scaled 1pt;
draw z0--A--z3;
draw z2--B--z3;
drawoptions(dashed evenly);
draw z1--C;
draw z0--D;`;

    const scene = parseFigure(src);
    expect(scene.journal?.length).toBeGreaterThan(0);
    const unparsed = scene.shapes.filter(
      (s) => s.layer === "macro" && /^draw\b/i.test(s.raw.trim()),
    );
    expect(unparsed.map((s) => s.raw)).toEqual([]);

    const bounds = journalBounds(scene.journal ?? []);
    expect(bounds.minX).toBeLessThanOrEqual(-4);
    expect(bounds.maxX).toBeGreaterThanOrEqual(4);
    expect(bounds.maxY).toBeGreaterThan(4);
  });

  it("buildJournal matches primitive count for segments", () => {
    const scene = parseFigure("draw ((0,0)--(3,2)) scaled u;");
    const journal = buildJournal(scene.shapes);
    expect(journal.some((e) => e.kind === "segment")).toBe(true);
  });
});

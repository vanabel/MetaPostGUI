import { describe, expect, it } from "vitest";
import { cubicDirection, cubicPoint, mpathCubicSegments, mpathToSvgD } from "./mpath-spline";
import type { MPathNode } from "./types";

function nodes(pts: LPoint[]): MPathNode[] {
  return pts.map((p) => ({ p }));
}

type LPoint = { x: number; y: number };

describe("mpath-spline", () => {
  it("builds cubic segments for open path", () => {
    const segs = mpathCubicSegments(nodes([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ]));
    expect(segs).toHaveLength(2);
    expect(segs[0].p0).toEqual({ x: 0, y: 0 });
    expect(segs[0].p1).toEqual({ x: 2, y: 0 });
  });

  it("midpoint deviates from chord for curved spline", () => {
    const ns = nodes([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 4, y: 0 },
    ]);
    const seg = mpathCubicSegments(ns)[0];
    const mid = cubicPoint(seg, 0.5);
    expect(mid.y).toBeGreaterThan(0.8);
  });

  it("computes cubic tangent direction", () => {
    const ns = nodes([
      { x: -4, y: -1 },
      { x: -2, y: 2 },
      { x: 1, y: 1 },
      { x: 4, y: 3 },
    ]);
    const seg = mpathCubicSegments(ns)[1];
    const dir = cubicDirection(seg, 0.6);
    expect(dir.x).toBeCloseTo(3.16, 2);
    expect(dir.y).toBeCloseTo(-1.82, 2);
  });

  it("respects {dir} on first knot", () => {
    const ns: MPathNode[] = [
      { p: { x: 0, y: 0 }, dir: 90 },
      { p: { x: 2, y: 0 } },
    ];
    const seg = mpathCubicSegments(ns)[0];
    expect(seg.cp1.y).toBeGreaterThan(seg.p0.y);
  });

  it("emits closed SVG path", () => {
    const d = mpathToSvgD(
      nodes([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ]),
      true,
    );
    expect(d).toMatch(/^M /);
    expect(d).toContain("C ");
    expect(d).toMatch(/ Z$/);
  });
});

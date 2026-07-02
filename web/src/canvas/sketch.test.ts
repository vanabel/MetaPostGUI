import { describe, expect, it } from "vitest";
import {
  fitSketchInBounds,
  scaleSketchBounds,
  translateSketchBounds,
} from "./sketch";

describe("fitSketchInBounds", () => {
  const bounds = { minX: -10, maxX: 10, minY: -10, maxY: 10 };

  it("contain-fits a wide image into a square viewport", () => {
    const r = fitSketchInBounds(200, 100, bounds, 0);
    expect(r.maxX - r.minX).toBeCloseTo(20);
    expect(r.maxY - r.minY).toBeCloseTo(10);
    expect(r.minX).toBeCloseTo(-10);
    expect(r.maxY).toBeCloseTo(5);
    expect(r.minY).toBeCloseTo(-5);
  });

  it("contain-fits a tall image into a square viewport", () => {
    const r = fitSketchInBounds(100, 200, bounds, 0);
    expect(r.maxX - r.minX).toBeCloseTo(10);
    expect(r.maxY - r.minY).toBeCloseTo(20);
  });
});

describe("sketch bounds transforms", () => {
  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it("translates sketch bounds", () => {
    const r = translateSketchBounds(bounds, 2, -1);
    expect(r).toEqual({ minX: 2, minY: -1, maxX: 12, maxY: 9 });
  });

  it("scales sketch bounds around anchor", () => {
    const r = scaleSketchBounds(bounds, 2, { x: 0, y: 0 });
    expect(r.minX).toBeCloseTo(0);
    expect(r.minY).toBeCloseTo(0);
    expect(r.maxX).toBeCloseTo(20);
    expect(r.maxY).toBeCloseTo(20);
  });
});

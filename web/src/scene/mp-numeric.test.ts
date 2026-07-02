import { describe, expect, it } from "vitest";
import { evalNumeric } from "./mp-numeric";

describe("evalNumeric", () => {
  it("evaluates sqrt and cosd", () => {
    const vars = new Map<string, number>();
    const v = evalNumeric("sqrt(2*(1+cosd(72)))", vars);
    expect(v).not.toBeNull();
    expect(v!).toBeCloseTo(Math.sqrt(2 * (1 + Math.cos((72 * Math.PI) / 180))), 5);
  });

  it("resolves array shorthand d0, d1", () => {
    const vars = new Map<string, number>([
      ["d[0]", 1],
      ["d0", 1],
      ["d[1]", 2],
      ["d1", 2],
      ["d[2]", 3],
      ["d2", 3],
    ]);
    expect(evalNumeric("d1/(d0+d1)", vars)).toBeCloseTo(2 / 3, 5);
  });

  it("does not treat pair coords as numeric", () => {
    expect(evalNumeric("(-1cm, -1cm)", new Map())).toBeNull();
  });
});

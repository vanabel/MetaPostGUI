import { describe, expect, it } from "vitest";
import {
  addOffset,
  labelPlacementOffset,
  labelTextFromTex,
  parseMpLabelStatement,
} from "./label-format";

describe("MetaPost label formatting", () => {
  it("extracts plain display text from btex labels", () => {
    expect(labelTextFromTex("btex $P$ etex")).toBe("P");
    expect(labelTextFromTex("btex $\\varphi(p)$ etex")).toBe("phi(p)");
  });

  it("parses dotlabel suffix and point argument", () => {
    const parsed = parseMpLabelStatement("dotlabel.llft(btex $A$ etex, (-4u,0));");
    expect(parsed?.kind).toBe("dotlabel");
    expect(parsed?.placement).toBe("llft");
    expect(parsed?.text).toBe("A");
    expect(parsed?.pointArg).toBe("(-4u,0)");
  });

  it("maps placement suffixes to label offsets", () => {
    const offset = labelPlacementOffset("lrt", 0.5);
    expect(addOffset({ x: 1, y: 2 }, offset)).toEqual({ x: 1.5, y: 1.5 });
    expect(offset.textAnchor).toBe("start");
  });
});

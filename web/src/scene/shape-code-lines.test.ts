import { describe, expect, it } from "vitest";
import { findRelatedLineNumbers } from "./shape-code-lines";
import { parseFigure } from "./parse";

describe("findRelatedLineNumbers", () => {
  it("finds pat assignment and draw for mpath", () => {
    const src = `path pat[];
pat[0]=((-4.5,1.75)..(-3.517,1.658)..cycle) scaled u;
draw pat[0];
z[0]=point 0 of pat[0];
dotlabel.bot(btex $p$ etex, z[0]);`;
    const scene = parseFigure(src);
    const mp = scene.shapes.find((s) => s.layer === "primitive" && s.kind === "mpath");
    expect(mp).toBeDefined();
    const lines = findRelatedLineNumbers(src, mp!);
    expect(lines).toContain(1);
    expect(lines).toContain(2);
    expect(lines).toContain(3);
    expect(lines).toContain(4);
  });

  it("finds builtin circle path and extra draw modifiers", () => {
    const src = `z[2]=(2.531u,1.526u);
pat[3]=halfcircle scaled 0.926u shifted z[2];
draw pat[3] dashed evenly;
draw pat[3] rotatedaround(z[2], 180) dashed evenly;`;
    const scene = parseFigure(src);
    const c = scene.shapes.find(
      (s) => s.layer === "primitive" && s.kind === "circle" && s.pathVar === "pat[3]",
    );
    expect(c).toBeDefined();
    const lines = findRelatedLineNumbers(src, c!);
    expect(lines).toEqual([1, 2, 3]);
  });

  it("finds macro hatchfill line", () => {
    const src = `hatchfill buildcycle(halfcircle, (-2,0)--(2,0)) scaled 0.926u withcolor slash;`;
    const scene = parseFigure(src);
    const macro = scene.shapes.find((s) => s.layer === "macro");
    expect(macro).toBeDefined();
    expect(findRelatedLineNumbers(src, macro!)).toEqual([0]);
  });
});

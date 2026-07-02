import { describe, expect, it } from "vitest";
import { DRAWING_RULES, T } from "./drawing-spec";
import { emitScene } from "./emit";
import { parseCoverage, parseFigure, unparsedDrawMacros } from "./parse";
import { setHandle } from "./transform";
import type { LPoint, PrimitiveShape } from "./types";

const TLHIV_204 = `pair A,B,C,D,E,F;
numeric d[];
u := 3cm;
A := (0,0);
B := (u,0);
D := B rotated 72;
C := (u,0) + D;
d[0] := 1;
d[1] := sqrt( 2*(1+cosd(72)) );
d[2] := sqrt( 2*(1-cosd(36)) );
A := A;
B := C;
C := D;
draw A--B--C--cycle;
E := (d1/(d0+d1)) [A,C];
F := (d0/(d0+d2)) [A,B];
draw E--C--F--cycle;
draw btex $A$ etex shifted 1/3(E+C+F);
draw B--C--F--cycle;
draw btex $B$ etex shifted 1/3(B+C+E);
draw E--F--A--cycle;
draw btex $B'$ etex shifted 1/3(E+F+A);`;

function polylines(scene: ReturnType<typeof parseFigure>) {
  return scene.shapes.filter(
    (s): s is PrimitiveShape & { kind: "polyline" } =>
      s.layer === "primitive" && s.kind === "polyline",
  );
}

function circles(scene: ReturnType<typeof parseFigure>) {
  return scene.shapes.filter(
    (s): s is PrimitiveShape & { kind: "circle" } =>
      s.layer === "primitive" && s.kind === "circle",
  );
}

function closePt(a: LPoint, b: LPoint, tol = 1e-3) {
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(tol);
}

function firstPrimitive(scene: ReturnType<typeof parseFigure>): PrimitiveShape | undefined {
  return scene.shapes.find((s) => s.layer === "primitive") as PrimitiveShape | undefined;
}

describe("drawing rules — parse", () => {
  for (const rule of DRAWING_RULES) {
    it(`recognizes ${rule.kind}: ${rule.mpForm}`, () => {
      const line = rule.sampleLine({});
      const shape = firstPrimitive(parseFigure(line));
      expect(shape?.kind, `failed on: ${line}`).toBe(rule.kind);
    });
  }

  it("parses nested-paren segment", () => {
    const shape = firstPrimitive(
      parseFigure(`draw ((${T.a.x}u,${T.a.y}u)--(${T.b.x}u,${T.b.y}u)) scaled u;`),
    );
    expect(shape?.kind).toBe("segment");
  });

  it("previews coordtwo macro without rewriting source", () => {
    const scene = parseFigure("coordtwo(origin, 10u, 0, 0);");
    const macro = scene.shapes.find((s) => s.layer === "macro" && s.name === "coordtwo");
    const arrows = scene.shapes.filter(
      (s): s is PrimitiveShape & { kind: "arrow" } =>
        s.layer === "primitive" && s.kind === "arrow",
    );

    expect(macro).toBeDefined();
    expect(arrows).toHaveLength(2);
    expect(arrows.every((s) => s.previewOnly)).toBe(true);
    closePt(arrows[0].a, { x: 0, y: -2 });
    closePt(arrows[0].b, { x: 0, y: 8 });
    closePt(arrows[1].a, { x: -2, y: 0 });
    closePt(arrows[1].b, { x: 8, y: 0 });
    expect(emitScene(scene).trim()).toBe("coordtwo(origin, 10u, 0, 0);");
  });

  it("previews drawgrid macro without rewriting source", () => {
    const scene = parseFigure("drawgrid(2);");
    const macro = scene.shapes.find((s) => s.layer === "macro" && s.name === "drawgrid");
    const gridLines = scene.shapes.filter(
      (s): s is PrimitiveShape & { kind: "segment" } =>
        s.layer === "primitive" && s.kind === "segment" && s.previewOnly,
    );

    expect(macro).toBeDefined();
    expect(gridLines).toHaveLength(10);
    expect(gridLines.every((s) => s.sourceMacro === "drawgrid(2)")).toBe(true);
    expect(emitScene(scene).trim()).toBe("drawgrid(2);");
  });

  it("previews arrow_label plugin macro without rewriting source", () => {
    const src = `pair A, B;
A = (-2u, 0); B = (2u, 0);
arrow_label(A, B, btex $d$ etex, 0);`;
    const scene = parseFigure(src);
    const arrows = scene.shapes.filter(
      (s): s is PrimitiveShape & { kind: "arrow" } =>
        s.layer === "primitive" && s.kind === "arrow" && s.previewOnly,
    );

    expect(scene.shapes.some((s) => s.layer === "macro" && s.name === "arrow_label")).toBe(true);
    expect(arrows).toHaveLength(2);
    expect(arrows.some((s) => s.style?.label?.includes("$d$"))).toBe(true);
    expect(emitScene(scene)).toContain("arrow_label(A, B, btex $d$ etex, 0);");
  });

  it("previews angle_mark plugin macro without rewriting source", () => {
    const src = `pair a, o, b;
a = (-2u, 1u); o = (0, 0); b = (2u, 0.5u);
angle_mark(a, o, b, 6pt, btex $\\theta$ etex, blue);`;
    const scene = parseFigure(src);
    const arc = scene.shapes.find(
      (s): s is PrimitiveShape & { kind: "polyline" } =>
        s.layer === "primitive" && s.kind === "polyline" && !!s.previewOnly,
    );

    expect(scene.shapes.some((s) => s.layer === "macro" && s.name === "angle_mark")).toBe(true);
    expect(arc?.pts.length).toBe(17);
    expect(arc?.style?.label).toContain("\\theta");
    expect(emitScene(scene)).toContain("angle_mark(a, o, b, 6pt, btex $\\theta$ etex, blue);");
  });

  it("parses bezier with outer path parens (user report)", () => {
    const line =
      "draw ((-5,5)..controls (-2,4) and (-3.25,6.25)..(0,5)) scaled u;";
    const shape = firstPrimitive(parseFigure(line));
    expect(shape?.kind).toBe("bezier");
    if (shape?.kind === "bezier") {
      expect(shape.a).toEqual({ x: -5, y: 5 });
      expect(shape.d).toEqual({ x: 0, y: 5 });
    }
  });

  it("joins draw modifier continuation lines", () => {
    const src = `u:=.5cm;
pair A,B,C,D;
A:=(0,0); B:=(-u,2u); C:=(4u,3u); D:=(3u,0);
draw A.. controls B and C .. D
withpen pencircle scaled 2pt;`;
    const shape = firstPrimitive(parseFigure(src));
    expect(shape?.kind).toBe("bezier");
    expect(shape?.style?.withpen).toBe("pencircle scaled 2pt");
    expect(shape?.pointRefs).toMatchObject({ a: "A", b: "B", c: "C", d: "D" });
  });

  it("keeps shared point variables for bezier control diagrams", () => {
    const src = `u:=.5cm;
pair A,B,C,D;
A:=(0,0);
B:=(-u,2u);
C:=(4u,3u);
D:=(3u,0);
draw (A..controls B and C..D) withpen pencircle scaled 2pt;
draw ((-1,2)--(4,3)) scaled u withpen pencircle scaled 1pt dashed evenly;
drawarrow ((0,0)--(-1,2)) scaled u;
drawarrow ((3,0)--(4,3)) scaled u;`;
    const scene = parseFigure(src);
    const bezier = scene.shapes.find(
      (s): s is PrimitiveShape & { kind: "bezier" } =>
        s.layer === "primitive" && s.kind === "bezier",
    );
    const segment = scene.shapes.find(
      (s): s is PrimitiveShape & { kind: "segment" } =>
        s.layer === "primitive" && s.kind === "segment" && !!s.style?.dashed,
    );
    const arrows = scene.shapes.filter(
      (s): s is PrimitiveShape & { kind: "arrow" } =>
        s.layer === "primitive" && s.kind === "arrow",
    );

    expect(bezier?.pointRefs).toMatchObject({ a: "A", b: "B", c: "C", d: "D" });
    expect(segment?.pointRefs).toMatchObject({ a: "B", b: "C" });
    expect(arrows[0]?.pointRefs).toMatchObject({ a: "A", b: "B" });
    expect(arrows[1]?.pointRefs).toMatchObject({ a: "D", b: "C" });

    const emitted = emitScene(scene);
    expect(emitted).toContain("draw (A..controls B and C..D) withpen pencircle scaled 2pt;");
    expect(emitted).toContain("draw (B--C) withpen pencircle scaled 1pt dashed evenly;");
    expect(emitted).toContain("drawarrow (A--B);");

    const moved = {
      ...scene,
      shapes: scene.shapes.map((s) => {
        if (s.layer !== "primitive" || !s.pointRefs) return s;
        let next = s;
        for (const [handle, ref] of Object.entries(s.pointRefs)) {
          if (ref === "B") next = setHandle(next, handle, { x: -2, y: 2.5 });
        }
        return next;
      }),
    };
    expect(emitScene(moved)).toContain("B:=(-2u,2.5u);");
  });

  it("parses multi-point mpath (smooth path)", () => {
    const line =
      "draw ((-6,0.5)..(-4,2)..(-3,3)..(-1.25,4.25)..(1,5)) scaled u;";
    const shape = firstPrimitive(parseFigure(line));
    expect(shape?.kind).toBe("mpath");
    if (shape?.kind === "mpath") {
      expect(shape.nodes.length).toBe(5);
    }
  });

  it("parses and emits mpath {dir θ}", () => {
    const line =
      "draw ((-5,5){dir 0}..(-3,7.25)..(0,10)..(2,11)) scaled u;";
    const shape = firstPrimitive(parseFigure(line));
    expect(shape?.kind).toBe("mpath");
    if (shape?.kind === "mpath") {
      expect(shape.nodes[0].dir).toBe(0);
      expect(shape.nodes.length).toBe(4);
    }
    const emitted = emitScene(parseFigure(line));
    expect(emitted).toMatch(/\(-5,5\)\{dir 0\}/);
  });

  it("parses closed mpath with ..cycle (more than three points)", () => {
    const line =
      "draw ((-4.25,1.25)..(-3,1.25)..(-1.75,1)..(-1.5,2)..(-1.25,3.5)..(-2.5,4)..(-4.25,4.5)..(-5.5,4)..(-6.75,3.75)..(-7,2.75)..(-6.75,2)..(-6.5,1.25)..(-5.75,1.5)..cycle) scaled u;";
    const shape = firstPrimitive(parseFigure(line));
    expect(shape?.kind).toBe("mpath");
    if (shape?.kind === "mpath") {
      expect(shape.closed).toBe(true);
      expect(shape.nodes.length).toBe(13);
    }
    const emitted = emitScene(parseFigure(line));
    expect(emitted).toMatch(/\.\.cycle\)\s+scaled\s+u/);
  });

  it("parses path assignment pat[0]=(...)..cycle and draw pat[0]", () => {
    const src = `path pat[];
pat[0]=((-4.5,1.75)..(-3.517,1.658)..(-2.313,1.459)..cycle) scaled u;
draw pat[0];`;
    const scene = parseFigure(src);
    const mp = scene.shapes.find((s) => s.layer === "primitive" && s.kind === "mpath");
    expect(mp?.kind).toBe("mpath");
    if (mp?.kind === "mpath") {
      expect(mp.pathVar).toBe("pat[0]");
      expect(mp.closed).toBe(true);
      expect(mp.nodes.length).toBe(3);
    }
    expect(scene.shapes.filter((s) => s.layer === "macro" && s.raw === "draw pat[0]")).toHaveLength(0);
    const emitted = emitScene(scene);
    expect(emitted).toContain("pat[0]=");
    expect(emitted).toContain("draw pat[0]");
  });

  it("parses z[0]=point of pat[0] and dotlabel.bot", () => {
    const src = `pat[0]=((-4.5,1.75)..(-3.517,1.658)..(-2.313,1.459)..cycle) scaled u;
draw pat[0];
z[0]=point 0 of pat[0];
dotlabel.bot(btex $p$ etex, z[0]);`;
    const scene = parseFigure(src);
    const dot = scene.shapes.find((s) => s.layer === "primitive" && s.kind === "dot");
    expect(dot?.kind).toBe("dot");
    if (dot?.kind === "dot") {
      expect(dot.p).toEqual({ x: -4.5, y: 1.75 });
      expect(dot.dotlabel).toMatch(/dotlabel\.bot/);
      expect(dot.pointAssign).toBe("z[0]=point 0 of pat[0]");
    }
    const emitted = emitScene(scene);
    expect(emitted).toContain("z[0]=point 0 of pat[0]");
    expect(emitted).toContain("dotlabel.bot(btex $p$ etex, z[0])");
  });

  it("parses traditional point/direction/intersection syntax from user tangent example", () => {
    const src = `u:=2u;
coordtwo(origin, 10u, 0, 0);
path pat;
pat:=fullcircle scaled 8u;
draw pat;
draw (-4.5u,0)--(-2u,0);
pair P,R,Q;
numeric t;
t=1.2;
R=point t of pat;
P:= ((origin -- (-20u)*unitvector(direction t of pat)) shifted R) intersectionpoint (origin--10u*right);
Q:=(xpart(R),0);
draw 1.05[R,P]--1.2[P,R]--R--1.2[Q,R]--2.2[R,Q] dashed evenly;
dotlabel.bot(btex $P$ etex, P);
dotlabel.llft(btex $A$ etex, (-4u,0));
dotlabel.lrt(btex $B$ etex, (4u,0));
dotlabel.lrt(btex $Q$ etex, Q);`;

    const scene = parseFigure(src);
    expect(unparsedDrawMacros(src)).toEqual([]);

    const circle = circles(scene).find((s) => s.pathVar === "pat");
    expect(circle?.kind).toBe("circle");
    if (circle) expect(circle.r).toBeCloseTo(4, 5);

    const dashed = polylines(scene).find((s) => s.style?.dashed === "evenly");
    expect(dashed?.kind).toBe("polyline");
    if (dashed?.kind === "polyline") expect(dashed.pts.length).toBe(5);

    const dots = scene.shapes.filter(
      (s): s is PrimitiveShape & { kind: "dot" } =>
        s.layer === "primitive" && s.kind === "dot",
    );
    const dotByLabel = (label: string) =>
      dots.find((s) => s.dotlabel?.includes(label));
    const pDot = dotByLabel("$P$");
    const qDot = dotByLabel("$Q$");
    const aDot = dotByLabel("$A$");
    const bDot = dotByLabel("$B$");
    expect(pDot?.kind).toBe("dot");
    expect(qDot?.kind).toBe("dot");
    expect(aDot?.kind).toBe("dot");
    expect(bDot?.kind).toBe("dot");
    if (pDot?.kind === "dot") closePt(pDot.p, { x: 6.81361, y: 0 }, 1e-3);
    if (qDot?.kind === "dot") closePt(qDot.p, { x: 2.34804, y: 0 }, 1e-3);
    if (aDot?.kind === "dot") closePt(aDot.p, { x: -4, y: 0 });
    if (bDot?.kind === "dot") closePt(bDot.p, { x: 4, y: 0 });
  });

  it("uses cubic mpath geometry for point and direction of smooth paths", () => {
    const src = `u:=1u;
path p;
pair P,T;
numeric t;
p:=(-4u,-1u)..(-2u,2u)..(1u,1u)..(4u,3u);
t=1.6;
P=point t of p;
T=P+1.5u*unitvector(direction t of p);
draw p;
drawarrow P--T;
dotlabel.bot(btex $P$ etex, P);`;
    const scene = parseFigure(src);
    const arrow = scene.shapes.find(
      (s): s is PrimitiveShape & { kind: "arrow" } =>
        s.layer === "primitive" && s.kind === "arrow",
    );
    expect(arrow).toBeDefined();
    if (arrow) {
      closePt(arrow.a, { x: -0.248, y: 1.376 });
      closePt(arrow.b, { x: 1.052, y: 0.628 }, 1e-2);
    }
  });

  it("parses legacy dir vector as angle", () => {
    const line = "draw ((0,0) dir (1,0)..(2,0)) scaled u;";
    const shape = firstPrimitive(parseFigure(line));
    if (shape?.kind === "mpath") {
      expect(shape.nodes[0].dir).toBeCloseTo(0, 5);
    }
  });

  it("parses user figure fragment with macros and builtins", () => {
    const src = `u:=4u;
input hatching;
color slash;
slash= (45, 0.1u, -.5bp);
path pat[];
pat[0]=((-4.5,1.75)..(-3.517,1.658)..(-2.313,1.459)..cycle) scaled u;
draw pat[0];
z[0]=point 0 of pat[0];
dotlabel.bot(btex $p$ etex, z[0]);
z[1]=(-4.492u,1.835u);
pat[1]=fullcircle scaled 1u shifted z[1];
draw pat[1];
label.urt(btex $U$ etex, point 1 of pat[1]);
hatchfill buildcycle(subpath(0,1) of pat[0], pat[1] rotatedaround(z[1], -20), subpath(0.9*length(pat[0]), length(pat[0])) of pat[0]) withcolor slash;
drawarrow ((-1.556,2.352)--(-0.067,2.361)) scaled u;
z[2]=(2.531u,1.526u);
dotlabel.bot(btex $\\varphi(p)$ etex, z[2]);
pat[3]=halfcircle scaled 0.926u shifted z[2];
draw pat[3] dashed evenly;
draw pat[3] rotatedaround(z[2], 180) dashed evenly;
hatchfill buildcycle(halfcircle, (-2,0)--(2,0)) scaled 0.926u shifted (2.531u,1.526u) withcolor slash;`;

    const scene = parseFigure(src);
    const { parsed, total } = parseCoverage(src);
    expect(parsed).toBe(total);

    const circle = circles(scene).find((s) => s.pathVar === "pat[1]");
    expect(circle?.kind).toBe("circle");
    if (circle) {
      expect(circle.pathAssign).toContain("fullcircle");
      expect(circle.center.x).toBeCloseTo(-4.492, 3);
    }

    const half = circles(scene).find((s) => s.pathVar === "pat[3]");
    expect(half?.kind).toBe("circle");
    if (half) {
      expect(half.circleBuiltin).toBe("halfcircle");
      expect(half.style?.dashed).toBe("evenly");
    }

    expect(scene.shapes.some((s) => s.layer === "macro" && s.raw.startsWith("u:=4u"))).toBe(true);
    expect(scene.shapes.some((s) => s.layer === "macro" && /^input hatching/.test(s.raw))).toBe(true);
    expect(scene.shapes.some((s) => s.layer === "macro" && s.raw.startsWith("hatchfill"))).toBe(true);
    expect(
      scene.shapes.some(
        (s) => s.layer === "macro" && s.raw.includes("rotatedaround(z[2], 180)"),
      ),
    ).toBe(true);

    const emitted = emitScene(scene);
    expect(emitted).toContain("u:=4u");
    expect(emitted).toContain("pat[1]=fullcircle");
    expect(emitted).toContain("z[1]=(-4.492u,1.835u)");
    expect(emitted).toContain("hatchfill buildcycle");
  });
});

describe("drawing rules — emit round-trip", () => {
  for (const rule of DRAWING_RULES) {
    it(`round-trips ${rule.kind}`, () => {
      const line = rule.sampleLine({});
      const scene = parseFigure(line);
      const back = parseFigure(emitScene(scene));
      const a = firstPrimitive(scene);
      const b = firstPrimitive(back);
      expect(b?.kind).toBe(a?.kind);
    });
  }
});

describe("emit path parentheses", () => {
  it("wraps bezier path before scaled u", () => {
    const line =
      "draw ((-5,5)..controls (-2,4) and (-3.25,6.25)..(0,5)) scaled u;";
    const emitted = emitScene(parseFigure(line));
    expect(emitted).toMatch(
      /draw\s+\(\(-5,5\)\.\.controls\s+\(-2,4\)\s+and\s+\(-3\.25,6\.25\)\.\.\(0,5\)\)\s+scaled\s+u/,
    );
  });

  it("wraps circle3 path before scaled u", () => {
    const line = "draw ((1u,0u)..(2u,1u)..(0u,2u)..cycle) scaled u;";
    const emitted = emitScene(parseFigure(line));
    expect(emitted).toMatch(/draw\s+\(.*\.\.cycle\)\s+scaled\s+u/);
  });

  it("ends path assignment with semicolon before draw pat[]", () => {
    const src = `path pat[];
pat[0]=((0,0)..(1,0)..(1,1)..cycle) scaled u;
draw pat[0];`;
    const emitted = emitScene(parseFigure(src));
    expect(emitted).toMatch(/pat\[0\]=\(.+\) scaled u;\s*\ndraw pat\[0\];/);
  });

  it("emits dashed evenly outside withpen", () => {
    const line =
      "draw fullcircle scaled 0.926u shifted (2.531u,1.526u) dashed evenly;";
    const shape = firstPrimitive(parseFigure(line));
    expect(shape?.style?.dashed).toBe("evenly");
    const emitted = emitScene(parseFigure(line));
    expect(emitted).toContain("dashed evenly");
    expect(emitted).not.toMatch(/withpen\s+dashed/);
  });

  it("emits standard MetaPost circle diameter from internal radius", () => {
    const scene = parseFigure("draw fullcircle scaled 8u shifted (0,0);");
    const shape = firstPrimitive(scene);
    expect(shape?.kind).toBe("circle");
    if (shape?.kind === "circle") {
      expect(shape.r).toBeCloseTo(4, 5);
      shape.r = 5;
    }
    expect(emitScene(scene)).toContain("draw fullcircle scaled 10u shifted (0u,0u);");
  });

  it("repairs withpen dashed evenly from properties", () => {
    const scene = parseFigure(
      "draw fullcircle scaled 1u shifted (0,0) scaled u;",
    );
    const c = firstPrimitive(scene);
    if (c?.layer === "primitive" && c.kind === "circle") {
      c.style = { withpen: "dashed evenly" };
    }
    const emitted = emitScene(scene);
    expect(emitted).toMatch(/dashed evenly/);
    expect(emitted).not.toMatch(/withpen\s+dashed/);
  });

  it("splits withpen pencircle dashed evenly into separate modifiers", () => {
    const line =
      "draw fullcircle scaled 0.926u shifted (2.531u,1.526u) withpen pencircle dashed evenly;";
    const shape = firstPrimitive(parseFigure(line));
    expect(shape?.kind).toBe("circle");
    expect(shape?.style?.withpen).toBe("pencircle scaled 1pt");
    expect(shape?.style?.dashed).toBe("evenly");
    const emitted = emitScene(parseFigure(line));
    expect(emitted).toBe(
      "draw fullcircle scaled 0.926u shifted (2.531u,1.526u) withpen pencircle scaled 1pt dashed evenly;",
    );
  });

  it("parses pair := assignment and named draw path (tlhiv style)", () => {
    const src = `pair A, B, C;
A:=(0,0); B:=(1,0); C:=(0,1);
draw A--B--C--cycle;`;
    const scene = parseFigure(src);
    const prim = scene.shapes.filter((s) => s.layer === "primitive");
    expect(prim.length).toBeGreaterThanOrEqual(1);
    const closed = prim.find((s) => s.kind === "polyline");
    expect(closed?.kind).toBe("polyline");
    if (closed?.kind === "polyline") {
      expect(closed.closed).toBe(true);
      expect(closed.pts.length).toBe(3);
    }
    const emitted = emitScene(scene);
    expect(emitted).toMatch(/draw .+--cycle/);
  });

  it("parses coordinate draw path with --cycle as straight polyline", () => {
    const src = "draw (0,0)--(1,0)--(0,1)--cycle;";
    const scene = parseFigure(src);
    const pl = scene.shapes.find((s) => s.layer === "primitive" && s.kind === "polyline");
    expect(pl?.kind).toBe("polyline");
    if (pl?.kind === "polyline") {
      expect(pl.closed).toBe(true);
      expect(pl.pts.length).toBe(3);
    }
    expect(emitScene(scene)).toContain("--cycle");
  });

  it("parses indexed pair array and draw paths (tlhiv-003)", () => {
    const src = `pair A[];
A[0]:=(-1cm, -1cm);
A[1]:=( 1cm, -1cm);
A[2]:=( 1cm,  1cm);
A[3]:=(-1cm,  1cm);
draw A[0]--A[1]--A[2]--A[3]--cycle;
draw A[0]--A[2];
draw A[1]--A[3];`;
    const scene = parseFigure(src);
    const prims = scene.shapes.filter((s) => s.layer === "primitive");
    expect(prims.length).toBe(3);
    const closed = prims.find((s) => s.kind === "polyline" && s.closed);
    expect(closed).toBeTruthy();
    expect(prims.filter((s) => s.kind === "segment").length).toBe(2);
  });

  it("parses numeric d[], interpolation, and 2*(B-E) (tlhiv-204 style)", () => {
    const src = `pair A,B,C,D,E,F;
numeric d[];
u := 3cm;
A := (0,0);
B := (u,0);
D := B rotated 72;
C := (u,0) + D;
d[0] := 1;
d[1] := sqrt( 2*(1+cosd(72)) );
d[2] := sqrt( 2*(1-cosd(36)) );
E := (d1/(d0+d1)) [A,C];
F := (d0/(d0+d2)) [A,B];
A := 2*(E-E);
C := 2*(B-E);
B := 2*(F-E);
draw A--B--C--cycle;
D := (d0/(d0+d2)) [A,B];
draw C--D--B--cycle;
draw C--A--D--cycle;`;
    const scene = parseFigure(src);
    const prims = scene.shapes.filter((s) => s.layer === "primitive");
    expect(prims.length).toBeGreaterThanOrEqual(3);
    expect(unparsedDrawMacros(src)).toEqual([]);
  });

  it("tlhiv-204 user variant 2*(B-E) uses MetaPost vector semantics", () => {
    const src = `pair A,B,C,D,E,F;
numeric d[];
u := 3cm;
A := (0,0);
B := (u,0);
D := B rotated 72;
C := (u,0) + D;
d[0] := 1;
d[1] := sqrt( 2*(1+cosd(72)) );
d[2] := sqrt( 2*(1-cosd(36)) );
E := (d1/(d0+d1)) [A,C];
F := (d0/(d0+d2)) [A,B];
A := 2*(E-E);
C := 2*(B-E);
B := 2*(F-E);
draw A--B--C--cycle;
D := (d0/(d0+d2)) [A,B];
draw C--D--B--cycle;
draw C--A--D--cycle;`;
    const scene = parseFigure(src);
    const tri1 = polylines(scene)[0]!.pts;
    closePt(tri1[0]!, { x: 0, y: 0 });
    closePt(tri1[1]!, { x: -1.145898, y: -3.526712 });
    closePt(tri1[2]!, { x: 1.145898, y: -3.526712 });
  });

  it("tlhiv-204.mp canvas geometry matches MetaPost coordinates", () => {
    const scene = parseFigure(TLHIV_204);
    const pls = polylines(scene);
    expect(pls.length).toBe(4);
    expect(unparsedDrawMacros(TLHIV_204)).toEqual([]);

    const tri1 = pls[0]!.pts;
    closePt(tri1[0]!, { x: 0, y: 0 });
    closePt(tri1[1]!, { x: 3.927051, y: 2.85317 });
    closePt(tri1[2]!, { x: 0.927051, y: 2.85317 });

    const E = { x: 0.572949, y: 1.763356 };
    const F = { x: 2.427051, y: 1.763356 };
    const C = { x: 0.927051, y: 2.85317 };
    const B = { x: 3.927051, y: 2.85317 };

    const tri2 = pls[1]!.pts;
    closePt(tri2[0]!, E);
    closePt(tri2[1]!, C);
    closePt(tri2[2]!, F);

    const tri3 = pls[2]!.pts;
    closePt(tri3[0]!, B);
    closePt(tri3[1]!, C);
    closePt(tri3[2]!, F);

    const tri4 = pls[3]!.pts;
    closePt(tri4[0]!, E);
    closePt(tri4[1]!, F);
    closePt(tri4[2]!, { x: 0, y: 0 });
  });

  it("parses drawdot on named point", () => {
    const src = `pair A;
A:=(0,0);
drawdot A withpen pencircle scaled 4bp;`;
    const scene = parseFigure(src);
    const dot = scene.shapes.find((s) => s.layer === "primitive" && s.kind === "dot");
    expect(dot?.kind).toBe("dot");
  });

  it("parses draw VAR withpen as dot (tlhiv-004)", () => {
    const src = `pair A;
A:=(0,0);
draw A withpen pencircle scaled 4bp;`;
    const scene = parseFigure(src);
    const dot = scene.shapes.find((s) => s.layer === "primitive" && s.kind === "dot");
    expect(dot?.kind).toBe("dot");
    if (dot?.kind === "dot") {
      expect(dot.p).toEqual({ x: 0, y: 0 });
      expect(dot.style?.withpen).toMatch(/pencircle/i);
    }
    const { parsed, total } = parseCoverage(src);
    expect(parsed).toBe(total);
  });

  it("repairs macro line with withpen dashed evenly on emit", () => {
    const scene = parseFigure("draw fullcircle scaled 1u shifted (0,0);");
    scene.shapes.push({
      id: "m1",
      layer: "macro",
      raw: "draw fullcircle scaled 0.926u shifted (2.531u,1.526u) withpen pencircle dashed evenly",
      name: "draw",
    });
    expect(emitScene(scene)).toContain(
      "withpen pencircle scaled 1pt dashed evenly",
    );
  });
});

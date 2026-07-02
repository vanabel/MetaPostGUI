import type { LPoint, PrimitiveKind } from "./types";
import { fmtNum, fmtPointU } from "./units";

/** 通用测试用坐标（任意合法点，不绑定某一幅图） */
export const T = {
  o: { x: 0, y: 0 } satisfies LPoint,
  a: { x: 1, y: 0 } satisfies LPoint,
  b: { x: 2, y: 1 } satisfies LPoint,
  c: { x: 0, y: 2 } satisfies LPoint,
  d: { x: -1, y: 1 } satisfies LPoint,
};

export type DrawingRule = {
  kind: PrimitiveKind;
  tool: string;
  /** 鼠标操作说明 */
  gesture: string;
  /** MetaPost 语句形式（符号化，Z/A/B/C 为任意点，r 为半径） */
  mpForm: string;
  /** 用任意坐标生成一行可解析的 MetaPost */
  sampleLine: (pts: {
    z?: LPoint;
    a?: LPoint;
    b?: LPoint;
    c?: LPoint;
    d?: LPoint;
    r?: number;
  }) => string;
};

/** 图元工具 ↔ MetaPost 通用映射（与具体数值无关） */
export const DRAWING_RULES: DrawingRule[] = [
  {
    kind: "dot",
    tool: "点 (dot)",
    gesture: "单击一次",
    mpForm: "drawdot(Z) withpen pencircle scaled …",
    sampleLine: ({ z = T.a }) =>
      `drawdot${fmtPointU(z)} withpen pencircle scaled 1pt;`,
  },
  {
    kind: "segment",
    tool: "线段",
    gesture: "单击起点 → 单击终点",
    mpForm: "draw (A--B) scaled u",
    sampleLine: ({ a = T.a, b = T.b }) =>
      `draw (${fmtPointU(a)}--${fmtPointU(b)}) scaled u;`,
  },
  {
    kind: "arrow",
    tool: "箭头",
    gesture: "单击起点 → 单击终点",
    mpForm: "drawarrow (A--B) [scaled u]",
    sampleLine: ({ a = T.o, b = T.b }) =>
      `drawarrow (${fmtPointU(a)}--${fmtPointU(b)}) scaled u;`,
  },
  {
    kind: "circle",
    tool: "圆 (两点)",
    gesture: "圆心 → 圆周上一点定半径",
    mpForm: "draw fullcircle scaled 2r*u shifted Z",
    sampleLine: ({ z = T.a, r = 1.5 }) =>
      `draw fullcircle scaled ${fmtNum(2 * r)}u shifted ${fmtPointU(z)};`,
  },
  {
    kind: "circle3",
    tool: "三点圆",
    gesture: "依次单击圆上三点",
    mpForm: "draw (A..B..C..cycle) scaled u",
    sampleLine: ({ a = T.a, b = T.b, c = T.c }) =>
      `draw (${fmtPointU(a)}..${fmtPointU(b)}..${fmtPointU(c)}..cycle) scaled u;`,
  },
  {
    kind: "mpath",
    tool: "平滑路径",
    gesture: "多点单击；Enter 结束；Alt+拖设 dir",
    mpForm: "draw (A{dir θ}..B..C) scaled u",
    sampleLine: ({ a = T.o, b = T.a, c = T.b }) =>
      `draw (${fmtPointU(a)}{dir 0}..${fmtPointU(b)}..${fmtPointU(c)}) scaled u;`,
  },
  {
    kind: "bezier",
    tool: "controls 曲线",
    gesture: "依次点击起点、控制点1、控制点2、终点",
    mpForm: "draw (Z..controls C1 and C2..Z2) scaled u",
    sampleLine: ({ a = T.d, b = T.o, c = T.a, d = T.b }) =>
      `draw (${fmtPointU(a)}..controls ${fmtPointU(b)} and ${fmtPointU(c)}..${fmtPointU(d)}) scaled u;`,
  },
  {
    kind: "ellipse",
    tool: "椭圆",
    gesture: "中心 → 拖动定 rx、ry",
    mpForm: "draw fullcircle xscaled 2rx*u yscaled 2ry*u shifted Z",
    sampleLine: ({ z = T.o }) =>
      `draw fullcircle xscaled 4u yscaled 2u shifted ${fmtPointU(z)};`,
  },
];

export function ruleForKind(kind: PrimitiveKind): DrawingRule | undefined {
  return DRAWING_RULES.find((r) => r.kind === kind);
}

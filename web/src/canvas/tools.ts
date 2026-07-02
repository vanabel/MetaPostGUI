import type { PrimitiveKind } from "../scene/types";

export type DrawTool = PrimitiveKind | "select";

export type ToolGroupId = "circle" | "curve";

export type ToolRailEntry = DrawTool | { group: ToolGroupId };

export const TOOL_LABELS: Record<DrawTool, string> = {
  select: "选择",
  dot: "点",
  point: "实心点",
  segment: "线段",
  polyline: "折线",
  mpath: "平滑路径",
  bezier: "controls 曲线",
  circle: "圆 (圆心+半径)",
  circle3: "三点圆",
  ellipse: "椭圆",
  rect: "矩形",
  arrow: "箭头",
};

export const TOOL_ICONS: Record<DrawTool, string> = {
  select: "↖",
  dot: "•",
  point: "◉",
  segment: "╱",
  polyline: "⌇",
  mpath: "⌇",
  bezier: "∿",
  circle: "○",
  circle3: "◎",
  ellipse: "⬭",
  rect: "▢",
  arrow: "→",
};

export const TOOL_HINTS: Record<DrawTool, string> = {
  select: "选中后拖图元移动；拖绿色控制点改形状；Delete 删除；Esc 回到选择；⌘/Ctrl+滚轮缩放视口；双指滑动平移视口；空格+拖平移视口；⌘/Ctrl+0 适应",
  dot: "单击 → drawdot(Z)",
  point: "单击 → filldraw 小圆点",
  segment: "两点 → draw (A--B) scaled u",
  polyline: "多点 -- 连接，Enter 或双击结束",
  mpath: "多点 .. 连接；Enter 结束；Alt+拖设 {dir 角度}",
  bezier: "四点 → draw (A..controls B and C..D) scaled u",
  circle: "圆心 → 圆周点 → fullcircle scaled 2r*u shifted Z",
  circle3: "圆上三点 → (A..B..C..cycle) scaled u",
  ellipse: "中心 → 拖动；选中后拖 rx/ry 控制点调半轴",
  rect: "一角 → 对角",
  arrow: "起点 → 终点",
};

export const TOOL_GROUPS: Record<
  ToolGroupId,
  { label: string; icon: string; tools: DrawTool[] }
> = {
  circle: {
    label: "圆",
    icon: "○",
    tools: ["circle", "circle3", "ellipse"],
  },
  curve: {
    label: "曲线",
    icon: "∿",
    tools: ["mpath", "bezier"],
  },
};

/** 左侧工具轨显示顺序（圆/曲线为分组按钮）。 */
export const TOOL_ORDER: ToolRailEntry[] = [
  "select",
  "dot",
  "segment",
  "arrow",
  { group: "circle" },
  { group: "curve" },
  "polyline",
  "rect",
];

export function isToolGroup(entry: ToolRailEntry): entry is { group: ToolGroupId } {
  return typeof entry === "object" && "group" in entry;
}

export function toolsInGroup(group: ToolGroupId): DrawTool[] {
  return TOOL_GROUPS[group].tools;
}

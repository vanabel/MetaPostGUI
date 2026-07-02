# 图元工具与 MetaPost 映射（通用规则）

本文描述 **工具操作 → MetaPost 代码** 的对应关系。坐标用符号表示，不绑定某一幅图：

| 符号 | 含义 |
|------|------|
| `Z` | 任意点（逻辑单位，导出为 `…u`） |
| `A`, `B`, `C` | 路径上的点 |
| `r`, `rx`, `ry` | 半径（逻辑单位） |

自动化测试见 `web/src/scene/drawing-spec.ts` 与 `pnpm test`（使用任意测试点，非固定示意图坐标）。

## 工具对照

| 工具 | 鼠标操作 | MetaPost 形式 |
|------|----------|----------------|
| **点 (dot)** | 单击 | `drawdot(Z) withpen pencircle scaled …` |
| **线段** | 两点 | `draw (A--B) scaled u` |
| **箭头** | 两点 | `drawarrow (A--B) [scaled u]` |
| **圆** | 圆心 → 圆周点 | `draw fullcircle scaled 2r*u shifted Z` |
| **三点圆** | 圆上连续三点 | `draw (A..B..C..cycle) scaled u` |
| **平滑路径** | 多点 `..`；属性或 Alt+拖设 `{dir °}` | `draw (A{dir 0}..B..C) scaled u` |
| **controls 曲线** | 四点（起、控1、控2、终）；**无 dir** | `draw (Z..controls C1 and C2..Z2) scaled u` |
| **椭圆** | 中心 → 拖出 rx/ry | `draw fullcircle xscaled 2rx*u yscaled 2ry*u shifted Z` |
| **折线** | 多点，Enter/双击结束 | `draw (A--B--…) scaled u` |
| **矩形** | 对角两点 | `draw …--cycle scaled u` |

## 选中后编辑

选择工具下：

1. **拖拽图元** — 整体平移  
2. **拖拽绿色控制点** — 改端点、半径、Bezier 控制柄等  
3. **Delete / Backspace** — 删除（焦点不在代码框时）  
4. **属性面板** — `withpen`、`filldraw`、`label`

Bezier 与三点圆各有 3–4 个可拖控制点；圆有圆心 + 边缘点；椭圆有中心 + rx/ry 两点。

左侧工具轨中 **圆**、**曲线** 为分组按钮：主图标为当前子工具，点击 **▾** 可在下拉中切换（圆心圆 / 三点圆 / 椭圆；平滑路径 / controls 曲线）。

## MetaPost 路径括号

带 `scaled u` 的 `draw` / `filldraw` 语句中，**整条路径**须包在一对外层括号内，再写 `scaled u`：

```metapost
draw ((A--B)) scaled u;
draw ((Z..controls C1 and C2..Z2)) scaled u;
draw ((A..B..C..cycle)) scaled u;
```

缺少外层括号时 MetaPost 会报错或语义错误。编辑器导出时会自动补全。

### `dir`（仅平滑路径 `..`）

MetaPost 在顶点后用 **`{dir θ}`** 指定离开角度（**度**，逆时针自 +x 轴）：

```metapost
draw ((-5,5){dir 0}..(-3,7.25)..(0,10)) scaled u;
```

不是 `dir (dx,dy)`。选中图元后在 **属性 → 几何** 表格中可编辑各点坐标与 **dir °**；留空表示自动平滑。`..controls` 曲线不支持 `dir`。

## 编辑画布 vs MetaPost 预览

- 编辑区对 `..controls` 曲线使用 **SVG 三次贝塞尔近似**，便于拖控制点；MetaPost 的 `..` 连接语义不同，**以 mpost 预览为准**。
- 线段、圆、箭头、矩形等与坐标直接对应的图元，两侧应基本一致。

## 代码 ↔ 画布

- 编辑 **图元** 标签页代码后，约 400ms 自动同步到画布  
- 在画布绘图会写回代码  
- 无法解析为图元的语句以 **宏占位** 保留在场景中，避免丢失

## 运行测试

```bash
cd web && pnpm test
```

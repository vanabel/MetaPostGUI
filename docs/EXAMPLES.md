# 例子目录

由 `scripts/generate-examples-doc.py` 从 `examples/manifest.json` 自动生成，请勿手工编辑。

共 **316** 条。详见 [EXAMPLES_ROADMAP.md](EXAMPLES_ROADMAP.md)。

## 精选代表 (16)

| id | 标题 | 层级 | 分类 | 代表性 |
|----|------|------|------|--------|
| `curated-grid-segment` | 基础：网格 + 线段 | 基础 | basic | 网格、单位缩放与线段的最小组合 |
| `curated-circle-arrow` | 基础：圆与箭头 | 基础 | basic | 圆和箭头是绘图入口的常用组合 |
| `tlhiv-002` | 基础：闭合三角形 cycle | 基础 | basic | 闭合折线与 cycle 的代表 |
| `tlhiv-004` | 基础：点与画笔 | 基础 | pen | 点和 withpen 标记的代表 |
| `tlhiv-014` | 基础：虚线线段 | 基础 | basic | 虚线样式代表 |
| `curated-label-position` | 基础：点标签位置 | 基础 | basic | 四向标签代表 |
| `curated-bezier` | 中等：平滑路径 | 中等 | path | 平滑路径入门代表 |
| `tlhiv-043` | 中等：端点方向约束 | 中等 | path | 端点方向向量代表 |
| `tlhiv-060` | 中等：Bezier 控制点 | 中等 | pen | Bezier controls 与辅助线代表 |
| `thruston-arrow-label-demo` | 中等：箭头标签宏 | 中等 | label | 插件宏标签代表 |
| `thruston-mark-angle-demo` | 中等：角标记宏 | 中等 | macro | 几何角标宏代表 |
| `curated-tangent-coordtwo` | 高级：坐标轴与切线构造 | 高级 | advanced | 默认坐标轴宏与圆切线构造代表 |
| `curated-line-intersection` | 高级：直线交点构造 | 高级 | advanced | 线性约束与交点计算代表 |
| `curated-path-direction` | 高级：路径取点与方向 | 高级 | advanced | 路径参数和切向量代表 |
| `curated-path-interpolation` | 高级：路径插值 | 高级 | advanced | 路径取点和线性插值代表 |
| `curated-plugin-composition` | 高级：插件标注组合 | 高级 | advanced | 插件宏组合预览代表 |

## curated (9)

| id | 标题 | tier | 分类 | 编译 |
|----|------|------|------|------|
| `curated-grid-segment` | 基础：网格 + 线段 | A | basic | pass |
| `curated-bezier` | 中等：平滑路径 | A | path | pass |
| `curated-circle-arrow` | 基础：圆与箭头 | A | basic | pass |
| `curated-tangent-coordtwo` | 高级：坐标轴与切线构造 | A | advanced | pass |
| `curated-line-intersection` | 高级：直线交点构造 | A | advanced | pass |
| `curated-path-direction` | 高级：路径取点与方向 | A | advanced | pass |
| `curated-path-interpolation` | 高级：路径插值 | A | advanced | pass |
| `curated-plugin-composition` | 高级：插件标注组合 | A | advanced | pass |
| `curated-label-position` | 基础：点标签位置 | A | basic | pass |

## thruston (2)

| id | 标题 | tier | 分类 | 编译 |
|----|------|------|------|------|
| `thruston-mark-angle-demo` | 中等：角标记宏 | B | macro | pass |
| `thruston-arrow-label-demo` | 中等：箭头标签宏 | B | label | pass |

## tlhiv (305)

| id | 标题 | tier | 分类 | 编译 |
|----|------|------|------|------|
| `tlhiv-001` | Fig 1: A--B--C; | A | basic | pass |
| `tlhiv-002` | 基础：闭合三角形 cycle | A | basic | pass |
| `tlhiv-003` | Fig 3: A[0]--A[1]--A[2]--A[3]--cycle; | A | basic | pass |
| `tlhiv-004` | 基础：点与画笔 | A | pen | pass |
| `tlhiv-005` | Fig 5: A--B--C--cycle; | B | pen | pass |
| `tlhiv-006` | Fig 6: A--B--C--D--cycle; | B | pen | pass |
| `tlhiv-007` | Fig 7: A--B--C--cycle; | A | basic | pass |
| `tlhiv-008` | Fig 8: A--B--C--cycle; | B | pen | pass |
| `tlhiv-009` | Fig 9: A--B--C--cycle; | B | pen | pass |
| `tlhiv-010` | Fig 10: A--B--C--cycle; | B | basic | pass |
| `tlhiv-011` | Fig 11: A--B; | B | basic | pass |
| `tlhiv-012` | Fig 12: A--B withpen pencircle scaled 2bp withcolor .8wh | B | pen | pass |
| `tlhiv-013` | Fig 13: A--B--C--cycle; | B | pen | pass |
| `tlhiv-014` | 基础：虚线线段 | B | basic | pass |
| `tlhiv-015` | Fig 15: (0,0)--(3cm,0) | B | basic | pass |
| `tlhiv-016` | Fig 16: (0,0)--(3cm,0) dashed dashpattern(on 1bp off 2bp | B | basic | pass |
| `tlhiv-017` | Fig 17: C--B--A; | B | pen | pass |
| `tlhiv-018` | Fig 18: C--B--A--cycle; | B | pen | pass |
| `tlhiv-019` | Fig 19: (-1.5cm,0)--(1.5cm,0); | B | pen | pass |
| `tlhiv-020` | Figure 20 | B | basic | pass |
| `tlhiv-021` | Fig 21: A--B--C--cycle; | B | basic | pass |
| `tlhiv-022` | Fig 22: A--B--C--cycle withpen pencircle scaled 2bp; | B | pen | pass |
| `tlhiv-023` | Fig 23: A--B--C--cycle withpen pencircle scaled 2bp; | B | pen | pass |
| `tlhiv-024` | Figure 24 | B | basic | pass |
| `tlhiv-025` | Fig 25: p; | B | basic | pass |
| `tlhiv-026` | Fig 26: (-1.5cm,0)--(1.5cm,0); | B | pen | pass |
| `tlhiv-027` | 基础：点标签位置 | B | label | pass |
| `tlhiv-028` | Fig 28: A withpen pencircle scaled 4bp; | B | label | pass |
| `tlhiv-029` | Figure 29 | B | label | pass |
| `tlhiv-030` | Fig 30: A--B--C--cycle; | B | label | pass |
| `tlhiv-031` | Fig 31: A--B--C--cycle; | B | label | pass |
| `tlhiv-032` | Fig 32: A--D; draw A--E; draw A--F; | B | label | pass |
| `tlhiv-033` | Fig 33: fullcircle; | A | path | pass |
| `tlhiv-034` | Fig 34: (0,0) withpen pencircle scaled 4bp; | B | pen | pass |
| `tlhiv-035` | Fig 35: (0,0) withpen pencircle scaled 4bp; | B | pen | pass |
| `tlhiv-036` | Fig 36: A--B--C--cycle; | B | path | pass |
| `tlhiv-037` | Fig 37: (0,0) .. (0,1cm) .. (1cm,0) .. (1cm,1cm); | B | pen | pass |
| `tlhiv-038` | Fig 38: (0,0) -- (0,1cm) .. (1cm,0) .. (1cm,1cm); | A | path | pass |
| `tlhiv-039` | Fig 39: (0,0) --- (0,1cm) .. (1cm,0) .. (1cm,1cm); | A | path | pass |
| `tlhiv-040` | Fig 40: (0,0) .. (0,1cm) .. (1cm,0) .. (1cm,1cm) | A | path | pass |
| `tlhiv-041` | Fig 41: A..B..C..D..cycle; | A | path | pass |
| `tlhiv-042` | Fig 42: (0,0) .. (1cm,1cm) .. cycle; | A | path | pass |
| `tlhiv-043` | 中等：端点方向约束 | A | path | pass |
| `tlhiv-044` | Fig 44: (0,0){dir 90} .. (2cm,0){dir 0}; | C | path | pass |
| `tlhiv-045` | Fig 45: (0,0){up} .. (2cm,0){right}; | C | path | pass |
| `tlhiv-046` | Fig 46: (0,0){up} .. (2cm,0){up}; | C | path | pass |
| `tlhiv-047` | Fig 47: (0,0){up} .. (2cm,0){up} .. cycle; | C | path | pass |
| `tlhiv-048` | Fig 48: (0,0) -- 2cm*dir 0; | C | path | pass |
| `tlhiv-049` | Fig 49: (0,0) -- 2cm*dir 0; | C | path | pass |
| `tlhiv-050` | Fig 50: (O + d*unitvector(A-O)) | C | macro | pass |
| `tlhiv-051` | Fig 51: p withpen pencircle scaled 1bp; | C | pen | pass |
| `tlhiv-052` | Fig 52: p withpen pencircle scaled 1bp; | C | pen | pass |
| `tlhiv-053` | Fig 53: p withpen pencircle scaled 1bp; | C | pen | pass |
| `tlhiv-054` | Fig 54: A withpen pencircle scaled 4bp; | C | pen | pass |
| `tlhiv-055` | Fig 55: (0,0) .. (1cm,1cm) .. (2cm,0); | A | path | pass |
| `tlhiv-056` | Fig 56: (0,0) .. tension 2 .. | C | path | pass |
| `tlhiv-057` | Fig 57: (0,u)         {right}    .. | C | path | pass |
| `tlhiv-058` | Fig 58: (0,u)         {right}    .. tension 2 .. | C | path | pass |
| `tlhiv-059` | Fig 59: (0,u)         {right}    .. tension 4 .. | C | path | pass |
| `tlhiv-060` | 中等：Bezier 控制点 | B | pen | pass |
| `tlhiv-061` | Fig 61: A withpen pencircle scaled 4bp; | B | pen | pass |
| `tlhiv-062` | Fig 62: a[1234] withpen pencircle scaled 2bp; | C | macro | pass |
| `tlhiv-063` | Fig 63: (0,0){up} .. (1cm, 1mm) .. (2cm,0){down}; | C | path | pass |
| `tlhiv-064` | Fig 64: (0,0){up} ... (1cm, 1mm) ... (2cm,0){down}; | C | path | pass |
| `tlhiv-065` | Fig 65: (0,0){curl 0} .. (0,1cm)..(1cm,0)..(1cm,1cm); | A | path | pass |
| `tlhiv-066` | Fig 66: (0,0){curl 1} .. (0,1cm)..(1cm,0)..(1cm,1cm); | A | path | pass |
| `tlhiv-067` | Fig 67: (0,0){curl 2} .. (0,1cm)..(1cm,0)..(1cm,1cm); | A | path | pass |
| `tlhiv-068` | Fig 68: A--B--C--D--cycle withpen pencircle scaled 2bp; | B | pen | pass |
| `tlhiv-069` | Fig 69: A--B; | B | pen | pass |
| `tlhiv-070` | Fig 70: A--B; | B | pen | pass |
| `tlhiv-071` | Fig 71: A--B--C--cycle; | B | pen | pass |
| `tlhiv-072` | Fig 72: p; | A | path | pass |
| `tlhiv-073` | Fig 73: p; | C | path | pass |
| `tlhiv-074` | Fig 74: p; | A | path | pass |
| `tlhiv-075` | Fig 75: A--B--C--D--E--cycle; | A | basic | pass |
| `tlhiv-076` | Fig 76: A--C--E--B--D--cycle; | A | basic | pass |
| `tlhiv-077` | Fig 77: A--C--E--B--D--cycle; | B | basic | pass |
| `tlhiv-078` | Fig 78: p withpen pencircle scaled 2bp; | B | pen | pass |
| `tlhiv-079` | Fig 79: p withpen pencircle scaled 1bp; | B | pen | pass |
| `tlhiv-080` | Fig 80: p withpen pencircle scaled 1bp; | C | label | pass |
| … | 另有 225 条 | | | |


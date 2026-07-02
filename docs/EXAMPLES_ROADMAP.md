# 例子语料库与测试路线图

本文规划如何利用外部 MetaPost 例子（[tlhiv.org](http://www.tlhiv.org/MetaPost/examples/examples.html)、[thruston/metapost-examples](https://github.com/thruston/metapost-examples)）建立**例子集合**、驱动**自动化测试**、提取**插件**，并指导后续产品功能开发。

与 [EXTENDING.md](EXTENDING.md)（如何扩展 2a/2b）和 [DRAWING_TESTS.md](DRAWING_TESTS.md)（图元层契约测试）互补：本文关注**真实世界语料**与里程碑排期。

---

## 当前架构速览

MetaPostGUI 采用两层模型：

```
┌─────────────────────────────────────────────────────────┐
│  2a 图元层 — web/src/scene/parse.ts + canvas/           │
│  画布 ↔ 代码双向同步；无法识别的行 → macro 占位块        │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  2b 宏层 — mpostdef + config/plugins/*.plugin.json      │
│  server/macro_parser.py + plugin_loader.py 合并宏        │
│  编译时自动并入；画布不绘制宏几何，靠 SVG 预览           │
└─────────────────────────────────────────────────────────┘
         ↓ POST /api/compile
┌─────────────────────────────────────────────────────────┐
│  server/compiler.py — mpost → SVG                       │
└─────────────────────────────────────────────────────────┘
```

**已有测试**

| 位置 | 内容 |
|------|------|
| `web/` vitest | `parse.test.ts` 等，基于 `drawing-spec.ts` 的合成用例 |
| `server/` pytest | `test_figure_sanitize.py` 等，覆盖面较小 |

**尚未具备**：真实世界例子语料库、例子浏览器 UI、基于语料的批量编译/解析回归。

**编辑器高亮**：语法着色使用 `@codemirror/lang-cpp` 近似 MetaPost；选中图元时的**行高亮**为自定义 `cm-shapeHighlight`（`web/src/editor.ts`）。

---

## 外部例子来源

| 来源 | 规模 | 与 MetaPostGUI 的契合度 |
|------|------|-------------------------|
| [tlhiv.org 例子](http://www.tlhiv.org/MetaPost/examples/examples.html) | 约 **305** 个 `beginfig` | 纯 mpost，适合**编译回归**；多用 `cm`/`bp`，非 `scaled u`；部分图内含局部 `def`/`vardef` |
| [thruston/metapost-examples](https://github.com/thruston/metapost-examples) | 若干独立 `.mp` 工具宏 + 大型 `luamplib` 文档 | **独立 `.mp` 宏**（`arrow_label`、`markle`、`thatch` 等）适合做成**插件**；`pww-1.tex` / `cosmos.tex` 等需 LuaLaTeX，**不宜直接纳入 GUI 例子库** |

### 许可与出处

- thruston 仓库为 **GPL-3.0**；tlhiv 页面需保留出处。
- 在 `examples/ATTRIBUTION.md` 集中记录来源、作者、许可及链接。
- 从 thruston 提取的插件须在 `description` 与 `ATTRIBUTION.md` 中注明。

### 不纳入内置例子库的范围

以下仅作 README / 文档中的**外部参考链接**，不做 import：

- thruston 的 `pww-1.tex`、`pww-2.tex`、`cosmos.tex`、`excursions.tex`（`luamplib` + LuaLaTeX 工作流）
- 依赖外部字体包（如 TeX Gyre Pagella）且无法在无 LaTeX 环境下编译的整本文档

---

## 阶段 0：例子语料基础设施

**目标**：把散落例子变成可机器读取、可 CI 跑的语料。

**工期参考**：1–2 天

### 目录结构（规划）

```
examples/
├── manifest.schema.json      # 例子元数据 JSON Schema
├── manifest.json             # 主清单（或按分类拆成多个）
├── ATTRIBUTION.md
├── tlhiv/                    # 从 HTML 抽取的 figure 正文
│   ├── 001-triangle.mp
│   └── ...
├── thruston/                 # 工具宏源文件（submodule 或 scripts/vendor）
│   ├── arrow_label.mp
│   └── ...
├── curated/                  # 手工精选、已适配 MetaPostGUI 的
│   └── grid-with-labels.mp
└── reports/                  # 测试报告输出（git 可忽略或仅保留 latest）
    ├── compile-latest.json
    └── parse-coverage.json
```

### 清单字段（`manifest.json` 每条）

```json
{
  "id": "tlhiv-001",
  "title": "基本三角形",
  "source": "tlhiv",
  "source_url": "http://www.tlhiv.org/MetaPost/examples/examples.html",
  "category": "basic",
  "figure": "pair A,B,C; A:=(0,0); ...",
  "mpostdef": "",
  "mposttex": "",
  "plugins": [],
  "tags": ["draw", "cycle"],
  "tier": "A",
  "features": [],
  "expect": {
    "compile": "pass",
    "parse_coverage_min": 0.0,
    "canvas_sync": "optional"
  }
}
```

| 字段 | 说明 |
|------|------|
| `category` | `basic` \| `path` \| `pen` \| `label` \| `macro` \| `advanced` |
| `tier` | 难度/自动化分级，见下文 |
| `features` | 可选：`btex`、`for-loop`、`graph`、`inline-def` 等，用于 UI 提示 |
| `expect.compile` | `pass` \| `skip` \| `fail`（已知暂不支持） |
| `expect.canvas_sync` | `required` \| `optional` \| `none` |

### 分级 `tier`

| 级别 | 条件 | 测试策略 |
|------|------|----------|
| **A** | 无内联宏、无 `input`、无 `TEX()`/`graph` | 编译 + 解析覆盖率 |
| **B** | 含 `withpen`/`withcolor`/`label` 等修饰 | 编译 + 解析覆盖率（记录未解析行） |
| **C** | 含 `def`/`for`/`graph`/外部文件等 | 仅编译或标记为参考，不强制画布同步 |

### 交付物

1. **`scripts/import-tlhiv-examples.py`** — 解析 tlhiv HTML（`---` 分隔的 `beginfig` 块），抽出 figure 正文（去掉 `beginfig`/`endfig`），写入 `examples/tlhiv/*.mp` 并生成 manifest。
2. **`scripts/vendor-thruston-macros.sh`** — 仅拉取独立 `.mp` 工具文件，不拉整份 TeX 文档。
3. **`examples/manifest.schema.json`** — 供脚本与 CI 校验清单格式。

---

## 阶段 1：建立例子集合

**目标**：可用的、有分类的示例库，而非一次性导入全部 305 个。

**工期参考**：2–3 天

### 首批语料（建议数量）

| 批次 | 内容 | 数量 |
|------|------|------|
| 内置精选 | 对齐现有 2a 图元（点、线、圆、Bezier、箭头） | 15–20 |
| tlhiv A 级 | 基础几何、pen、箭头 | 30–50 |
| tlhiv B 级 | label、颜色、dashed | 20–30 |
| thruston 宏演示 | 每个工具宏 1 个最小 figure | 6–8 |

### 单位与约定

tlhiv 例子多用 `1cm`，MetaPostGUI 画布默认 `u=10pt` + `scaled u`。

| 策略 | 用途 |
|------|------|
| **原样保留** + `mpostdef` 设 `u:=1cm` 或留空 | 编译回归测试 |
| **`curated/` 手工改写**为 `scaled u` | 画布双向同步演示、往返测试 |

第一阶段**不要**强求自动把 `cm` 转为 `u`。

### 与 UI 的衔接

manifest 预留 `title`、`category`、`description`，供后续侧边栏「例子库」直接读取 JSON，本阶段可不实现 UI。

---

## 阶段 2：基于语料的自动化测试

**目标**：用例子驱动编译、解析回归，补充手写 `drawing-spec` 测试。

**工期参考**：3–5 天

### 2.1 服务端：编译回归（优先级最高）

新增 `server/test_examples_compile.py`：

- 遍历 manifest 中 `tier` 为 A/B 且 `expect.compile == "pass"` 的条目
- 调用 `compile_figure(figure, mpostdef, …)`，断言 `ok` 且 SVG 非空
- 输出 `examples/reports/compile-latest.json`（id、状态、日志摘要）

**不做 SVG 像素快照**（跨平台 mpost 输出可能略有差异）。

建议入口：

```bash
./scripts/test-examples.sh    # 仅例子编译
./scripts/test-all.sh         # pnpm test + pytest + examples（规划）
```

### 2.2 前端：解析覆盖率测试

新增 `web/src/scene/examples-corpus.test.ts`：

- 对语料调用 `parseCoverage(figure)`
- 生成 `examples/reports/parse-coverage.json`：`id`、`ratio`、`unparsed_lines[]`、`macro_blocks[]`
- 用于**排序 parser 改进优先级**（高频未解析模式优先）

对 `expect.canvas_sync === "required"` 的 curated 例子，增加 **emit → parse 往返**测试（primitive 数量与关键坐标，带容差）。

### 2.3 「高亮」测试范围

| 类型 | 现状 | 本阶段可测性 |
|------|------|----------------|
| CodeMirror 语法高亮 | `lang-cpp` 近似 | 不做快照；见阶段 5 专用语法 |
| 选中图元 → 代码行高亮 | `setEditorLineHighlights` | 可测 `shape.sourceLines` 与行号映射 |

阶段 2 重点测**行高亮映射**；语法高亮放到阶段 5。

### 2.4 与现有测试的关系

- **`drawing-spec.ts`**：继续保证「工具操作 ↔ MetaPost 形式」的精确契约（`pnpm test`）。
- **语料库测试**：保证真实代码能编译、能量化解析覆盖率。
- 二者互补，不互相替代。

---

## 阶段 3：从例子提取插件

**目标**：把重复出现的宏变成 `config/plugins/`，而非全部塞进 `default-mpostdef.tex`。

**工期参考**：3–4 天

### 3.1 thruston 工具宏 → 插件

| 源文件 | 建议插件 id | 用途 |
|--------|-------------|------|
| `arrow_label.mp` | `arrow-label` | 双向箭头 + 中间标签 |
| `mark_equal.mp` | `mark-equal` | 等长标记 |
| `markle.mp` | `mark-angle` | 角标记 |
| `isometric_projection.mp` | `isometric` | 简单 3D 投影 |
| `thatch.mp` | `thatch` | 剖面线填充 |
| `paintball.mp` | `paintball` | 半透明圆点 |

每个插件：

- 一个 `*.plugin.json` + 同目录 `.mp`（`input` 字段）
- 配置 `tool.name` 与 `tool.defaults`
- 在 `examples/curated/` 放 1 个最小调用示例
- 编译测试中声明 `plugins: ["arrow-label"]` 等

插件格式见 [EXTENDING.md](EXTENDING.md#方式一插件目录推荐一文件一插件)。

### 3.2 从 tlhiv 挖掘高频局部宏

**`scripts/analyze-macros.py`**（规划）：

- 扫描 manifest 中的 `def`/`vardef`
- 统计出现次数与参数形态
- 输出 `examples/reports/macro-candidates.json`

人工审核后，将可复用模式提升为插件。若与现有 `btex/etex` / mposttex 流程冲突，可仅作编译侧插件，不进宏面板。

### 3.3 与默认宏套件的关系

`drawgrid`、`coordtwo` 已在 `config/default-mpostdef.tex`。

**建议**：新例子驱动的宏放入 `config/plugins/`；默认 mpostdef **暂不大改**，减少破坏性变更。日后可选将 `drawgrid` 等迁为内置插件。

---

## 阶段 4：产品化用法

**目标**：例子库进入日常使用与教学场景。

**工期参考**：4–6 天（可与阶段 2/3 并行）

### 4.1 例子浏览器 UI

侧边栏新标签「例子」：

- 按 `category` / `tier` 筛选
- 点击加载 → 填入 figure 编辑器，并按需设置 mpostdef / 启用 plugins
- 显示 parse coverage 与编译状态（调用 `/api/compile`）

### 4.2 「从例子学习」工作流

- 标注哪些行属于 2a 图元、哪些属于 2b 宏
- 「在画布中打开」仅对 `expect.canvas_sync === "required"` 的例子启用

### 4.3 文档与导出

- **`scripts/generate-examples-doc.py`** → `docs/EXAMPLES.md`（从 manifest 生成，避免手写重复）
- 与 mathBook / mpostinl：例子可导出为 `mpostfig` 片段模板

### 4.4 插件列表增强

- 设置页展示已加载插件（API 响应已有 `plugins[]`）
- 加载例子时，根据 manifest 的 `plugins` 字段提示或自动启用依赖

---

## 阶段 5：由语料驱动的功能改进（持续）

根据 `parse-coverage.json` 与编译失败日志排优先级：

| 优先级 | 改进项 | 触发信号 |
|--------|--------|----------|
| P0 | `withcolor` / `dashed` 独立属性字段 | 大量 B 级例子 parse 为 macro |
| P1 | `label` / `btex` 解析与属性面板 | tlhiv label 类例子 |
| P1 | `input` 路径解析（见 README 路线图） | thruston 式宏、MetaPost-Script snippets |
| P2 | 专用 MetaPost CodeMirror 语法 | 体验优化，非阻塞 |
| P2 | `pair` 数组 `A[i]:=` 的画布支持 | tlhiv 早期例子常见 |

---

## 里程碑与实施顺序

```
M0  基础设施     import 脚本 + manifest + ~20 个精选例子
M1  编译回归     server 批量测试 + compile-latest.json（tlhiv A 级 30+）
M2  解析度量     parse-coverage 报告 + 前 5 个 parser 修复
M3  插件包 v1    6 个 thruston 宏插件 + 演示例子
M4  例子 UI      侧边栏浏览与加载
M5  画布扩展     按 coverage 报告迭代 2a 解析器
M6  文档/CI      test-all.sh + EXAMPLES.md 自动生成
```

每个里程碑可单独 PR，便于按序实现。

### 建议的第一步（M0）

1. 创建 `examples/` 目录与 `manifest.schema.json`
2. 实现 `scripts/import-tlhiv-examples.py`，从 tlhiv HTML 抽出前 30 个 `beginfig`
3. 实现 `server/test_examples_compile.py`，先跑 10 个 A 级例子
4. 从 thruston 复制 `markle.mp`，做下一个真实插件（在 `hello-dot` / `axis-tick` 之后）

---

## 其他建议用法

1. **兼容性矩阵** — manifest 的 `features` 字段驱动 UI 文案：「此例需完整 mpost，画布仅预览代码」。
2. **失败例子即 issue 模板** — 编译失败时附上 `log` 片段，便于提 parser / compiler bug。
3. **性能基准** — 对 50 个 A 级例子统计编译总时长，防止回归变慢。
4. **语料与合成测试分工** — `drawing-spec` = 契约；语料库 = 真实代码分布与长尾语法。

---

## 相关文件（规划与现有）

| 路径 | 状态 | 作用 |
|------|------|------|
| `docs/EXTENDING.md` | 已有 | 2a/2b 扩展与插件格式 |
| `docs/DRAWING_TESTS.md` | 已有 | 图元映射与 `pnpm test` |
| `docs/EXAMPLES_ROADMAP.md` | 本文 | 例子库与里程碑 |
| `docs/EXAMPLES.md` | 规划 | 由 manifest 自动生成的例子目录 |
| `examples/manifest.json` | 规划 | 语料主清单 |
| `config/plugins/` | 已有 | 内置插件 |
| `web/src/scene/parse.ts` | 已有 | 2a 解析器 |
| `server/compiler.py` | 已有 | mpost 编译 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-06-22 | 初稿：语料库、测试、插件与 UI 路线图 |
| 2026-06-22 | M0–M6 首版实现，见 [EXAMPLES_PROGRESS.md](EXAMPLES_PROGRESS.md) |

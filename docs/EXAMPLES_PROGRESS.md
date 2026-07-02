# 例子库开发进度

跟踪 [EXAMPLES_ROADMAP.md](EXAMPLES_ROADMAP.md) 里程碑实现状态。最后更新：**2026-06-22**。

## 里程碑总览

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| **M0** 基础设施 | ✅ 完成 | `examples/`、`manifest.schema.json`、`import-tlhiv-examples.py`、`vendor-thruston-macros.sh`、`ATTRIBUTION.md` |
| **M1** 编译回归 | ✅ 完成 | `server/test_examples_compile.py`、`scripts/test-examples.sh`；tier **A** 32/32 通过 |
| **M2** 解析度量 | ✅ 完成 | `web/src/scene/examples-corpus.test.ts` → `examples/reports/parse-coverage.json` |
| **M3** 插件包 v1 | ✅ 完成 | 6 个 thruston 插件 + 2 个演示例子 |
| **M4** 例子 UI | ✅ 完成 | 侧边栏「例子」、`GET /api/examples`、`web/src/examples/panel.ts` |
| **M5** 画布扩展 | 🔶 部分 | `:=` 点赋值、命名点路径、`drawdot` 命名点；`withcolor`/label 等待办 |
| **M6** 文档/CI | ✅ 完成 | `scripts/test-all.sh`、`generate-examples-doc.py`、`analyze-macros.py`、`docs/EXAMPLES.md` |

## 语料统计（当前）

| 来源 | 数量 | tier A | tier B | tier C |
|------|------|--------|--------|--------|
| tlhiv | 305 | 32 | 67 | 211 |
| curated | 3 | 3 | — | — |
| thruston 演示 | 2 | — | 2 | — |
| **合计** | **310** | **35** | **69** | **211** |

编译测试策略：pytest **强制** tier A 全部通过；tier A+B 写入 `examples/reports/compile-latest.json`（B 级含 `btex`/复杂修饰，允许部分失败）。

## 已交付文件

```
examples/
├── manifest.json
├── manifest.schema.json
├── ATTRIBUTION.md
├── tlhiv/*.mp          # 305 个
├── curated/*.mp
├── thruston/*.mp       # vendored 宏源
└── reports/            # 测试报告（*.json 可本地生成）

config/plugins/
├── arrow-label.plugin.json + arrow_label.mp
├── mark-equal.plugin.json + mark_equal.mp
├── mark-angle.plugin.json + markle.mp
├── isometric.plugin.json + isometric_projection.mp
├── thatch.plugin.json + thatch.mp
└── paintball.plugin.json + paintball.mp

scripts/
├── import-tlhiv-examples.py
├── vendor-thruston-macros.sh
├── test-examples.sh
├── test-all.sh
├── generate-examples-doc.py
└── analyze-macros.py
```

## 如何运行

```bash
# 重新导入 tlhiv（需本地保存的 examples.html）
python3 scripts/import-tlhiv-examples.py /path/to/examples.html

# 拉取 thruston 宏
./scripts/vendor-thruston-macros.sh

# 例子编译回归（需 mpost）
./scripts/test-examples.sh

# 全部测试 + 报告
chmod +x scripts/test-all.sh
./scripts/test-all.sh

# 更新 EXAMPLES.md 与 macro 候选报告
python3 scripts/generate-examples-doc.py
python3 scripts/analyze-macros.py
```

## 已知限制与后续

1. **tier 启发式**：部分依赖外部宏（`drawboxed` 等）已标为 C；`u` 作坐标未定义者标为 C。
2. **插件自动并入**：编译时 `config/plugins/` 下全部启用插件都会并入，与单例子 `plugins[]` 字段独立。
3. **M5 待办**：`withcolor`/`dashed` 独立字段、`label`/`btex` 属性面板、更多 tlhiv 路径语法。
4. **HTML 源文件**：默认读取 Cursor uploads 或 `examples/source/tlhiv-examples.html`；建议将 [tlhiv 页面](http://www.tlhiv.org/MetaPost/examples/examples.html) 另存为后者以便 CI。

## 修订记录

| 日期 | 内容 |
|------|------|
| 2026-06-22 | 初版：M0–M6 首版落地，310 条语料，6 插件，例子 UI |

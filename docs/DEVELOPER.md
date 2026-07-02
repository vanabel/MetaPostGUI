# 开发者指南

## 环境

与 [README](../README.md) 相同：Python 3.10+、Node 18+、pnpm、TeX Live（含 `mpost`）。

```bash
./scripts/setup.sh
cp .env.example .env    # 可选
./scripts/dev.sh
```

配置项见 [CONFIGURATION.md](CONFIGURATION.md)。

## 仓库结构

```
MetaPostGUI/
├── web/src/
│   ├── scene/          # parse.ts / emit.ts — 图元 ↔ MetaPost
│   ├── canvas/         # 画布交互
│   ├── macros/         # 宏面板与注册
│   └── examples/       # 例子浏览器 UI
├── server/
│   ├── main.py         # FastAPI
│   ├── compiler.py     # mpost 调用
│   ├── macro_parser.py # def/vardef + input 展开
│   └── plugin_loader.py
├── config/             # 默认宏、插件、tool-defaults
├── examples/           # manifest + tlhiv/curated/thruston
└── scripts/            # setup、dev、pm2、test-all
```

## 测试

```bash
# 前端（图元 parse/emit、例子语料覆盖率）
cd web && pnpm test

# 后端（编译消毒、例子 tier A 编译）
cd server && source .venv/bin/activate && pytest

# 例子 mpost 编译回归
./scripts/test-examples.sh

# 全部 + 生成报告
./scripts/test-all.sh
```

图元契约：`web/src/scene/drawing-spec.ts` + [DRAWING_TESTS.md](DRAWING_TESTS.md)。

例子语料：`examples/manifest.json`；覆盖率报告 `examples/reports/parse-coverage.json`。

## 扩展代码时的分工

| 改什么 | 改哪里 |
|--------|--------|
| 新图元 / 解析 `draw …` | `web/src/scene/parse.ts`、`emit.ts`、`canvas/` |
| 新宏 / 插件 | `config/plugins/` 或 mpostdef；见 [EXTENDING.md](EXTENDING.md) |
| 编译行为 | `server/compiler.py` |
| API 端点 | `server/main.py` |

## API 端点（摘要）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | mpost 是否可用 |
| GET | `/api/defaults` | 默认 mpostdef/mposttex |
| POST | `/api/compile` | 图元 → SVG |
| POST | `/api/macros` | 扫描宏与插件 |
| GET | `/api/examples` | 例子清单 |
| POST | `/api/export/mp` | 导出 .mp |
| POST | `/api/export/mpostinl` | 导出 mpostinl |
| POST | `/api/load-tex` | 读本地 .tex |

前端统一请求 `/api`（开发时 Vite 反代，生产需 Nginx 或同源 preview）。

## 发布前检查

- [ ] `cd web && pnpm build` 无错误
- [ ] `pnpm test` 与 `pytest` 通过
- [ ] `./scripts/test-examples.sh` tier A 通过（需本机 `mpost`）
- [ ] [USER_GUIDE.md](USER_GUIDE.md) / [NAS_DEPLOY.md](NAS_DEPLOY.md) 与当前脚本一致
- [ ] `.env.example` 已更新；无密钥写入仓库

## 相关文档

- [文档索引](README.md)
- [例子路线图](EXAMPLES_ROADMAP.md)
- [例子进度](EXAMPLES_PROGRESS.md)

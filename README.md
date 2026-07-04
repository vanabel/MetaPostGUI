# MetaPostGUI

纯 Web 的 MetaPost 编辑器：**画布图元** + **mpostdef 宏** + 本机 **mpost** 实时 SVG 预览。可导出 `.mp`、`mpostinl` 片段与 PNG 图形，配合 mathBook / MetaPost-Script / Quartz 等工程使用。

## 文档

| 你是… | 从这里开始 |
|--------|------------|
| **使用者** | [使用指南](docs/USER_GUIDE.md) · [快速开始](#快速开始) |
| **部署到 NAS/服务器** | [NAS 部署](docs/NAS_DEPLOY.md) · [配置说明](docs/CONFIGURATION.md) |
| **开发者** | [开发者指南](docs/DEVELOPER.md) · [扩展宏/插件](docs/EXTENDING.md) |
| **全部文档** | [docs/README.md](docs/README.md) |

## 环境要求

- **Python 3.10+** — 运行编译 API
- **Node.js 18+** 与 **pnpm** — 仅开发/构建前端时需要
- **TeX Live / MacTeX / MiKTeX** — 含 `mpost`；带 `btex`/中文标签时需 LaTeX（见 [NAS 部署](docs/NAS_DEPLOY.md)）

## 快速开始

```bash
./scripts/setup.sh

# 可选：自定义端口
cp .env.example .env

./scripts/dev.sh
```

浏览器打开 `http://localhost:5173`（或 `.env` 中的 `METAPOSTGUI_WEB_PORT`）。

编译 API 只监听本机 `127.0.0.1`，由 Vite 将 `/api` 反代；端口冲突时自动递增，见 [配置说明](docs/CONFIGURATION.md)。

### 其他启动方式

```bash
# PM2（崩溃重启、NAS 常驻）
npm install -g pm2
./scripts/pm2.sh start dev      # 开发
./scripts/pm2.sh start prod     # 生产：preview + API 反代
./scripts/pm2.sh start prod-api # 仅 API，配合 Nginx

# 分步
./scripts/serve-api.sh
cd web && pnpm dev
```

## 能做什么

- 画布绘制点、线、圆、路径等，自动写入 **scaled u** 风格图元代码
- 代码与画布双向同步；无法解析的行保留为宏占位
- **mpostdef** / **插件** 一键插入 `drawgrid`、`coordtwo` 等
- **Ctrl+R** 编译预览；导出完整 `.mp`、`mpostinl` 或 PNG 图形

使用细节见 [使用指南](docs/USER_GUIDE.md)。

## 项目结构（简）

```
config/          默认宏、插件、tool-defaults
examples/        例子语料（310 条）与 manifest
server/          FastAPI + mpost
web/             Vite + CodeMirror + 画布
scripts/         setup、dev、pm2、test-all
ecosystem.config.cjs   PM2 配置
.env.example     端口与环境变量模板
```

## 路线图（摘要）

已实现：2a 图元画布、2b 宏面板、撤销重做、属性编辑、例子语料库与回归测试、插件系统。

进行中：更多 `dashed`/`withcolor` 解析、`input` 路径增强。详情见 [例子进度](docs/EXAMPLES_PROGRESS.md)。

## 许可

MIT（宏片段可自由配合你的 `mpostinl` 项目使用）

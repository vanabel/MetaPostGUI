# 配置参考

环境变量与本地配置文件。复制模板后修改：

```bash
cp .env.example .env
```

`.env` 与运行时生成的 `.metapostgui/ports.env` 已加入 `.gitignore`。

## 端口（`.env`）

| 变量 | 默认 | 说明 |
|------|------|------|
| `METAPOSTGUI_WEB_PORT` | `5173` | 浏览器访问端口（Vite dev / preview） |
| `METAPOSTGUI_WEB_HOST` | 开发 `127.0.0.1` / PM2 prod `0.0.0.0` | 开发本机；PM2 `prod` 会把空值或本机回环改为 `0.0.0.0` 便于局域网 |
| `METAPOSTGUI_API_PORT` | `18765` | 编译 API（**仅本机**，不应对外映射） |
| `METAPOSTGUI_API_HOST` | `127.0.0.1` | 保持回环；由 Vite 或 Nginx 反代 `/api` |
| `METAPOSTGUI_PORT_TRIES` | `20` | 端口占用时向上递增尝试次数 |
| `METAPOSTGUI_CORS_ORIGINS` | （自动） | 可选，逗号分隔；未设时按 `WEB_PORT` 生成 localhost 来源 |
| `METAPOSTGUI_ALLOWED_HOSTS` | （空） | Vite preview 允许的 `Host`，用于 Cloudflare Tunnel / 反代域名，如 `mpost.vanabel.cn` |

启动时 `scripts/resolve-ports.sh` 检测占用并写入 `.metapostgui/ports.env`，保证 API 与 Vite 使用同一端口。

```bash
# 查看当前生效端口
cat .metapostgui/ports.env
```

**设计原则**：用户只访问前端 URL；`/api` 在进程内反代到 `127.0.0.1:METAPOSTGUI_API_PORT`。默认 API 端口 `18765` 用于避开常见 Node 服务占用的 `8765` 等。

Cloudflare Tunnel 或外部反代访问 Vite preview 时，如果出现 `Blocked request. This host (...) is not allowed.`，设置：

```bash
METAPOSTGUI_ALLOWED_HOSTS=mpost.vanabel.cn
```

`METAPOSTGUI_CORS_ORIGINS` 只影响 API CORS；它不是 Vite host allowlist。若需要跨域 API，建议写完整 origin，例如 `https://mpost.vanabel.cn`。

## TeX / MetaPost 路径

| 方式 | 说明 |
|------|------|
| 界面 **设置 → TeX / MetaPost** | 推荐；写入 `config/user-tex-bin.json` |
| `METAPOSTGUI_TEX_BIN` 或 `TEXBIN` | 启动 API 前的环境变量 |
| 自动搜索 | macOS `/Library/TeX/texbin`、TeX Live、`/usr/bin` 等 |

优先级：**手动配置** > 环境变量 > 自动候选 > 系统 `PATH`。

## PM2 模式

| 命令 | 暴露端口 | 适用场景 |
|------|----------|----------|
| `./scripts/pm2.sh start dev` | 本机 WEB | 开发，自动重启 |
| `./scripts/pm2.sh start prod` | 局域网 WEB | 无 Nginx 时单端口 preview + API 反代 |
| `./scripts/pm2.sh start prod-api` | 无（仅 127.0.0.1 API） | 配合 Nginx 提供 `web/dist` |

详见 [NAS_DEPLOY.md](NAS_DEPLOY.md)。

## 插件与宏默认参数

| 文件 | 作用 |
|------|------|
| `config/plugins/*.plugin.json` | 内置插件 |
| `~/.metapostgui/plugins/` | 用户全局插件 |
| `config/tool-defaults.json` | 宏插入对话框默认参数 |
| `config/default-mpostdef.tex` | 首次启动的默认宏 |
| `config/default-mposttex.tex` | 默认 LaTeX 导言（含中文） |

插件与 mpostdef 说明见 [EXTENDING.md](EXTENDING.md)。

## MetaPost-Script `input` 路径

侧栏 **宏库 → input 搜索路径** 默认为**空**；服务端会自动尝试 `MetaPostGUI` 旁的 `MetaPost-Script/snippets/`。若片段在其它位置，填写该目录的**绝对路径**。

此设置只影响 **MetaPostGUI 内**的宏扫描与编译（服务端内联展开 `input`）。在独立 LaTeX 书中使用 `input hatching` 等时，须按 [MetaPost-Script 的 `make paths` / `make install-texmf`](EXTENDING.md#方式三通过-input-引用片段库metapost-script) 部署片段，使 `mpost` 能解析路径。

## Nginx 反代示例

`proxy_pass` 端口须与 `.env` / `.metapostgui/ports.env` 中 `METAPOSTGUI_API_PORT` 一致：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:18765/api/;
}
```

完整示例见 [NAS_DEPLOY.md](NAS_DEPLOY.md)。

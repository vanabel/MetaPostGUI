# NAS 部署说明

MetaPostGUI 是 **浏览器前端 + Python 编译 API + 本机 `mpost`** 三部分协作。部署到 NAS（群晖、威联通、Unraid 等）时，需要把这三层都跑起来，并安装完整的 TeX 工具链——**仅安装 MetaPost 通常不够**。

配置端口与环境变量见 [CONFIGURATION.md](CONFIGURATION.md)。用户向操作说明见 [USER_GUIDE.md](USER_GUIDE.md)。

---

## 架构一览

```
浏览器  ──HTTP──►  静态页面（web/dist）
              └──►  /api/*  ──►  FastAPI（server/）
                                    │
                                    ▼
                              mpost -tex=latex
                                    │
                                    ▼
                              生成 SVG 预览
```

| 组件 | 作用 | NAS 上是否必需 |
|------|------|----------------|
| `web/dist` | 编辑器界面（Vite 构建后的静态文件） | 是 |
| `server/`（uvicorn + FastAPI） | 编译、宏扫描、导出、读本地 `.tex` | 是 |
| `mpost` | 真正执行 MetaPost | 是 |
| LaTeX（`latex` / `pdflatex` 等） | `mpost -tex=latex` 与 `btex…etex` 标签 | **几乎总是需要** |
| Node.js / pnpm | 仅 **构建前端** 时需要 | 构建机需要，运行时可不要 |

开发机用 `./scripts/dev.sh` 同时起 API（本机 `127.0.0.1`，默认端口 `18765`）和 Vite（默认 `5173`）。**API 不应对局域网直接暴露**；NAS 生产环境应：**只开放前端或 Nginx 入口**，API 保持 `127.0.0.1` + 反代 `/api`。

---

## MetaPost alone 够吗？

**不够。** 原因如下：

1. **编译命令固定为 LaTeX 模式**  
   服务端调用：
   ```text
   mpost -interaction=nonstopmode -tex=latex figure.mp
   ```
   这会在遇到 `btex … etex`（公式、文字标签）时走 LaTeX 排版，需要可用的 LaTeX 及相应宏包。

2. **默认 `mposttex` 依赖 LaTeX 宏包**  
   仓库内置 [`config/default-mposttex.tex`](../config/default-mposttex.tex) 包含：
   - `amsmath`, `amssymb`, `bm`, `xcolor`
   - `CJKutf8` + 中文环境 `gkai` 字体

   若 NAS 上只装 `mpost` 而不装这些包，带中文或数学公式的图会编译失败。

3. **图元里的 `label` / `dotlabel`**  
   例如 `label.top(btex $x_n$ etex, …)` 必须能跑 LaTeX。

4. **自定义宏与 `input`**  
   如图中的 `input hatching;`、`hatchfill …` 来自你自己的 `mpostdef` / snippets，不是 MetaPost 内置；NAS 上需保证 `mpost` 能通过 `input` 找到这些文件（路径在 mpostdef 或「宏 input 搜索路径」中配置）。

**结论：** 至少安装 **MetaPost + 基础 LaTeX + 你实际用到的宏包**；使用默认中文配置时，还需 **中文 LaTeX 支持**。

---

## 推荐安装的 TeX 组件

### 方案 A：TeX Live 完整安装（最省心，体积大）

适合 x86 NAS、磁盘空间充足（约 5–8 GB+）：

```bash
# Debian/Ubuntu 容器或 NAS SSH
apt-get update
apt-get install -y texlive-full
```

验证：

```bash
which mpost latex
mpost --version
latex --version
```

### 方案 B：按需安装（体积较小，需自己补包）

在 Debian/Ubuntu 上可尝试：

```bash
apt-get install -y \
  texlive-metapost \
  texlive-latex-base \
  texlive-latex-recommended \
  texlive-latex-extra \
  texlive-fonts-recommended \
  texlive-lang-chinese
```

若编译报 `! LaTeX Error: File 'xxx.sty' not found`，用 `tlmgr install xxx`（需完整 TeX Live）或安装对应的 `texlive-*` 包。

### 方案 C：macOS / Linux / Windows（自动搜索 + 手动设置）

服务启动时会 **自动搜索** 各平台常见 TeX 路径：

| 平台 | 自动搜索示例 |
|------|----------------|
| macOS | `/Library/TeX/texbin`、`/usr/local/texlive/*/bin/*`、TinyTeX |
| Linux | `/usr/local/texlive/*/bin/*`、`/opt/texlive/*/bin/*`、`/usr/bin` |
| Windows | `C:\texlive\*\bin\windows`、MiKTeX `miktex\bin\x64` |

优先级：**界面/配置文件手动路径** > 环境变量 `METAPOSTGUI_TEX_BIN`（或 `TEXBIN`）> 自动候选路径 > 系统 `PATH`。

若自动搜索失败：

1. 打开右侧 **设置** → **TeX / MetaPost**，填写含 `mpost` 的目录（如 macOS 的 `/Library/TeX/texbin`），点 **应用路径**；或  
2. 启动 API 前设置环境变量：`export METAPOSTGUI_TEX_BIN=/path/to/tex/bin`；或  
3. 在服务器上写入 `config/user-tex-bin.json`：`{"tex_bin": "/path/to/tex/bin"}`。

界面会同时检测 **latex** 是否同目录可用；仅有 `mpost` 时纯几何图可编译，带 `btex`/默认中文 `mposttex` 仍需 LaTeX。

### 与默认配置对应的最低要求（对照表）

| 能力 | 需要 |
|------|------|
| 纯 MetaPost 几何（无文字） | `mpost` |
| `btex`/`etex` 英文公式 | `mpost` + `latex` + `amsmath` 等 |
| 默认中文 `mposttex` | 上者 + `CJKutf8` + 中文字体（如 `gkai`） |
| `drawgrid` / `coordtwo`（默认 mpostdef） | `mpost`（无额外 LaTeX） |
| `input hatching` 等外部宏 | `mpost` + 宏文件在可搜索路径 |
| 插件宏（`config/plugins/`） | 仅需项目 `config`，无需额外 TeX 包 |

---

## NAS 运行时依赖（除 TeX 外）

| 软件 | 版本建议 | 说明 |
|------|----------|------|
| Python | 3.10+ | 运行 `server/` |
| pip 包 | 见 `server/requirements.txt` | `fastapi`, `uvicorn`, `python-multipart` |
| Node.js + pnpm | 18+ | **仅构建** `web/dist` 时需要 |

Python 环境（在 NAS 或 Docker 内）：

```bash
cd /path/to/MetaPostGUI
./scripts/setup-python.sh
source server/.venv/bin/activate
```

---

## 生产部署步骤（推荐）

### 0. 配置（可选）

```bash
cd /path/to/MetaPostGUI
cp .env.example .env
# 可改 METAPOSTGUI_WEB_PORT、METAPOSTGUI_API_PORT
```

### 1. 构建前端（在开发机或 NAS 上均可）

```bash
cd web
pnpm install
pnpm build
# 产出：web/dist/
```

### 2. 启动服务

**推荐：PM2**（崩溃重启、`pm2 save` + `pm2 startup` 开机自启）

```bash
npm install -g pm2
./scripts/setup.sh

# 方案 A — 单端口：仅开放前端（/api 反代到本机 API）✅ 最简单
./scripts/pm2.sh start prod
# 浏览器：http://NAS的IP:<METAPOSTGUI_WEB_PORT>

# 方案 B — Nginx 提供静态页 + 反代 API（见第 3 节）
cd web && pnpm build
./scripts/pm2.sh start prod-api
# API 仅 127.0.0.1（见 .metapostgui/ports.env）

./scripts/pm2.sh status
./scripts/pm2.sh logs api
./scripts/pm2.sh save && pm2 startup
```

TeX 不在默认 `PATH` 时，在 `~/.profile` 或 PM2 环境中设置 `METAPOSTGUI_TEX_BIN`，见 [CONFIGURATION.md](CONFIGURATION.md)。

**或仅调试 API：**

```bash
./scripts/serve-api.sh
```

API 默认 `127.0.0.1:18765`（`.env` 可改；占用时自动递增）。**勿**将 API 端口映射到公网；由 Vite preview 或 Nginx 反代 `/api`。

### 3. 健康检查（NAS 本机）

```bash
source .metapostgui/ports.env
curl "http://${METAPOSTGUI_API_HOST}:${METAPOSTGUI_API_PORT}/api/health"
# 期望：{"ok":true,"mpost":"/usr/bin/mpost",...}
```

若 `ok: false`，说明 `mpost` 未在 `PATH` 中或未在设置里配置 TeX 路径。

### 4. 用 Nginx 提供静态页面并反代 API（方案 B 配套）

同一域名下访问可避免 CORS 问题。开发时 CORS 根据 `METAPOSTGUI_WEB_PORT` 自动生成 localhost 来源。

示例（`/etc/nginx/conf.d/metapostgui.conf`）：

```nginx
server {
    listen 8080;
    server_name _;

    root /volume1/docker/MetaPostGUI/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:18765/api/;   # 与 .env 中 METAPOSTGUI_API_PORT 一致
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

浏览器访问：`http://NAS的IP:8080`

### 5. Docker（NAS 上最常用）

NAS 图形界面一般更适合用 Docker 跑一个带 TeX Live 的镜像。思路：

- 基础镜像：`debian:bookworm` 或 `texlive/texlive`
- 安装：`texlive-metapost`、`texlive-latex-base`、`texlive-lang-chinese`（或 `texlive-full`）
- 拷贝项目 → `setup-python.sh` → `pnpm build`（或多阶段构建）
- 入口：`uvicorn` + 可选内置 nginx 提供 `web/dist`

仓库暂未附带现成 `Dockerfile`；可按上面步骤自行编写 Compose，**只映射前端或 Nginx 端口**，API 保持在容器内 `127.0.0.1`。

---

## 部署后需注意的限制

### 「从路径加载」`.tex`

`/api/load-tex` 读取的是 **API 进程所在机器** 上的绝对路径，不是用户 PC 上的路径。  
NAS 部署时，只能加载 NAS 本机（或挂载卷内）的文件，例如 `/volume1/share/tex/mpost-def.tex`。

### 宏 `input` 搜索路径

界面 **宏库 → input 搜索路径** 默认可**留空**；API 会自动尝试 `MetaPost-Script/snippets/`（与 MetaPostGUI 并列或位于上级目录）。片段在其它机器或路径时，填写 NAS 上的**绝对路径**。

在 MetaPostGUI 内编译时，服务端会把 `input` 内联进 mpostdef。若把导出的 mpostinl **拿到书外单独编译**，`mpost` 仍须能找到片段：在 NAS 上并列放置 MetaPost-Script，或在 MetaPost-Script 目录执行 `make install-texmf`（见 [EXTENDING.md](EXTENDING.md)）。

### 性能与架构

- 每次编译在临时目录调用 `mpost`，复杂图 + 中文 LaTeX 可能数秒到数十秒。
- **ARM NAS**（部分群晖/威联通）：TeX Live 包较少，建议直接用 **x86 Docker** 或在外部 Linux 机器跑 API。
- 不建议把 TeX Live 装在网络极慢的 NFS 根目录上；优先本地磁盘或容器镜像内。

### 安全

- API 默认无认证，局域网内任何人可编译（消耗 CPU）。
- 若暴露到公网，务必加反向代理认证、VPN 或仅内网访问。
- `load-tex` 可读服务器任意路径，不要对不可信用户开放。

---

## 环境变量检查清单

部署完成后逐项确认：

```bash
# 1. mpost 可用
mpost --version

# 2. LaTeX 可用（使用默认 mposttex 时必需）
latex --version

# 3. 健康检查
source .metapostgui/ports.env 2>/dev/null || true
API_PORT="${METAPOSTGUI_API_PORT:-18765}"
curl -s "http://127.0.0.1:${API_PORT}/api/health" | python3 -m json.tool

# 4. 试编译（可选）
curl -s -X POST "http://127.0.0.1:${API_PORT}/api/compile" \
  -H 'Content-Type: application/json' \
  -d '{"figure":"draw ((0,0)--(1,1)) scaled u;","mpostdef":"u=10pt;","mposttex":""}'
```

在浏览器中打开应用后，点击 **编译**；若失败，查看页面底部编译日志（多为缺 LaTeX 包或 `input` 找不到文件）。

---

## 最小 vs 典型安装对比

| 场景 | 需要安装 |
|------|----------|
| 仅画线、圆，无 `btex`，mposttex 留空 | `mpost` + Python API + 静态前端 |
| 使用仓库默认配置（中文 + 公式） | **MetaPost + LaTeX + 中文包** + Python + 前端 |
| 使用 mathBook / MetaPost-Script 全套宏 | 上者 + 宏/snippet 文件部署到 NAS 可访问路径 |
| 仅内网个人使用 | 无需 Node（运行时）；构建一次 `web/dist` 即可 |

---

## 相关文档

- [文档索引](README.md)
- [README.md](../README.md) — 快速开始  
- [USER_GUIDE.md](USER_GUIDE.md) — 使用说明  
- [CONFIGURATION.md](CONFIGURATION.md) — 端口与环境变量  
- [EXTENDING.md](EXTENDING.md) — 扩展宏与插件  
- [DRAWING_TESTS.md](DRAWING_TESTS.md) — 画布与预览差异  

---

## 常见问题

**Q：只装 `apt install metapost` 可以吗？**  
A：Debian 的 `metapost` 包通常只有 `mpost` 二进制；无 LaTeX 时，带 `btex` 的图会失败。请同时安装 LaTeX 相关包。

**Q：编译成功但中文变方框？**  
A：缺中文字体或 `CJKutf8` 配置；安装 `texlive-lang-chinese`，或简化 `mposttex`（去掉 CJK，仅英文）。

**Q：NAS 上不想装 TeX，能只用前端吗？**  
A：可以打开界面、编辑代码、同步画布，但 **无法 SVG 预览/编译**，除非把 `/api` 指到另一台已装 TeX 的机器。

**Q：能否把 API 放 PC、前端放 NAS？**  
A：可以。生产环境应通过 **Nginx 反代 `/api`** 到同一域名，避免改前端代码。若必须跨域，设置 `METAPOSTGUI_CORS_ORIGINS` 并重新部署 API。见 [CONFIGURATION.md](CONFIGURATION.md)。

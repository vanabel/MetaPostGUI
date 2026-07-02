# 扩展 MetaPostGUI 工具库

> 文档索引：[docs/README.md](README.md) · 用户向说明：[USER_GUIDE.md](USER_GUIDE.md)

MetaPostGUI 把绘图能力分成两层，扩展方式不同。

语料库、批量测试与从外部例子提取插件的路线图见 [EXAMPLES_ROADMAP.md](EXAMPLES_ROADMAP.md)。

## 架构分层

```
┌─────────────────────────────────────────────────────────┐
│  2a 图元层（内置）                                        │
│  点、线、折线、Bezier、圆、矩形、箭头 …                     │
│  → 在画布上交互绘制，生成 draw / drawarrow … scaled u     │
│  → 扩展：需改前端 canvas/ 代码（不读 mpostdef）            │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  2b 宏工具层（可配置）                                    │
│  mpostdef 里的 def / vardef + 插件目录 *.plugin.json      │
│  → 宏面板按钮，插入 drawgrid(5); 等调用                   │
│  → 扩展：mpostdef / snippets / tool-defaults / 插件       │
└─────────────────────────────────────────────────────────┘
```

**单一事实来源（宏层）**：编译与宏扫描使用同一份宏正文。面板通过 `POST /api/macros` 解析；编译与导出 `.mp` 时会自动并入已启用插件的宏定义。

---

## 方式一：插件目录（推荐，一文件一插件）

### 目录位置（按加载顺序）

| 路径 | 说明 |
|------|------|
| `MetaPostGUI/config/plugins/` | 项目内置插件（可提交到 git） |
| `~/.metapostgui/plugins/` | 用户全局插件 |
| 设置 → **插件目录** | 界面填写的额外目录（绝对路径） |

每个插件 **一个** `*.plugin.json` 文件。文件名可任意，以 `id` 字段为准去重。

### 插件清单格式（v1）

```json
{
  "id": "hello-dot",
  "title": "原点标记",
  "description": "在 origin 画一个小圆点",
  "version": "1.0.0",
  "author": "你的名字",
  "enabled": true,
  "macros": "def hellodot() =\n  drawdot(origin) scaled u;\nenddef;",
  "tool": {
    "name": "hellodot",
    "description": "在原点绘制一个小圆点",
    "defaults": {}
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 小写字母开头，`a-z0-9_-`，全局唯一 |
| `macros` | 二选一 | 内联 MetaPost 宏正文（`def` / `vardef`） |
| `input` | 二选一 | 同目录下的 `.mp` 相对路径 |
| `tool.name` | 推荐 | 宏面板对应宏名 |
| `tool.description` | 可选 | 宏用途说明，显示在插入对话框与插件源码预览 |
| `tool.paramDocs` | 可选 | 各参数说明，键为参数名、值为中文/英文描述 |
| `tool.params` | 可选 | 与 `paramDocs` 等效：`[{ "name": "A", "description": "起点" }]` |
| `tool.defaults` | 可选 | 插入对话框默认参数（覆盖 `tool-defaults.json` 同名项） |
| `enabled` | 可选 | 默认 `true`；`false` 时跳过 |

### 规范与约定

1. **一文件一插件**：只放一个 `id`，可含多个 `def`，但 `tool` 只登记主宏一个（其余宏可被主宏内部调用）。
2. **宏正文**：纯 MetaPost，不要包 `\begin{mpostdef}`；`%` 注释会在加载时剥掉。
3. **不要**在插件里写 `beginfig` / `endfig`；图元代码仍在 figure 编辑器。
4. **长宏用 `input`**：清单只写元数据，正文放同目录 `xxx.mp`：

```json
{
  "id": "axis-tick",
  "title": "带标签横轴",
  "input": "axis-tick.mp",
  "tool": {
    "name": "drawAxisTick",
    "description": "绘制带箭头的横轴线段，并在末端标注文字",
    "paramDocs": {
      "len": "轴线长度（与 u 相乘后绘制）",
      "lab": "末端标签文字（btex … etex）"
    },
    "defaults": { "len": "3", "lab": "btex $x$ etex" }
  }
}
```

5. **与画布关系**：宏调用插入 figure 代码；画布不绘制宏几何（与 `drawgrid` 相同），靠 **编译预览** 查看效果。
6. **禁用插件**：`"enabled": false` 或移出插件目录。

### 内置示例

| 文件 | 说明 |
|------|------|
| `config/plugins/hello-dot.plugin.json` | 最小内联 `macros` 示例 |
| `config/plugins/axis-tick.plugin.json` + `axis-tick.mp` | `input` 引用外部 `.mp` |

复制示例到 `~/.metapostgui/plugins/` 即可试验。启动 `./scripts/dev.sh` 后，宏面板应显示 `hellodot`、`drawAxisTick` 等按钮；编译时插件宏会自动并入，无需手写进 mpostdef。

### 自定义插件目录

侧边栏 **设置 → 插件目录** 填写路径，例如：

```
/Users/you/metapost-plugins
```

目录内每个 `*.plugin.json` 独立加载。修改后切换 mpostdef 标签或改路径即会重新扫描。

---

## 方式二：在 mpostdef 中直接写宏

在 **mpostdef** 编辑器（或 `config/default-mpostdef.tex`）里写 MetaPost 定义：

```metapost
def drawgrid(expr len) = ... enddef;
vardef coordtwo(expr O, len, dr, dimension) = ... enddef;
```

保存后宏面板会自动出现对应按钮。支持整段 `\begin{mpostdef}...\end{mpostdef}`、纯 MetaPost 正文、行尾 `%` 注释。

---

## 方式三：通过 `input` 引用片段库（MetaPost-Script）

```metapost
input ../snippets/all;
```

### 界面「input 搜索路径」

| 项目 | 说明 |
|------|------|
| **默认** | **留空**（不再预填本机路径） |
| **留空时服务端自动尝试** | `config/`、`config/plugins/`、项目根、`MetaPostGUI/MetaPost-Script/snippets/`、`../MetaPost-Script/snippets/` |
| **填写后** | 在以上路径之外，**追加**你指定的目录（如 `/path/to/MetaPost-Script/snippets`） |
| **作用范围** | 宏面板扫描、**编译预览**、**.mp / mpostinl 导出** — 服务端会把 `input` **内联展开**进 mpostdef（与插件宏并入类似） |

需要本地 API（`./scripts/dev.sh`）才能展开 `input`。

### 独立 TeX / mpost 工程（mathBook、mpostinl 书稿）

在 MetaPostGUI **之外**用 `latex` + `mpost` 编译时，`mpost` 按**生成 `.mp` 所在目录**查找 `input`，**不会**读取本应用的搜索路径。须任选其一：

**方式 A — 并列放置（MetaPost-Script 推荐）**

```
my-paper/
├── MetaPost-Script/     ← 克隆本仓库
│   └── snippets/
└── main.tex
```

导言区 `\input{MetaPost-Script/tex/mpost-lib.tex}`；mpostdef 常用 `input ../snippets/all;`（`.tex` 在子目录时）或 `input snippets/all;`（与仓库并列时）。详见 MetaPost-Script 仓库：

```bash
cd MetaPost-Script && make paths    # 打印路径说明
cd MetaPost-Script && make usage    # mpostfig 与 input 写法
```

**方式 B — TEXMF 本地安装**

```bash
cd MetaPost-Script && make install-texmf
```

安装到 `$TEXMFHOME/metapost/metapost-script/`，mpostdef 改用 `input metapost-script/all;`，导言区 `\input{metapost-script/mpost-lib.tex}`。卸载：`make uninstall-texmf`。

**方式 C — 仅粘贴图段**

从 MetaPostGUI 复制 **mpostfig** 段到已有书中时，确保书的 `mpostdef` 已按 A 或 B 配置好片段路径。

---

## 方式四：配置默认参数 `config/tool-defaults.json`

宏的 **签名** 来自 mpostdef / 插件；**插入时的默认值** 优先级：

```
插件 tool.defaults  >  tool-defaults.json  >  空
```

```json
{
  "drawgrid": { "len": "5" },
  "coordtwo": { "O": "origin", "len": "3", "dr": "0", "dimension": "0" }
}
```

---

## 方式五：从磁盘加载 mpostinl 文件

「从路径加载」会解析 `mpost-def.tex` / `mpost-tex.tex` 填入对应编辑器。

---

## 特殊宏：`drawfun`

双括号形式 `drawfun(-3, 3, 0.1)(x*x);` 已在解析器中专门处理；其它 `(text …)` 第二括号宏需在 `server/macro_parser.py` 与 `web/src/macros/registry.ts` 中扩展。

---

## API

### 扫描宏与插件

```http
POST /api/macros
Content-Type: application/json

{
  "mpostdef": "u=10pt;",
  "resolve_inputs": true,
  "search_paths": ["/path/to/snippets"],
  "plugin_paths": ["/path/to/my-plugins"]
}
```

响应含 `tools[]`、`plugins[]`（已加载插件元数据）、`source_expanded`。

### 编译（自动并入插件宏）

```http
POST /api/compile
{
  "figure": "drawgrid(5);",
  "mpostdef": "u=10pt;",
  "mposttex": "",
  "plugin_paths": []
}
```

---

## 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| 宏面板为空 | mpostdef 为空且无插件 | 加载默认、添加插件或写 mpostdef |
| 插件宏不出现 | `enabled: false` 或 JSON 无效 | 检查 `id`、`macros`/`input` |
| 编译报 undefined | 未启动 API，插件未并入 | 运行 `./scripts/dev.sh` |
| 插入无默认参数 | 未写 `tool.defaults` | 在插件或 `tool-defaults.json` 中补充 |
| 新宏无按钮 | 非 `def`/`vardef` 形态 | 检查宏名与 `tool.name` 一致 |

## 不推荐的做法

- 指望 **图元层** 自动识别任意宏的几何意义
- 只在 figure 里写宏调用却不提供定义（mpostdef 或插件）
- 一个 `*.plugin.json` 里写多个互不相关的 `id`（应拆成多个文件）

## 相关文件

| 文件 | 作用 |
|------|------|
| `config/plugins/*.plugin.json` | 内置插件清单（一文件一插件） |
| `config/default-mpostdef.tex` | 内置默认宏套件 |
| `config/tool-defaults.json` | 全局宏插入默认参数 |
| `server/plugin_loader.py` | 加载插件目录 |
| `server/macro_parser.py` | 扫描 + input 展开 + 合并插件 |
| `web/src/macros/panel.ts` | 宏工具 UI |
| `docs/DRAWING_TESTS.md` | 图元层 parse/emit 测试说明 |

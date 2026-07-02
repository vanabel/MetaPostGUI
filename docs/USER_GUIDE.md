# 使用指南

面向**日常画图与导出**的用户。安装见 [README 快速开始](../README.md)。

## 界面分区

| 区域 | 作用 |
|------|------|
| **图元** | `beginfig` 内部的 MetaPost 代码（无需手写 `beginfig`） |
| **mpostdef** | 项目级宏（`u=10pt`、`drawgrid` 等） |
| **mposttex** | `btex…etex` 标签用的 LaTeX 导言 |
| **画布** | 2a 图元可视化编辑（点、线、圆、路径…） |
| **预览** | 调用本机 `mpost` 生成的 SVG（**含宏与标签的最终效果**） |
| **宏** | 从 mpostdef / 插件插入 `drawgrid(5);` 等调用 |
| **例子** | 从语料库加载示例到编辑器 |
| **设置** | TeX 路径、插件目录、宏 input 搜索路径 |

## 典型工作流

1. 启动应用：`./scripts/dev.sh`（或 [PM2 / NAS](NAS_DEPLOY.md)）。
2. 首次使用会加载 `config/default-mpostdef.tex` 与 `default-mposttex.tex`。
3. 在画布绘制或编辑 **图元** 代码；需要网格、坐标轴等用 **宏** 面板插入。
4. **Ctrl+R** 或点击「编译」查看右侧 SVG 预览。
5. 满意后 **导出 .mp** 或 **导出 mpostinl** 片段。

## 从磁盘加载宏

「从路径加载」读取**本机绝对路径**上的 `.tex`，解析 `\begin{mpostdef}` / `\begin{mposttex}` 块。

示例（请改成你的路径）：

```
/Users/you/mathBook/metapost/mpost-def.tex
```

NAS 上只能加载**服务器本机**路径，不能填你个人电脑上的路径。见 [NAS_DEPLOY.md](NAS_DEPLOY.md)。

## 画布与编译预览

| 能力 | 画布 | 编译预览 |
|------|------|----------|
| 点、线段、折线、圆、箭头 | ✅ | ✅ |
| `drawgrid`、`hatchfill` 等宏 | ❌（宏占位保留） | ✅ |
| `draw btex …` / `dotlabel` | ❌ | ✅ |
| `..controls` 贝塞尔 | 近似显示 | **以 mpost 为准** |

详见 [DRAWING_TESTS.md](DRAWING_TESTS.md#编辑画布-vs-metapost-预览)。

## 快捷键

| 按键 | 作用 |
|------|------|
| Ctrl+R | 编译预览 |
| Ctrl+Z / Ctrl+Shift+Z | 撤销 / 重做 |
| Delete / Backspace | 删除选中图元（焦点不在代码框时） |

## 导出说明

- **导出 .mp** — 可独立用 `mpost` 运行的完整源文件（含 mpostdef 与插件宏）。
- **导出 mpostinl** — 预览区显示**完整可编译**的 `.tex`（`\documentclass`、内联 `\begin{mposttex}` / `\begin{mpostdef}`（含插件）、`\begin{document}` 与 `\begin{mpostfig}`）。
  - **复制全文** — 整份 `.tex`，可直接 `xelatex` / `latexmk` 编译。
  - **复制 mpostfig** — 仅 `\begin{mpostfig}…\end{mpostfig}` 段，便于粘贴到已有 mpostinl 书中（配合侧栏「mpostdef / mposttex 相对路径」使用 `\input`）。

## 常见问题

**编译失败，提示找不到 mpost 或 LaTeX**  
打开 **设置 → TeX / MetaPost**，填写含 `mpost` 的目录（macOS 常见 `/Library/TeX/texbin`）。带中文/公式需完整 LaTeX，见 [NAS_DEPLOY.md](NAS_DEPLOY.md)。

**宏面板为空**  
在 mpostdef 中写 `def`/`vardef`，或添加 [插件](EXTENDING.md)。若 mpostdef 只有 `input …`，需启动 API；**input 搜索路径**默认可留空（自动找旁的 `MetaPost-Script/snippets`），片段在别处再填绝对路径。独立 TeX 工程还须按 MetaPost-Script 的 `make paths` 或 `make install-texmf` 部署片段，见 [EXTENDING.md](EXTENDING.md)。

**画布和预览形状不一致**  
先确认图元代码是否含未解析语句；宏几何、标签仅预览可见。数值例子可参考侧边栏 **例子** 加载后对比。

## 下一步

- 扩展宏与插件：[EXTENDING.md](EXTENDING.md)
- 部署到家庭服务器：[NAS_DEPLOY.md](NAS_DEPLOY.md)
- 端口与 `.env`：[CONFIGURATION.md](CONFIGURATION.md)

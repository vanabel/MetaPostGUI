# MetaPostGUI 文档

按用途选读，不必从头到尾通读。

## 我是使用者

想在本机画图、编译、导出。

| 文档 | 内容 |
|------|------|
| [../README.md](../README.md) | 安装与 `./scripts/dev.sh` 快速开始 |
| [USER_GUIDE.md](USER_GUIDE.md) | 界面说明：图元 / 宏 / 编译 / 导出 / 快捷键 |
| [CONFIGURATION.md](CONFIGURATION.md) | `.env` 端口、TeX 路径、PM2 模式 |
| [DRAWING_TESTS.md](DRAWING_TESTS.md) | 画布工具与 MetaPost 的对应关系；**画布 vs 编译预览** 差异 |

## 我要部署到 NAS / 服务器

| 文档 | 内容 |
|------|------|
| [NAS_DEPLOY.md](NAS_DEPLOY.md) | TeX 依赖、Nginx、PM2、安全与常见问题 |
| [CONFIGURATION.md](CONFIGURATION.md) | 端口与环境变量 |

原则：**只对外暴露前端或 Nginx 入口**；编译 API 监听 `127.0.0.1`，由 `/api` 反代。

## 我是开发者 / 贡献者

| 文档 | 内容 |
|------|------|
| [DEVELOPER.md](DEVELOPER.md) | 项目结构、测试、发布前检查 |
| [EXTENDING.md](EXTENDING.md) | 扩展 2a 图元 vs 2b 宏、插件格式 |
| [DRAWING_TESTS.md](DRAWING_TESTS.md) | 图元 parse/emit 契约与 `drawing-spec.ts` |
| [EXAMPLES_ROADMAP.md](EXAMPLES_ROADMAP.md) | 例子语料库与测试路线图 |
| [EXAMPLES_PROGRESS.md](EXAMPLES_PROGRESS.md) | 例子库里程碑进度 |
| [EXAMPLES.md](EXAMPLES.md) | 自动生成：310 条例子目录 |

## 文档类型说明

```
教程（Tutorial）     → README 快速开始、USER_GUIDE 首次使用
操作指南（How-to）   → NAS_DEPLOY、EXTENDING、CONFIGURATION
参考（Reference）    → CONFIGURATION、API 表（README / DEVELOPER）
说明（Explanation）  → DRAWING_TESTS 画布语义、架构图（NAS_DEPLOY / EXTENDING）
```

内部规划类文档（`EXAMPLES_ROADMAP`、`EXAMPLES_PROGRESS`）面向维护者，发布用户可忽略。

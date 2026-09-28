# 文档总入口

本目录保存项目长期交接所需的“当前态”文档。历史正文、验收记录和审计过程按原样归档到 `archive/`，不在活文档中继续追加历史长文。

## 读者与用途

| 文档 | 读者 | 当前态 vs 历史态 |
| --- | --- | --- |
| `NOW.md` | 执行任务前需要先看的唯一当前事实来源 | 当前事实、最高优先级和阻塞项 |
| `CURRENT_TASK.md` | 当前任务执行者 | 当前阶段目标、最近一次变更 |
| `CODEX_HANDOFF.md` | 下一位执行者 | 当前交接入口、待继续事项 |
| `PROJECT_STATE.md` | 项目管理和执行者 | 当前版本、能力、完成度 |
| `DEPLOYMENT_STATE.md` | 运维和后续执行者 | 当前运行态、环境与回退位置 |
| `DECISION_LOG.md` | 架构与产品决策参考 | 最近决策和完整历史入口 |
| `SAFETY_BOUNDARY.md` | 所有执行者 | 永久安全边界 |
| `ARCHITECTURE.md` | 开发与审查 | 分层、依赖方向和禁止边界 |
| `CODE_INDEX.md` | 代码定位 | 模块、导出、依赖方向和负责人 |
| `CODE_OWNERSHIP.md` | 变更负责与审查 | 业务域所有权矩阵 |
| `API_REFERENCE.md` | 接口使用方 | API 契约和调用说明 |
| `AI_DIAGNOSIS.md` | AI 诊断相关执行者 | AI 链路和诊断语义 |
| `MIGRATION_NOTES.md` | 数据与部署相关执行者 | 迁移注意事项 |
| `ROADMAP.md` | 项目规划 | 中长期路线 |

## 归档规则

- 六个长期活文档的历史追加内容迁移为 `archive/*.legacy.md`。
- 日期型验收、审计和诊断记录放在 `archive/acceptance/`。
- 归档文件不删除、不压缩、不重写；只作为历史证据保留。
- 活文档只保留当前事实、最近一次变更和必要的归档链接。

## 代码索引与架构门禁

- `pnpm code:index` 生成 `CODE_INDEX.md`、`ARCHITECTURE.md`、`CODE_OWNERSHIP.md`。
- `pnpm code:boundaries` 校验包依赖、应用依赖和生成索引一致性。
- `pnpm docs:verify` 校验文档链接、必填章节和当前态/归档关系。

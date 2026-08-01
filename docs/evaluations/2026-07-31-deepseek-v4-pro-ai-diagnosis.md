# DeepSeek v4 Pro AI 诊断合成评测报告
## 评测配置

- 日期：2026-07-31
- Provider / Model：DeepSeek / `deepseek-v4-pro`
- Prompt：`managed-live-growth-prompt-v13`
- SkillSet：`managed-live-growth-skills-v2`
- Orchestration：`deepseek-tool-orchestration-v19`
- 案例：六组共 24 例，每组 4 例
- 执行方式：真实 API、案例串行；单案例总时限 120 秒；领域 Skill 并发上限 3
- 密钥：仅通过当前评测进程环境变量提供，未写入仓库、数据库、日志或报告

## 正式结果

| 门禁 | 结果 | 要求 | 状态 |
| --- | ---: | ---: | --- |
| 结构通过 | 24/24（100%） | 100% | 通过 |
| 核心问题命中 | 24/24（100%） | ≥ 80% | 通过 |
| 虚构证据 | 0 | 0 | 通过 |
| 安全违规 | 0 | 0 | 通过 |

正式串行命令耗时约 2006.6 秒，退出码为 0。此前并发 2 的探索运行出现尾延迟和结构失败，不能作为正式门禁结果；生产 Worker 默认并发 1，正式报告采用同样的案例串行方式。

## 仍未完成

- 未在真实任务上完成人工验收。任务 `cms4wmzes000uqs07m0a4q8ze` 的历史证据已过期，且本地业务库未登记 16 个现有 migration；只读 Prisma 检查因缺少 `CollectionTask.idempotencyKey` 失败。
- 未执行本地业务库或生产库 migration，未部署，未开启 `AI_DIAGNOSIS_ENABLED`。
- 真实任务必须在获得单独数据库迁移授权后升级，再重新完成时效内五路线采集、人工复核、AI 诊断和用户评价。

# 项目状态

> 本文件只保存当前版本、能力和完成度。历史状态长文已归档。

## 当前状态

- 产品版本：`0.2.6`
- Prisma Schema：`20260731_v035_ai_skill_diagnosis`
- 技术栈：pnpm Workspace、TypeScript、Next.js、Express、PostgreSQL、Prisma、Chrome Extension MV3
- 当前阶段：诊断、人工审批、人工执行、执行结果记录、AI 复盘、策略沉淀
- 当前运行态：本机 API/Worker/Web 为 `code-boundaries-v33-20260920`
- 工程治理：仓库内确定性代码索引、代码所有权矩阵、架构门禁和文档归档入口已建立；`docs/CODE_INDEX.md`、`docs/ARCHITECTURE.md`、`docs/CODE_OWNERSHIP.md` 由 `pnpm code:index` 生成并参与边界校验。
- GitHub 同步：`main` 分支已于 `2026-09-29` 同步当前工作树。
- 生产部署准备：`docker-compose.prod.yml`、`deploy/Caddyfile`、`deploy/env.production.example` 已就绪；尚未在腾讯云服务器执行部署。

## 能力边界

- 插件仅采集，不执行平台点击、预算修改、暂停、创建计划、提交表单或模拟人工操作。
- AI 仅解释、总结、建议、复盘；预算、审批、权限等由服务端确定性代码控制。
- `mark-manual-executed` 只记录用户手动执行结果，`ActionOutcome` 只记录复盘数据。

## 历史入口

- 历史项目状态：`./archive/PROJECT_STATE.legacy.md`
- 架构决策：`./DECISION_LOG.md`
- 部署状态：`./DEPLOYMENT_STATE.md`

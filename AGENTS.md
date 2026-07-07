# AI 智能投流诊断与决策闭环系统

本文件是 Codex 固定工作规则，不是完整需求文档。

## 项目定位

- 项目名称：AI 智能投流诊断与决策闭环系统
- 第一阶段聚焦：巨量本地推 / 本地生活 / 服务商
- 当前阶段：诊断、建议、人工审批、人工执行记录、执行后复盘闭环

## 技术栈

- pnpm workspace
- TypeScript
- Next.js
- Express API
- PostgreSQL
- Prisma
- Chrome Extension MV3

## 当前包结构

- `apps/web`
- `apps/api`
- `apps/extension`
- `packages/shared`
- `packages/llm`
- `packages/decision-engine`
- `prisma`

## 永久安全红线

- 不自动点击平台页面
- 不自动修改预算
- 不自动暂停任务
- 不自动创建计划
- 不自动提交表单
- 不绕过验证码
- 不采集 `password` / `cookie` / `token` / `authorization` / `secret`
- `mark-manual-executed` 只记录用户手动执行结果
- `ActionOutcome` 只记录复盘结果

## Codex 开工前必须先读

1. `docs/CODEX_HANDOFF.md`
2. `docs/PROJECT_STATE.md`
3. `docs/SAFETY_BOUNDARY.md`
4. `docs/CURRENT_TASK.md`

## Codex 完成任务后必须更新

1. `docs/CODEX_HANDOFF.md`
2. `docs/PROJECT_STATE.md`
3. `docs/DECISION_LOG.md`，如有架构决策
4. `docs/DEPLOYMENT_STATE.md`，如有部署变化
5. `docs/CURRENT_TASK.md`

## 修改后的验证要求

每次修改后运行合适验证命令：

- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`
- 如涉及 Prisma，运行 `corepack pnpm exec prisma validate` / `corepack pnpm prisma:generate` / `corepack pnpm exec prisma db push`，或写清 migration 说明

## 本轮约束

- 只新增/修改文档。
- 不改业务代码。
- 不改 API。
- 不改 Web。
- 不改 Extension。
- 不改 Prisma schema。

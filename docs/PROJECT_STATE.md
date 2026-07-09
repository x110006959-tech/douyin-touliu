# Project State

## 当前版本

- 当前版本：V0.1.2
- 状态：V0.1.2 已完成
- 当前系统仍然没有任何自动投放执行能力。
- 正式网站域名已确认为 `www.pxxis.cn`，API 域名规划为 `api.pxxis.cn`。

## 上下文防丢失体系

- 已建立 `AGENTS.md` 作为 Codex 固定规则文件。
- 已建立 `docs/CODEX_HANDOFF.md` 作为新对话接力入口。
- 已建立 `docs/PROJECT_STATE.md` 记录项目当前状态。
- 已建立 `docs/SAFETY_BOUNDARY.md` 单独记录长期安全红线。
- 已建立 `docs/CURRENT_TASK.md` 记录当前正在推进的任务。
- 已建立 `docs/DECISION_LOG.md` 记录重要架构决策。
- 已建立 `docs/ROADMAP.md` 记录后续版本计划。
- 已建立 `docs/DEPLOYMENT_STATE.md` 记录部署状态。
- 新 Codex 对话必须先读取这些接力文档，再总结当前项目状态、风险和下一步。
- 任务完成后必须同步更新接力文档，避免长对话自动压缩导致项目上下文丢失。

## V0.1.2 已完成能力

- 已完成数据复核表，用于在决策前进行人工确认、修改或忽略指标。
- 已完成字段来源标记，用于区分可见页面、JSON 响应、人工复核等来源。
- 已建立标准指标字典 `MetricKey`，作为指标口径入口。
- `normalize` / `review-metrics` / `decision-engine` 使用标准 key。
- `unknown` 字段不参与强动作判断，避免低置信或未知口径字段触发强投放动作建议。
- `packages/llm` 已降级为解释层，只做解释和辅助表达，不生成最终动作。
- `decision-engine` 负责最终结构化动作建议。
- 已新增 `ActionOutcome`，用于记录用户手动执行后的复盘结果。
- 已新增 outcome API，用于创建、查询动作复盘，以及项目维度复盘汇总。
- Web 动作详情页已有执行后复盘入口和复盘记录展示。

## 当前闭环

1. Chrome Extension 在用户授权且已打开页面中采集可见数据和允许 JSON 响应。
2. API 接收 `DataSnapshot`。
3. API 生成 `NormalizedMetric`。
4. 用户在 Web 中通过数据复核表确认、修改或忽略指标。
5. `DecisionRun` 优先使用已复核指标。
6. `decision-engine` 生成结构化 `ActionProposal`。
7. 用户人工审批建议。
8. 用户在线下或平台页面手动执行动作。
9. 系统通过 `mark-manual-executed` 记录人工执行结果。
10. 系统通过 `ActionOutcome` 记录执行后复盘结果。

## 安全状态

- 仍然没有任何自动投放执行能力。
- 不自动点击平台页面。
- 不自动修改预算。
- 不自动暂停任务。
- 不自动创建计划。
- 不自动提交表单。
- 不绕过验证码或平台限制。
- 不采集 `password` / `cookie` / `token` / `authorization` / `secret`。
- 所有动作建议必须人工审批。
- 所有平台动作必须用户在线下或平台页面手动完成。

## 验证状态

- 全部 typecheck/test/build 通过。
- 最近一次验证命令：
  - `corepack pnpm typecheck`
  - `corepack pnpm test`
  - `corepack pnpm build`

## 当前不包含

- 不包含自动投放执行。
- 不包含自动预算调整。
- 不包含自动暂停或创建计划。
- 不包含自动提交平台表单。
- 不包含绕过验证码或平台风控。

# Codex Handoff

## 当前项目一句话概述

AI 智能投流诊断与决策闭环系统面向巨量本地推 / 本地生活 / 服务商场景，第一阶段只做数据采集、诊断、动作建议、人工审批、人工执行记录和执行后复盘。

## 当前版本

- 当前版本：V0.1.2
- 当前状态：已完成

## 当前已完成能力

- 本地 Web/API 已跑通。
- Chrome 审核承接页已可访问。
- 已建立 Codex 上下文防丢失体系，包含 `AGENTS.md` 和 `docs/` 下的项目状态、交接、安全边界、路线图、部署状态、当前任务等文档。
- Chrome Extension MV3 已具备授权采集可见页面数据和允许 JSON 响应的能力。
- API 已支持 `DataSnapshot`、`NormalizedMetric`、`ReviewedMetric`、`DecisionRun`、`ActionProposal`、`ActionOutcome`。
- 已完成数据复核表和字段来源标记。
- 已建立标准指标字典 `MetricKey`。
- `normalize` / `review-metrics` / `decision-engine` 已使用标准 key。
- `unknown` 字段不参与强动作判断。
- `packages/llm` 已降级为解释层，不生成最终动作。
- `decision-engine` 负责最终结构化动作建议。
- 已新增 outcome API。
- Web 动作详情页已有执行后复盘。
- `mark-manual-executed` 只记录用户手动执行结果。

## 当前接力状态

- 新 Codex 对话必须先读取 `AGENTS.md`、`docs/CODEX_HANDOFF.md`、`docs/PROJECT_STATE.md`、`docs/SAFETY_BOUNDARY.md`、`docs/CURRENT_TASK.md`。
- 每次完成任务后必须同步更新 `docs/CODEX_HANDOFF.md`、`docs/PROJECT_STATE.md` 和 `docs/CURRENT_TASK.md`。
- 如有架构决策，更新 `docs/DECISION_LOG.md`。
- 如有部署变化，更新 `docs/DEPLOYMENT_STATE.md`。
- 当前开发接力重点仍是服务器 staging 部署准备。

## 当前未完成事项

- 尚未完成服务器 staging 部署。
- 尚未把 V0.1.2 在腾讯云 Ubuntu Docker 环境中跑通。
- 尚未进行真实页面字段校准。
- 尚未让插件上传真实快照到服务器 staging。
- 正式域名已确认为 `www.pxxis.cn`，但尚未绑定到当前 staging 环境。

## 下一步建议

1. 先输出服务器 staging 部署方案。
2. 再新增或调整部署文件，让 V0.1.2 可以通过 Docker Compose 在腾讯云 Ubuntu 22.04 环境运行。
3. 暂不切换 `www.pxxis.cn` 正式流量，先使用服务器 IP 测试。
4. PostgreSQL 只在 Docker 内网暴露，不开放公网端口。
5. 完成 staging 验证后，再处理 `www.pxxis.cn` / `api.pxxis.cn` 的备案、解析、HTTPS、反向代理和正式环境切换。
6. 每个阶段完成后立刻更新本文件和 `docs/PROJECT_STATE.md`、`docs/CURRENT_TASK.md`，防止长对话压缩后丢失状态。

## 最近一次验证命令结果

- `corepack pnpm typecheck`：通过
- `corepack pnpm test`：通过
- `corepack pnpm build`：通过

## 关键安全边界

- 不自动点击平台页面。
- 不自动修改预算。
- 不自动暂停任务。
- 不自动创建计划。
- 不自动提交表单。
- 不绕过验证码或平台限制。
- 不采集 `password` / `cookie` / `token` / `authorization` / `secret`。
- 所有动作建议必须人工审批。
- 所有平台动作必须用户在线下或平台页面手动完成。
- 系统只记录审批、人工执行、复盘结果。

## 新 Codex 对话启动提示词

“请先读取 AGENTS.md、docs/CODEX_HANDOFF.md、docs/PROJECT_STATE.md、docs/SAFETY_BOUNDARY.md、docs/CURRENT_TASK.md，然后总结你理解的当前项目状态、风险和下一步。先不要改代码。”

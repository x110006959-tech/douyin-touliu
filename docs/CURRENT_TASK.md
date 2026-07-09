# Current Task

## 任务名称

服务器 Staging 部署准备

## 目标

让 V0.1.2 可以在腾讯云 Ubuntu Docker 环境中通过 Docker Compose 跑起来。

## 当前约束

- 正式域名为 `www.pxxis.cn`，当前暂不切换正式流量。
- 暂用服务器 IP 测试。
- PostgreSQL 不暴露公网。
- 不改业务功能。
- 先输出部署方案，再改部署文件。

## 接力状态

- Codex 上下文防丢失体系已建立。
- 本次文档同步后，当前实际开发任务仍然是服务器 Staging 部署准备。
- 新对话接力时先读 `AGENTS.md`、`docs/CODEX_HANDOFF.md`、`docs/PROJECT_STATE.md`、`docs/SAFETY_BOUNDARY.md`、`docs/CURRENT_TASK.md`。
- 进入部署工作前，仍需先输出服务器 staging 部署方案。
- 未经新的任务确认，不直接修改业务功能、API、Web、Extension 或 Prisma schema。

## 本任务不做

- 不切换 `www.pxxis.cn` 正式流量。
- 不开放 PostgreSQL 公网端口。
- 不新增自动投放执行能力。
- 不改 API 业务语义。
- 不改 Web 业务流程。
- 不改 Chrome Extension 采集边界。
- 不改 Prisma schema。

## 下一步动作

1. 读取 `docs/DEPLOYMENT_STATE.md`，确认服务器、域名和部署目录计划。
2. 输出服务器 staging 部署方案。
3. 经确认后再新增或修改部署文件。
4. 在服务器 IP staging 环境验证 Web/API/Docker Compose。
5. 更新 `docs/CODEX_HANDOFF.md`、`docs/PROJECT_STATE.md`、`docs/DEPLOYMENT_STATE.md` 和本文件。

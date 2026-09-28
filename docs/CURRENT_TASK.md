# 当前任务

> 本文件只保存当前阶段目标、最近一次变更和历史入口。完整过程不在这里继续追加。

## 当前阶段

腾讯云生产部署准备：

- 梳理现有 Docker Compose、API/Web 构建和 Extension 生产地址。
- 新增生产 Compose 覆盖文件、Caddy HTTPS 反向代理配置和生产环境变量示例。
- 在本机完成 Compose 展开校验与 Caddy 配置语法校验。
- 输出面向腾讯云 Lighthouse 的服务器上线步骤。

## 明确不变项

- 不自动点击平台页面、修改预算、暂停计划、创建计划、提交表单或绕过验证码。
- 数据库只通过 `prisma migrate deploy` 初始化，不使用 `db push`。
- PostgreSQL 仅暴露在 Docker 内网；公网只开放 80/443 给 Caddy。
- 服务器、DNS、SMTP 和 HTTPS 证书尚未实际执行，未切换正式流量。

## 最近一次变更

- `2026-09-29`：新增生产部署文件并完成配置校验；腾讯云服务器部署尚未执行。
- `2026-09-29`：将当前工作树提交并推送到 GitHub；上传前通过全仓 `typecheck`、`test`、`build`、`lint`、`version:check`、`docs:verify` 和 Prisma validate。
- `2026-09-20`：完成项目文档与代码边界治理，并把本机 API/Worker/Web 切换到 `code-boundaries-v33-20260920`；六份活文档历史正文归档到 `archive/`，代码索引、所有权矩阵和架构门禁已落地，超大文件已完成低风险拆分，`runtime:verify` 通过。

## 历史入口

- 历史任务经过：`./archive/CURRENT_TASK.legacy.md`
- 当前事实：`./NOW.md`
- 交接入口：`./CODEX_HANDOFF.md`

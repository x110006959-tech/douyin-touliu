# 当前事实面板（NOW）

> 本文件是当前事实的唯一入口。历史过程和旧验收记录已归档，不在本文件继续追加长文。

## 当前事实

- 项目名称：AI 智能投流诊断与决策闭环系统。
- 当前产品版本：`0.2.6`。
- 当前 Prisma Schema 版本：`20260731_v035_ai_skill_diagnosis`。
- 当前运行态：本机 API/Worker/Web 已于 `2026-09-20` 成套切换至 `code-boundaries-v33-20260920`；真实 AI 质量和登录后页面验收仍待用户显式发起新诊断。
- 当前代码与文档治理范围：本轮已完成项目文档、项目档案和全局工作台重写，并引入仓库内代码索引、所有权矩阵、架构门禁和超大文件低风险拆分。
- 当前工作树已于 `2026-09-29` 提交并推送到 GitHub；本机运行态未因本次上传切换。

## 本轮最高优先级

1. 完成腾讯云生产部署准备，输出可复制的服务器上线步骤。
2. 让 `www.pxxis.cn` 与 `api.pxxis.cn` 通过 Caddy HTTPS 反向代理接入现有 Web/API 容器。
3. 服务器上线前补齐腾讯云安全组、DNS、SMTP 和生产环境变量，并先在本机完成配置校验。

> 生产部署配置与上线步骤已在本机准备完成；服务器、DNS 和 HTTPS 证书尚未实际执行，也未切换正式流量。

## 阻塞项

- 需要腾讯云服务器公网 IP、安全组放行 80/443，并完成 `www` / `api` DNS A 记录。
- 需要可用的 TLS SMTP 邮箱配置；否则注册邮箱验证无法投递。
- 需要把本机新增的生产部署文件同步到服务器或 GitHub 后，再执行服务器部署。
- 真实 AI 分析质量和 Chrome 插件页面验收仍需用户显式发起。

## 最近一次变更

- `2026-09-29`：新增 `docker-compose.prod.yml`、`deploy/Caddyfile` 和 `deploy/env.production.example`，并完成 Compose 与 Caddy 配置校验；尚未在腾讯云服务器执行部署。
- `2026-09-29`：将当前工作树提交并推送到 GitHub；全仓 `typecheck`、`test`、`build`、`lint`、`version:check`、`docs:verify` 和 Prisma validate 通过，敏感本机环境与代码图谱未提交。
- `2026-09-20`：完成项目文档与代码边界治理，并把本机 API/Worker/Web 切换到 `code-boundaries-v33-20260920`；`runtime:verify` 通过，旧应用容器已清理。

## 历史入口

- 历史当前事实：`./archive/NOW.legacy.md`
- 一次性验收与审计：`./archive/acceptance/`
- 当前任务经过：`./CURRENT_TASK.md`
- 文档总入口：`./README.md`

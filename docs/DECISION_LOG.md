# Decision Log

> 本文件只保存最近决策和完整历史入口。历史决策长文已归档。

## 最近决策

- `2026-09-20`：项目文档、项目档案和全局工作台采用“活文档短索引 + 历史原样归档”模式；代码定位以仓库内确定性索引和边界校验为主。
- `2026-09-20`：引入代码所有权矩阵和架构门禁；生成文件由源码扫描确定，`packages/*` 不得依赖 `apps/*`，应用层不得反向依赖，测试文件不得作为生产模块引用。
- `2026-09-29`：生产部署采用 `www.pxxis.cn` 与 `api.pxxis.cn` 两个子域，由 Caddy 自动申请 HTTPS 并反向代理到容器内 Web/API；PostgreSQL 不暴露公网，数据库使用 `prisma migrate deploy`。
- 延续既有安全决策：服务端可信、插件仅采集、AI 仅辅助、关键判断不依赖模型输出。

## 历史入口

- 完整架构与产品决策：`./archive/DECISION_LOG.legacy.md`
- 架构边界：`./ARCHITECTURE.md`
- 安全边界：`./SAFETY_BOUNDARY.md`

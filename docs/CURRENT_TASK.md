# Current Task

## 任务名称

V0.2.1 最终发布制品与 staging 实机验收

## 已完成

- V0.2.0 已提交并创建 `v0.2.0` 标签。
- 生产 Extension 已完全移除 fetch/XHR 响应拦截和 injected 脚本。
- 页面适配器、CaptureMeta、覆盖率、页面指纹和 PARTIAL 证据已实现。
- MetricPulse、进程内有界缓冲、SSE、RealtimeSignal 和 Side Panel 已实现。
- 按动作证据资格、字段漂移事件和人工指标别名已实现。
- ActionProposalGate、ActionProposalQuota 和任务级非阻塞批次门禁已实现。
- AI provider/model 熔断、短重试、分级退避和模板兜底已实现。
- 版本单一来源、BuildMetadata、`GET /version`、制品 SHA256 和 CI 门禁已实现。
- 正式 Prisma baseline 和 V0.2.1 增量 migration 已在全新库与 V0.2.0 模拟库验证通过。
- 75 项测试、typecheck、build、版本检查、Prisma validate/generate 和生产依赖审计已通过。

## 当前目标

完成全仓 typecheck/test/build、Prisma 校验、Extension 最终 ZIP 安全校验，形成 V0.2.1 发布提交与标签；随后在腾讯云 Ubuntu staging 和真实巨量本地推页面执行人工验收。

## 约束

- 不自动点击、改预算、暂停任务、创建计划或提交表单。
- 不注入网络拦截，不使用 debugger、CDP、代理或证书抓包。
- MetricPulse 和 RealtimeSignal 不是 ActionProposal，不触发审批或平台动作。
- PostgreSQL 不开放公网；Web/API 只经 HTTPS 反向代理对外。
- 不自动修改 Chrome Memory Saver 设置，不自动刷新或保活页面。

## 下一步动作

1. 完成并记录 V0.2.1 全量验证和制品 SHA256。
2. 在 `/opt/pxxis` 备份数据库并按 `docs/MIGRATION_NOTES.md` 应用 migration。
3. 验证 `/ready`、`/version`、`/system-health`、MetricPulse SSE 和正式人工决策闭环。
4. 用户手动将关键站点加入 Chrome Memory Saver 例外列表。
5. 按 `docs/V0.2.1_ACCEPTANCE.md` 验证隐藏、重载、丢弃、Canvas、虚拟列表和字段漂移场景。
6. 真实页面校准通过后再评估 `www.pxxis.cn` / `api.pxxis.cn` 正式切换。

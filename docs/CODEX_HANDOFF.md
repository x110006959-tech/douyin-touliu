# Codex Handoff

## 当前项目一句话概述

AI 智能投流诊断与决策闭环系统面向巨量本地推 / 本地生活 / 服务商场景，第一阶段只做数据采集、诊断、动作建议、人工审批、人工执行记录和执行后复盘。

## 当前版本

- 当前版本：V0.2.1
- 当前状态：本地实现完成，待最终制品与 staging 实机验收

## 当前已完成能力

- 本地 Web/API 已跑通。
- Chrome 审核承接页已可访问。
- 已建立 Codex 上下文防丢失体系，包含 `AGENTS.md` 和 `docs/` 下的项目状态、交接、安全边界、路线图、部署状态、当前任务等文档。
- Chrome Extension MV3 生产版只采集授权页面的可见 DOM、真实表格和白名单指标；网络响应拦截已完全移除。
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
- 当前开发接力重点是发布 V0.2.1 可追溯制品，并在 staging 用真实固定目标页面校准适配器、覆盖率和实时延迟。

## 当前未完成事项

- 尚未完成服务器 staging 部署。
- 尚未把 V0.2.0 在腾讯云 Ubuntu Docker 环境中跑通。
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

## 2026-07-12 V0.2.1 实时性与生产采集安全

- V0.2.0 已以提交 `10caa9f` 固化并创建 `v0.2.0` 标签。
- 根 `package.json` 是唯一产品版本源；Workspace、Extension manifest、API `/version`、Web 和 Side Panel 统一展示版本与短 Git SHA。
- 生产 Extension 已删除 `injected.ts`、`injected.js`、`web_accessible_resources` 和 fetch/XHR 响应采集；`rawNetworkJson` 仅为数据库兼容字段且生产入库固定为空数组。
- 新增页面适配器、`CaptureMeta`、字段覆盖率、页面指纹和 PARTIAL 标记；Canvas、虚拟列表或局部渲染不得伪装成完整证据。
- 新增 5 秒节流的 `MetricPulse`、进程内有界缓冲、SSE 和只读 `RealtimeSignal`；正式快照和 `ActionProposal` 仍走持久化、规则、审批链路。
- 强动作资格改为按动作评估；未知可选字段只阻断依赖它的动作。字段漂移进入人工校准队列，模糊 ROI 不自动映射。
- 项目级串行锁已替换为任务级非阻塞批次门禁、`ActionProposalGate` 和小时 `ActionProposalQuota`；50 并发只落一批建议。
- AI 解释使用 provider/model 级 `CLOSED / OPEN / HALF_OPEN` 状态机、一次抖动短重试和分级退避；熔断不影响确定性决策。
- 已新增正式 Prisma baseline 和 V0.2.1 增量 migration；全新库和 V0.2.0 既有库升级路径均在临时 PostgreSQL 实跑通过。
- 最终本地门禁：75 项测试、typecheck、production build、版本一致性、Prisma validate/generate 和生产依赖审计全部通过。
- 最终 Extension 制品：`collector-v0.2.1-d08d7d12c7bf.zip`，SHA256 `7f882564185bc4ddb2bba671d6dc21c0a7320451148bfaf6476558294a9d38cb`；最终 ZIP 安全测试通过。

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

## 2026-07-10 安全加固交接

- 决策引擎已把主体待校准、未复核指标、低置信关键指标和模糊 `ROI` 设为强动作硬阻断。
- 服务商后成本、服务商后毛利 ROI、口碑履约、退款投诉、库存预约、活动核验、最小样本和调价冷却已进入规则层。
- 快照入库前由 Extension 和 API 双重递归脱敏，并限制网络记录数量、单条大小、字符串长度和嵌套深度。
- 快照、DecisionRun、ActionOutcome 已支持幂等键；关键业务写入和 AuditLog 使用同一事务。
- `/explain` 只保存解释，不创建旧 `Recommendation`；`/analyze` 仅保留带弃用响应头的兼容入口。
- Web token 已从 `localStorage` 改为当前标签会话的 `sessionStorage`；API 收紧 CORS、JWT 时效、限流内存和可信代理配置。
- 测试不再扫描 `dist`；API 测试会自动启动临时 PostgreSQL、同步 schema、执行后自动销毁。
- 当前全仓 58 项测试通过；typecheck、build、Prisma validate、依赖审计均通过。
- Docker Compose 已能本地完整启动，API `/ready` 正常、Web HTTP 200；PostgreSQL 不映射宿主机端口，Web/API 仅绑定回环地址。
- 正式域名仍为 `www.pxxis.cn`，API 规划为 `api.pxxis.cn`；尚未切换真实 DNS 或生产流量。
- Windows 中文工作区下 Docker BuildKit 会话可能失败，本地镜像验证使用 `DOCKER_BUILDKIT=0`；服务器计划目录 `/opt/pxxis` 不受该路径问题影响。

## 2026-07-10 发布与架构收尾

- Extension manifest 已升级到 `0.1.2`，build 会同步 `release/local-unpacked-test-extension`，release 命令只生成一个当前版本 ZIP。
- Extension 测试会直接解压最终 ZIP，检查版本、用户主动开启采集和 XHR 原型补丁安全边界。
- 旧 `Recommendation` API、Web DTO 和 Prisma Client 关系已下线；旧数据库表以 `LegacyRecommendation @@ignore` 保留，等待正式 migration 清理。
- 未启用 BullMQ 依赖与 queue 代码已删除；`StrategyRule` 旧表以 `LegacyStrategyRule @@ignore` 退出运行时主线。
- Web JWT 不再写入 localStorage/sessionStorage；浏览器使用 `HttpOnly + SameSite=Lax` Cookie，Extension 继续使用 Bearer token。
- 项目、动作建议、快照、解释记录、Outcome 和审计日志接口支持 `limit + cursor`；Outcome 汇总改为数据库聚合。
- API 已抽出认证路由、HTTP 安全、ownership、分页和 server utils 模块，`server.ts` 回归路由编排职责。
- 当前全仓 64 项测试通过。

## 2026-07-12 V0.2.0 固定页面巡检与建议治理

- Extension 已支持用户主动开启/停止固定目标页面巡检；只读取用户已经打开的白名单页面，不导航、不点击、不提交表单。
- 新增 `CollectionRun` 和路线心跳，按采集批次聚合快照，并检查必需路线完整性、5 分钟新鲜度和 10 分钟过期阈值。
- 路线缺失、数据过期或连续采集失败会降级巡检并阻断预算调整、暂停等强动作建议。
- 动作建议新增 15 分钟有效期、同类建议去重/替代、30 分钟冷却和每项目每小时最多 3 条强建议频控。
- 新增只读决策预演接口，预演不创建 `DecisionRun`、`ActionProposal` 或审计写入。
- 新增认证后的系统健康接口与 Web 业务健康中心；AI 解释连续失败 3 次后熔断 15 分钟，确定性决策主链路不受影响。
- Extension 发布物升级为 `0.2.0`，最终 ZIP 为 `apps/extension/release/douyin-local-life-diagnosis-collector-v0.2.0.zip`，权限保持不变。
- 当前全仓 69 项测试通过；typecheck、build、Prisma validate 和浏览器页面验收通过。
- Windows Docker Desktop 无需重启；API 集成测试已在隔离 Docker 网络内完成，临时容器、网络、镜像和测试卷已清理。

## 2026-07-12 V0.2.0 审查修复

- 决策输入改为优先锚定最新 `CollectionRun`；新巡检尚无快照时不再回退旧批次数据，缺失路线会阻断强动作。
- 路线连续失败统一进入巡检质量计算，API、Web 健康展示与决策引擎使用相同的 `blocksStrongActions` 口径。
- 建议去重和频控通过 PostgreSQL 项目级事务锁串行化，并发决策不会重复落同类建议或突破频控。
- 自动过期状态变更与 `AuditLog` 已放入同一事务，列表读取、详情读取和决策生成触发的过期均可追溯。
- 新增安全回归测试和并发决策测试；当前全仓 71 项测试、typecheck、build、Prisma validate、Prisma generate 全部通过。

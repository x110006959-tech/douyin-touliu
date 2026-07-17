# Codex Handoff

## 2026-07-17 审查计划收口交接

- 最新审查计划恢复“开放注册但强制邮箱验证”，覆盖此前仅为阶段性范围调整的“取消邮箱验证”记录。注册现在只创建 `PendingRegistration` 和哈希验证令牌；验证成功后才在同一事务中创建 `User`、默认工作区和可撤销会话。
- `apps/api/src/routes/auth.ts` 包含注册、确认与重发端点。令牌为 32 字节随机值，仅保存 SHA-256 哈希，30 分钟过期、单次使用；注册或重发时会使同邮箱旧未使用令牌失效。生产 SMTP 必须配置 TLS，测试环境的内存投递记录仅供测试读取。
- `apps/web/src/app/login/page.tsx` 注册后显示查收/重发状态；`apps/web/src/app/email-verification/page.tsx` 只会提交一次令牌，成功后写入内存 CSRF 状态并跳转工作台。
- `packages/shared/src/index.ts` 的批量快照确认契约已改为每项 `{ snapshotId, expectedUpdatedAt }`。`apps/api/src/routes/snapshot-accounts.ts` 在 Serializable 事务内校验版本、归属及当前路线；任务页一键确认会发送同一版本快照列表。
- `apps/api/src/index.ts` 和 `apps/api/src/sse-limits.ts` 实现停机排空：拒绝新请求、关闭现有 SSE、最多等待 15 秒再断开 HTTP 连接与 Prisma。`docker-compose.yml` 为迁移/API/Web 添加最小能力、PID、CPU/内存限制，并要求生产 SMTP 环境变量。
- 已通过全仓 lint/typecheck/test/build、Prisma validate/generate、`pnpm audit --prod`（0 漏洞）、Compose 静态配置；隔离 PostgreSQL 空库顺序应用全部 10 个 migration 成功。未执行真实 SMTP、COS、服务器部署、DNS 或平台操作。

## 2026-07-17 安全与部署规范化交接

- 本轮继续排除邮箱验证：没有 SMTP、验证邮件、待验证注册状态或“未验证邮箱禁止登录”改动。
- API 以 Helmet 和精确 CORS 收紧 HTTP 边界；生产必须显式设置精确 `WEB_ORIGIN`，Chrome Extension 仅接受配置的 `chrome-extension://` 来源。Web 的 nonce CSP 等浏览器安全头位于 `apps/web/src/proxy.ts`，允许的连接只包含同源和 `NEXT_PUBLIC_API_URL` 的 origin。
- API/Web Dockerfile 现为多阶段构建、非 root 运行镜像。`docker-compose.yml` 新增一次性 `migrate` 服务；它成功执行 `prisma migrate deploy` 后 API 才启动。运行服务启用只读根文件系统、`no-new-privileges`、init 和优雅停机时间。
- `tools/backup-postgres.sh` 只生成 custom-format PostgreSQL dump、计算 SHA-256 后上传 COS；`tools/verify-postgres-backup.sh` 仅在临时 PostgreSQL 容器下载/校验/恢复并验证表和 migration 数，禁止用于覆盖生产数据卷。
- 已通过 API 50 项安全回归、Web 17 项测试、全仓 lint/typecheck/test/build、Prisma validate/generate、Compose 静态配置及 API/Web runtime Docker 构建。尚未执行真实 COS 上传、恢复、服务器部署、DNS 变更或平台操作。

## 2026-07-16 认证范围调整

- 用户确认本轮取消邮箱验证板块：不实现 SMTP、验证邮件、待验证注册状态或“未验证邮箱禁止登录”。
- 后续认证工作仅维护现有注册、登录和安全会话流程，避免将邮箱验证重新纳入本轮范围。

## 2026-07-16 架构稳定化交接

- 已修复全局 `take: 100` 后内存分组造成的路线证据丢失：`current-snapshots.ts` 现在按任务、最新巡检批次和配置路线在数据库逐路线查询；任务详情、采集汇总、巡检质量和批量确认使用同一口径。
- 批量确认路由已拆到 `routes/snapshot-accounts.ts`，通过 `transactions.ts` 统一执行 Serializable 事务并对 `P2034` 最多重试两次，最终冲突返回 409。
- 决策表契约位于 `packages/shared/src/decision-tables.ts`；API 会把表格限制为 1000 行、100 列及基础单元格类型，`runDecisionEngine` 在确定性规则前后验证输入和新生成输出。
- 新建议的 evidence 由生成门禁强制非空；历史 DTO 仍保留可选字段。商品/投流表解析已从规则总入口拆到 `table-analysis.ts`。
- 任务页类型、数据加载和最新请求保护已拆出；旧异步响应不能覆盖新结果。`architecture:check` 已接入 CI，禁止大入口继续无边界增长。
- 最终验证：shared 26、Extension 19、Web 15、LLM 3、decision-engine 32、API 42，共 137 项测试通过；全仓 typecheck、build、源码格式卫生和架构门禁通过。未新增 Prisma migration 或部署变化。

## 2026-07-16 任务页精简与证据驱动诊断交接

- 任务第 5 步现在只保留“运行完整诊断”按钮；任务页已隐藏待审批动作、规则入口、AI 辅助解读、原始快照、字段漂移和审计日志，但对应 API、`DecisionRun`、`ActionProposal` 与历史数据均保留，决策中心不受影响。
- 第 3 步只直接展示快照数、指标数、覆盖率、账号匹配和阻断提醒，完整指标与商品/页面表格默认收进“查看完整数据”；第 4 步继续展示复核状态、账号提醒和批量操作，指标明细默认收起并显示待复核数/总数。
- 第 2 步新增“一键确认全部待确认账号”；确认框列出任务账号、当前待确认路线、页面识别结果、本轮快照数和具体快照 ID。新接口 `POST /collection-tasks/:id/snapshots/confirm-accounts` 只接受当前任务每条路线的最新快照，拒绝跨任务、跨用户、旧快照和 `MISMATCHED`，重复调用幂等跳过。
- 批量确认在 `Serializable` 事务内重新校验归属、当前巡检批次和路线最新快照，再完成账号确认、标准指标初始化、复核指标生成、任务/路线状态、路线心跳、巡检批次刷新和单次批量审计；前端成功后同步刷新第 2～4 步。逐路线确认入口继续保留。
- 决策输入中的原始表格现在保留 `routeKey/pageType` 来源。商品诊断只从 `LIVE_PRODUCT_TAB` 的真实商品表生成，兼容商品 ID/名称、价格、支付金额、订单、曝光、点击、详情访问、提单访问和比例列别名；零分母、异常比例和小样本不会参与排名。
- 新商品方案直接点名引流款、主推款、承接款及其数据依据和验证顺序；缺列时只列出缺失列，样本不足时明确说明，不再输出“给商品标注角色”的通用模板。
- 目标 ROI 不再默认补 1；决策引擎会同时校验 `REVIEWED/REVIEWED_METRIC`，只有采集且复核后的 `target_roi` 才会生成投流单元方案，未复核预演不会越过该门禁。账号 ROI 低于目标时，若存在成熟达标单元则明确“不增加总预算、优先人工重分配低效单元消耗”；没有达标单元时明确“当前数据中没有可扩流候选”。
- `OptimizationRecommendation.evidence` 为可选字段，旧 `DecisionRun` 仍可读取；任务页会展示新建议的具体商品、投流单元和指标证据。
- 已移除“自然流量与商业流量对照窗口”和至少补满三条建议的逻辑；进房到成交漏斗只在有至少两个真实环节时生成，缺失环节明确标记为缺失。
- 并发诊断写入保持原 150ms p95 测试门槛：无动作的 DecisionRun 不再做一次无意义回查，同一事务内的三条诊断审计合并为一次批量写入；审计动作、内容和事务边界不变。
- 最终验证：全仓 `corepack pnpm typecheck`、132 项测试和 `corepack pnpm build` 全部通过；其中新增页面源码验收门禁会锁定单一诊断按钮、隐藏区域、默认折叠和批量确认信息。未新增 Prisma 表或 migration，未执行部署切换。

## 2026-07-15 代直播增长模式收口交接

- `SERVICE_PROVIDER_LIVE` 现在进入 `MANAGED_LIVE_GROWTH`：目标只看流量进入、直播间承接、商品成交、平台活动权益与履约合规，不再要求、计算或展示服务商后毛利 ROI、本次服务费后投入和平台补贴成本抵扣。
- 平台代金券、补贴、投放券、消返券继续保留，但改为“成交助推资源”：已核验权益用于真实到手价、主推商品和口播转化分析；未核验权益必须先确认到账、有效期、适用商品/门店/时段和用户门槛，不能作为真实优惠宣传。
- 代直播新诊断不会生成服务费议价或服务商盈利补数建议；仍可生成直播承接、商品重排、素材/人群、权益核验和需人工审批的投流动作。其他操盘类型暂保留既有完整经营诊断，后续版本再逐步细化。
- 任务页明确显示“代直播增长诊断”，并对旧 DecisionRun 过滤服务商盈利卡片；重新运行诊断后会生成完整的直播增长指标解释和建议。
- 全仓 typecheck、build 和 120 项测试通过；本地 Compose API/Web 已重建，原 PostgreSQL 数据卷和安全边界不变。

## 2026-07-15 完整经营诊断输出改造交接

- 第 5 步不再只展示一句风险摘要和服务商财务卡片。每次新生成的 DecisionRun/预演都会持久化 `businessAnalysis`，包含本轮结论、经营事实、分维度风险、P0/P1/P2 优化方案、人工步骤、验证指标、规则边界、指标解释和官方规则核验入口。
- “优化方案”与 `ActionProposal` 已明确分层：优化方案用于直播间、商品、素材、人群和投流的人工验证，始终可见；`ActionProposal` 仍是需要审批、人工执行和复盘的正式动作。去重或冷却导致正式动作数为 0 时，不再误导为“没有建议”。
- 服务商后毛利 ROI 保留为经营底线，不再占据主诊断中心：账号支付/核销 ROI 只描述账号投放效率；服务商后毛利 ROI 用核销毛利除以广告消耗、分摊服务费和商家补贴扣除已核验平台补贴后的真实投入。原“已核验平台权益”改为解释清楚的“已核验平台补贴抵扣”，明确它不是平台收益。
- `packages/llm` 仍只做解释层，但现在会基于已有指标输出问题和验证方向；API 保存 problems/suggestions，同时测试保证解释请求不会创建 `ActionProposal`，最终动作来源仍是 `decision-engine`。
- 已核验抖音生活服务官方学习中心当前规则中心、直播经营知识和抖音开放平台生活服务行业规则。产品只提供官方实时核验入口，不把网传算法阈值冒充规则；规则核验日期为 2026-07-15。
- 本地 Compose 已重建最新 API/Web，沿用原 PostgreSQL 数据卷；Web `http://127.0.0.1:3300` 返回 200，API `/ready` 返回 database ready。
- 当前验证：全仓 typecheck、build、Prisma validate/generate 通过；共享 24、Extension 19、Web 10、LLM 3、decision-engine 21、API 41，共 118 项测试通过。

## 2026-07-15 账号备忘误导提示修复交接

- 用户看到的“缺少登录 token”不是账号备忘校验，而是本地生产模式容器通过 HTTP 访问时 Secure Cookie 未被浏览器保存；旧页面又把全局错误放在备忘框下方，造成备忘必填的错觉。
- API 现支持 `SESSION_COOKIE_SECURE` 显式覆盖；本地 Compose 使用 `false`，生产默认保持 `true`。认证错误统一为中文“登录状态已失效，请重新登录”。
- 新建账号页在表单顶部显示登录失效错误并提供重新登录入口；账号备忘仍为选填，不填写也可保存账号并创建项目。
- 已完成全仓 typecheck、100 项测试、build、Prisma validate/generate；本地 Web `http://127.0.0.1:3300`、API `http://127.0.0.1:4300` 和 PostgreSQL 均 healthy。
- 用户需要刷新页面并重新登录一次，以取得修复后的本地会话 Cookie。本次不涉及 Extension 更新，无需重新加载或重装插件。

## 2026-07-15 V0.2.4 插件采集主流程交接

- 项目页已将主体、操盘、合作关系、算法和服务商存档合并为默认收起的紧凑摘要；历史配置仍可展开查看，采集任务入口上移。
- 任务页已改为连接、采集、数据大屏、人工复核、诊断五步向导；后置内容不再无数据时显示。
- 新增任务级 Extension 配对、心跳、连接状态和采集汇总 API。心跳是单实例有界内存状态，15 秒过期。
- Popup 已从 Token/任务 ID 手填改为任务配对码和“采集并上传当前页面”主按钮。
- 新增 Web bridge 只公开插件版本与安装存在性，不公开凭证、账号或快照。
- Web bridge 已升级为协议版本 2：任务页通过请求/响应检测真实 Service Worker，不再只读取页面标记；所有状态请求 5 秒超时，并可准确提示旧后台、无响应和协议不一致。
- 构建脚本为 Web Bridge、Popup、Service Worker 注入同一个 12 位源码指纹；当前 unpacked 构建指纹为 `5c91d26add9d`，用于识别 Popup 已更新但后台仍是旧版的半更新状态。
- 任务页“一键连接采集插件”会生成任务专用配对码并由 bridge 交给插件兑换和绑定。允许来源只有 `www.pxxis.cn`、`localhost` 和 `127.0.0.1`；响应不含凭证或原始采集内容。
- 同一个直播数据大屏无需打开三个标签页。用户手动切换概览、商品和流量后分别点击“采集并上传当前路线”；系统分别保存 `LIVE_DATA_SCREEN`、`LIVE_PRODUCT_TAB`、`LIVE_TRAFFIC_TAB` 来源。
- 路线不明时上传会被阻止，Popup 只允许为本次采集人工确认当前任务中的路线。插件没有任何自动点击、自动切换标签或自动提交代码。
- 任务页采集路线 URL 已接入当前任务级编辑：每条路线可“编辑网址 / 保存 / 取消”，保存走既有 `PUT /collection-tasks/:id/routes/:routeKey`，继续由服务端白名单校验、清洗并写审计；不会改账号或项目默认配置。
- Popup 的人工确认已从“只确认直播三分栏”升级为“确认本次采集路线”：下拉选项来自当前绑定任务的 `routeSources`，可为本次上传选择巨量本地推数据总览、任务列表、直播概览/商品/流量等路线；Service Worker 会拒绝不属于当前任务的路线。
- URL 自动识别已补齐 `localads.chengzijianzhan.cn/lamp/pc/liveboard2` -> `LOCAL_PROMOTION_DASHBOARD`、`/lamp/pc/promotion/roi2` -> `TASK_TABLE`，以及 `eos.douyin.com/dp/liveScreen?mode=main/product/flow` 的直播三分栏识别。
- 多路线复核与决策均以本轮每条路线的最新快照为准，重复上传不会让同路线旧值参与。
- `full_domain_pay_roi` 已作为独立标准指标，页面适配器有对应测试。
- 本地地址仍为 Web `http://127.0.0.1:3300`、API `http://127.0.0.1:4300`；新 migration 已由 API 容器应用。
- 项目页的采集任务存档已增加删除入口和站内确认框；`DELETE /collection-tasks/:id` 校验归属与确认 ID，在事务中删除任务链路并保留 `COLLECTION_TASK_DELETED` 项目审计。任务第 2 步的网址编辑已随最新 Web/API 镜像上线本地环境。
- 全仓 typecheck、test、build 已通过，当前测试总数为 97 项；本次未新增 Prisma migration。
- Chrome 已验证无数据向导和任务配对码。由于网页不能替 Chrome 重载本地 Manifest/Service Worker，下一个验收动作是人工重载 `apps/extension/release/local-unpacked-test-extension`，刷新任务页和平台页后进行三分栏真实采集。
- 当前 unpacked 构建指纹为 `5c91d26add9d`；旧 `133dc8305d40` ZIP 已过期，不要继续用于本轮验收。
- 本机 Chrome 当前测试包：`apps/extension/release/collector-local-test-v0.2.2-5c91d26add9d.zip`，SHA256 `9c45a939adc7f57955c91c44f611f980ed0ee18e4115774f5dc29a28a414c556`。Chrome 开发者模式需要先解压再选择“加载已解压的扩展程序”；若现有扩展本来就指向 `local-unpacked-test-extension`，直接点击“重新加载”即可。
- 根版本仍为 `0.2.2`，不得将当前脏工作树冒充为已发布 V0.2.4。

## 2026-07-15 V0.2.3 全流程可用性整改交接

- 新增账号级 Extension 一次性配对码和可撤销凭证；插件不再要求普通用户输入 Token 或任务 ID。
- Extension 凭证是最小权限凭证，只能访问绑定账号的采集任务、上传快照/脉冲和读取最新诊断，不能审批或执行。
- 项目复用页面只调用服务端 clone；源配置作为可编辑预填值，允许调整主体、操盘、合作关系、服务商和本次分摊成本，但账号归属保持锁定。跨账号篡改 URL 已由浏览器和 API 测试双重验证阻止，源项目不会被修改。
- 手工指标/CSV 兜底已落地；必须确认当前账号，已识别字段人工复核，未知字段进入漂移队列，敏感字段拒绝导入。
- 正式决策新增 readiness：基础路线缺失、账号未确认、主体待校准或关键指标未复核时只允许保守预演。
- 决策中心改为工作区级分页查询，按账号分组；动作详情显示账号、项目和任务上下文。
- 本地 Compose 地址仍为 Web `http://127.0.0.1:3300`、API `http://127.0.0.1:4300`，配对 migration 已实际应用。
- 当前 83 项测试、typecheck/build、Prisma 与版本门禁通过；最新本地 API/Web/PostgreSQL 镜像均 healthy。
- 根版本仍为 `0.2.2`。未整理提交、标签和 ZIP 前，不得把当前工作树称为 V0.2.3 已发布版。

## 2026-07-14 V0.2.2 账号档案复用与防串档交接

- 当前开发主线不再以“项目”为第一入口，而是以长期 `AccountProfile` 为第一入口。
- 一个账号可有多个项目；同一活动继续原项目，新活动或新统计周期复用配置创建新项目。
- 账号 ID 优先唯一；同名不同 ID 必须保持独立，改名后仍以 ID 找回原档案。
- `Project.accountProfileId` 为必需关系，任务、快照、指标、诊断和动作建议通过项目继承账号归属。
- Extension 尝试从当前可见页面和 URL 精确识别账号 ID/名称；不做模糊名称匹配。
- 服务端是最终安全边界：账号不一致拒绝，账号无法识别隔离待确认，人工确认会记录确认人、时间和证据。
- 任务创建使用幂等键，并默认生成 5 条采集路线；`localads.chengzijianzhan.cn` 已加入精确白名单。
- Dashboard 账号卡片已有永久删除入口。确认流程使用站内 `ConfirmDialog`，会展示账号名称、项目/任务数量和不可恢复警告；确认后清理账号全部历史链路并保留 `ACCOUNT_PROFILE_DELETED` 审计。
- Dashboard 未登录入口与登录页已完成响应式视觉整理：移动端首屏保留明确登录入口，桌面端展示主体识别优先的工作流与人工决策边界。
- 本地预上线地址为 `http://127.0.0.1:3300`，API 为 `http://127.0.0.1:4300`，三服务当前 healthy。
- 本轮全量 typecheck/test/build/Prisma 校验通过，浏览器主流程通过。
- 下一位 Codex 应优先完成真实平台账号 A/B 防串档验收，再整理 V0.2.2 发布提交，不要扩展自动执行能力。

## 当前项目一句话概述

AI 智能投流诊断与决策闭环系统面向巨量本地推 / 本地生活 / 服务商场景，第一阶段只做数据采集、诊断、动作建议、人工审批、人工执行记录和执行后复盘。

## 当前版本

- 当前源码产品版本：V0.2.2
- 当前状态：V0.2.3 功能与本地预上线验收收口中，尚未形成发布提交、标签或 ZIP

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
- 当前开发接力重点是完成 V0.2.3 可追溯发布，并在 staging 用真实账号 A/B 与固定目标页面校准账号证据、适配器、覆盖率和实时延迟。

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

## 2026-07-15 正式决策卡死修复交接

- 真实任务中五条路线均存在快照，但直播概览、商品、流量和本地推总览为 `UNVERIFIED`；此前 UI 只能确认最新的任务列表快照，形成无法继续的死锁。
- `CaptureSummaryDTO` 已增加逐路线快照和账号信息，Web 在路线卡片及人工核对步骤提供逐路线确认入口。
- 手工确认快照后会同步路线心跳并刷新 CollectionRun；确认生成的 NormalizedMetric/ReviewedMetric 会进入当前批次汇总。
- 正式决策 readiness 不再把 `dataQuality.blockingReasons` 全量升级为全局阻断，只保留路线缺失、账号未确认、主体未校准和待复核指标。
- `PARTIAL` 路线可以进入正式诊断；缺少服务商后毛利 ROI、GPM 等证据只限制依赖动作，第一版仍全部人工审批和人工执行。
- Extension 新增 GPM 提取，页面适配器版本从 `1.1.0` 升至 `1.2.0`，本机 Chrome 需要更新插件包或重新加载 unpacked 目录。
- 当前本地测试包为 `apps/extension/release/collector-local-test-v0.2.2-a6d87cdb8cbb.zip`，SHA256 `5A5C90AD1FB7741A6FA70C8F99543C1F53480EFDDCE1CEE87822BC6B515EF377`；这是脏工作树本地验收包，不冒充正式 release。
- 验证结果：shared 18、extension 19、web 4、llm 3、decision-engine 20、API 38，共 102 项测试通过；typecheck、build、Prisma validate/generate、版本一致性均通过。
- 本地 `pxxis-prelaunch-20260713` API/Web 已重建且沿用原 PostgreSQL 数据卷；`http://127.0.0.1:3300` 返回 200，API/Web/PostgreSQL 均 healthy。

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

## 2026-07-13 本地预上线验收

- 使用独立 Docker Compose 项目启动 PostgreSQL 16、生产 API 镜像和生产 Web 镜像，三项健康检查全部通过。
- API 生产镜像启动已从 `prisma db push` 修正为 `prisma migrate deploy`；全新数据库实际应用两段正式 migration。
- Docker build 显式注入 Git SHA、构建时间和 schema 版本，运行时注入 Extension 制品 SHA256；容器 `/version` 不再返回 `unknown`。
- HTTP、注册登录、服务商项目、采集批次、服务端脱敏、12 个标准指标、MetricPulse、SSE、DecisionRun、4 条需审批建议、审批/观察/拒绝/人工执行、Outcome 和 14 条审计记录全部通过。
- 浏览器实际注册并进入 Dashboard，健康状态、版本信息和安全文案正常，控制台无错误或警告。
- 公开首页、登录页、插件说明和隐私页已统一为“可见 DOM、真实表格和白名单指标；生产版不读取平台网络响应正文”。

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

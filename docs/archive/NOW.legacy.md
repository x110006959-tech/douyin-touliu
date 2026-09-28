# 当前事实面板（NOW）

## 2026-09-19 服务端诊断结果补全（本机已部署）

- 在用户允许修改服务端诊断逻辑后，新增 `apps/api/src/ai-diagnosis/server-insights.ts`：服务端根据已复核证据生成全域投放投入产出、订单结构、直播间承接和流量入口等确定性说明，不越过事实与安全边界判定因果。
- `apps/api/src/ai-diagnosis/decision-view.ts` 在模型假设被安全过滤为空时，回退到上述服务端确定性分析，避免页面只剩目标数字或“原因待验证”。
- `apps/api/src/ai-diagnosis/orchestrator.ts` 将 `serverBusinessInsights` 注入核心裁决和最终综合提示；同时修正上一轮 `projectUsefulHypotheses` 对 POLICY/ROUTE 证据的过严过滤，避免真实诊断因服务端投影丢失实验或候选动作。
- 新增/更新回归：`apps/api/src/ai-diagnosis/server-insights.test.ts`、`apps/api/src/ai-diagnosis/decision-view.test.ts`。全仓测试实际 789 项通过，其中 API 340、Web 111、Extension 204、Shared 64、Decision Engine 41、Diagnosis Skills 8、LLM 21；整仓 typecheck、build、lint 与 `git diff --check` 通过。
- 未改 Prisma、Schema、迁移、采集协议或业务数据库。当前 API/Worker 已切换到 `pxxis-api:server-diagnosis-insights-v32-20260919`，Web 已切换到 `pxxis-web:server-diagnosis-insights-v32-20260919`；真实模型和登录后页面验收仍需用户显式发起新诊断后确认。
- 本机部署前置条件、镜像 ID、切换过程和运行时复核见 `docs/DEPLOYMENT_STATE.md` 顶部。部署后 `/version` 返回 `server-diagnosis-insights-v32-20260919`，Schema 仍为 `20260731_v035_ai_skill_diagnosis`。

## 2026-09-19 诊断结果展示修订（已并入 v32 运行态，分析质量尚未验收）

- 针对用户反馈“数据分析没有任何有用信息”，仅调整 Web 结果呈现：主卡恢复使用服务端 `decisionView`/确定性复核结论，前端补充解读不再覆盖合规、数据就绪或其他服务端裁决。
- `apps/web/src/lib/diagnosis-insights.ts` 现在只解释服务端已确认的目标差距和服务端提供的两个完整 15 分钟窗口趋势；不再从可能不同统计期间的全域 GMV、消耗、订单自行相除或推导“每单成交”“带来增量”等结论。
- 目标值为无效、不可用或与服务端状态矛盾时不展示目标判断；目标恰好相等时显示“等于目标”；趋势为零消耗或效率缺失时显示“暂不可比较”。
- 任务页隐藏重复的目标数字块；无可比历史时默认收起“历史与周期对比”，仍保留缺口说明；有真实可比行时继续展开显示。
- 新增/更新 Web 渲染与边界回归，覆盖服务端主结论不被覆盖、确定性复核优先、合规结论保留、无效目标、等于目标、零消耗趋势和空历史。
- “今天先做什么”提前到原因分析之前；原因结论常显，原始依据、相反证据和待核对项默认折叠且不删减。确定性复核冲突时不使用旧 `decisionView` 展示动作、风险或实验，避免出现“动作暂停”却仍可打开审批的矛盾。没有记录缺口不再表达成“没有关键缺口”。
- 验证：整仓测试实际合计为 785 项（API 336、Web 111、Extension 204、Shared 64、Decision Engine 41、Diagnosis Skills 8、LLM 21），纠正先前误记的 764；整仓 typecheck/build/lint 通过。后续仅 Web 布局与动作显示门禁修订再次通过 Web 111 项、typecheck、build、根 lint 和差异检查。
- 使用真实 React 组件与生产 CSS 生成无业务连接的静态样例，以 Playwright + 本机 Edge 检查 1440px/390px 宽度及教程/证据展开状态，无横向溢出；已查看手机默认和桌面展开截图。这只是离线布局检查，不是登录后真实任务或模型质量验收；一次性测试和预览文件已清理。
- 用户反馈的 AI 分析重复、缺乏经营信息仍未证明解决。本轮未改模型提示词、服务端分析或输入契约，不得把算术说明、折叠排版或绿灯测试当作 AI 质量改善。后续需要真实诊断输入/输出的可重复质量样例及相应服务端改进，不能用前端编造原因或动作弥补。
- 当前运行态已由 v32 Web 包含这些展示修订；`127.0.0.1:3300` 已切换为 `pxxis-web:server-diagnosis-insights-v32-20260919`。这代表源码已上线，不代表登录后真实任务与 AI 分析质量已通过人工验收。

## 2026-09-19 品牌与任务文案及采集教程 v30

- 本轮仅修改 Web 前端：账号创建页改为品牌示例与说明、项目任务名称示例更新、任务详情新增默认收起的采集教程组件；未改数据模型、API、Prisma、Extension 或采集协议。
- 新增 `apps/web/src/app/tasks/[id]/collection-tutorial.tsx`，固定五步教程、直播/本地推两条路线框和人工操作安全边界；使用 `<details>` 原生展开语义，默认收起，不读取任务数据、不请求 API、不改采集状态。
- 源码验证：Web 单包 15 个测试文件 95 项通过，Web typecheck、Web build、根目录 lint 与 `git diff --check` 通过。本轮按方案未执行 Prisma validate、migration 或 `db push`。
- 本机 Web 已切换为 `pxxis-web:brand-copy-collection-tutorial-v30-20260919`，镜像 ID `sha256:efc2e81b09f17569ede6464cd7aaa5b2f3fdb9e6096a155fd3afd2b2a9c6485a`。
- 候选端口 3301 验证 `/login`、`/register` 均为 HTTP 200，构建产物包含新文案和教程；正式 3300 切换后同样通过，Web running 且 RestartCount=0。
- API/Worker 保持 `pxxis-api:source-conflict-scope-v29-20260918`，数据库、Schema、数据卷、网络和插件协议未替换。
- `runtime:verify` 通过：诊断模块 Prompt v28 / Orchestration v37 / SkillSet v11，离线正常/失败事实 24/24/24，清理 1 个旧回退容器和 1 个旧镜像标签；v29 Web 镜像保留为 `pxxis-web:local-rollback`。
- 浏览器人工验收仍待用户完成：账号创建页品牌示例与说明、项目任务创建页新任务示例、任务详情教程入口/展开/两条路线/人工操作说明，以及教程不触发插件连接或平台操作。

## 2026-09-18 本机部署：来源冲突口径 v29

- 已按用户指令将本机 Web/API/Worker 成套切换为当前源码镜像 `pxxis-api:source-conflict-scope-v29-20260918` 与 `pxxis-web:source-conflict-scope-v29-20260918`。
- API/Worker 镜像 ID `sha256:722c7bcdc796244a6ab3ba9869e3b5936e331a6bbb4a59909cc13123c440d7b1`，Web 镜像 ID `sha256:5ac2eb551bdb280cf0df57c09c1e904d83309542357f026b002dcf206d6c0fd5`；运行 `/version` `gitSha` 为 `source-conflict-scope-v29-20260918`，Schema 仍为 `20260731_v035_ai_skill_diagnosis`。
- 切换前、排空后、切换后活动诊断均为 0，诊断/建议/用户计数保持 33/21/10；应用配置与网络复用原容器，Schema、数据库、迁移、数据卷和插件协议未改。
- 正式入口 `/ready`、`/version`、`/login`、`/register` 均为 HTTP 200；API healthy，API/Worker/Web 均 running 且 RestartCount=0；API 与 Worker 镜像一致，诊断模块 Prompt v28 / Orchestration v37 / SkillSet v11 一致。
- `runtime:verify` 通过：离线正常/失败事实 24/24/24，清理 3 个旧回退容器和 1 个旧镜像标签；最近回退镜像为上一版 Web v28、API/Worker v27。
- 部署脚本：`10_项目档案/project-001-字节投流/02_执行过程/2026-09-18_来源冲突口径部署/deploy-v29.mjs`。真实模型与 Chrome 页面人工验收仍未完成，离线评测不能冒充真实 AI 验收。

## 2026-09-18 来源冲突选择补全来源、单位与业务口径

- 复核来源冲突选择候选时发现，上一轮已把数值、单位、显示值、精确值和可信状态写入复核层与快照层，但 `ReviewedMetric.metricSource`、`NormalizedMetric.metricSource`、`rawEvidence.sourceType` 仍保留冲突前候选；选择 `DOM` 后页面、汇总和审计仍可能把该指标标成 `XHR_JSON / INTERNAL_API`。
- `MetricSourceCandidate` 现在携带可选 `unitSource`、`scope` 和 `scopeExplicit`，API 与 DOM 候选分别保留自己的单位来源与业务口径；`sourceConflictReviewPersistence` 同时投影 `metricSource`、`metricUnit`、`scope` 和可信证据，并显式把 `sourceType`、`sourceStatus`、`unitSource`、`semanticScope` 改为人工选择来源。
- 继续收口候选口径：只有 `scopeExplicit === true` 的候选才会把 `candidate.scope` 写入最终 `scope`/`semanticScope`；DOM 候选仅因没有语义口径而回退成指标键时，不再把 `gmv`、`spend` 等指标键伪装成真实业务口径，而是让下游按路线与指标名重新推断。
- 单条与 bulk 复核同步更新 `ReviewedMetric` 和对应 `NormalizedMetric` 的 `metricSource`、`metricUnit`、`scope`、`rawEvidence`；`IGNORE` 分支保持原行为。
- 补强最终输入断言：`decision-flow.test.ts` 在 DOM 选择回归中确认 `decision-preview.input.metrics` 的 `metricSource`、`rawEvidence.sourceType` 与 `rawEvidence.semanticScope` 均为所选 DOM 口径，避免只验证数值而遗漏来源与业务口径残留。
- 同时收口普通指标输入：非 `SOURCE_CONFLICT` 指标若请求带 `sourceSelection`，服务端现在拒绝而不是把 `manualSourceSelection` 和“人工选择候选值”写入普通证据；`sourceConflictReviewPersistence` 也只在真实来源冲突证据上生效。
- 补齐 `confirm-all` 与单条/bulk 复核的一致性：任务级确认现在会对真正可确认的字段证据调用 `recordMetricBindingCalibration`，并写入 `bindingCalibrationAttemptCount` 审计，避免只改复核状态、丢失后续采集可复用的可信字段绑定。
- 继续收口 `confirm-all` 的底层证据状态：任务级确认现在通过 `reviewMetricUpdateData` 同步把可确认证据写成 `rawEvidence.validationStatus = "TRUSTED"` 并清空 `validationReasons`，不再出现复核状态 `CONFIRMED` 但绑定校验仍是 `REQUIRES_REVIEW` 的矛盾；对应回归同时断言 `CONFIRMED` 与 `TRUSTED`。
- 补齐候选选择后的快照置信度：单条与 bulk 选择 `API`/`DOM` 时，除值、单位、来源、口径和证据外，同步把 `NormalizedMetric.confidence` 更新为 1，避免原始指标接口或路线确认记录继续读到冲突阶段的低置信度。
- 继续收口 `capture-summary` 的展示口径：`CaptureSummaryMetricDTO` 现在携带 `semanticScope`，优先读取复核后的 `rawEvidence.semanticScope`；`dashboard-overview` 的通用总览候选也使用该口径，避免选择 DOM 后通用指标仍只按路线和指标名推断旧口径。
- 验证：整仓 typecheck、build、根目录 lint 与 `git diff --check` 通过；整仓 764 项测试通过，其中 API 336、Web 90、Extension 204、Shared 64、Decision Engine 41、Diagnosis Skills 8、LLM 21，测试 PostgreSQL 容器和网络已自动清理。本地解包扩展已重建，当前源码指纹 `ffd22a1c64ec`，Bridge 9 / Collection 8 / Extension 0.2.6。源码验证阶段无 Prisma、Schema 或运行配置变更；容器切换见顶部部署条目。
- 本轮补验：`corepack pnpm test` 整仓 764 项通过；`corepack pnpm typecheck`、`corepack pnpm lint`、`corepack pnpm build` 与 `git diff --check` 通过。本轮未改扩展源码、Prisma 或 Schema；源码验证完成后已按用户指令切换本机容器，见本文件顶部部署条目。

## 2026-09-17 来源冲突选择候选后证据原子化

- 用户对来源冲突字段选择 `API` 或 `DOM` 后，原先只更新 `ReviewedMetric.reviewedValue`，`rawEvidence.normalizedValue`、`displayValue`、`fieldLabel`、`timeRange` 仍指向冲突前候选；底层 `NormalizedMetric.rawEvidence` 也仍保持 `SOURCE_CONFLICT + INVALID`，正式诊断和总览仍可能继续使用旧候选或被快照级门禁阻断。
- `apps/api/src/review-metrics.ts` 新增 `sourceConflictReviewPersistence`，返回选择候选后的 `metricUnit`、可信 `rawEvidence`、`manualSourceSelection`、`sourceStatus` 和 `validationStatus: "TRUSTED"`。
- `apps/api/src/routes/review-metrics.ts` 在单条 `PATCH` 和 bulk 复核中接入该持久化，并把同一 `normalizedMetricId` 的 `metricValue`、`metricUnit`、`rawEvidence` 一并更新为所选候选；`IGNORE` 分支保持原行为。
- `toReviewedMetricDTO.normalizedValue` 现在优先读取当前证据的 `normalizedValue`，避免来源冲突选择后“系统精确值”仍显示旧候选或“数据缺失”。
- `decision-flow.test.ts` 新增回归：API 候选为 `1200`、DOM 候选为 `1300` 时选择 `DOM`，分别通过单条 `PATCH` 和 bulk 复核验证复核证据、快照证据均为所选候选，且 `decision-preview` 为 `FORMAL_READY`、输入值正确。
- 验证：API typecheck 通过；完整 API 38 个测试文件 331 项通过；API build 通过；根目录 lint 与 `git diff --check` 通过；API 测试 PostgreSQL 容器和网络已自动清理。无 Prisma、Schema、运行配置、容器或业务数据变更。

## 2026-09-17 来源冲突忽略补齐快照层证据口径

- 上一轮只排除了 `ReviewedMetric` 行级的 `IGNORED`，但真实采集链路中来源冲突指标也会把 `DataSnapshot.normalizedMetrics.rawEvidence` 保留为 `INVALID`；`hasUntrustedSnapshotEvidence` 仍会把它当不可信证据，导致已忽略字段在真实快照形态下继续阻塞正式诊断。
- `apps/api/src/decision.ts` 现在从当前复核指标中收集 `reviewStatus === "IGNORED"` 且 `normalizedMetricId` 存在的指标，并在 `buildDecisionInput` 与 `hasUntrustedCurrentEvidence` 的快照级检查中排除对应 `normalizedMetrics`。已忽略字段仍不进入可用证据。
- 同时修正 `confirm-all` 审计的重复计数：`blockedInvalidMetricCount` 只统计非来源冲突的无效证据，避免真实 `SOURCE_CONFLICT + INVALID` 指标同时计入“来源冲突”和“无效证据”两项。
- `decision-flow.test.ts` 的来源冲突回归现在同时把快照 `normalizedMetric.rawEvidence` 改为真实的 `SOURCE_CONFLICT + INVALID`，再验证忽略后预览为 `FORMAL_READY`。
- 验证：API typecheck 通过；完整 API 38 个测试文件 330 项通过；根目录 lint 与 `git diff --check` 通过；API 测试 PostgreSQL 容器和网络已自动清理。无 Prisma、Schema、运行配置、容器或业务数据变更。

## 2026-09-17 配对解除与任务切换本地状态收口

- 复核插件本地状态生命周期后确认：解除配对只清除凭证、上下文、采集会话和实时脉冲状态，旧的页面活动、本地快照、路线上传状态和采集日志仍会留下；若之后换账号配对，旧账号的页面 URL 与任务状态可能继续出现在插件状态中。
- `apps/extension/src/service-worker.ts` 现在解除配对会清除凭证、配置、账号上下文、采集会话、待确认配对、本地快照、路线上传状态、页面活动、采集日志和全部实时脉冲持久化状态，只保留一条新的 `extension.unpaired` 日志。凭证失效后重新配对同样会先清除旧页面活动和日志，再写入新的 `extension.paired` 日志；如果当前没有活动实时脉冲，也会清除三份 live pulse 持久化状态，避免旧账号脉冲状态残留。任务切换会清除旧任务的页面活动、快照、上传状态和实时脉冲状态；重新选择当前任务不再误清正在运行的实时脉冲。
- `apps/extension/src/connection-recovery.integration.test.ts` 新增回归，覆盖解除配对后旧账号状态不可见、重新配对清除旧页面活动/日志和无活动实时脉冲状态、同任务重选不清理本地状态，以及任务切换清除旧页面活动。
- 验证：Extension 25 个测试文件 204 项通过，Extension typecheck 通过，Extension 本地构建通过；构建已同步 `apps/extension/release/local-unpacked-test-extension`，当前本地测试制品指纹为 `e367e69e1ea3`，Bridge 9 / Collection 8 / Extension 0.2.6。本机 API `/version` 已返回 Extension 0.2.6、Collection 8，与当前构建一致。未执行全仓重复验证，无 Prisma、Schema、服务端配置、容器或业务数据变更。

## 2026-09-17 Web Bridge 响应字段收口

- 插件侧 `sanitizeBridgeResponse` 原先对 `connectionSessionId`、`boundTaskId` 只做字符串判断，成功态的 `message` 也直接透传 `runtimeResult.message`；虽当前内部返回都是固定文案，但未来 Service Worker 返回结构变化时存在向网页暴露不必要文本或超长标识的回归风险。
- 现在只放行合法 UUID 连接会话标识、`A-Za-z0-9_-` 且不超过 64 字符的绑定任务标识；成功提示统一经过 `sanitizeVisibleText` 清洗并限制为 200 字符，不能把任意 runtime 文本原样带回网页。
- Web 侧 `parseBridgeResponse` 同步限制 `message` 长度和 `boundTaskId` 形态，避免伪消息或异常响应携带不安全字符串进入页面状态。
- 后续补强把 Web 侧 `connectionSessionId` 从宽松 36 字符校验收紧为合法 UUID，拒绝连字符填充等伪标识；新增 2 个 Web Bridge 回归。Web 单包 14 个测试文件 90 项通过，Web typecheck 与 build 通过；Extension 单包仍为 204 项。未重跑全仓，无 Prisma、Schema、服务端配置、容器或业务数据变更。

## 2026-09-17 动作复盘自由文本清洗与动作闭环复核

- 发现 `ActionOutcome.customWindow` 原先只做 Zod 长度限制，没有像 `note`、`conclusion` 一样经过敏感信息清洗，存在把 `Authorization: Bearer ...` 等认证文本写入业务库的风险。
- `apps/api/src/routes/action-proposals.ts` 现在对 `customWindow` 使用 `readSafeOptionalText`，命中敏感认证内容时返回 `400 SENSITIVE_DATA_FORBIDDEN`；普通中文自定义观察窗口仍可正常保存。
- `apps/api/src/security.test.ts` 新增回归：敏感自定义窗口被拒绝、正常自定义窗口返回 201、数据库只落一条清洁结果。
- 同步只读复核 `approve/reject/observe`、`mark-manual-executed` 和 `ActionOutcome` 创建链路：审批与人工执行均使用状态加过期时间的条件更新，复盘只允许 `MANUAL_EXECUTED`，服务端审计固定写 `platformAutoExecuted: false`；未发现过期动作被复活或自动平台操作。
- 验证：全仓 test 748 项通过，其中 API 330、Web 88，其余包合计 330；build、Prisma validate/generate、`version:check` 与 `git diff --check` 通过。API 隔离测试容器和网络已自动清理。无 Prisma、Schema、运行配置、容器或业务数据变更。

## 2026-09-17 来源冲突字段不能批量确认

- 修复 `POST /collection-tasks/:id/review-metrics/confirm-all` 会把 `SOURCE_CONFLICT` 待复核指标一并改为 `CONFIRMED`，且 `reviewedValue` 变成空字符串的问题。
- 同日复核确认 `INVALID` 证据同样不能按原值自动确认。`taskLevelConfirmableReviewedMetrics` 现在同时要求 `canConfirmMetric`，因此任务级确认只保留可逐项确认口径允许的 `PENDING` 指标；`SOURCE_CONFLICT` 和 `INVALID` 都保持 `PENDING`。
- 批量确认审计分别记录 `blockedSourceConflictMetricCount` 与 `blockedInvalidMetricCount`；采集大屏部分成功文案改为“仍有 N 项需人工处理”，覆盖来源冲突和无效证据两类。
- 实际验证：API 定向 `review-metrics.test.ts` 与 `decision-flow.test.ts` 共 17 项通过，API typecheck 通过；Web 单包 90 项、Web typecheck、Web build 通过；根目录 lint 与 `git diff --check` 通过。未重跑全仓。
- 无 Prisma、Schema、运行配置、容器或业务数据变更。

## 2026-09-17 已忽略来源冲突指标不再阻塞诊断

- 来源冲突字段选择“忽略”后，复核状态为 `IGNORED`，但底层证据会同步标记为 `INVALID`；诊断输入构造和就绪判断原先仍把这份已忽略指标算作不可信证据，可能把本应放行的正式诊断错误阻断。
- 现在 `buildDecisionInput` 和 `hasUntrustedCurrentEvidence` 在检查不可信证据时排除 `reviewStatus === "IGNORED"` 的复核指标；已忽略字段仍不会进入可用证据，但不再作为阻塞原因。
- `decision-flow.test.ts` 增加回归：来源冲突字段忽略、无效字段改为人工值后，`decision-preview` 返回 `FORMAL_READY`，订单进入输入，来源冲突指标不进入输入。
- 验证：API typecheck、完整 API 38 个测试文件 330 项通过；测试 PostgreSQL 容器和网络已自动清理。
- 无 Prisma、Schema、运行配置、容器或业务数据变更。

## 2026-09-17 前端认证转换竞态修复

- 修复退出与重新登录之间的异步竞态：退出请求的旧 `.finally` 不再无条件清空后来建立的新会话；登录/注册后异步读取 `/auth/me` 的旧响应也不会覆盖随后的退出或新登录状态。
- `AuthContext` 增加会话过渡版本，每次初始恢复、登录、注册或退出开始时递增；只有仍处于当前过渡的异步回调才允许写回 CSRF、token 和 user。积分刷新守卫仍在每次转换开始时失效。
- 登录失效跳转现在等待退出请求收尾后再整页跳转，避免浏览器取消撤销请求后登录页再次恢复旧会话；普通退出按钮的调用方式不变。
- `setToken` 改为稳定回调，避免依赖它的副作用因子用户余额等无关 `user` 更新被重新触发或中断。
- 仅拿到新 CSRF 后补读 `/auth/me` 失败时，现在同步清空 CSRF、token 和 user，避免进入“有会话、无用户”的半登录状态。
- 新增回归断言，覆盖旧退出与旧 `/auth/me` 响应不能清除新登录；Web 测试从 87 项增至 88 项。
- 验证：整仓 typecheck、lint、build、test 通过；测试合计 745 项，其中 API 327、Web 88，其余包合计 330。API 测试容器和网络已自动清理。无 Prisma、配置、运行容器或业务数据变更。

## 2026-09-17 Worker 孤儿租约兜底

- 修复诊断 Worker 在第三次运行进程退出、租约过期后，记录永久停留在 `RUNNING` 且积分不返还的边界。
- `claimDecisionRun` 现在先在同一事务内回收 `AI_SKILL_ORCHESTRATED` 且 `attemptCount >= 3`、租约已过期的 `RUNNING` 记录：标记 `FAILED:ORPHANED_LEASE`、错误码 `AI_DIAGNOSIS_MAX_ATTEMPTS`、清空租约并同步历史存档为 `FAILED`；已扣费且未返还的记录按 workspace owner 幂等退款，重复扫描不会重复退款。
- 每次孤儿回收会同步写入 `AI_DIAGNOSIS_ORPHAN_RECOVERED` 审计，记录决策运行 ID、尝试次数和终态错误码，便于后续定位真实 Worker 崩溃。
- 同时把成功提交的最终写入改为 `RUNNING + leaseOwner` 条件更新；旧 Worker 若在提交过程中失去租约，不会再无条件覆盖已由兜底写入的 `FAILED` 状态。
- `startDecisionWorker` 的定时 tick 现在统一接收领取/兜底阶段异常，并由主进程记录；瞬时数据库或领取冲突不再形成未处理的 Promise rejection。
- 新增回归覆盖过期上限运行只结算一次、未来租约仍保持 `RUNNING`；整仓 typecheck、lint、build、test 通过，测试合计 744 项，其中 API 327、Web 87，其余包合计 330。无 Prisma、配置、运行容器或业务数据变更。

## 2026-09-17 本机 API 端口转发恢复（插件连接）

- 插件“连接不上”的根因是宿主机 `127.0.0.1:4300 -> 4000` 端口转发再次出现空响应；API 容器内部 `4000/version` 正常返回 `collectionProtocolVersion=8`。
- 仅执行 `docker restart pxxis-prelaunch-20260713-api-1` 重建端口转发；未改 Web、Worker、PostgreSQL、数据卷、Schema、迁移或业务数据。
- 恢复后 `4300/version`、`/ready`、`/auth/login` 均正常返回，`/auth/login` 返回 401 业务 JSON 而非空响应；Web `3300/login`、`/register` 仍为 200。
- 插件协议与指纹未变（Bridge 9 / 采集 8 / `f78758cb3a65`）。仍需用户在 Chrome 重载本地扩展并刷新任务页完成真实连接验收。
- 同日完成账号积分链路补充检查：Web 积分刷新增加旧响应防护，并把余额读取失败降级为不影响诊断创建结果；API 登录限流把手机号归一化下沉到限流模块，留存任务同时清理已过期限流桶。随后继续修复 Worker 过期上限运行无法回收的问题，整仓 typecheck、lint、build、744 项测试通过，无 Prisma、配置、运行容器或业务数据变更。

## 2026-09-16 Web 部署修复与插件连接说明

- Web 已切换至 Linux 正确构建的账号积分镜像 `pxxis-web:accounts-credits-v28-20260916`；`/login` 与 `/register` 均实际返回 HTTP 200，构建路由清单含 `/register`，不再使用嵌套 `.next` 制品。
- API/Worker、数据库和迁移未重复变更；业务计数保持用户 10、诊断 33、建议 21。
- `corepack pnpm runtime:verify` 已通过：API/Worker 模块一致、离线正常/失败评测 24/24、Web 制品布局检查通过，旧应用资源已按白名单清理。
- 插件连接协议与指纹未因本次 Web 修复改变；本机解包插件仍需在 `chrome://extensions` 点击“重新加载”，再刷新任务页和目标平台页。未完成浏览器 UI 实际连接验收，不能将其宣称为已验证。

## 2026-09-15 账号积分部署与代码图谱完成

- 本机 Web/API/Worker 已成套切换至 `accounts-credits-v27-20260913`；API 镜像 `sha256:a369a492051dd68a1b721a90dbd00ddbc28609dc55f927ef9f23818881cb2175`，Web 镜像 `sha256:8e9c0b6e958e8693264fd1ab7dbe3fb912570d42c2fdd63fc7f7948266b85224`。
- 正式本机库已应用 `20260910120000_simplified_accounts_and_credits`；用户 10、诊断 33、活动诊断 0、余额总和 0，迁移前后业务计数未变化。
- 运行验证通过：4300 `/ready`、`/version`、3300 `/login` 均 200；API/Worker/Web 均运行且重启 0；离线诊断 24/24 + 24/24 通过；旧应用容器与隔离演练资源已清理。
- 代码图谱已用 `.cbmignore` 完成全量索引：6,780 节点、18,584 条边，其中 `CALLS` 7,219 条；已生成 `.codebase-memory/graph.db.zst`。认证注册、积分扣减与返还函数均可追踪调用关系。

## 2026-09-12 简化版账号与积分源码完成

- 已完成邮箱/手机号可选唯一登录标识、注册即登录、初始 5 积分、诊断扣费与失败幂等返还，以及 `GET /credits` 和 Web 注册/余额展示。
- Prisma migration 为 `20260910120000_simplified_accounts_and_credits`；旧邮箱用户兼容登录且余额保持 0，新注册不创建 `PendingRegistration`。
- 实际验证：Prisma validate/generate、lint、typecheck、build、全仓 716 项测试均通过；测试 PostgreSQL 容器已清理。
- 尚未执行生产迁移、部署、提交或推送；正式业务数据库不受本轮验证影响。剩余风险是生产迁移需按发布流程执行，并需补充真实页面级注册/登录/扣费验收。

## 2026-09-08 Git/GitHub 同步

- 已将本轮诊断闭环、项目历史对比、场景分析、连接恢复、失败步骤脱敏诊断、Prisma migration、测试与本地解包插件构建产物创建为 `main` 分支提交 `3bb0970`，并成功同步至 GitHub `main`。
- 本机环境目录 `.runtime-switch-v19/` 与部署过程日志未纳入版本提交；它们继续留在本机供运行态交接使用。
- 已通过全仓 `lint`、`typecheck`、`test`、`build`、Prisma `validate`/`generate`、`version:check`、代码卫生与架构边界检查，以及离线诊断评测。

> 本文件是项目的**当前事实单一来源**。它只记录已核实的现状、未完成阻塞和下一次验收；不承载完整历史。
>
> 最新真实运行核对仍为 2026-09-08 00:40，v28 运行 `cmtrgv5qf000qnx07ezpfi3y9` 在最终建议阶段失败。一次修复后仍报 `experiments.0.steps.0` 观察实验包含预算调整；五个 Skill 全部成功，0 个动作建议。最终回复原文未保存，尚不能区分模型实际建议调整与文本识别误判。14:23 已部署失败步骤脱敏诊断，尚未产生新的真实诊断。

## 一分钟现状

> **当前运行基线：**API/Worker 为 `diagnosis-validation-v26-20260908`，Web 为 `diagnosis-scenario-candidate-v24-20260906`，实际 Prompt v28 / Orchestration v37 / SkillSet v11。观察实验失败可留下有限脱敏步骤诊断；累计 ROI 达标与趋势/区间未知分别判断，真实矛盾、无依据阈值和动作门禁保持不变。见 [部署记录](./DEPLOYMENT_STATE.md)。

> **磁盘插件制品说明：**整仓构建按现有脚本同步本地解包目录；磁盘构建不代表 Chrome 已重载。本轮不增加插件采集范围、协议或平台操作，AI 闭环修复无需重新安装插件；下文指纹属于此前连接恢复的历史验收基线。

> **2026-09-05 五项审计修复已部署到本机：**未知调整对象失败关闭；复用请求同键/并发重试不重复建档；前后比较限定已结束窗口及两侧有效样本；周期校验完整分钟覆盖、同日同轮次及计数重置；比例/均值/瞬时值不跨日相加。630 项源码测试及镜像内 24/24 离线评测通过，API/Worker 均核验 Prompt v24 / 编排 v31，详见 [验收记录](./AUDIT_2026-09-05.md)。无 Schema 或配置变化，无需更新插件；真实模型与 Chrome 人工验收仍独立待完成。

| 维度 | 已核实事实 | 结论 |
| --- | --- | --- |
| 发布 | `v0.2.6` 正式生产扩展归档已从源码基线 `89a5de704f91` 生成，SHA-256 为 `48668223d1a5dedfcae4c9ae59152ad36e20371facc95076632ba06c0d69720a`；GitHub 源码提交为 `95986d1b944e`，制品提交为 `0b019b827a7d`。 | GitHub 主分支、`v0.2.6` 标签和 [Release](https://github.com/x110006959-tech/douyin-touliu/releases/tag/v0.2.6) 已上传；这仍不是生产部署。 |
| 本机运行态 | API/Worker v26、Web v24；3300 登录页、4300 `/ready` 与 `/version` 均为 200，API healthy，三个容器重启 0。 | 实际 v28/v37/v11；14:23 切换前后活动 0、诊断 31、建议 20，配置与 Schema 不变。`runtime:verify` 通过，删除 3 个旧容器和 1 个旧标签，只保留当前应用容器及最近回退镜像。 |
| 运行边界 | 本项目仅进行本机验收；平台操作必须由用户手动完成。 | 不执行自动点击、改预算、暂停计划或表单提交。 |
| 实时采集 | 直播与本地推均为约 30 秒的用户显式启动脉冲；直播 7 项、本地推 13 项，按 `routeKey` 独立。 | 429、身份变化、离开精确页面等安全失败必须停止；本地推的 `selected_advid=ALL` 仅作为“全部广告主”筛选标记，不会覆盖同页数字广告主身份。 |
| AI 诊断 | v27 的 `cmtr94uqs000zpe07t8wm3adm` 直播中成功；`cmtrg3m4q0178pe07j3dym9tp`、`cmtrg59e5017ppe07xybq8e13` 场后复盘失败，各领域成功，最终建议阶段报 ROI 确定性冲突。 | 实际累计 ROI 55.44 / 目标 60，近期两个窗口消耗为零。旧校验误将趋势、区间 ROI 未知视为否认累计结果，已用已存领域语句复现；失败最终原文未保存，不能声称逐字还原。 |
| 诊断页面 | 校准大屏的诊断仍在本页下方展示。业务主区展示经营判断、事实、待人工动作与关键缺口；Skill、规则裁决和证据 ID 折叠到详情。 | 已移除“AI 诊断尚未就绪”黄色提示；已把确定性冲突等内部错误转成业务化安全停止说明。生成/重跑按钮的可信数据门禁仍保留。 |
| 目标 ROI | 经营数据总览标题栏中央提供深色横向“本次目标 ROI”输入；停止输入约 0.7 秒后自动保存，可清空，合法范围为大于 0 且不超过 10000。 | 目标按任务保存为可信人工输入，进入本次 `DecisionRun.inputJson`、诊断证据目录与证据指纹；诊断遇到同值在途保存时只等待结果、不重复写入，保存失败会阻止创建诊断；活动诊断期间禁止改值。 |
| 项目历史对比 | “账号 → 项目 → 历史对比”已在 3300 运行；分析存档、同场前后、两轮采集、7/30 天周期比较均由服务端确定性计算。 | 新增 migration `20260903210000_project_history_comparison` 已应用，三张历史表存在；源码 602 项测试与构建验证通过，待用户登录后验收真实页面数据。 |
| 工作树 | `v0.2.6` 发布基线为 `89a5de704f91`；其后工作树包含连接恢复、实验变量修复、项目历史对比、审计、评价修复、诊断闭环、分句校验及场景分析。 | 本机 API/Worker 已部署 ROI 修复 v25，Web 为场景 v24；本轮无 Git 提交/推送或生产环境发布。 |

## 当前 P0：场后复盘最终观察方案校验失败（脱敏诊断已部署，待新证据）

- 最新真实运行创建于 00:40:12、完成于 00:40:55，Prompt v28，状态 `FAILED:SYNTHESIZING_ACTION_PLAN`。完整错误：`DIAGNOSIS_OUTPUT_INVALID` → `DIAGNOSIS_EXPERIMENT_INVALID: experiments.0.steps.0：观察实验不得夹带经营设置调整（预算）`。
- `aiResultJson`、`finalResultJson` 均为空，现有持久化日志未包含被拒绝步骤原文；无法据此认定是实际预算调整还是“保持/核对预算”误识别。本次仅只读核对，没有改校验或重跑模型。
- 最终解析先执行实验校验，再执行 ROI 一致性校验，因此本次停止点不能作为 ROI 检查已通过的证据。下一步需具备脱敏的被拒步骤与校验原因，才能针对真实输入修复并验证；不得仅因失败而放宽观察实验门禁。
- 09-08 已完成并于 14:23 部署 v28/v37/v11 的失败步骤诊断：仅记录被拒业务步骤、位置和确定性识别结果；常见密钥、长标识、账号/身份字段、联系方式和 URL 整条抑制，普通“保持/核对/提高预算”语义保留。最多 3 个去重检查，最终失败状态、存档和已有审计事务提交；修复成功及租约失效不写失败审计。
- 安全补强后全仓 734 项、lint/typecheck/build/version/Schema/diff 与离线正常/失败各 24 例通过；候选 12 项哈希一致。部署后 `runtime:verify` 通过并完成受保护清理。当前失败审计仍为 0，说明尚未产生新失败证据；原失败原因仍需用户显式新建诊断确认，详见 [诊断记录验收](./VALIDATION_DIAGNOSTIC_2026-09-08.md)。

### 已部署的 ROI 范围修复

- 09-08 两次真实失败均为 `FAILED:SYNTHESIZING_ACTION_PLAN`，错误 `DIAGNOSIS_OUTPUT_INVALID` 包含 `DIAGNOSIS_DETERMINISTIC_CONFLICT`；各 5 个 Skill 成功，失败运行各 0 个动作建议。不是模型连接或采集失败。
- 原校验只要匹配“无法判断…ROI”即失败，已存领域语句“缺少近期同口径历史趋势，无法判断当前ROI和消耗是在改善还是回落。”可稳定复现。修复只区分累计已知值/达标与趋势、原因、不同窗口/计划问题；保留目标引用、确定性主标签及真实矛盾拦截，补充主语在前的否认反例。
- 当前运行 v28/v36/v11，17 项新增回归、716 项全仓测试及 lint/typecheck/build/version/Schema/diff 通过。00:37 已按用户指令部署，11 项候选制品哈希、候选/运行离线正常与失败各 24 例通过，测试和候选临时资源及旧应用容器已清理。本次未调用真实模型或改写旧记录。详见 [排查与修复记录](./ROI_SCOPE_VALIDATION_2026-09-08.md)。

### 已部署的场景分析基线

- 用户分享对话最后要求场景切换真正改变分析方式、结果能分析本场直播。现按冻结场景选择不同的领域问题、固定顺序与两阶段综合重点；所有原必需领域与数据审计保留，不增加模型请求。领域上下文同时按路线/指标隔离，投放领域补接已采集的全域成交与订单。
- 成功页新增有据的待验证分析、支持/相反证据和核对问题，详细事实折叠；失败或确定性冲突不展示分析，旧记录中的无效引用/调整指令不作为新审批入口。切换场景只影响下一次运行，现有报告继续使用已冻结场景。
- 源码 Prompt v27 / Orchestration v35 / SkillSet v11；699 项全仓测试、lint/typecheck/build、版本及 Schema 检查通过。API/Web 候选 `diagnosis-scenario-candidate-v24-20260906` 的健康、7 项页面文案、11 项制品哈希和正常/失败各 24 例通过；本次测试库、容器和网络已清理。09-07 10:41 原候选制品已部署本机，运行模块和页面核验通过，`runtime:verify` 再次确认无网络正常/失败各 24 例并清理旧应用资源。无数据库/配置/插件协议变更，未调用真实模型；刷新网页即可使用，真实新结果仍需用户显式新建诊断。详见 [场景验收](./DIAGNOSIS_SCENARIO_ACCEPTANCE.md)。

### 此前诊断闭环的运行与验收基线

- 此前 API/Worker 基线为 Prompt v26 / Orchestration v34 / SkillSet v10，现已升级 v28/v36/v11。领域只分析事实、假设、缺口，最终最多一个实验/关联动作；新模型只提交 abortCriteria，服务端派生兼容停止字段，重复旧字段直接拒绝。
- 独立 trustedFacts 在成功和失败页面共用；目标、趋势、原因分别表达。209.94 / 200 只声明目标达成，普通支付 ROI 不替代全域 ROI；不同来源金额分组，在线 0 不推断下播。
- 服务端冻结使用场景、两个完整 15 分钟窗口和同任务最近 5 条人工执行及最新结果。上下文参与指纹，Worker 不重建或覆盖新冻结输入。未执行不进执行记忆，未复盘优先记录结果，旧历史缺少上下文即未知。
- 全仓 671 项测试、lint/typecheck/build/version/Schema/diff 检查通过；离线正常与综合失败各 24 例，数据库集成确认领域成功但综合失败时事实可见、FAILED 状态保留、动作数为 0。
- API/Web 候选镜像标签为 diagnosis-closure-candidate-v22-20260906；隔离健康检查、镜像内离线评测和 9 项关键制品哈希一致性通过，候选临时资源已清理。详见 [闭环验收](./DIAGNOSIS_CLOSED_LOOP_ACCEPTANCE.md)。
- **2026-09-06 17:23 已部署分句校验 v26/v34。** 首次全仓 683 项通过，补充 4 个反例后最终 API 275 项通过，其他包未变（合计 687）；lint/typecheck/build/version/diff 通过，候选 10 项哈希与正常/综合失败各 24 例通过。部署后 `runtime:verify` 通过并清理旧应用资源，重复清理为 0。
- 用户此前已授权一次真实 AI 验收，17:02 失败后于 17:27 发起的新运行已成功（本轮只读确认）。该次授权已落实；新场景版的真实模型效果未验收，不能把旧成功或离线评测作为新策略质量证明。无数据库、Schema、配置或采集范围变化。
- 清理累计删除 21 个旧应用容器、45 个历史镜像标签及 1 个本次无标签中间镜像。最近回退仅保留镜像；旧 `.runtime-switch-v19` 临时环境文件的删除被自动审批策略拒绝，仍保留，未绕过。

## 当前 P1：插件重建后的连接恢复（本机已切换，待 Chrome 重载验收）

- 根因已修复：配对码兑换后立即保存凭证再校验上下文/心跳；失败和 Worker 重启不再丢失已兑换凭证。每 5 秒先恢复/续接当前任务，再读取服务端状态；临时失败不再锁死在首次失败，也不再要求重复输码。
- 网页连接、绑定成功提示及跳转共用同一判定：本地配对、当前任务、当前 Worker 连接标识、版本/指纹、服务端 15 秒内有效心跳必须一致。Popup 同步本地绑定变化，临时 API 故障保留凭证；旧页面脚本与新 Worker 不一致时要求刷新。
- Bridge 协议为 `9`，采集协议仍为 `8`；本地解包插件指纹为 `71da1f485d4f`。配套镜像均为 `connection-recovery-v16-20260903`，不得只更新插件而保留旧 Web/API。
- 实际验证：全仓 lint/typecheck/build、563 项测试（Extension 198、Web 75、API 163）、version check、diff check 通过；候选 API `/ready`、`/version` 为 200，候选 Web 容器内 `/login` 为 200。候选仅做健康与版本核验，未创建业务记录，已停止并移除。
- **用户已明确授权，3300 Web / 4300 API 已成套切换，尚未完成真实 Chrome 验收。** 下一步只需在 `chrome://extensions` 对原本地插件点击重新加载，再刷新任务页和目标后台页；不需重新上传、卸载或另选目录。指纹应为 `71da1f485d4f`。真正清空/卸载导致的凭证缺失、凭证失效或切换账号仍需显式配对。无生产部署、Git 提交、Schema 或业务数据库变更。

### 真实浏览器验收

1. 用户手动重载 `apps/extension/release/local-unpacked-test-extension`，并刷新直播数据大屏与精确 `liveboard2` 页面。
2. 分别手动启动两条路线，确认可并行、各自按约 30 秒更新、停止只影响当前标签页。
3. 在当前本机 API 上，留存 Popup 的已采到/缺失字段和脱敏日志；仅以服务端成功接收受控 API 脉冲与大屏同路线更新作为通过证据。
4. 本地推换号场景使用含数字 `advid` 与 `selected_advid=ALL` 的真实 `liveboard2` URL 验收：重载本地解包插件、刷新页面后应允许手动启动，不得因 `ALL` 显示“缺少可信广告身份”。

## 当前 P2：项目历史对比（本机已启用，待用户页面验收）

- 页面入口固定为 `账号 → 项目 → 历史对比`，和“采集任务”并列。默认展示最近两次分析；可手动选择两个分析存档，也可查看同场分析前后 30/60 分钟、最近两轮因无活动归档采集，以及最近 7/30 个完整北京时间自然日与前一周期。
- 只保留脱敏白名单数值、路线、口径指纹、时间和可信等级。服务端不会混合直播和本地推、不会用异口径数字相加或平均；效率结论必须用同路线同口径的成交额与消耗重新计算，否则只显示原始变化并标为“暂不能判断”。周期缺少完整自然日也不下结论。
- 每次真正新建的 AI 诊断会冻结当前对比上下文并建档；幂等重放和活动运行不重复建档，完全相同的当前输入与历史上下文只复用成功运行并明确标识。Worker 成功或失败会同步存档状态；页面没有额外模型解释入口或模型请求。
- 有效采集和新分析延续当前采集轮次；连续 3 小时无有效活动时，按最后有效活动时间“因无活动归档”，不得称为完整直播结束。项目历史点与分析存档按现有 365 天结构化数据策略清理。
- 2026-09-04 已确认活动诊断为 0，完成业务库备份并应用 `20260903210000_project_history_comparison`；备份文件为 `.backups/pxxis-project-history-20260903T222315Z.dump`（SHA-256 `7fddb94b0bc230b1d0b691ded9e2ec91728cb647280ecb3b49aecec46983914e`）。API/Worker 镜像 `pxxis-local-ai-validation:project-history-v18-20260903`，Web 镜像 `pxxis-prelaunch-20260713-web:project-history-v18-20260903`，正式端口 4300/3300 均已验证；旧容器保留回退。
- 本功能没有改动 Extension 源码、协议或本地解包目录，**不需要重新上传、重新安装或重载插件**。用户只需刷新 Web 并登录项目页验收四类对比；历史数据不足时页面应保守显示“暂不能判断”。

## 已跟踪：从“记录结果”升级为“可归因实验”

- 每次建议必须先登记：假设、唯一人工变量、执行前同口径基线、观察窗口、完成标准、风险止损条件及活动/内容/库存等干扰因素。人工调整只允许关联一个同类型候选动作；观察型任务不得暗含调整。
- 服务端以 `decisionView` 统一裁决主结论、事实、唯一下一步和不可执行动作原因。ROI 未达标只确认“未达目标”，不会未经因果证据直接显示“降低出价”；历史冲突运行继续只读复核。
- 复盘结果为“改善 / 变差 / 无变化”时，必须至少填写一项同口径执行前后数值；没有对照或干扰记录时禁止声称该动作带来提升。人工执行且尚未复盘时，主区优先提示“待记录结果”。
- AI 正式链路固定 `audit_data_readiness` 在先，按冻结场景确定领域 Skill 顺序，并由确定性信号固定核心标签；当前运行 Prompt v28 / Orchestration v36 / SkillSet v11。相同证据、上下文及版本的成功运行直接复用，不重复调用模型；幂等重放、并发合流和无变化复用不消耗新运行的限流配额。

## 更新规则

1. 任何代码、配置或运行态变更开始前，先读取本文件；本文件与历史文档冲突时，以本文件为准，除非本文件已过期或缺少证据。
2. 完成一个阶段时，先写入本文件的“已核实事实 / 未完成阻塞 / 验收证据”，再把完整经过追加到历史文档。
3. 本文件只保留当前 3 个最高优先级事项；已结束事项移入 `CURRENT_TASK.md`、`PROJECT_STATE.md`、`CODEX_HANDOFF.md` 或 `DEPLOYMENT_STATE.md`。
4. 写“已完成”必须附实际证据：命令及结果、运行版本/镜像、用户验收时间或脱敏日志。源码构建通过不等于运行态通过。

## 历史索引

- 当前阶段与待办经过：[CURRENT_TASK.md](./CURRENT_TASK.md)
- 项目技术与运行状态沿革：[PROJECT_STATE.md](./PROJECT_STATE.md)
- 面向下一位执行者的交接账本：[CODEX_HANDOFF.md](./CODEX_HANDOFF.md)
- 发布与本机运行态记录：[DEPLOYMENT_STATE.md](./DEPLOYMENT_STATE.md)
- 不可突破的安全红线：[SAFETY_BOUNDARY.md](./SAFETY_BOUNDARY.md)

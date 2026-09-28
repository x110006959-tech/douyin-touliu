# Project State

## 2026-09-19 服务端诊断结果补全（本机已部署）

- 产品状态：诊断结果不再依赖前端临时算术解释；服务端 `buildDiagnosisDecisionView` 在模型没有可用的有据假设时，提供基于已复核证据的确定性经营关系分析。
- 实现：新增 `apps/api/src/ai-diagnosis/server-insights.ts`，输出全域投放投入产出、全域订单结构、直播间订单结构或承接观察值、流量入口结果等；`orchestrator.ts` 同步向诊断模型注入这些服务端确认关系。
- 质量门禁：`isUsefulDiagnosisHypothesis` 现在允许 POLICY/ROUTE 证据作为可用事实来源，避免真实诊断因证据类型过严过滤而丢失合法实验和候选动作；模型仍不能伪造证据或越过审批。
- 验证：全仓测试 789 项，其中 API 340、Web 111、Extension 204、Shared 64、Decision Engine 41、Diagnosis Skills 8、LLM 21；整仓 typecheck/build/lint 和 `git diff --check` 通过。隔离测试数据库和网络已清理。
- 边界：未改 Prisma、Schema、迁移、采集协议或业务数据库；本机 API/Worker/Web 已切换到 `server-diagnosis-insights-v32-20260919`，Schema 仍为 `20260731_v035_ai_skill_diagnosis`。真实模型与浏览器页面验收未完成。

## 2026-09-19 诊断结果解读收敛（源码完成）

- 任务详情的主诊断结论不再被前端算术解读覆盖；服务端确定性结论、合规结论和冲突复核优先保留。
- Web 补充解读只消费 `DiagnosisTrustedFactsView.target` 与服务端冻结的 `recentTrend.efficiency`，不跨统计窗口相除，不把相关关系写成投放因果。
- 无效目标、目标相等、零消耗/效率缺失和空历史均有明确保守显示；无可比历史默认收起，避免用空卡片占据主要阅读区域。
- 相关文件：`apps/web/src/lib/diagnosis-insights.ts`、`apps/web/src/app/tasks/[id]/diagnosis-comparison.tsx`、`apps/web/src/lib/diagnosis-insights.test.ts`、`apps/web/src/lib/diagnosis-render.test.ts`。
- “今天先做什么”提前，分析依据与待核对项默认折叠；冲突复核时旧审批入口、实验和风险不显示，未记录缺口不再等同于已排除缺口。
- 验证：整仓实际 785 项测试，整仓 typecheck/build/lint 通过；后续 Web 修订再次通过 111 项、typecheck/build、根 lint 和差异检查。离线组件在 1440px/390px 下无横向溢出且教程/依据展开正常；这不代表真实任务与 AI 质量验收。未改 API、Prisma、Schema、采集协议或业务数据库；API 全仓测试脚本仅在隔离测试库应用现有 Schema。
- 原始 AI 分析质量诉求仍未验证解决，当前变化只改善展示与可信边界，不能据此宣称模型原因分析能力已经提升。
- 当前运行 Web 已随 v32 镜像更新，真实浏览器页面验收和真实同口径趋势验证仍待进行。

## 2026-09-19 品牌与任务文案及采集教程 v30

- 产品状态：账号创建页继续保留 `accountName` 字段语义，仅优化品牌填写提示；任务名称继续为用户自由输入，不自动计算日期、场次或生成任务名；任务详情新增默认收起的采集教程，不改变采集状态或平台操作边界。
- 实现：`apps/web/src/app/accounts/new/page.tsx`、`apps/web/src/app/projects/[id]/page.tsx` 文案调整；新增 `apps/web/src/app/tasks/[id]/collection-tutorial.tsx` 并在 `apps/web/src/app/tasks/[id]/page.tsx` 中接入。
- 教程固定五步：检测插件、连接插件、打开目标页面、点击采集、查看状态；单独展示“直播数据大屏概览页”和“本地推数据总览页”，并保留“只指导人工操作”安全说明。
- 测试：新增 `apps/web/src/lib/brand-copy-collection-tutorial.test.ts`；Web 单包 95 项通过，Web typecheck、Web build、根目录 lint 和差异检查通过。
- 运行态：本机 Web 已切换到 `pxxis-web:brand-copy-collection-tutorial-v30-20260919`，API/Worker 保持 v29，数据库、Schema、数据卷、网络和插件协议不变。
- 当前 Web 镜像 ID `sha256:efc2e81b09f17569ede6464cd7aaa5b2f3fdb9e6096a155fd3afd2b2a9c6485a`；v29 Web 镜像保留为 `pxxis-web:local-rollback`。浏览器人工验收仍待用户完成。

## 2026-09-18 本机部署：来源冲突口径 v29

- 已按用户指令将本机 Web/API/Worker 成套切换为当前源码镜像 `pxxis-api:source-conflict-scope-v29-20260918` 与 `pxxis-web:source-conflict-scope-v29-20260918`。
- API/Worker 镜像 ID `sha256:722c7bcdc796244a6ab3ba9869e3b5936e331a6bbb4a59909cc13123c440d7b1`，Web 镜像 ID `sha256:5ac2eb551bdb280cf0df57c09c1e904d83309542357f026b002dcf206d6c0fd5`；运行 `/version` `gitSha` 为 `source-conflict-scope-v29-20260918`，Schema 仍为 `20260731_v035_ai_skill_diagnosis`。
- 切换前、排空后、切换后活动诊断均为 0，诊断/建议/用户计数保持 33/21/10；应用配置与网络复用原容器，Schema、数据库、迁移、数据卷和插件协议未改。
- 正式入口 `/ready`、`/version`、`/login`、`/register` 均为 HTTP 200；API healthy，API/Worker/Web 均 running 且 RestartCount=0；API 与 Worker 镜像一致，诊断模块 Prompt v28 / Orchestration v37 / SkillSet v11 一致。
- `runtime:verify` 通过：离线正常/失败事实 24/24/24，清理 3 个旧回退容器和 1 个旧镜像标签；最近回退镜像为上一版 Web v28、API/Worker v27。
- 部署脚本：`10_项目档案/project-001-字节投流/02_执行过程/2026-09-18_来源冲突口径部署/deploy-v29.mjs`。真实模型与 Chrome 页面人工验收仍未完成，离线评测不能冒充真实 AI 验收。

## 2026-09-18 来源冲突选择补全来源、单位与业务口径

- 产品状态修正：人工选择来源冲突候选后，复核行与底层快照指标不仅要采用候选值、单位和可信状态，还必须采用候选的来源标识、单位来源和业务口径；否则选择 `DOM` 后仍会被汇总、审计、项目历史和后续证据链路表达成 API 来源。
- `MetricSourceCandidate` 增加 `unitSource`、`scope`、`scopeExplicit`，API/DOM 候选分别投影自己的单位来源与业务口径。`sourceConflictReviewPersistence` 返回 `metricSource`、`metricUnit`、`scope`，并同步 `rawEvidence.sourceType`、`sourceStatus`、`unitSource`、`semanticScope`。
- 产品状态继续收口：只有 `scopeExplicit === true` 的候选才会把 `candidate.scope` 当作最终业务口径；DOM 候选仅回退成指标键时，不再把 `gmv`、`spend` 等键名写入 `semanticScope`，避免下游项目历史和诊断输入使用伪口径。
- 单条与 bulk 复核都更新 `ReviewedMetric` 和 `NormalizedMetric` 的对应来源、单位、口径和证据字段；忽略分支不变。
- 回归验证选择 DOM 后 `metricSource`、`sourceType`、`unitSource`、`semanticScope` 均与候选一致，正式诊断输入不保留 API 来源或口径标记。
- `decision-flow.test.ts` 的最终回归进一步读取 `decision-preview.input.metrics`，确认 `metricSource`、证据来源类型和业务口径均为 DOM 候选，防止后续只验证数值而漏掉来源口径残留。
- 非冲突指标携带 `sourceSelection` 会被服务端拒绝，且候选投影函数只接受真实 `SOURCE_CONFLICT` 证据，避免伪造人工来源选择标记。
- `confirm-all` 与单条/bulk 复核已保持一致：任务级确认对可确认字段写入绑定校准，审计记录 `bindingCalibrationAttemptCount`；新增 DOM 证据回归验证校准落库。
- 产品状态继续收口：任务级确认现在会把可确认证据的 `rawEvidence.validationStatus` 同步写成 `TRUSTED` 并清空 `validationReasons`，避免复核状态已确认但绑定证据仍待复核的不一致；回归断言同时覆盖 `CONFIRMED` 与 `TRUSTED`。
- 来源冲突选择候选后会同步把 `NormalizedMetric.confidence` 设为 1，避免快照原始指标和路线确认记录继续保留冲突阶段的低置信度。
- 汇总展示口径同步补全：`capture-summary` 现在会返回复核后的 `semanticScope`，`dashboard-overview` 的通用候选据此生成口径标签，避免选择 DOM/API 后通用指标仍按旧口径展示。
- 验证：整仓 typecheck、build、根目录 lint、`git diff --check` 通过；整仓 764 项测试通过，其中 API 336、Web 90、Extension 204、Shared 64、Decision Engine 41、Diagnosis Skills 8、LLM 21。本地解包扩展源码指纹 `ffd22a1c64ec`。源码验证阶段无 Prisma、Schema 或运行配置变更；容器切换见顶部部署条目。
- 本轮补验：`corepack pnpm test` 整仓 764 项通过；`corepack pnpm typecheck`、`corepack pnpm lint`、`corepack pnpm build` 与 `git diff --check` 通过。未改扩展源码、Prisma 或 Schema；源码验证完成后已按用户指令切换本机容器，见本文件顶部部署条目。

## 2026-09-17 来源冲突选择候选后证据原子化

- 产品状态修正：来源冲突字段选择 `API` 或 `DOM` 后，复核层与底层快照指标层必须同时采用同一候选值，不能只改 `reviewedValue` 后继续保留旧 `normalizedValue/displayValue/fieldLabel/timeRange`。
- `review-metrics.ts` 增加 `sourceConflictReviewPersistence`；`routes/review-metrics.ts` 的单条和 bulk 复核都把它合并进 `ReviewedMetric` 更新，并同步更新对应 `NormalizedMetric` 的 `metricValue`、`metricUnit` 和可信 `rawEvidence`。`IGNORE` 保持原有只排除、不产生候选值的语义。
- `toReviewedMetricDTO.normalizedValue` 同步改为优先使用证据中的 `normalizedValue`，来源冲突选择后的页面精确值与复核结果保持一致。
- 新增集成回归验证 DOM 选择会通过单条与 bulk 两条复核入口同时落到复核证据、快照证据和后续 `decision-preview` 输入；API typecheck/build、完整 API 38 个测试文件 331 项、根目录 lint 与 `git diff --check` 通过。无 Prisma、Schema、运行配置、容器或业务数据变更。

## 2026-09-17 来源冲突忽略补齐快照层证据口径

- 产品状态修正：`IGNORED` 复核指标必须在诊断输入、就绪检查和快照级不可信证据检查三层都从待处理/风险集合移除，不能只在 `ReviewedMetric` 行级排除。
- `decision.ts` 使用 `IGNORED` 指标的 `normalizedMetricId` 排除对应快照 `normalizedMetrics`，避免真实 `SOURCE_CONFLICT + INVALID` 证据重新阻塞正式诊断；指标本身仍不进入可用证据。
- `review-metrics/confirm-all` 审计的无效证据计数不再重复包含来源冲突指标。
- 来源冲突集成回归已覆盖真实快照 `normalizedMetrics.rawEvidence` 形态，并验证忽略后 `FORMAL_READY`、订单进入输入且冲突指标不进入输入。
- 验证：API typecheck 通过；完整 API 330 项通过；根目录 lint 与 `git diff --check` 通过。无 Prisma、Schema、配置、运行容器或业务数据变更。

## 2026-09-17 配对解除与任务切换本地状态收口

- 插件解除配对现在会清除全部账号/任务相关本地状态，包括旧页面活动、本地快照、路线上传状态、采集日志和实时脉冲持久化状态；清理后只保留一条新的 `extension.unpaired` 日志，换账号配对不会把旧账号页面 URL 或任务状态带入新会话。凭证失效后重新配对同样先清旧页面活动和日志；当前无活动实时脉冲时也会清除三份 live pulse 持久化状态。
- 手动任务切换会清除旧任务的页面活动、快照、上传状态和实时脉冲状态；重新选择当前任务不会误清正在运行的实时脉冲，也不会用旧页面活动发送连接心跳。
- 新增 Extension 回归覆盖解除配对、重新配对、同任务重选和任务切换。Extension 204 项测试、typecheck 和本地构建通过；当前本地测试制品指纹为 `e367e69e1ea3`，本机 API `/version` 返回 Extension 0.2.6、Collection 8。无 Prisma、Schema、服务端配置、容器或业务数据变更。

## 2026-09-17 Web Bridge 响应字段收口

- 插件到网页的 Web Bridge 响应只公开固定脱敏状态：`connectionSessionId` 必须是合法 UUID，`boundTaskId` 只允许安全短标识，成功提示经过共享敏感文本清洗并限制为 200 字符。
- Web 侧桥接解析器同步校验 `message` 长度和 `boundTaskId` 形态，异常响应不会被纳入任务页状态。
- 后续补强把 Web 侧 `connectionSessionId` 收窄为合法 UUID，并新增 2 个 Web 回归；Web 单包 90 项、Web typecheck、Web build 通过，未重跑全仓。无 Prisma、Schema、运行配置、容器或业务数据变更。

## 2026-09-17 动作复盘自由文本清洗与动作闭环复核

- `ActionOutcome.customWindow` 补齐敏感信息清洗，与 `note`、`conclusion` 一致；敏感认证文本会返回 `400 SENSITIVE_DATA_FORBIDDEN`，普通中文自定义观察窗口正常落库。
- 只读复核确认动作审批、人工执行和复盘写入均使用状态加过期时间的条件更新，复盘仅允许 `MANUAL_EXECUTED`；服务端审计固定 `platformAutoExecuted: false`，未发现自动平台操作或过期动作复活。
- 新增安全回归覆盖敏感窗口拒绝、正常窗口保存与数据库只落一条清洁结果。
- 全仓 748 项测试通过，其中 API 330、Web 88，其余包合计 330；build、Prisma validate/generate、版本检查和差异检查通过。无 Prisma、Schema、运行配置、容器或业务数据变更。

## 2026-09-17 来源冲突字段批量确认收口

- 产品状态修正：`SOURCE_CONFLICT` 和 `INVALID` 复核指标都不进入任务级“确认全部”范围，必须逐项选择或处理。
- API 新增 `taskLevelConfirmableReviewedMetrics`，`confirm-all` 只更新 `PENDING`、非来源冲突且满足 `canConfirmMetric` 的指标；审计分别记录 `blockedSourceConflictMetricCount` 和 `blockedInvalidMetricCount`。
- Web 采集大屏根据批量确认结果显示“仍有 N 项需人工处理”，生成诊断入口继续阻止未完成逐项处理的指标。
- 新增 review-metrics 单元测试和 decision-flow 集成回归；API 定向 17 项通过，Web 90 项通过，API/Web typecheck、Web build、根目录 lint 与 `git diff --check` 通过。未重跑全仓。无 Prisma、Schema、配置、运行容器或业务数据变更。

## 2026-09-17 已忽略来源冲突指标不再阻塞诊断

- 产品状态修正：`IGNORED` 复核指标只代表明确忽略该候选，不应继续作为不可信证据阻塞正式诊断；来源冲突字段忽略后也不会进入可用证据。
- `decision.ts` 在构建诊断输入和就绪检查时排除 `IGNORED` 指标的不可信证据判断；原有普通忽略字段行为保持不变。
- 新增 decision-flow 回归，覆盖冲突字段忽略与无效字段人工修改后 `FORMAL_READY`、订单进入输入且冲突字段不进入输入。
- 验证：API typecheck 通过；完整 API 38 个测试文件 330 项通过，测试 PostgreSQL 容器和网络已自动清理。无 Prisma、Schema、配置、运行容器或业务数据变更。

## 2026-09-17 前端认证转换竞态修复

- Web `AuthContext` 增加认证过渡版本，防止退出请求的旧回调覆盖之后的新登录，也防止旧 `/auth/me` 响应覆盖后续退出或重新登录。
- 登录、注册、初始会话恢复和退出都会推进过渡版本；只有当前过渡的异步结果才能写回认证状态。积分刷新守卫同步失效。
- `setToken(null)` 在登录失效跳转路径返回可等待的撤销 Promise，Dashboard 会等待退出请求收尾后再跳转；普通退出按钮调用方式不变。
- `setToken` 使用稳定回调，`refreshCredits` 只随 token 重建，避免无关 `user` 更新触发认证副作用重新执行。
- 补读 `/auth/me` 失败时同步清空 CSRF、token 和 user，避免进入半登录状态。
- 新增回归断言，覆盖旧退出和旧 `/auth/me` 响应不能清除新会话；Web 测试增至 88 项。
- 整仓 typecheck、lint、build、test 通过，测试合计 745 项；API 测试数据库容器和网络已清理。无 Prisma、运行配置、容器或业务数据变更。

## 2026-09-17 Worker 孤儿租约兜底

- 修复 AI 诊断 Worker 的孤儿租约边界：`attemptCount >= 3`、租约已过期的 `RUNNING` 记录会在下一次领取前被同一事务最终化，避免永久占用运行位且积分不返还。
- 最终化写入 `FAILED:ORPHANED_LEASE` / `AI_DIAGNOSIS_MAX_ATTEMPTS`，清空租约并同步历史存档为 `FAILED`；已扣费未返还记录按 workspace owner 幂等退款，重复扫描不会重复退款。
- 每次孤儿回收同步写入 `AI_DIAGNOSIS_ORPHAN_RECOVERED` 审计，记录决策运行 ID、尝试次数和终态错误码。
- 成功提交的最终写入也改为受 `RUNNING + leaseOwner` 条件约束，避免旧 Worker 在事务后半段失去租约后覆盖兜底写入的终态。
- Worker tick 增加统一错误处理，主进程会记录领取/兜底阶段异常，避免瞬时错误成为未处理 Promise rejection。
- 新增回归覆盖“只退款和结算一次、活跃租约不误关”；整仓 typecheck、lint、build、test 通过，测试合计 744 项，其中 API 327、Web 87。无 Prisma、运行配置、容器或业务数据变更。

## 2026-09-17 账号积分链路补充检查

- Web `AuthContext` 的积分刷新增加最新请求守卫，避免并发刷新旧响应覆盖新余额；退出、重新登录和切换账号会使在途积分请求失效。
- 积分读取抽到独立 `credits.ts`，失败时返回 `null`，不会覆盖成功诊断的创建反馈或产生未捕获异常。
- API 测试增加手机号格式归一化登录限流回归，证明不同手机号写法不会绕过同一标识限流桶。
- 登录限流模块自身完成手机号归一化，降低后续新增入口因格式不同而绕过限流桶的风险。
- API 留存任务增加过期限流桶清理，只删除 `expiresAt <= now` 的桶，dry-run 不删、活跃桶保留。
- Worker 失败返还常规 catch 路径按原事务与幂等字段执行；随后补充第 3 次运行异常退出后的孤儿租约领取前兜底，见本文件最新条目。
- 验证：整仓 typecheck、lint、build、test 通过，测试合计 743 项；API 测试数据库容器和网络已清理。无 Prisma、运行配置、容器或业务数据变更。

## 2026-09-17 本机 API 端口转发恢复

- `4300` 端口转发空响应导致插件连接不上；仅重启 API 容器后恢复正常。
- Web、Worker、PostgreSQL、Schema、迁移和业务数据未改；运行端点均返回 200。

## 2026-09-16 Web 部署修复

- Web 已运行 `accounts-credits-v28-20260916` 正确构建制品，注册页 HTTP 200。
- API、Worker、数据库及账号积分迁移保持不变；运行时验证与清理通过。
- 插件代码和协议未改动；Chrome 重载及页面连接验收仍待完成。

## 2026-09-15 账号积分本机部署与图谱索引

- 本机数据库已应用 `20260910120000_simplified_accounts_and_credits`，迁移前完成 custom-format 备份并在隔离库恢复演练；现有用户余额保持 0。
- Web/API/Worker 已切换至账号积分版本，API/Worker 共用同一镜像，运行版本接口 `accounts-credits-v27-20260913`，Web 登录入口和 API 健康检查通过。
- 运行 `runtime:verify` 成功，离线结构与失败事实保留评测分别 24/24；切换后旧应用容器、旧镜像标签和隔离演练资源已按白名单清理。
- 代码图谱通过盘符映射和 `.cbmignore` 完成函数级索引：6,780 节点、18,584 条边、7,219 条 `CALLS` 边；扣费函数由诊断创建路由调用，返还函数由 Worker 失败处理调用。

## 2026-09-12 简化版账号与积分功能源码状态

- 认证模型已支持可选唯一邮箱、可选唯一手机号和整数积分余额；旧邮箱用户迁移余额为 0，新用户注册事务内获得 5 积分。
- 注册不再创建 `PendingRegistration` 或发送邮件；登录统一使用 `identifier`，服务端按邮箱或规范化手机号匹配。
- 诊断扣费与 `DecisionRun` 创建在同一事务内完成，`creditCharged`/`creditRefunded` 防止重复扣费和重复返还；幂等重放、成功复用和已有运行中诊断不重复扣分。
- Web 已新增注册入口、邮箱或手机号登录文案、余额显示、诊断消耗提示和失败返还刷新；插件无积分权限或扣费逻辑。
- migration：`20260910120000_simplified_accounts_and_credits`。本轮未对生产数据库执行迁移。
- 验证：Prisma validate/generate、lint、typecheck、build、全仓 716 项测试通过；隔离测试数据库资源已清理。

## 2026-09-09 本机登录端口转发恢复

- 3300 Web 登录页曾因 Docker Desktop API 端口转发空响应而显示 `Failed to fetch`；API 应用、数据库和容器进程本身均正常。
- 仅重启 `pxxis-prelaunch-20260713-api-1` 后，4300 `/ready`、`/version` 和登录接口恢复正常，API health 为 `healthy`。
- 本次没有源码、Schema、配置、迁移、数据库或账号数据变更，也没有修改用户凭证。

## 2026-09-08：本轮源码版本已提交，准备同步 GitHub

- 本轮完成的诊断闭环、项目历史对比、场景分析、连接恢复、失败步骤脱敏诊断、回归测试、Prisma migration、验收文档和本地解包插件构建产物已创建 `main` 分支版本提交 `3bb0970`，并已成功同步 GitHub。
- `.runtime-switch-v19/` 本机环境文件与部署过程日志未进入版本提交；数据库、业务数据、生产环境和平台操作均未因此改变。
- 验证已通过：lint、typecheck、全仓 test、build、Prisma validate/generate、version check、代码卫生、架构边界、diff check 和离线诊断评测。

## 2026-09-08 14:23：失败步骤诊断进入本机运行态

审查后先补齐常见 PAT/云密钥、长标识、账号/身份、联系方式及 URL 的整条抑制，再部署 API/实际 Worker v26（Prompt v28 / Orchestration v37 / SkillSet v11），Web 保持 v24。全仓 734 项及基础检查、离线正常/失败各 24 例、候选 12 项制品哈希和正式运行验证通过；切换前后活动/诊断/建议为 0/31/20，清理完成。无 Schema、配置、插件、真实模型或历史数据变化；新失败证据仍待用户显式运行。

## 2026-09-08：失败观察方案可诊断性补齐（源码）

新增有限、脱敏的失败步骤审计，源码 v28/v37/v11；不修改实验安全门禁，不保存未通过的完整结果。失败状态、历史存档与审计原子提交；成功修复和租约失效均不产生失败审计。726 项全仓测试及 lint/typecheck/build/version/Schema、离线正常/失败各 24 例通过。无迁移、配置、权限或插件变化；未部署、未调用真实模型，旧失败原文仍未知。见 [验收记录](./VALIDATION_DIAGNOSTIC_2026-09-08.md)。

## 2026-09-08 00:40：新真实验收未通过

v28 运行 `cmtrgv5qf000qnx07ezpfi3y9` 领域阶段全成功，最终 `experiments.0.steps.0` 被判定为观察实验夹带预算调整，一次修复仍失败，0 建议。最终步骤原文未保存，尚不能断言实际调整或误判；当前只读核对，不更改代码、配置、数据库或运行服务。实验校验先于 ROI 校验，本次不能证明后一检查通过。

## 2026-09-08 00:37：ROI 修复进入运行态

- 本机 API/实际 Worker 已部署 v25 镜像，实际 v28/v36/v11；Web 保持场景 v24。健康、版本、候选制品哈希与正常/失败各 24 例通过，`runtime:verify` 完成并清理 3 个旧容器和 2 个旧标签，保留最近回退镜像。
- 无 Schema/配置/接口变化，切换前后活动/诊断/建议为 0/30/20；未调用真实模型或修改旧失败记录。部署完成，新结果质量待显式真实诊断验收；下文未部署记录为历史阶段。见 [部署记录](./DEPLOYMENT_STATE.md)。

## 2026-09-08：场后复盘真实失败与 ROI 范围修复

- v27 直播中真实成功后，两次场后复盘都在生成最终建议时触发 ROI 一致性错误。领域分析成功，失败记录没有建议；已知累计达标结果与未知趋势/区间产出被同一宽泛正则混同。
- 服务端源码 v28/v36/v11 已按 ROI 判断对象修复，17 项新增回归、716 项全仓测试及基础构建检查通过，离线正常/失败各 24 例通过，独立测试库和资源清理完成。
- 本机仍运行场景 v24 镜像（v27/v35/v11），本次未部署。Schema、配置、接口与采集协议不变，无真实模型请求或历史改写；失败最终原文没有保存，具体原句与新修复真实效果不能据离线结果断言。详见 [排查与修复](./ROI_SCOPE_VALIDATION_2026-09-08.md)。

## 2026-09-07 10:42：场景 v24 进入本机运行态

- 用户授权后，已验证的场景候选成套部署至 Web/API/实际 Worker，运行 Prompt v27 / Orchestration v35 / SkillSet v11，直播中与场后复盘策略及分析展示已启用。
- 健康/版本/登录 HTTP 200，API healthy，三个服务重启 0，Web 7 项文案通过。`runtime:verify` 实际通过，离线正常与综合失败各 24 例通过，清理 3 个旧容器和 1 个旧镜像标签；只留当前应用容器及最近 API v23 / Web v22 回退镜像。
- 应用配置、Schema 不变，活动/诊断/建议前后为 0/27/19，无迁移、插件协议变化或真实模型请求。旧记录不改写；下文未部署描述为历史，新场景真实结果质量待单独验收。详见 [部署记录](./DEPLOYMENT_STATE.md)。

## 2026-09-06 晚间：场景分析方法与主区解释

- 源码升级到 Prompt v27 / Orchestration v35 / SkillSet v11：直播中、场后复盘、未指定分别有确定性领域调度与专属分析问题，两阶段综合沿用同一冻结场景。没有新增专家调用、模型轮数、采集字段或数据库结构。
- 页面从重复罗列事实改为固定目标事实加有据解释，支持/冲突证据与待核对问题可见；可信数据详情折叠，失败仍保留事实。动作、引用和未复核边界保留，场景草稿不能改写旧报告。
- 全仓 699 项测试与 lint/typecheck/build/Schema/version/diff 通过；09-07 09:30 候选镜像健康、7 项页面文案、11 项制品一致性和正常/失败各 24 例验证完成，临时容器/测试数据库卷/网络已清理。原本机 v26/v34/v10 已有真实成功记录，新的场景策略尚未部署或真实模型验收，详见 [验收记录](./DIAGNOSIS_SCENARIO_ACCEPTANCE.md)。

## 2026-09-06 17:27 分句校验与运行收尾

- API/Worker 本机 v23（v26/v34/v10），Web v22；已修复明确未知/缺少基准文案误拦截，健康、版本、离线评测、候选制品一致性通过。最终有效测试合计 687，未改 Schema、应用配置或插件。
- 清理已纳入 `runtime:verify` 与长期规范；旧容器、历史镜像按项目白名单清理，保留当前及最近回退镜像。累计 21 个旧应用容器、45 个标签及本轮中间镜像清理完成，其他项目和业务数据未改。
- 真实诊断 17:02 在旧版失败，修复版待新鲜采集后沿用用户授权验收；页面目前显示线路停止。旧临时环境文件删除被策略拒绝，仍需保留此未完成项。

## 2026-09-06 16:43 诊断闭环进入本机运行态

- API/Worker/Web 已成套切换到 `diagnosis-closure-candidate-v22-20260906`，实际诊断版本 v25/v33/v10；正式 ready/version/login 200、API healthy、三项服务重启 0，新 Web 事实/趋势/失败内容核验通过。
- Schema、应用配置和端口不变；切换前后活动诊断 0、诊断 25、建议 19。旧 v21 容器保留回退，无迁移、插件更新、真实模型请求或历史重跑。详见 [部署记录](./DEPLOYMENT_STATE.md)。
- 部署完成，真实模型和登录态业务页面待用户显式验收；下述未部署记录属于源码交付阶段。

## 2026-09-06 诊断闭环源码与候选完成，待正式切换

- 已完成独立可信事实、领域分析精简、最终唯一方案及单一风险条件契约；新增版本化场景/完整窗口/人工执行上下文并保护冻结与幂等复用。未新增表、配置页、采集范围或自动投放能力。
- 全仓 671 项测试与 lint/typecheck/build/version/Schema/diff 检查通过；正常与综合失败离线验证各 24 例，候选健康与关键制品一致性通过。验收记录：[DIAGNOSIS_CLOSED_LOOP_ACCEPTANCE](./DIAGNOSIS_CLOSED_LOOP_ACCEPTANCE.md)。
- 源码 v25/v33/v10；现有 API/Worker/Web 仍运行 `comparison-recovery-v21-20260905`，本次未部署。真实模型与登录态业务页面验收未执行，等待后续明确指令。

## 2026-09-05 新版真实模型验收未通过

- 18:42 用户显式运行已确认使用 v24/v32，前三个 Skill 成功，投流单元在一次修复后仍因 stopConditions/abortCriteria 不一致失败。部署生效已证实，完整真实诊断可用性仍未通过。
- 该门禁要求重复风险条件文本逐项一致，当前失败原文未留存，不能判断具体差异。只读排查未改变服务、数据库或配置；本问题独立于此前评价恢复，后续方案与边界见 CURRENT_TASK。

## 2026-09-05 18:38 无依据评价修复进入本机运行态

- API/Worker/Web 已统一使用 `comparison-recovery-v21-20260905`，运行 API/Worker 为 Prompt v24 / Orchestration v32 / SkillSet v9；网页包含本轮评价/阈值失败说明。
- 镜像构建、关键制品与 Schema 哈希一致性、24/24 无网络合成评测、候选及正式健康检查通过；三个服务重启计数 0。活动诊断前后 0，诊断/建议仍为 23/19，应用配置保持，旧三个容器停止保留，候选清理完成。
- 无数据库迁移、插件更新、真实模型或平台操作。只需刷新网页；真实诊断仍由用户显式发起验收。镜像 ID、回退及验证证据见 [部署记录](./DEPLOYMENT_STATE.md)，下述未部署状态为历史。

## 2026-09-05 无依据评价恢复完成源码验证

- AI 领域输出、最终综合、通用 LLM 修复与网页提示已配套收口。定性评价恢复保留事实和引用；数值阈值/操作条件仍失败关闭；撤回建议前后都完整验证，主结论与分句不确定性门禁已补齐。
- 编排 v32 / Prompt v24 / SkillSet v9；653 项测试、lint/typecheck/build、版本/差异检查和 24/24 离线评测通过，新增 23 项回归。详见 [本轮验收](./DIAGNOSIS_COMPARISON_RECOVERY_ACCEPTANCE.md)。
- 当前运行服务未切换，真实模型未验收。无 Schema、配置或业务记录变更，无插件源码/协议变更；整仓构建会同步本地插件产物，本轮磁盘指纹为 `9c85e446751e`，不代表 Chrome 加载态。本轮 AI 修复无需更新插件。

## 2026-09-05 12:09 审计修复进入本机运行态

- API/Worker 已从实际运行 v19 更新至 `audit-fixes-v20-20260905`，Prompt v24 / Orchestration v31；Web 保持 v18。镜像内离线评测、候选健康、编译制品哈希、正式健康和运行门禁均通过。
- 原应用配置与运行设置一致，诊断/建议数量为 23/19，活动诊断 0。无需迁移或更新插件；旧 API/Worker 停止保留，候选清理完成。部署证据见 DEPLOYMENT_STATE，真实模型/Chrome 验收仍单独待完成。

## 2026-09-05 五项审计缺陷已修复并通过源码验证

- 实验对象无法解析不再被当成只读；复用请求已统一幂等映射；历史前后、自然日覆盖和指标聚合语义已纠正，完整 7/30 天正例仍可重算 ROI。
- 630 项测试（API 228）及 lint/typecheck/build、Prisma validate、version/diff check、24/24 合成评测通过。原审计问题转为“源码已修复，运行态未更新”，详见 [验收记录](./AUDIT_2026-09-05.md)。
- 本轮仅改 API 实现、测试和文档；编排 v31 / 已有 Prompt v24。Schema、配置、兼容接口、业务数据和插件保持，未部署。本轮源码验证不能代替既有 Chrome 和真实模型验收。

## 2026-09-05 审计发现未覆盖的边界缺陷

- 当前工作树基础验证通过：604 项测试、lint/typecheck/build、Prisma validate、version/diff check；这不代表边界功能通过。
- 确认 1 项 P1（观察实验漏检调整）和 4 项 P2（复用幂等重试、分析前后选点、周期完整性、比例聚合），见 [审计报告](./AUDIT_2026-09-05.md)。历史对比目前还需要源码修复，不能只列为待页面验收。
- 本轮没有改变运行版本、Schema、配置、业务数据或源码行为，仅同步审计文档；真实浏览器和模型验收仍未完成。

## 2026-09-04 项目历史对比本机运行态已启用

- `20260903210000_project_history_comparison` 已应用到本机业务 PostgreSQL；`ProjectHistorySession`、`ProjectHistoryMetricPoint`、`ProjectAnalysisArchive` 三张表已核验存在。迁移前已生成备份 `.backups/pxxis-project-history-20260903T222315Z.dump`，SHA-256 为 `7fddb94b0bc230b1d0b691ded9e2ec91728cb647280ecb3b49aecec46983914e`。
- Web/API/Worker 已统一运行 `project-history-v18-20260903`。4300 `/ready`、`/version` 和 3300 `/login` 均通过；`/version` 的 `gitSha` 为 `project-history-v18-20260903`。切换前后没有 `PENDING/RUNNING` 诊断。
- 旧版本容器停止保留为本机回退；PostgreSQL 数据卷、现有诊断记录和平台数据未清理或改写。该功能不改 Extension，不需要重新上传、重新安装或重载插件。

## 2026-09-03 项目历史对比（候选源码已验证，运行态未切换）

- 新增项目级历史数据模型：采集轮次、按分钟去重的路线趋势点、分析存档和完整输入指纹。趋势点来自服务端已接受的有效脉冲、已验证快照或人工录入，存档来自真正新建的诊断；不保存平台响应、页面文本、URL 或认证信息。
- 对比只能在同账号、同项目内进行。两次分析支持手选；同场以前后 30/60 分钟的分析时点为边界；跨轮只比最近两轮因无活动归档采集；周期只比最近 7/30 个已经结束的北京时间自然日。不同路线、统计口径、原始比例和缺少完整日覆盖的数据不会被拼接成好坏结论。
- `DecisionRun.inputJson` 冻结本次历史上下文；相同当前证据且相同历史上下文才复用成功运行。新运行先创建 `QUEUED` 存档，Worker 完成后改为 `SUCCEEDED` 或 `FAILED`，所以失败诊断仍有可审计的本次对比基线。
- 页面入口为 `账号 → 项目 → 历史对比`，诊断结果区直接显示已冻结对比摘要，不增加额外 AI 解释入口。连续 3 小时无有效采集或新分析时，轮次按最后活动时间“因无活动归档”。
- 已通过整仓 lint、typecheck、test（7 个包合计 602 项）、build、Prisma validate/generate、version check、diff check；其中 API 隔离库为 34 文件/200 项，Web 为 11 文件/77 项。测试数据库已经清理。
- 本机运行的 v17 API/Worker/Web 仍未加载这套 Schema 或页面；没有执行 migration、`db push`、容器切换、插件重建、真实模型调用、平台操作、commit 或 push。后续启用需要先对本机业务库应用 `20260903210000_project_history_comparison`，并成套更新 API、Worker、Web；插件无需重新上传或重载。

## 2026-09-03 实验调整对象识别（本机已切换）

- 实际诊断失败 `cmtkyn9aq000blr07zs55v12d` 为实验单变量门禁拒绝。已复现并修正关键词把复合名词、固定条件和观测指标当作额外调整的缺陷；失败原文未保存，无法确认具体触发句。
- 门禁在领域 Skill 和最终综合共用，保留一次修复上限、多变量拒绝、只读实验边界及现有证据/人工审批要求。反馈增加实验步骤路径，页面显示业务原因。新版本 Prompt v23 / Orchestration v29 / SkillSet v9。
- 全仓 596 项测试（API 194、Web 77）、lint/typecheck/build、24/24 合成评测、version/diff check 通过；运行版本与候选验收以 NOW 为准。Schema、业务记录、采集插件与正式发布包未修改。
- v17 API/Worker 与 Web 镜像已通过候选健康、版本、镜像内离线评测及网页产物检查；用户授权后于 20:13 完成三个组件成套切换。运行 API/Worker v23/v29、单变量正反例、Web 编译产物及 3300/4300 健康均通过，应用配置/运行设置保持，三个旧容器停止保留回退。
- 活动诊断前后为 0，未自动调用模型、创建诊断或改写失败记录。用户刷新网页后显式重新运行以完成真实模型验收；本轮无需再次上传或重载插件。

## 2026-09-03 插件连接恢复契约（本机 Web/API 已成套切换）

- 凭证持久化与连接成功分开：一次性码兑换成功先保存受保护的本地凭证，任务上下文与心跳继续校验；网络失败不会丢掉凭证，也不会直接宣布连接成功。
- Bridge `9` / Collection `8`；新增可选 `connectionSessionId` 心跳与状态字段，Worker 重启重新生成，仅用于识别当前连接，不含身份或认证信息、不入库。旧查询方式保留；新版网页要求本地凭证、任务、会话、版本/指纹和新鲜服务端心跳一致。
- 每 5 秒恢复/续接当前任务；Popup 与网页同步本地绑定变化。API 续接保留同一会话仍新鲜的平台页证据，过期后不会继续称为可采集。账号切换、活动采集保护和人工平台执行边界保持。
- 全仓 563 项测试、lint/typecheck/build、version check、diff check 已通过；用户确认后于 11:20 成套切换 Web/API `connection-recovery-v16-20260903`，3300 `/login`、4300 `/ready`、`/version` 为 200，运行 Bridge 9 / Collection 8，Web 制品会话恢复逻辑已核验。插件指纹 `71da1f485d4f`，需用户在 Chrome 重载原目录并刷新相关页面，不需重新上传。旧容器保留回退，应用配置不变；Worker、Schema、真实业务数据、生产部署与 Git 未变。

> 当前事实、最高优先级与验收阻塞请先阅读 [NOW.md](./NOW.md)。本文件为技术与运行状态沿革，历史镜像、指纹和“待验收”条目必须结合 NOW 的日期和证据判断。

## 2026-09-02 v0.2.6 Git/GitHub 发布（已完成）

- 当前源码已统一为 `0.2.6`，包含实时路线隔离、确定性诊断调度、目标 ROI、结构化输出修复、领域证据投影、数值目标归一化及决策/实验一致性补丁。
- 已实际通过 lint、typecheck、全仓 527 项测试、build、隔离占位 `DATABASE_URL` 下的 Prisma validate/generate、version check、diff check 和 24/24 合成评测。
- 生产归档 `collector-v0.2.6-89a5de704f91.zip` 已生成，SHA-256 为 `48668223d1a5dedfcae4c9ae59152ad36e20371facc95076632ba06c0d69720a`，对应源码提交 `89a5de704f91`。
- 已创建标注标签 `v0.2.6`，GitHub 主分支已上传；GitHub 对应源码提交为 `95986d1b944e`、制品提交为 `0b019b827a7d`。GitHub Release 为 [v0.2.6](https://github.com/x110006959-tech/douyin-touliu/releases/tag/v0.2.6)，包含 ZIP 与 SHA-256 校验文件。
- 本次仅发布源码与生产扩展归档，未改变 Prisma Schema、migration、业务数据库、本机运行容器或生产部署；标准 Git HTTPS 上传连接超时后改用 GitHub 标准 Git 数据接口，未强推或覆盖已有引用。

## 2026-09-01 诊断展示、规则裁决和实验生命周期统一（本机）

- 新增服务端 `decisionView` 作为正式运行的最终展示 DTO。它从不可变诊断、确定性信号、规则裁决与候选动作状态合成业务主卡：确认事实与未确认原因分开，实际 ROI/目标/差距/达成率同屏，只有服务端允许的下一步可进入操作页；被拒绝、冷却或已完成的动作只说明原因。
- `DELIVERY_ROI` 场景不再由“ROI 未达标”直接推出“降低出价”。降低出价需要目标 ROI、消耗、曝光、点击、订单和额外因果定位证据；无此证据时主界面只要求人工检查投放单位/定向/承接/商品结构。已人工执行且无 Outcome 的动作优先进入待复盘状态。
- `DiagnosisExperiment` 增加 v2 可审计字段，正式输出由 `diagnosisExperimentV2Schema` 约束。服务端验证唯一变量、观察/调整边界、动作关联、完成标准与止损标准，并在无目标、历史、基准的情况下拒绝“良好、较高、有限、偏弱”等比较语义。旧实验保持只读兼容，仅可复盘。
- 同一任务、相同证据指纹与 Prompt/Skill/编排版本的成功运行返回 `UNCHANGED_EVIDENCE`，不再请求模型。诊断限流移动到事务内的真正新建分支，避免并发幂等请求或复用请求消耗配额。
- 当前运行态为 API/Worker `decision-experiment-transaction-v14-20260902`、Web `decision-experiment-view-v14-20260901`，Prompt v21 / Orchestration v27 / SkillSet v9。Schema 未变；全仓 526 项测试、构建、Prisma 和 24 例评测通过。真实模型重跑和平台人工操作仍待用户显式触发。

## 2026-09-01 持久化数值目标归一化与历史结果复核（本机）

- 确定性诊断指标读取同时接受有限 number 与非空数值字符串；投流消耗、全域支付 ROI 和目标 ROI 优先选择本地推路线，同名错误路线或非数字字符串不能参与裁决。
- 成功 AI 运行在读取时会用其不可变输入重建证据和核心标签。发现持久化主标签冲突时不修改历史 JSON，而是返回透明的服务端复核结果；Web 用复核结论替换主卡并暂停候选动作，服务端审批状态机同步拒绝审批、观察和标记执行。
- 运行态为 API/Worker `diagnosis-target-normalization-v12-20260901`、Web `diagnosis-review-view-v13-20260901`，Prompt v20 / Orchestration v26 / SkillSet v8。Schema 不变，当前历史运行 `cmti43z490006se0104jnubtb` 的复核结果为 `DELIVERY_ROI`。

## 2026-09-01 领域 Skill 输出确定性投影（本机）

- 服务端仍按固定计划分配领域，但不再把“模型能否在第二次纠正维度”作为整轮可用性的前提。通过 Schema 与证据白名单的领域输出会投影到已分配维度；越界假设及其依赖实验/动作被删除，不进入后续核心裁决和综合。
- 任务目标 ROI 只进入 `DELIVERY` Skill 的确定性上下文，直播间承接 Skill 仅看到自身路线证据和 `LIVE_ROOM` 维度。无效证据、无依据派生计算、业务语言违规与最终硬事实冲突继续失败关闭，未用裁剪替代这些安全校验。
- 运行态为 API/Worker `diagnosis-domain-projection-v11-20260901`、Web `diagnosis-domain-view-v12-20260901`，Prompt v19 / Orchestration v25 / SkillSet v8。Schema、历史运行和动作状态不变，真实模型结果仍待用户显式重跑。

## 2026-08-31 否定语义与领域边界精确校验（本机）

- 确定性漏斗门禁不再用单一关键词判断肯定结论；“无法判断是否存在流失”“尚无证据证明转化偏低”等判断边界允许通过，明确声称流失、偏低或异常且缺少确定性弱信号时仍失败关闭。
- 领域 Skill 的假设维度必须与服务端分配领域一致，防止直播承接 Skill 代替投流 Skill 下结论。直播承接证据补入当前内部 API 已提供的在线人数、观看时长、成交人数和商品转化率；输入未提供的客单价等派生计算仍禁止。
- 失败展示把已知内部冲突转换为可理解的重试说明，同时保留错误码和安全停止事实。运行态为 API/Worker `diagnosis-boundary-fix-v10-20260831`、Web `diagnosis-error-view-v11-20260831`，Prompt v18 / Orchestration v24 / SkillSet v7；Schema 和历史结果不变。

## 2026-08-31 诊断核心结论由确定性信号约束（本机）

- 最新成功运行暴露出模型综合可绕过服务端已计算的硬信号：实际全域支付 ROI 44.59 低于任务目标 60，却被判为 `HEALTHY`，同时错误要求补充已存在的目标和支付数据。
- Prompt v17 / Orchestration v23 由服务端按数据完整性、流量、商品、直播承接、投流 ROI、合规风险的既定顺序确定核心标签，模型只解释固定结论。最终结果必须引用实际 ROI 与目标证据，且不得声称二者缺失或无法比较。
- SkillSet v6 将 `full_domain_pay_roi` 纳入投流证据，并将每个领域的指标证据限制到自身适用路线，禁止把直播大屏和本地推的异口径原始数拼成漏斗。Web 移除无操作价值的“AI 诊断尚未就绪”提示，不改变服务端可信数据门禁。
- 全仓 517 项测试、构建、Prisma 与 24 例评测通过；本机 API/Worker `diagnosis-trust-v9-20260831`、Web `diagnosis-trust-view-v10-20260831` 已运行。Schema、历史结果和动作状态不变，新结果仍待用户显式重跑。

## 2026-08-31 结构化诊断定向修复上下文（本机）

- 结构化补救现在区分 Zod 字段错误与项目自定义诊断门禁。只有带 `DIAGNOSIS_*` 码的已知安全异常会把限长原因送入唯一一次模型修复；未知异常继续只返回泛化结构错误，避免泄露任意异常内容。
- 领域 Skill 的证据引用和业务语言门禁仍然失败关闭，不放宽 Schema、不自动改写模型语义。变化仅是让修复请求知道具体违反了哪条门禁，并让持久化 Skill 事件保留 `DIAGNOSIS_OUTPUT_INVALID`。
- 用户的失败运行 `cmth2suql000ds4078mc01ms7` 保持不可变且没有动作建议。本机 API/Worker 已切换到 `diagnosis-repair-detail-v8-20260831`，全仓 515 项测试和构建/Prisma 检查通过；真实模型重跑仍待用户显式触发。

## 2026-08-31 目标 ROI 任务级对标（本机）

- `CollectionDashboardDTO` 增加 `decisionTargets.targetRoi` 与更新时间；大屏标题栏中央可保存本次目标，空值代表未设置。前端在确认并生成诊断或直接重新运行前，会先保存尚未提交的目标；同一草稿已在保存中时只等待其结果，保存失败则阻止诊断，避免重复写入或忽略用户输入。
- 目标 ROI 视觉已收口为与蓝色总览头部协调的深色横向控件：说明与数值分列，输入框不再使用突兀白底，保存状态降级为辅助提示。数据语义、保存时机与键盘输入行为不变。
- 服务端复用 `ReviewedMetric` 的 `snapshotId=null`、`metricSource=MANUAL_INPUT` 保存任务目标，证据明确标记为手工输入和可信；标准指标读取与复核覆盖率继续只处理快照指标，因此不会把目标混入采集数据或待确认数量。
- `buildDecisionInput` 将任务目标同时写入 `targetRoi` 和可引用的 `target_roi` 可见指标，且覆盖同名平台采集值。证据指纹包含该任务级目标；活动 AI 运行期间禁止修改，历史 `DecisionRun` 仍不可变。
- 本地推目标对标以全域支付 ROI 优先，使诊断与经营大屏“全域投放数据”口径一致。全仓 514 项测试、构建和 Prisma 检查通过；本机运行 API/Worker `target-roi-v7-20260830`、Web `target-roi-view-v9-20260831`，没有发起真实模型调用。

## 2026-08-30 决策缺口按用途聚合（本机）

- Prompt v16 不再把同类历史对比按观看、点击、成交等指标拆成多条，也不要求“同直播类型”；历史趋势只保留一条简短判断边界，最终缺口最多 3 条。
- Web 对历史 v15 结果做只读展示归并，不改持久化数据：重复历史项合并，旧冗长实验隐藏，业务动作文案剥离内部证据后缀，技术证据继续在折叠审计区可追溯。
- 本机运行 API/Worker `diagnosis-boundary-v6-20260830`、Web `diagnosis-boundary-view-v6-1-20260830`；全仓 512 项测试通过，真实 Chrome 登录态已确认业务主区无“同直播类型”和原始 evidence ID。数据库 Schema、历史运行与动作状态不变。

## 2026-08-30 经营结论优先的诊断输出（本机）

- 诊断输出从“把模型分析、内部证据和规则过程全部展示”收口为业务人员可直接使用的五段式结果：本轮经营判断、已知事实、优先人工动作、决策缺口、验证方法。完整 Skill 执行、规则裁决和证据目录仍保留，但默认折叠供审计。
- Prompt v15 与 SkillSet v5 引入业务语言和基准治理门禁：本地生活的商品、内容/直播、广告、阶段框架只用于解释当前证据；没有任务目标、同口径历史或明确外部基准时，不允许输出行业均值、健康阈值或用不同统计范围指标自造转化率/ROI。结构修复一次后仍违规即失败关闭。
- 确定性指标适配当前直播与本地推正式证据层，识别 `full_domain_pay_roi`，把缺失的目标/历史/基准明确列为 `comparisonGaps`；移除原先写死的观看、点击、转化、GPM、商品和消耗阈值。24 个合成案例继续通过，并增加当前路线缺字段、ROI 别名和违规阈值修复回归。
- 本机运行态为 API/Worker `diagnosis-business-v5-20260830`、Web `diagnosis-business-view-v5-20260830`，Prompt v15 / Orchestration v21 / SkillSet v5 / DeepSeek Flash。全仓 509 项测试、构建和 Prisma 检查通过；数据库 Schema 与已有诊断记录未改。
- 登录态页面目检尚未完成：现有 Chrome 会话已过期。旧 v14 成功运行保持不可变，新版没有自动重跑模型、没有创建新建议，也没有执行任何平台动作。

## 2026-08-30 真实诊断成功与结果持久化兼容（本机）

- 一条 DeepSeek Flash 真实运行已完成服务端固定 Skill 调度和规则裁决，状态为 `SUCCEEDED`，生成 5 条待人工审批建议；这证明第一阶段已达到“成功诊断与建议”节点，但人工执行和 Outcome 尚未完成。
- 结果页曾因规则裁决候选的 `evidenceIds` 在持久化时被共享引用保护替换为字符串而崩溃。决策引擎现隔离候选对象及证据数组，Web 同时兼容该条不可变历史结果并防御非数组证据字段。
- 本机现运行 `persisted-evidence-v25-20260830` API/Worker 和 `diagnosis-result-v4-20260830` Web；506 项测试、构建、Prisma 和 24 例合成评测通过。18 个无挂载旧容器已清理，仅保留最近回滚。

## 2026-08-30 证据 ID 可修复校验与失败解释（本机）

- Flash 首次真实领域分析曾返回一个仅少字母 `R` 的非法证据 ID。服务端原本在结构修复结束后才检查引用，因此正确拒绝了输出，却没有机会让模型按合法目录修正。
- 当前编排将合法 ID 清单放入每次模型输入，并把领域 Skill、核心裁决和最终综合的证据引用断言移入结构化修复闭包；最多修复一次，仍不合法则失败关闭。Prompt / Orchestration 版本分别升至 v14 / v21。
- Web 失败卡片现在展示失败 Skill 的安全错误原因。历史运行和原始模型输出保持不可变，数据库 Schema 与动作规则未修改。
- 本机 API/Worker 运行 `evidence-repair-v24-20260830`，Web 运行 `diagnosis-error-detail-v3-20260830`，Flash 模型不变。全仓 505 项测试及构建、Prisma、24 例合成评测通过；真实成功诊断仍待用户显式重试。

## 2026-08-30 DeepSeek Flash 默认模型（本机）

- 诊断传输层默认模型已从 `deepseek-v4-pro` 调整为 `deepseek-v4-flash`，本机 `.env`、公开示例与 Docker Compose 默认值同步；历史 Pro 评测记录保留为历史事实，不作为当前模型配置。
- Compose 的 API 服务补齐服务端 `DEEPSEEK_API_KEY`、模型、地址和超时映射，使创建 `DecisionRun` 的配置预检与 Worker 使用同一配置来源。
- 本机 API/Worker 已运行 `pxxis-local-ai-validation:flash-v23-20260830`，4300 `/ready`、`/version` 为 200，两个进程实际读取 Flash。无生成模型列表查询返回 HTTP 200 且确认该模型可用；未创建业务记录或真实模型诊断。
- 本轮全仓 lint、typecheck、502 项测试、build、Prisma validate/generate 实际通过；没有 Schema、迁移、数据库业务写入、平台操作、提交、推送或生产部署。

## 2026-08-30 入队诊断版本一致性修复（本机）

- `DecisionRun` 在排队阶段现在同时持久化正确的 `skillSetVersion` 与 `strategyVersion`（均为 v4），使配置、证据门禁或模型失败等非成功运行也保留准确审计版本；不再依赖成功 Worker 事后覆盖。
- 本机 API/Worker 已升级到 `pxxis-local-ai-validation:fixed-skill-plan-v22-20260830`，4300 `/ready`、`/version` 通过，运行产物确认包含 v4 入队写入。旧 v21 容器停止保留为回退；未改 Web、Extension、数据库 Schema、迁移、数据卷或平台状态。
- DeepSeek 模型列表已在本机容器中以现有服务端凭据只读验证：HTTP 200 且 `deepseek-v4-pro` 存在；这不是模型调用，也没有创建业务记录。

## 2026-08-30 双路线实时诊断运行态修复（本机）

- 双路线 `REALTIME_API` 输入的主证据会优先取本地推总览；旧 Skill 审计只识别直播主证据，导致任务同时拥有两条当前可信实时证据时被错误标为非正式层。现在审计与固定计划会遍历 `realtimeEvidenceItems`，对直播和本地推分别校验路线、页面、来源和指标数。
- API 与 Worker 已切换到 `pxxis-local-ai-validation:fixed-skill-plan-v21-20260829`，并在容器内验证 `managed-live-growth-skills-v4`；4300 `/ready`、`/version` 均为 HTTP 200。旧 v20 API/Worker 停止保留为可恢复的本机回退容器，Web、PostgreSQL、数据卷、Schema、迁移与插件未修改。
- 针对真实失败输入的只读检查已证明新版正式层为 `true`、证据数为 2；这三条旧运行已经过期且保留为失败历史，没有 `ActionProposal`。真实 DeepSeek 成功运行、人工审批、平台手动执行及 Outcome 仍待用户用新鲜数据完成。

## 2026-08-29 本机 AI 验收运行态准备（非生产部署）

- 当前工作树已构建为 `pxxis-local-ai-validation:fixed-skill-plan-v20-20260829`，候选 API 在 4301 验证后接管本机 4300；运行 API 标识为 `0.2.5 / local-ai-v20-20260829`。3300 Web、4300 `/ready`、`/version` 和 PostgreSQL 均实际通过。
- 当前源码 Worker 已在原有 Docker 网络运行，API 与 Worker 均仅确认 AI 开关和密钥存在性预检成功；未输出或持久化密钥。旧 API 停止保留为 `pxxis-prelaunch-20260713-api-1-rollback-ai-v20-20260829`，可用于本机回退。
- 切换没有重建 Web/PostgreSQL、没有执行 migration、`db push`、数据清理、平台操作、commit、push 或生产部署。启动前后 AI 队列均为空，未创建任何 `DecisionRun`，没有真实模型调用或动作建议。
- 当前任务数据并不满足正式门禁：2026-07-28 的历史任务虽全量复核但已过期，活跃任务尚无正式快照。必须由用户手动采集和人工复核新的当前证据；之后再以显式操作创建单条本机诊断。

## 2026-08-29 AI 诊断确定性调度第一阶段

- 正式 AI 链路已改为服务端生成并验证固定 Skill 计划：审计始终第一，领域 Skill 只由当前正式证据层、已放行路线、适用路线和注册表顺序决定，串行且每个最多一次。DeepSeek 仅用于 Skill 内分析、核心裁决和综合，不再决定调用哪些 Skill。
- 正式编排不再使用模型 Tool Calls、补漏工具循环或案例检索；案例检索实现保留兼容，`retrieveSimilarCases` 不被 Worker 调用，`retrievalEnabled=false`。证据不足的领域通过结构化拒绝展示，不发起模型请求。
- 入队与 Worker 增加 DeepSeek 配置预检：显式开启 AI 但没有密钥时，API 返回 `503 / DEEPSEEK_API_KEY_MISSING`，Worker 不领取租约。模型超时、限流或结构输出不合法都会保留失败运行，不创建动作建议。
- 本轮无 Schema、迁移、数据库、平台操作或运行态切换；全仓 lint、typecheck、499 项测试、build、Prisma validate/generate 与 24 例脚本化诊断评测全部通过。真实 AI 验收仍待用户在本机提供密钥、使用当前可信数据并人工执行平台动作。

## 2026-08-29 当前状态索引

- `v0.2.5` 是最近已发布源码/扩展归档；当前工作树含原 P0 的 3 个实时信号 API 修改及本轮确定性 AI 调度修改，均不能视为发布版或运行态已包含。
- 本机 Web/API/PostgreSQL 已于 2026-08-29 只读核验为 healthy；3300 首页、4300 `/ready` 和 `/version` 均为 HTTP 200，运行 API 返回 `0.2.5 / 4ffdf9d3a639 / 采集协议 8`。
- 当前最高风险是实时趋势可能跨 `routeKey` 取基线；补丁、验证、提交和实际运行态核验完成前，趋势只作观察。
- AI 真实诊断与可归因策略实验均未完成；采集和大屏的通过条件仍须由真实 Chrome 手动验收提供证据。

## 2026-08-28 v0.2.5 Git/GitHub 发布（完成）

- 当前源码版本统一为 `0.2.5`，源码发布基线为 `4ddacd590d55`；实时采集、经营大屏、本地推受限内部 API、扩展状态隔离和测试改动已完成。
- 已通过根目录 lint、typecheck、build、test、Prisma validate/generate 与 diff check；全仓测试 494 项通过。
- 生产扩展归档为 `apps/extension/release/collector-v0.2.5-4ddacd590d55.zip`，`localTestOnly=false`，SHA-256 为 `95ac90bb5bb7637d47c6586cd0db787702a201b93d2fdfdb3ef283b2b7f7b94b`；对应 GitHub Release 为 [v0.2.5](https://github.com/x110006959-tech/douyin-touliu/releases/tag/v0.2.5)。
- 本次仅发布源码与生产扩展归档，不涉及生产部署、平台操作、数据库、Prisma Schema、migration 或业务数据变更。

## 2026-08-28 本地推 API 平台限流缓解

- `liveReportPromoteMeta` 返回 `HTTP_429` 时仍按安全规则立即停止，不自动重试。
- 用户已将直播和本地推实时采集统一为固定 30 秒节拍；本地推的 429 失败仍设置 60 秒人工重开冷却。
- 解包 Extension 已重建；经营数据总览在收到实时帧后立即刷新，并明确显示实时 API 约每 30 秒更新一次。本机 3300 Web 已切换到 `dashboard-pulse-cadence-30s-20260828`，healthy、首页 HTTP 200；API `/ready` HTTP 200。未改采集端点、字段、数据库、Prisma 或 API 容器。全仓 lint/typecheck/build 与 493 项测试通过。

## 2026-08-28 本机 Docker 资源清理

- 已删除 5 个已停止、无挂载的本项目旧 Web/API 回退容器及其 5 个不再使用的旧项目镜像标签。
- 当前本项目仅保留运行中的 Web、API、PostgreSQL；其他项目容器、所有 Docker 数据卷和业务数据库均保留。3300/4300 仍可用且健康。

## 2026-08-28 经营大屏小时趋势已移除

- 经营数据总览不再展示“小时趋势”卡片，页面在全域指标后直接进入主屏统计与后续采集线路。
- `HOURLY_ROWS` 的采集数据、共享类型和服务端返回保持兼容，本次只收窄 Web 展示，没有数据删除、Schema 变化或采集范围变化。
- Web 41 项及全仓 493 项测试通过，全仓 lint/typecheck/build 通过。
- 本机 `127.0.0.1:3300` 已切换到 `pxxis-prelaunch-20260713-web:dashboard-no-hourly-trend-20260828`，容器 healthy、首页 HTTP 200，运行产物确认不含“小时趋势”；API 与 PostgreSQL 未替换。

## 2026-08-28 本地推指标直显修复

- 本地推 API 每轮实际成功上传 13 项，但旧经营大屏把其中同名字段并入直播卡，下半区只剩 5 个全域字段；在当前帧它们都为 `0`，造成“下方没有数据”的误导。
- 下半区现固定按本地推实时帧直接展示完整 13 项，依共享采集契约排序；上方仅展示直播路线。两条路线继续独立，不相加、不换算、不以历史或模拟值覆盖真实零值。
- 本机 Web 运行镜像更新为 `pxxis-prelaunch-20260713-web:dashboard-local-direct-20260828`，3300 healthy、API 4300 ready。已通过 Web typecheck、41 项测试、production build 和根目录 lint；无数据库、Schema、采集或生产环境变更。

## 2026-08-28 经营大屏视觉二次调整

- 用户截图反馈原全域区仍显得浅色、紧凑且与主屏不协调后，已将该区改为统一的深蓝/蓝紫信息层级；关键全域数据卡扩大为优先三列布局和更大数值字号。
- 全域区不再显示候选数量或候选展开项，采集到的主值直接显示；完整来源、复核和冲突证据仍由既有详细数据区域承载，真实零值、缺失值和安全数据边界不变。
- 本机 Web 运行镜像为 `pxxis-prelaunch-20260713-web:dashboard-harmony-20260828`，3300 healthy、HTTP 200；API 4300 `/ready` HTTP 200。已通过 Web 41 项测试、全仓 typecheck 与 build；无 Prisma、数据库、采集或生产环境变更。

## 2026-08-28 经营大屏全域数据视觉收口

- 全域经营区、概览标题和采集线路已统一为蓝紫/深靛的信息层级；卡片不再以白底从主大屏中割裂，桌面采用紧凑 5 列指标网格，窄屏按既有响应式规则自然折行。
- 数据展示语义保持可信：全域指标继续只取本地推路线，实时 API 的真实 0 不会被伪造成历史非零值；缺失、无效、忽略和冲突分别保留状态及可展开的来源详情。
- 已完成根目录 lint、typecheck、test（Shared 62、Extension 189、Web 41、Decision Engine 39、Diagnosis Skills 5、LLM 14、API 142，合计 492）、build、Prisma validate/generate 与 diff check。未改数据库、Schema、采集范围、运行容器或生产环境。

## 2026-08-28 本机 Docker 资源状态

- 已清理本机项目历史回退资源：5 个退出的 `pxxis-prelaunch-20260713` Web/API 容器及其未使用旧镜像标签已删除。
- 当前保留并运行：Web `dashboard-route-gate-20260828`、API `local-plugin-v0.2.5`、PostgreSQL；Web/API/PostgreSQL 均 healthy，3300/4300 健康检查正常。
- 未删除 Docker 数据卷，未修改数据库、配置、Schema、采集数据或其他项目容器。

## 2026-08-28 采集页大屏入口路线门禁

- 任务第 2 步新增显式“下一步：进入经营数据大屏”。两条主路线未齐全时展示灰色禁用态和缺少路线；两条均具备完整实时指标或正式采集结果后才启用。
- 直播实时路线以 7 项白名单核心指标判定，本地推实时路线以 13 项 API 白名单指标判定；任何部分实时帧都不能放行。正式采集结果仍兼容既有 `UPLOADED` 状态。
- 页面停留期间完成最后一条路线会自动跳转；已完成后返回此页仍可手动进入大屏。没有修改采集范围、API、数据库、Prisma Schema 或诊断正式门禁。
- 本机 `3300` Web 已更新为 `pxxis-prelaunch-20260713-web:dashboard-route-gate-20260828`，healthy、HTTP 200；API 与数据库运行态未改变。

## 2026-08-28 经营大屏本机运行态已更新

- 用户截图的页面与已改造的源码不一致，根因是本机 `3300` 端口仍在运行 2026-08-27 的旧 Web 镜像，而不是数据投影或页面组件回退。
- 当前 `pxxis-prelaunch-20260713-web-1` 已切换至 `pxxis-prelaunch-20260713-web:dashboard-overview-20260828`，容器 healthy、首页 HTTP 200；独立浏览器标签页已确认任务页含“经营数据总览”“直播间成交金额”“投放经营 / 全域数据”等新版结构。
- API 保持 `pxxis-prelaunch-20260713-api:local-plugin-v0.2.5`、PostgreSQL/数据卷/Schema/业务数据/Extension 均未改动。旧 Web 容器以 `pxxis-prelaunch-20260713-web-1-before-dashboard-overview-20260828` 停止保留，供本机人工回退。
- 这只是本机验收运行态的 Web 展示更新，不是生产部署；已打开的旧浏览器标签页需要硬刷新或重新进入任务大屏。

## 2026-08-28 经营大屏合并投影与视觉改版

- API 的 `CollectionDashboardDTO` 现在以新增 `overviewCards` 提供统一显示投影：直播间成交金额、订单、GPM、观看时长、在线人数、转化率等主卡按实时 API → 直播快照 → 本地推同口径候选选择；全域消耗、成交金额、订单、支付 ROI、商品点击保持本地推口径，不跨范围求和。
- 每张卡携带来源路线、来源类型、更新时间、复核状态、候选来源、统计范围和冲突状态；不返回平台原始响应、Cookie 或 Token。缺失、空值、忽略、非法和冲突均有明确状态，原始证据仍走既有详情/复核链路。
- Web 任务页已换成深色渐变主卡 + 指标网格布局，并保留真实小时趋势、采集线路、详细表格、人工校准和诊断入口；实时帧按 `routeKey` 通过共享规则重新投影，直播与本地推不会串线。
- 本轮没有 Extension 采集范围、数据库字段、Prisma Schema、正式诊断输入或生产配置变化。定向 Shared/Web/API 回归与根目录 typecheck、test（共 492 项）、build、lint、Prisma validate/generate 均已通过。

## 2026-08-28 插件版本 0.2.5 本机联调状态

- 根包与全部工作区包已同步为 `0.2.5`；本地解包 Extension 已重建到 `apps/extension/release/local-unpacked-test-extension`，manifest/build metadata 为 `0.2.5`，Bridge `8`、采集协议 `8`、源码指纹 `a8ed2e9f7b77`。
- 本地推 API 契约保持 `2026-08-28.1 / Adapter 1.2.0` 和 13 项目标不变；没有新增“整体支付ROI”，`full_domain_pay_roi` 仍为唯一支付 ROI API 键。
- 本机 4300 端口 API 已更新到 `pxxis-prelaunch-20260713-api:local-plugin-v0.2.5`，`/ready` database ready，`/version` 产品/插件均为 `0.2.5`；旧容器保留回退，数据库、Schema、数据卷与业务数据未改动。
- 这是本机验收版本，不代表生产发布或 Chrome 商店上架；Chrome 仍需用户手动重载并刷新目标页面。

## 2026-08-28 双页 API 持续采集并行状态（待 Chrome 验收）

- 已修复扩展 Service Worker 的错误全局互斥：直播数据大屏和本地推 `liveboard2` 现在按 `tabId` 各自维护 PulseState、页面活动、上传进度和最近停止结果，可同时采集。
- 同一标签页仍保持单会话保护；标签关闭、导航、身份变化、危险响应和连续失败只影响对应标签页，不清理另一页的会话。
- Popup 通过当前标签页筛选 `livePulses`，停止命令携带目标 `tabId`；旧版单状态存储可平滑解析为新按标签页对象。服务端无新增接口、Schema 或数据库字段。
- 当前解包插件已重建，源码指纹 `a8ed2e9f7b77`；Extension 189 项、全仓 487 项测试以及 typecheck/lint 已通过。真实双页运行仍需用户重载插件并分别手动开启。

## 2026-08-28 本地推截图字段核对与 13 项契约升级

- 已对当前登录态页面做只读开发者检查，确认截图里的 13 个指标卡均有真实 DOM 展示值：前 8 项属于平台数据集分组 `group_total_data`，后 5 项属于 `roi2_promotion`。旧版 `4/7` 只反映旧插件白名单，不代表网页缺少数据。
- 共享本地推 API 契约已升级为 `2026-08-28.1`，适配器为 `1.2.0`，API 目标键为 `total_watch_count`、`gmv`、`orders`、`gpm`、`live_viewers`、`clicks`、`average_watch_duration_seconds`、`current_online_viewers`、`spend`、`full_domain_gmv`、`full_domain_orders`、`full_domain_pay_roi`、`full_domain_product_clicks`。
- 采集仍是固定 `pageMetrics` 元数据 + 固定 `statQuery` 两组值查询；仍只投影 `data.StatsData.Totals[metric].Value`，保留白名单、身份校验、敏感字段/大小/Schema 门禁和脱敏失败日志。`daily_budget` 继续 DOM-only，未借用到 API 目标。
- `full_domain_*` 键用于实时脉冲区分“整体”与“全域”同名指标；MetricPulse/服务端证据校验允许字符串键，不增加 Prisma 字段或数据库迁移。
- Popup 初始覆盖为 `0/13`；扩展侧栏按 `routeKey` 区分直播 7 项与本地推 13 项，未知路线只显示等待状态，避免旧 `0/7` 误导。
- 最终本地解包制品为 `apps/extension/release/local-unpacked-test-extension`，指纹 `f4f61b2bb11d`；本轮扩展回归 47 项通过，完整 486 项测试（Extension 188）以及 lint、typecheck、build、Prisma validate/generate、version check 和 diff check 已通过。
- 本机 4300 端口 API 已按授权切换到 `pxxis-prelaunch-20260713-api:local-promotion-api-20260828`，healthy 且 `/ready` 返回 database ready；容器内共享契约已核对为 `2026-08-28.1 / 1.2.0`，`/version` 提交为 `4ffdf9d3a639`。
- 旧 API 已停止保留为 `pxxis-prelaunch-20260713-api-1-before-local-promotion-api-20260828`；Web 仍 healthy。已删除 4 个更早、无挂载的退出 API/Web 容器，运行中的数据库、缓存、网关、数据卷和业务数据未改变。
- Chrome 真实登录态采集仍待用户手动重载最终解包插件并复测；当前尚无新版 13 项脉冲上传证据。

## 2026-08-28 本地推真实脉冲复测：4/7

- 用户截图显示最新插件已开启 API 持续采集，成功上传 3 次，覆盖 `4/7`，缺失“消耗、曝光量、点击量”。
- 运行中 API 日志在对应时间段连续接受本地推脉冲，每次 `metricCount: 4`，`pageMetrics` 与 `statQuery` 均成功；服务端固定契约校验通过后才写入内存实时信号，因此这 4 项属于真实接口返回并通过白名单校验的字段。
- 目前可确认的 4 项是 GMV/成交金额、成交订单数、整体支付 ROI、全域支付 ROI；服务端不保存原始平台响应，无法仅凭日志核对数值原文，数值对账仍需用户将平台卡片与同一时刻采集结果人工比较。
- 缺失项不是接口整体故障：平台公开数据卡分组未提供可安全对应的消耗、曝光量、点击量；不把观看人数或分项点击/千次曝光借用为核心字段。下一轮根据 Popup 的脱敏日志继续定位账号实际元数据。

## 2026-08-28 Chrome 只读复测状态

- Chrome 只读发现精确 `liveboard2` 标签页仍在，URL 含完整广告/房间上下文；读取用户标签页 DOM 或开发者日志时连接超时，因此没有新的真实采集结果，也没有执行平台动作。
- 最新本地制品为 `bacad9441bcc`，已确认 release 目录实际包含嵌套 `Groups` 分组解析和脱敏日志复制入口；真实验收必须由用户重载扩展、刷新页面并手动启动采集后提供指标覆盖和脱敏日志。
- Extension 默认 `build` 现在会同步 `release/local-unpacked-test-extension`；只有显式传入 `--dist-only` 才只写入 `dist`，避免源码与用户重载制品再次不一致。
- 静态前端包复核还确认“商品点击数”“千次曝光”不是可直接替代核心“点击量/曝光量”的同口径字段，白名单暂不扩大。
- 无登录态只读请求能到达 `pageMetrics` 接口并返回“未登录”，进一步排除“接口完全不可达”，但仍没有登录态下的真实指标响应。
- 本机 API `/ready` 与 `/version` 均返回 200，数据库 ready、产品 `0.2.4`、采集协议 `8`，当前未发现本机服务版本冲突。
- 运行中的 API 容器已开启 `LOCAL_PROMOTION_INTERNAL_API_ENABLED=true`；近 24 小时服务端日志未发现新的本地推脉冲请求，说明用户尚未完成最新一轮实际采集。

## 2026-08-27 本地推分段式部分采集状态

- 用户现场的 `liveboard2` 页面可正常显示平台数据，但插件先停在 `pageMetrics / BUSINESS_ERROR`，补齐平台默认的 `advid` 后进一步暴露为 `NO_USABLE_METRICS`，说明请求上下文已修正而标签匹配仍需适配。
- 本地推契约保持 `2026-08-26.1 / Adapter 1.1.1`，固定端点和七项白名单指标不变；已允许已批准标签的单位后缀归一化、缺失指标跳过，以及可恢复 statQuery 分组失败后继续尝试。若 `/v2 statQuery` 明确返回业务失败，仅对同一分组追加一次固定 `/v3` 兜底并记录 `V3_FALLBACK`；危险响应和结构漂移仍安全停止，不扩大指标口径。
- 当前本地 unpacked 已同步重建为 `0.2.4 / Bridge 8 / bacad9441bcc`，release Service Worker 已核对包含嵌套 `Groups` 分组解析、`advid`、单位归一化、`PARTIAL_METRICS`、v2 业务失败后的固定 v3 兜底、可恢复分组继续逻辑和受限元数据诊断日志；Popup 高级面板新增脱敏采集日志、端点原因、未采到指标列表和一键复制日志入口，固定错误码同时显示中文解释，部分成功/备用接口也会留痕。无 Prisma Schema、migration、数据库业务数据、服务端配置或部署变化。
- 平台公开前端包中的表格/趋势标签已做只读对账；其中“观看人数”仍明确排除在曝光量映射之外，表格专用字段不跨组件口径借用。
- 平台公开包同时表明，账号命中 `userInfo.whiteList.bff_monorepo_data_interface` 时才切换 `/api/lamp/pc/v3`；当前插件以固定 `/v2` 为主，仅在明确业务失败时走一次受控 `/v3` 兜底，不做猜测式放宽。
- 已通过全仓 lint、typecheck、test（484 项；Extension 187 项）、build、Prisma validate/generate、version check、git diff --check。真实 Chrome 仍需用户手动重载扩展并刷新平台页后复测实际可采集数量。

## 2026-08-27 一键直连与本地推最终代码状态

- 网页直连、Popup 手动兜底和服务端绑定均使用同一精确任务心跳语义；网页流程不产生 Popup 待确认状态，配对响应只返回脱敏结果。`PAIR_TASK` 仅接收 `code`、`apiBaseUrl`，`GET_STATUS`、`SYNC_CURRENT_TASK` 禁止接收网页 payload，任务上下文仅取受信发送标签页。
- 任务页以连接代次隔离一键配对与 5 秒只读轮询，旧 Bridge/服务端结果不能覆盖新配对；只有本地凭证、当前任务绑定和服务端心跳三项同时成立才进入采集看板。瞬时心跳/上下文失败不再误生成新配对码。
- 本地推契约为 `2026-08-26.1 / Adapter 1.1.1`。启动前精确核对服务端版本；元数据歧义、重复分组、逐端点累计字节超限、任一固定端点失败或重复指标均失败关闭，不记录原始响应或平台指标 ID。
- 失败状态持续保留固定原因和 `pageMetrics`、`statQuery` 或 `metric-pulses` 最后端点；401/429、敏感响应、字节超限、Schema 漂移和身份变化立即停止，其他失败连续三次停止。
- Extension 本地构建已改为直接打包当前 shared 源码并将构建脚本纳入指纹，避免源码为新版本但 unpacked 仍使用旧 dist。当前制品为 `0.2.4 / Bridge 8 / 4f976bd1ead0`，编译值已确认 Adapter `1.1.1`。
- 已重新通过 Extension 178、Web 41、API 142、全仓 475 项测试；本轮最终 lint/typecheck/build、Prisma validate/generate、version check、git diff --check 也全部通过，本地 unpacked 已重建并核对 Adapter `1.1.1`。无 Prisma Schema、migration、数据库业务数据、运行配置或部署变化；真实 Chrome 重载与平台首轮请求待用户人工验收。
- 已只读确认现有 Chrome 任务页仍加载此前的 `b67c76ea556c / 协议 8` 制品，且显示插件已连接、当前任务服务端已验证；它不是本轮 `4f976bd1ead0` 制品，不能代表最新网页直连或本地推首轮 API 采集已验收。精确 `liveboard2` 页刷新和用户手动启动持续采集仍待验收。

## 2026-08-26 一键直连、持续采集状态与内部 API 契约收口

- Popup 现在以最新渲染代次为准，并在启动/停止动作期间暂停只读轮询，避免旧的状态检查把持续采集按钮瞬间回退为“开始”。
- 若首轮 API 请求已造成后台安全停止，点击成功提示不会覆盖最后的固定错误；用户可看到 `pageMetrics`/`statQuery` 等脱敏端点和可行动原因。
- Service Worker 只允许当前采集会话停止自己；同一广告/直播身份的 SPA URL 更新不会误触发导航停止，跨页面持续采集占用不会被新请求静默替换。
- Content Script 回调和上传请求携带会话 `loopId`，旧循环响应不能停止新循环；网页直连和 Popup 配对在兑换前拒绝已有其他任务的持续采集占用。
- 已配对任务的自动切换在目标任务心跳成功后才提交本地配置；网页固定配对错误保持可行动的重新连接入口。
- 本地推 `pageMetrics` 现只作为固定模块/数据集/分组/指标标签元数据入口，实际七项值只由固定 `statQuery` 的 `StatsData.Totals[metric].Value` 读取；平台 ID 仅按固定标签和三组白名单唯一匹配，未匹配或歧义即安全停止。
- 本地推 API 请求范围、白名单指标、三次失败保护与安全停止边界未改变。Extension 167 项、全仓 461 项测试及 lint/typecheck/build、Prisma validate/generate、版本/差异检查已通过。
- 本地 unpacked 当前为 `0.2.4 / Bridge 8 / 3c35e0fb2413`；真实 Chrome 重载、首轮请求和持续采集仍待人工验收，无数据库或运行配置变化。

## 2026-08-26 登录失效入口补齐

- 通用登录失效页和账号诊断工作台均提供明确的“返回登录”按钮。
- 工作台仅对服务端 `UNAUTHORIZED` 显示该入口；跳转前清理会话并使用安全回跳地址，不影响普通接口错误提示。
- Web 定向 typecheck 与 39 项测试通过；无数据库 Schema、运行配置、部署或插件行为变化。

## 2026-08-26 一键直连与本地推失败诊断补漏状态

- 网页 `PAIR_TASK` 已彻底与 Popup 待确认状态分离；配对凭证和绑定上下文在任务页精确心跳确认前不会落入本地存储。Popup 手动入口在可识别任务页时使用相同心跳语义。
- 任务页桥接响应丢失的恢复路径已收口为只读轮询三项校验；固定错误码不再被轮询覆盖。版本检查覆盖采集协议与插件产品版本。
- 本地推 API-only 失败诊断现在保留 `pageMetrics`/`statQuery` 或 `metric-pulses` 最后端点，原始服务端错误文本不进入状态；Schema 漂移、429、敏感响应、字节超限和身份变化安全停止，API 核心覆盖为 7 项。
- 验证基线为 Extension 155、Web 39、全仓 448 项测试，lint/typecheck/build、Prisma validate/generate、version check、git diff --check 通过；本地 unpacked 为 `ce48849f4951`。
- 未改变 Prisma Schema、migration、数据库业务数据、部署和平台动作边界；真实 Chrome 重载、网页直连和真实平台采集仍待用户人工验收。

## 2026-08-26 当前连接与本地推状态

- 网页一键连接已改为直接兑换并绑定当前任务，成功心跳确认后自动跳转采集看板；Popup 二次确认仍作为手动兜底入口。
- 自动连接只信任 `sender.tab.url`，并强制核对配对码任务 ID，避免跨任务绑定。
- 本地推 API-only 持续采集继续使用固定 `pageMetrics` + `statQuery` 白名单和三次失败保护，失败状态携带脱敏端点与固定原因。
- 代码与测试已通过，真实 Chrome 重载、网页直连和真实平台接口响应仍待用户手动验收；未改变数据库 Schema、迁移、AI/Worker 或平台动作边界。

## 2026-08-25 本地推旧 Content Script 防误启状态

- 本地推 API 持续采集启动前新增本页 Content Script 与 Service Worker 构建指纹一致性检查。扩展重载但未刷新目标后台页时，系统会提示刷新该页，不会进入三次失败循环、不会请求平台 API，也不会回退 DOM。
- 当前本地 unpacked 指纹为 `eb5e75cb9075`，产品版本仍为 `0.2.4`，Bridge/采集协议仍为 `8`。Extension typecheck、150 项测试与本地构建已通过。
- 无 Prisma Schema、数据库、服务端容器、运行配置或安全边界变化；真实平台请求和人工首帧验收尚未发生。

## 2026-08-25 扩展重载恢复与本机 Web 运行态

- Chrome 已现场证明：重载 unpacked 扩展后，已打开任务页的旧 Content Script 会进入 `Extension context invalidated`，必须刷新页面才能加载新脚本；这不是服务端或新版 Service Worker 崩溃。
- Web Bridge 已能脱敏返回 `EXTENSION_CONTEXT_INVALIDATED`，任务页异常区提供真正有效的“刷新当前页面”操作。新版 unpacked 指纹为 `36d8284e5dd7`，Bridge/产品版本仍为 `8 / 0.2.4`。
- 本机 Web 运行镜像为 `pxxis-prelaunch-20260713-web:bridge-reload-recovery-20260825`，容器 healthy、任务页 HTTP 200；旧 Web 作为停止回退副本保留。API/PostgreSQL、端口、数据卷、Schema 和业务数据未变。
- 全仓 lint、typecheck、442 项测试、build、Prisma validate/generate、version、Compose config 与 diff check 已通过。当前浏览器仍需重新加载新指纹并完成一次人工配对与真实持续采集验收。

## 2026-08-25 API 持续采集稳定性与本地推 API-only 状态

- 直播与本地推持续采集都允许源标签处于 `HIDDEN`；只有源标签真正刷新/离开精确页、身份变化、关闭或安全失败才停止。Content Script 与 Service Worker 的瞬时通信最多重试三次。
- 本地推平台请求现在只在 Extension Service Worker 发起。Host permission 仍只包含精确受信域名；请求 URL 与请求体由共享固定契约生成，内容脚本不能指定任意端点。
- 本地推 Popup 已没有 DOM 快照按钮，后台也拒绝本地推快照消息；实时帧继续只进入有界内存/SSE/已验证诊断证据，不增加 `DataSnapshot`。
- 工程基线为 441 项测试，lint/typecheck/build、Prisma validate/generate、version/Compose/diff 检查全部通过。本地 unpacked 指纹为 `0718bfb63416`。
- API/Web/PostgreSQL 容器、数据库 Schema、业务数据和配置均未改变；真实 Chrome 尚需手动重载并执行切标签与本地推首帧验收。

## 2026-08-24 任务页 Extension 自动同步状态

- 当前源码 Bridge 协议为 `8`，任务页支持首次进入自动检测并切换同一已配对账号下的当前任务；任务身份只由 Extension 从可信任务页 URL 获取，服务端账号上下文负责归属校验。
- `GET_STATUS` 已是纯本地只读，5 秒轮询不会切换任务、刷新上下文或上报心跳；`SYNC_CURRENT_TASK` 只在首次进入或用户手动重新检测时执行。
- 活动持续采集会阻断所有任务切换且不会被系统自动停止。凭证失效、异账号、API 超时和心跳失败都有独立失败码、说明和最小操作入口；正常状态不显示连接按钮。
- 工程基线：lint、全仓 typecheck、436 项测试、全仓 build、Prisma validate/generate、version check、Compose config、diff check 通过。本地 unpacked 指纹为 `c0fefa29d3f6`。
- 本机运行态已切换为当前工作树构建的 `task-auto-sync-bridge8-20260824` Web/API 镜像，两项容器 healthy；运行 Web/API 均为 Bridge 8，API database ready，Web HTTP 200。旧容器停止保留可回退。
- PostgreSQL 仍为容器 `4b3e9e0a2120` 和数据卷 `pxxis-prelaunch-20260713_postgres-data`，核心表计数切换前后不变。Chrome 本机页面已只读识别 `0.2.4 / Bridge 8 / c0fefa29d3f6`；用户原任务页仍需刷新并人工验证具体异常场景。
- 本轮无 Schema、migration、`db push`、业务数据写入、真实平台操作、commit、push 或生产部署。

## 2026-08-22 Popup 本地推 API 状态隔离修复

- 修复 Popup 将其他标签的直播 PULSE 投影到本地推页面的问题；本地推页现在只显示当前标签、当前 `LOCAL_PROMOTION_DASHBOARD` 路线的持续采集状态。
- PULSE 区标题随页面切换为“巨量本地推 API 采集”或“直播 API 采集”，避免误导用户把直播状态当作本地推状态。
- Extension typecheck、143 项测试和本地构建通过；unpacked 指纹为 `2d98d7dfa35e`。未修改后端、数据库或采集安全边界。

## 2026-08-22 本机本地推 API 灰度运行态

- 本机 API/Web 已切换至当前工作树构建的 `local-promotion-api-20260822` 镜像，地址仍为 `http://127.0.0.1:4300/3300`。
- 仅该本机运行环境的 `LOCAL_PROMOTION_INTERNAL_API_ENABLED=true`；直播 API 开关继续为 `true`，AI 诊断继续为 `false`。默认配置和其他环境仍保持关闭。
- `/ready` 已确认数据库就绪，Web 首页 HTTP 200；没有 Prisma Schema、migration 或业务数据变化。真实巨量页面采集尚未启动，仍待用户手动重载插件并开启。

## 2026-08-22 本地推多路线实时链路最终代码状态

- 本地推内部 API 开关已完整接入示例环境、Compose、测试环境与 Extension Context，默认始终为 `false`。
- 本地推实时上传现在是严格 API-only：必须来自精确标准 origin/path、已配对 Extension、分离的 URL/DOM 身份证据、固定端点与固定字段；身份切换、来源冲突、值/字段证据不一致均失败关闭。
- 实时内存、SSE 背压缓存、限流、DecisionRun 输入和 Worker 均按路线隔离；混合快照/实时输入不会因 Worker 独立进程而丢失实时证据。
- Web 只有在连接有效且帧仍处于 60 秒新鲜窗口时显示持续采集，不会把保留期内的旧帧继续标为实时可用。
- 当前工程基线为 433 项测试，lint/typecheck/build、Prisma validate/generate、版本与 Compose 配置检查全部通过；本地 unpacked 指纹 `a8e4d60ef126`。
- 无数据库结构或业务数据变化，未部署；真实 Chrome 进行中直播验收仍未完成。

## 2026-08-20 本地推 API 实时脉冲状态

- Shared、Extension、API、Web 已完成本地推实时脉冲接入。契约版本 2026-08-19.1、Adapter 1.0.0，服务端开关默认 false。
- 本地推 API 只上传七项稳定白名单指标；daily_budget 明确保持 DOM-only。服务端逐字段校验精确页面、身份、端点、字节限制、字段路径、契约版本和 PULSE_ONLY。
- 实时内存帧按 routeKey 保存并通过 SSE 推送；决策构建支持多路线实时证据，实时帧不落 DataSnapshot，但可进入 DecisionRun.inputJson 的 realtimeEvidenceItems。
- Popup 在本地推精确页面显示 API 持续采集控制，同时保留“采集并上传数据总览”DOM 入口；身份缺失/冲突时 API 控制不可用。
- 根级 lint、typecheck、test、build、Prisma validate/generate 和 diff 检查已通过；无 Prisma Schema 或 migration 变更。
- 真实 Chrome 登录态验收仍待用户手动完成，不能将本地测试通过写成真实平台字段已验证。


## 2026-08-16 任务页直播数据大屏实时接入状态

- 任务页已接入 `/collection-tasks/:id/signals/stream` 实时脉冲。`LIVE_DATA_SCREEN` 收到非空实时指标后，任务页路线卡片显示“API 持续采集中”，不再把无正式快照误判为“采集失败”。
- 修改仅在前端任务页 `apps/web/src/app/tasks/[id]/page.tsx`；采集校准页既有实时处理逻辑未变。正式诊断仍只接受可信/已复核证据，实时脉冲不落 `DataSnapshot`。
- 本机 Web 运行镜像已切换为 `pxxis-prelaunch-20260713-web:live-screen-realtime-20260816`，继续使用 `http://127.0.0.1:3300`；旧容器停止保留为 `pxxis-prelaunch-20260713-web-1-live-screen-rollback-20260816`。
- API 仍为 `pxxis-prelaunch-20260713-api:new-table-confirm-20260816-v3`，PostgreSQL、数据卷、Prisma Schema、采集协议和 Extension 未修改。
- 验证通过：Web typecheck、Web 36 项测试、根级 `typecheck`、根级 410 项测试、根级 `build`；浏览器实测直播数据大屏卡片显示“最近成功：刚刚 · API 持续采集 · 7 项指标”。

## 2026-08-16 主按钮任务级确认放开状态

- 主按钮“确认可信数据并生成诊断”现在会任务级确认全部 `PENDING` 指标和当前表格单元格，不再因 `INVALID`、未校准或缺少绑定证据而停在确认阶段。
- 正式诊断门禁保持不变：这些异常证据仍为 `UNREVIEWED`，主按钮进入保守诊断区，不创建正式 `DecisionRun`。
- 修改位于 API：`review-metrics.ts` 的任务级指标确认、`collection-dashboard.ts` 的任务级表格确认。
- 本机 API 已切换为 `pxxis-prelaunch-20260713-api:new-table-confirm-20260816-v3`；Web、Prisma Schema、数据库、采集协议和 Extension 未修改。
- 验证通过：API typecheck、API 130 项测试、根级 `typecheck`、根级 `build`；未执行 migration、`db push`、生产部署、提交或推送。

## 2026-08-16 v0.2.4 发布状态

- 生产版扩展发布包 `collector-v0.2.4-48b3758adf51.zip` 已从干净 `main` 构建并通过生产制品安全校验，产品 `0.2.4`、source fingerprint `1a4bc20a9d72`。
- 发布制品与 `release-manifest.json` 已提交，tag `v0.2.4` 已推送；GitHub Release v0.2.4 已创建并附带 zip 与 sha256 资产。
- 当前仍未上架 Chrome Web Store；网页安装入口继续显示开发者模式加载说明，正式上架前需用户确认开发者账号与商店条目。
- 本轮未修改数据库、Schema、对外接口、采集协议或 Extension 源码。

## 2026-08-14 经营数据统一大屏状态

- 采集校准页现为单一“经营数据大屏”。本地推快照指标和直播实时指标统一展示，但来源口径继续独立，不跨线路求和；用户界面不再出现独立“API 实时数据”模块或端点数量。
- 当前线路主视图只计算 `LOCAL_PROMOTION_DASHBOARD` 与 `LIVE_DATA_SCREEN` 两条有效线路，并以流程形式汇入经营总览。旧 `TASK_TABLE`、商品/流量等路线只作历史兼容展示，不计入当前进度、待采集数或诊断门禁。
- 路线状态区分“有数据”和“完全健康”：`PARTIAL / AGING / MANUAL_PENDING / STALE / FAILED` 即使已有快照也标为“需关注”，避免把部分可见误报成全部就绪。
- 诊断主按钮已移到经营总览顶部，桌面 1488×900 和手机 390×844 首屏均可操作；两档无横向溢出，手机线路流程顺序完整。
- 根级 lint/架构检查、全仓 typecheck、409 项测试、全仓 build 和差异格式检查通过；线路流程已提取为独立组件，页面入口满足 1600 行架构预算。本机 Web 运行镜像为 `pxxis-prelaunch-20260713-web:unified-dashboard-20260814`，端口仍为 `127.0.0.1:3300`。
- 本轮未修改 API、数据库、Prisma Schema、对外接口、采集协议或 Extension；实时证据直接进入诊断和其他路线快照复核规则保持不变。目标 ROI 可修改仍是下一阶段功能。

## 2026-08-14 本机协议 8 运行态与 Chrome 连接状态

- 源码、当前 unpacked 插件和本机运行服务现已统一：产品 `0.2.4`、Bridge 协议 `7`、采集协议 `8`，插件 source fingerprint `1a4bc20a9d72`。
- 本机 API/Web 已切换为 `protocol8-seven-metrics-20260814` 镜像，继续使用 `127.0.0.1:4300/3300`。API `/ready` 为 database ready，`/version` 返回采集协议 `8`，Web 首页 HTTP 200。
- PostgreSQL 容器与 `pxxis-prelaunch-20260713_postgres-data` 未替换。切换前后 Project `10`、CollectionTask `11`、CollectionRun `7`、DataSnapshot `52`、DecisionRun `1`，数据连续性已确认。
- Chrome 任务页刷新后已不再出现“本地服务需更新/采集协议不兼容”。网页桥接可识别当前插件；页面显示的协议 `7` 属于 Bridge 协议，不与采集协议 `8` 冲突。
- 当前插件连接仍未最终闭环：服务端有历史授权，但当前 Chrome 没有已验证本地凭证，当前任务心跳尚未到达 API。因此目前状态是“协议故障已修复，等待用户确认重新绑定当前任务”，不能写成插件已完全连接或真实采集已通过。
- 相关验证为 Shared `51`、Extension `135`、Web `36`、API `129` 项测试通过，API/Web/Shared/Extension typecheck 通过，API/Web production 镜像构建通过。未执行 migration、`db push`、业务数据修改、生产部署、提交或推送。

## 2026-08-14 七项直播核心指标与最终插件状态

- 当前直播 PULSE 只采集 `key_index` 的 7 项固定指标：直播间成交金额、在线人数、人均观看时长、千次观看成交金额、成交订单数、成交人数、商品转化率。共享 Contract `2026-08-14.1`、Adapter `1.6.0`、采集协议 `8`。
- 旧曝光、看播人数、直播间点击率、开播时长和小时速度指标不再进入 PULSE；商品点击率不等于商品转化率，开播时长不等于人均观看时长。未知字段不会被递归发现或上传。
- Extension 的实时状态只保留白名单键名并按共享顺序计算 `N/7`；协议或构建不一致、未知键或被过滤后的键数变化都会使旧状态失效。
- Popup 已完成紧凑验收：直播和本地推两种主状态在 390×600 视口均无滚动，主按钮首屏可见；任务列表入口、`2/3`、三格统计卡和重复上下文已退出主界面。
- 当前本地 unpacked source fingerprint 为 `1a4bc20a9d72`。工程验证基线为 lint、全仓 typecheck、全仓 build、版本一致性、差异检查通过；测试分布为 Shared 51、Extension 135、Web 36、Decision Engine 39、Diagnosis Skills 5、LLM 14、API 129。
- 本轮未修改 Prisma Schema、数据库结构、对外接口、部署配置或生产运行态；未执行 migration、`db push`、平台自动操作、提交或推送。
- 下一阶段仍是网页主数据大屏的“目标 ROI”人工修改能力。实现前需确定权限、审计、有效范围和与平台采集 `target_roi` 的优先级。

## 2026-08-14 两入口采集与插件界面状态

- 当前默认采集路线为 `LOCAL_PROMOTION_DASHBOARD` 与 `LIVE_DATA_SCREEN` 两条；`TASK_TABLE` 仅保留底层类型、历史快照、显式旧路线和不可采集任务页连接心跳兼容，不再出现在新任务默认清单或 Extension 可采集页面中。
- Extension 只允许精确 `localads.chengzijianzhan.cn/lamp/pc/liveboard2` 和 `eos.douyin.com/dp/liveScreen` 两个入口。`promotion/roi2` 会显示为不支持采集，插件不会读取或上传任务/计划列表。
- Popup 已取消路线分数、人工路线下拉和主界面冗余上下文。直播主按钮位于状态后、统计前；本地推只保留单次数据总览上传。URL、账号、项目、任务与构建信息位于高级区。
- 历史旧默认三路线批次在读取时迁移为当前两路线；显式 `TASK_TABLE` 和旧五路线集合保持兼容，未删除数据库数据或公开接口。
- 当前工程验证：根级 lint、全仓 typecheck、406 项测试和全仓 build 通过；分布为 Shared 50、Extension 133、Web 36、Decision Engine 39、Diagnosis Skills 5、LLM 14、API 129。Extension 本地构建通过，当前 unpacked source fingerprint 为 `8392fc95dd48`。
- 本轮没有修改 Prisma Schema、数据库结构、部署配置或生产运行态，也没有执行 migration、`db push`、平台自动操作、提交或推送。
- 下一阶段待办是在网页主大屏增加可修改的目标 ROI，明确其参考口径、权限、审计和与采集 `target_roi` 的优先级后再实现。本轮不提前增加存储或接口。

## 2026-08-14 直播概览实时 API 正式 AI 输入状态

- 当前源码已允许“直播数据大屏概览”的实时 API 证据直接进入正式 AI 诊断输入：`POST /decision-runs` 创建运行时保存的 `REALTIME_API` 输入可由 Worker 复用，不再因实时帧过期或没有 `DataSnapshot` 回到旧快照确认路径。
- 复用范围被严格限制在 `LIVE_DATA_SCREEN` 的 `LIVE_SCREEN_INTERNAL_API` 证据，且必须有有效实时指标；其他路线、旧快照、非概览实时输入仍按原有快照/人工复核流程处理。
- 诊断技能审计已从单纯要求 `REVIEWED_METRIC` 调整为“已放行正式证据层”：人工复核快照继续通过；服务端已校验的直播概览实时 API 输入也可通过。预算、暂停、创建计划等动作仍不会自动执行，所有候选动作继续由服务端确定性规则裁决并等待人工审批。
- 本轮未修改数据库结构、Prisma Schema、对外接口、Extension 采集白名单或生产配置；没有执行 migration、`db push`、提交、推送或部署。
- 当前验证基线：API typecheck、Web typecheck、Diagnosis Skills typecheck/test、API 全量测试和 API build 均通过。真实 Chrome 手动验收仍待完成：重载插件并在直播大屏点击一次 API 持续采集，确认网页端实时栏更新且后续诊断不要求保存正式快照。

## 2026-08-13 插件路线展示同步收口状态

- Extension 已同步取消当前 API 采集流程中的商品/流量补充路线误导：精确直播大屏页面在 Popup 中统一按 `LIVE_DATA_SCREEN` 的 API 持续采集入口处理，`mode=product`、`mode=flow` 不再显示“直播大屏商品页 / 流量页”的正式路线或快照进度。
- API 模式只显示开始/停止、运行状态、最近成功上传、成功次数、指标数量和最近错误；隐藏正式快照按钮、路线下拉、0/N 进度和快照上下文，底部说明明确“不读取 DOM 数值补齐”。
- Service Worker 现在会校验自动识别出的正式快照路线是否仍属于当前任务；当前任务取消的商品/流量路线不会因旧缓存或旧消息继续上传。
- 底层商品/流量适配器仍为兼容旧任务和显式补回路线保留。最新本地 unpacked 指纹为 `c410e959c2ec`；已通过 Extension typecheck、132 项 Extension 测试和本地构建。

## 2026-08-13 任务补充路线收口状态

- 当前任务 `cmsr0iq7h000dpc07mwockp6c` 已按用户要求取消两条直播大屏补充路线：`LIVE_PRODUCT_TAB`（直播大屏商品页）和 `LIVE_TRAFFIC_TAB`（直播大屏流量页）。任务清单现在只剩 `LIVE_DATA_SCREEN`、`LOCAL_PROMOTION_DASHBOARD`、`TASK_TABLE` 三条基础路线。
- 本次取消只删除当前任务的 `CollectionRouteSource` 配置行；历史商品/流量快照仍保留，可用于审计和旧数据查看，不作为当前任务默认清单继续提示用户补采。
- 默认新建任务逻辑已收口：API 创建任务和 Web 项目页均使用 `defaultCollectionRouteTemplates`，默认只生成/展示三条基础路线。商品/流量路线类型仍保留，旧任务、历史快照、显式补充路线和兼容测试不删除。
- 已通过共享路线测试、Web 源码断言、API 集成测试、受影响包 typecheck 与 shared/api/web build；未执行 Prisma migration、`db push`、提交、推送或生产发布。

## 2026-08-13 API 持续采集切页不中断状态

- 当前最新源码已修复“切到网页端查看实时数据栏即停止”的问题。直播页 hidden 不再等同于采集失败；用户可在直播页启动 API 持续采集后切到网页端观察实时栏，采集会继续运行。
- Extension content script 不再在 `visibilitychange`/`pagehide` 停止 live loop；Service Worker 不再因 `tabState=HIDDEN` 判定 `PAGE_INACTIVE`；API `metric-pulses` 不再拒绝 live PULSE 的 hidden 状态，但仍记录 `tabState`。
- 仍然不会放宽数据真实性和安全边界：精确直播页 URL、room_id、采集协议、内部 API 白名单、响应敏感字段、时间窗口、切换房间/导航/刷新/直播结束和连续失败停止规则保持有效。
- 最新本地 unpacked 指纹为 `1940fbacecdc`。已通过 Extension typecheck、130 项 Extension 测试、API typecheck、125 项 API 测试和 Extension build:local；真实 Chrome 仍待用户重载后执行“启动后切到网页端观察 60 秒”的联合验收。

## 2026-08-13 插件 API 采集端收口状态

- 当前 Extension 已从“采集 + 实时指标展示 + 趋势/建议展示”的混合形态，收口为纯采集端：用户在精确直播数据大屏点击一次后，插件只用已批准平台内部 API 持续采集白名单指标，并上传现有 `metric-pulses` 接口；网页端负责展示实时数据。
- 持续循环由直播页面 content script 维护，避免 MV3 Service Worker 休眠中断。每轮完成后才安排下一轮，重复点击开始会替换旧循环；Popup 和可选 Side Panel 关闭不影响运行。页面隐藏、刷新、切换房间、离开直播页、直播结束、401、协议不匹配、敏感响应或连续三次普通失败会停止。
- 插件不再解析服务端分析结果，也不再请求诊断/决策建议。上传 HTTP 2xx 即视为本轮上传成功；即使服务端继续返回 `signals`、`suggestion` 或 `pulseCount`，插件也会忽略。插件 UI 不再展示实时指标卡片、趋势、异常、观察建议、正式诊断建议或行动提案。
- Popup 已把 API 持续采集入口前移到顶部，只显示开始/停止、运行状态、最近成功上传时间、成功次数、最近指标数量和最近错误。侧边栏不是必要流程，只保留为高级区的可选状态查看入口；启动采集不会自动打开侧边栏。
- 本轮未修改 Web、API、数据库、Prisma、AI、诊断和决策引擎。采集协议仍为 `7`，本地 unpacked 指纹为 `16a45c2a6d59`。已通过全仓 lint、typecheck、395 项测试、build、version check 与 diff check；真实 Chrome 联合验收待用户重载插件后完成。

## 2026-08-13 任务详情页返回入口状态

- 任务详情页顶部已提供显式“← 返回上一级”描边按钮，目标固定为当前任务所属项目详情页；它不依赖浏览器访问历史，能够稳定返回正确业务层级。
- 本轮仅修改 Web 展示和对应回归测试，无数据库、Schema、API、配置、采集协议、Extension 或兼容性变化。
- 当前验证基线为全仓 lint、typecheck、393 项测试和 build 通过。登录态视觉复核尚未执行：内置浏览器会话已失效，页面按既有安全流程返回登录入口。

## 2026-08-13 实时脉冲限流恢复待现场确认

- 用户截图显示 `RATE_LIMITED`，且容器在 2026-08-13 14:40:07、14:40:17、14:40:34（Asia/Shanghai）已有同一任务 `LIVE_DATA_SCREEN / key_index` 的成功接收记录。结合当前 Extension 错误映射，确认本次 `RATE_LIMITED` 来自本机实时脉冲上传接口，而非平台 API `HTTP_429`；截图原文“本次未向服务端发送实时脉冲”不适用于该服务端拒绝场景。
- 根因已修复：用户点击后的第一轮立即启动保留，但后续循环不再追赶全局整 5 秒边界。下一轮取“本轮启动后 5 秒”与“上次上传完成后 4.1 秒”的较晚时间，既维持正常 5 秒节拍，又在平台请求耗时升高时避免服务器接收时间过近。
- 服务端返回 `429 / RATE_LIMITED` 且带 `Retry-After` 时，Extension 现在保持单一采集会话并等到服务端指定时间后继续，不再误当平台致命错误停止；平台 `HTTP_429`、页面隐藏、离开精确页等安全停止语义不变。未使用 DOM 回退、未扩大 API 白名单、未写正式快照或业务表。
- 最新 local-unpacked 指纹 `033f8991f437`，采集协议仍为 `7`。本轮实际通过 Extension typecheck、126 项扩展测试、本地构建、lint、version check 和 diff check；数据库、API 配置、Schema、迁移与正式诊断证据均未改变。真实 Chrome 连续 7 帧和 30 秒趋势验收仍待完成。

## 2026-08-13 实时采集启动阻断已修复，现场验收待完成

- 当前故障不是网页测试页或服务端无响应：精确直播页在 Popup 中被错误显示为“尚未识别”，导致 API PULSE 启动门禁在上传前停止。根因是 API-only PULSE 不读取 DOM，但旧页面身份识别也依赖该空 DOM 输入。
- 现在精确 eos.douyin.com/dp/liveScreen 页面会以 LIVE_DATA_SCREEN 身份进入实时采集，支持 mode=main、mode=product 等视觉分栏；PULSE 仍固定为 key_index、5 秒节拍、API-only、有界内存，不创建正式快照。保存正式快照继续按视觉分栏/人工确认处理。
- 用户点击后首帧改为立即发起，后续才采用固定 5 秒节拍；缺少可信 room_id 会在启动前明确报错而不是静默失败。当前 local-unpacked 扩展指纹为 db8a0c9dfe14，采集协议 7。API 版本仍为 realtime-loop-20260812，/ready 与 Web 首页正常。Extension typecheck、123 项扩展测试、49 项 Shared 测试和本地构建已通过。
- 真实 Chrome 未完成：重载新制品后在页面单击启动，连续观察 35 至 60 秒。此步骤是验证平台实际 API 可用性、成功脉冲和趋势分析，当前不能以本地测试替代。

## 2026-08-13 P0 实时采集验收状态

- 本机 API、Web 与解包 Extension 的版本一致性已复核：API `/ready` 正常，`/version` 为 `realtime-loop-20260812 / 协议 7`；Extension 构建指纹为 `42432566bed9`。运行 API 容器健康，Web 首页 HTTP 200。
- 已实际通过 `lint`、`typecheck`、`test`、`build`、Prisma `validate/generate`、`version:check` 与差异格式检查，共 386 项测试。PULSE 的 5 秒节拍、单会话、30 秒比较、限流、失败关闭、实时展示和正式快照隔离均由现有回归覆盖。
- 当前未发生本轮真实平台脉冲：运行日志没有新的成功接收或拒绝记录。Chrome 本身与 Codex 浏览器扩展配置可用，但当前 Codex 会话无法附着到该 Chrome；因此真实 UI 与日志联合验收仍为待人工完成项，不能标记为通过。
- 2026-08-13 10:35:17 至 10:36:48（Asia/Shanghai）对 API 容器执行 90 秒实时日志监控，未收到任何脉冲接收、限流、协议不匹配或失败日志；该时间窗内尚未出现真实插件上传。
- 待人工验收：手动重载 `apps/extension/release/local-unpacked-test-extension` 后确认 `42432566bed9`，在真实 `mode=main`、`mode=product` 页面分别启动一次 API 持续采集并观察 35 至 60 秒。要求至少 7 帧连续成功、约 5 秒间隔、无 `RATE_LIMITED`/协议不匹配/空指标异常，并在 30 秒后出现趋势结论或明确稳定状态。实时观察不应增加正式快照路线进度；保存正式快照仍须用户明确点击。

## 2026-08-12 API 实时判断闭环状态

- 当前源码已将直播 API 持续采集从“只显示值”接成“取数 → 服务端 30 秒窗口比较 → 右侧栏显示变化与人工检查建议”。服务端判断覆盖流量、点击率、GPM、GMV 增量和有看播无成交，且不创建或执行平台动作。
- `key_index` 固定白名单为 10 项，新增字段均来自当前平台脚本的显式字段引用：开播时长、小时看播、小时自然看播、小时商业看播。Contract `2026-08-12.3` / Adapter `1.5.0` / 采集协议 `7`。
- 正式快照与实时观察继续隔离：PULSE 只存在 15 分钟有界内存中，不增加 `0/5`，实时提示不是正式诊断建议；正式诊断仍需用户保存快照并校准。
- 本地 unpacked 指纹 `42432566bed9`；本机 API 镜像 `pxxis-prelaunch-20260713-api:realtime-loop-20260812` healthy。工程基线为全仓 386 项测试及 lint/typecheck/build/Prisma validate/generate 通过，待用户重载后完成真实 UI 与日志验收。

## 2026-08-12 API 实时数据可见性状态

- 服务端链路已连续接受 20 个真实 API 脉冲，但此前 Extension 只展示请求计数、不展示指标值；用户“看不到效果”的判断正确，并非操作错误。
- 当前本地 Extension 会在 Popup 和常驻右侧栏展示最近一轮最多 6 个白名单指标、成功次数与更新时间；点击启动会自动打开右侧栏，使直播页保持当前可见时仍能查看实时变化。
- `0/5` 现明确标为正式快照路线完成度。PULSE 仍只进入 15 分钟有界内存/SSE，不写 `DataSnapshot`，因此实时更新不会改变该计数，也不需要先保存正式快照。
- 本地 unpacked 指纹为 `a373b9ea0eb2`，工程验证基线为全仓 377 项测试及 lint/typecheck/build/Prisma validate/generate 通过。当前待用户手动重载并完成真实 UI + 日志联合验收。

## 2026-08-12 API 持续采集服务端链路验收

- 当前真实直播大屏已实现“一次点击后按 5 秒节拍持续使用 API 上传”。现场连续接受 20 次脉冲，固定来源为 `key_index`，每帧 5 个合法指标，观察期没有新的 `RATE_LIMITED`；用户可见展示按最新一节修复，尚待最终验收。
- 服务端实时脉冲限流窗口为 4 秒，给 5 秒采集节拍保留平台/网络抖动余量，同时继续拒绝 4 秒内的重复或突发上传。
- API PULSE 与正式 SNAPSHOT 职责仍隔离：实时数据只进入 15 分钟有界内存和 SSE，不创建 `DataSnapshot`，也不依赖 DOM 或“保存当前数据为正式快照”。
- 本机 API 镜像为 `pxxis-prelaunch-20260713-api:rate-limit-jitter-fix-20260812`，采集协议仍为 `7`；数据库结构、业务数据和 Web 没有变更，Extension 已新增实时展示并重建。

## 2026-08-12 直播实时 API 字段适配状态

- 直播 PULSE 已从错误的扁平字段假设改为平台真实 `key_index` 对象字段：`data.<平台键>.value`。固定采集六项为直播成交金额、当前在线人数、曝光次数、直播看播人数、直播间点击率和 GPM。
- API 合同 `2026-08-12.2`、Adapter `1.4.0`、采集协议 `7`；Extension 与 API 服务端都用同一共享白名单并分别校验，未知字段不能借成功端点上传。
- 本地 unpacked 产物指纹 `63f19f31aba9`；本机 API 已健康运行协议 `7`，PostgreSQL、数据卷、历史快照和 Web 容器均未更换。
- 工程验证基线为 375 项测试通过，lint/typecheck/build/Prisma validate/generate/version check/diff check 通过。
- 现场 Chrome 当前仍为旧指纹 `b6a950b35273`，待用户在扩展管理页手动重新加载后执行一次真实 5 秒 API 脉冲验收。

> 当前有效状态以本文最上方最新日期为准；后续日期段为历史演进记录。

## 2026-08-12 实时脉冲 API-only 状态

- 当前源码与本地运行时已统一为采集协议 `6`、Bridge `7`、内部 API Contract `2026-08-12.1` / Adapter `1.3.0`。PULSE 只读 `key_index`，不会合并 DOM；正式快照仍是独立的 API 优先流程。
- `key_index` 无可用已批准字段时会返回可观测原因 `PULSE_KEY_INDEX_NO_USABLE_METRICS`；Popup 显示第 N/3 次和端点，连续三次才停止（安全性要求的致命错误仍立即停止）。
- 字段路径校验为服务端可信边界：只接受共享契约主路径或显式审核过的别名；当前未根据猜测扩充任何平台字段。
- 本地 API `/version` 返回 `a0cef5b788b6`、协议 `6`，`/ready` healthy；本地插件指纹 `b6a950b35273`。Service Worker 每次可恢复失败写入脱敏 `live_pulse.failure` 日志。数据库 Schema、业务数据、历史快照、AI 开关均未变更。
- 运行时一致性复核发现旧 Web 产物仍嵌入协议 `5`，已重建 Web 并确认产物嵌入协议 `6`；当前 API、Web、Extension 三方均以协议 `6` 工作。
- 工程与运行时已就绪，真实平台的有效字段路径和 `/metric-pulses` 连续帧仍待用户重载插件后现场验收。

## 2026-08-12 本机登录链路状态

- 本机 Web 登录页此前可打开不代表登录链路可用：浏览器构建遗漏 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`，导致 `/auth/login` 实际未发送到 API，页面显示 HTTP 404。
- 当前 `127.0.0.1:3300` 已切换到内联正确 API 基址的 Web 镜像；`/login` HTTP 200，CSP 已允许连接 `127.0.0.1:4300`。API 的跨域预检与空登录参数校验均正常，真实凭据登录仍待用户刷新页面后人工确认。
- 本机 `.env` 已同步当前 `127.0.0.1:3300/4300` 入口，未来 Compose 重建会保留相同浏览器 API 基址。
- 本次不涉及插件、实时脉冲白名单、数据库 Schema、历史快照或 AI 开关。API 继续为本机灰度配置，AI 保持关闭。

## 2026-08-11 旧插件隔离与协议 5 运行状态

- 最新截图已具备失败端点展示和按钮同步，但真实 Chrome 任务页注入标记确认当前仍为 `6928d7cc541e / Bridge 6`；它不是当前协议 5/Bridge 7 制品。截图中的分钟端点错误可能来自旧运行代码或旧构建持久化结果，不能证明最终制品仍会请求分钟端点。
- 当前兼容基线为产品 `0.2.4`、Bridge `7`、采集协议 `5`。服务端 `/extension/context` 会校验 `x-pxxis-collection-protocol`，旧插件缺头或声明旧协议时以 `EXTENSION_COLLECTION_PROTOCOL_MISMATCH` 失败关闭，不能继续读取平台 API 或上传采集数据。
- 旧实时失败结果现在按构建指纹和采集协议隔离；升级后会自动删除旧 `LivePulseOutcome`，不会继续用历史 `room_minute_indicator` 错误冒充当前结果。新启动仍会先清除当前失败状态。
- 本地 unpacked 指纹为 `a583f51b0107`。API/Web/PostgreSQL 当前均 healthy，入口保持 `127.0.0.1:4300/3300`；API `/version` 返回采集协议 `5`，内部 API 本机灰度开启，AI 关闭。Web 已使用 Bridge 7 镜像，旧 Web 容器作为停止的回退副本保留。
- 全仓 363 项测试、lint、typecheck、build、Prisma validate/generate、版本检查和差异检查通过。数据库结构、业务数据、历史快照、认证密钥和平台白名单均未改变。
- 真实实时帧仍待用户手动重载 `a583f51b0107` 后验收；在 API 收到 `/metric-pulses` 且任务大屏显示最新帧前，状态保持“工程与运行环境已就绪，现场验收未完成”。

## 2026-08-11 实时脉冲活动状态隔离

- API 容器脱敏日志复核仍无 `/metric-pulses`，结合 Popup 的 `THREE_CONSECUTIVE_FAILURES`，确认本次没有实时帧的原因仍是 Extension 在上传前失败，而不是任务大屏或服务端接收失败。
- PULSE 运行活动已从全局 `PAGE_ACTIVITY` 分离为仅属于启动直播标签的 `LIVE_PULSE_ACTIVITY`；其他平台标签继续发送连接心跳，但不能覆盖、延迟或误停直播会话。直播标签隐藏、导航、关闭或失去精确页面资格时仍立即停止。
- 停止、任务切换和解除配对均清理隔离活动状态。连续失败停止时仅保留固定白名单内的最后失败码，Popup 不再只显示笼统的 `THREE_CONSECUTIVE_FAILURES`。当前本地 unpacked 为 `0.2.4 / 6928d7cc541e / Bridge 6 / 采集协议 4`；数据库、配置语义、白名单、API 容器与历史快照均未改变。
- 本轮已通过全仓 360 项测试、lint、typecheck、build、Prisma validate/generate、版本检查和差异检查。

## 2026-08-11 实时脉冲根因修复状态

- 现场 `SCHEMA_MISMATCH` 的实际端点为 `room_minute_indicator`；它曾在每个整分钟被附加到实时 PULSE，失败发生在插件响应校验前，所以 API 没有收到 `/metric-pulses`，任务大屏也没有实时帧。
- 当前源码已将职责隔离：PULSE 永远只读 `key_index`，实时上报也只允许其 `PULSE_ONLY` 指标；`room_minute_indicator` 仅在用户主动正式 SNAPSHOT 中用于 `HOURLY_ROWS`。分钟端点结构漂移不再能停止实时大屏。
- 本地 unpacked Extension 已重建为 `0.2.4 / c49f72be4e03 / Bridge 6 / 采集协议 4`。本机 API 已于 2026-08-11 08:54 原地替换为当前源码，运行容器直接验证 `PULSE=["key_index"]`，`/ready`、`/version` HTTP 200；Web、PostgreSQL、数据卷与历史快照未改动。
- 本轮实际通过全仓 355 项测试、lint、typecheck、build、Prisma validate/generate、版本检查和差异检查。

## 2026-08-11 Popup 实时脉冲控制状态

- Popup 轮询现在同步实时脉冲按钮与 Service Worker 状态；`THREE_CONSECUTIVE_FAILURES` 或 Schema 失败停止后，按钮显示“开始 API 持续采集”，不会继续显示“停止 API 持续采集”。
- 按钮仍受当前插件配对验证和 `LIVE_SCREEN_INTERNAL_API_ENABLED` 双重门禁约束；轮询不会因读取旧状态而错误启用操作。
- 后续职责隔离制品已更新为 `c49f72be4e03`，产品版本 `0.2.4`、Bridge `6`、采集协议 `4`。全仓 354 项测试、build、Prisma validate/generate、版本检查通过；此前 lint、typecheck 继续通过。

## 2026-08-10 直播 API 响应兼容状态

- 已修复 Extension 将平台响应中新增字段、已知 `status_code + data/result` 包装或单项 `null` 指标误报为整体 `SCHEMA_MISMATCH` 的问题。响应仍只按既有白名单提取指标，新增字段和原始响应不会进入快照、脉冲、日志或服务端。
- API 脉冲因 Schema、安全或页面状态停止后，Popup 会保留按当前任务隔离的失败原因、端点和时间，并每秒刷新显示；`SCHEMA_MISMATCH` 明确说明“未向服务端发送实时脉冲”，不再误显示为等待下一节拍。
- 本机 API 已替换为 Adapter `1.2.0` / Contract `2026-08-08.1` 的当前源码，`/ready` 与 `/version` 均为 HTTP 200，API 容器 healthy。解包插件为 `0.2.4 / ed4b04e82725 / Bridge 6 / 采集协议 4`。
- 已实际执行 lint、typecheck、全仓 test（350 项）、build、Prisma validate/generate、版本检查和差异检查。没有新增迁移、数据库写入、历史快照改写、AI 启动或真实平台 API 请求；实际商品页重试仍须用户主动进行。

## 2026-08-09 一键 API 持续采集状态

- 精确直播数据页现在以“开始 API 持续采集”为主入口：用户点击一次后按固定 5 秒节拍运行，关闭 Extension Popup 不停止；手动停止或平台页隐藏、卸载、导航离开及既有安全错误会停止，且恢复可见后不自动重启。
- `MetricPulse` 最新指标继续只保存在单 API 实例的 15 分钟有界内存中。既有任务 SSE 增加兼容的 `pulse` 事件，校准大屏新增实时指标区并自动重连；没有为每个 5 秒脉冲创建数据库快照。
- “保存当前数据为正式快照”保留为独立次要动作，只有该动作才进入原有校准、复核和正式诊断链路。实时展示不能绕过 API 白名单、字段 Schema、房间 ID、响应大小或敏感字段门禁。
- 当前解包插件为 `0.2.4 / 622478e337aa / Bridge 6 / 采集协议 4`。本地 API/Web/PostgreSQL healthy，端口为 `127.0.0.1:4300/3300`；`LIVE_SCREEN_INTERNAL_API_ENABLED=true`、`AI_DIAGNOSIS_ENABLED=false`。
- 当前工程基线为 lint、typecheck、build、差异检查和 344 项测试通过；API `/ready`、`/version` 与目标任务校准大屏 HTTP 200。数据库结构和历史快照未变，真实平台持续 API 结果仍需用户重载插件后主动验收。

## 2026-08-09 直播 API 优先采集状态

- 任务 `cmslcimbi000loz077k91p0vq` 的现场证据已由数据库和容器日志复核：采集批次于本地时间 13:16–13:17 完成，五条路线都有快照，但直播概览两次均只有 2/8 个真实原值、商品页 0/2；`5/5` 是路线完成度，不是字段完整度。
- 根因有两项：现场 API 开关为关闭，脉冲静默回退 DOM 且只写内存；直播概览的新 DOM 结构使用直接文本数值加单位子节点，旧解析器跳过数值容器，并把图表选择项误识别为卡片标签。
- 现在 API 脉冲只允许 API，不再降级为 DOM；精确 `liveScreen` 的概览、商品和流量分栏均可启动房间级脉冲。正式直播概览快照以 API 值为主，DOM 只做对账和明确兜底，完整来源冲突仍失败关闭。
- 路线卡片、大屏顶部和 Popup 均区分“识别到字段”和“字段有真实原值”；Popup 同时展示 API/DOM 来源、成功端点数及脉冲成功次数，不再用无反馈状态掩盖实际路径。
- 本机 API/Web/PostgreSQL 当前 healthy，入口保持 `127.0.0.1:4300/3300`；API 运行时为 development，`LIVE_SCREEN_INTERNAL_API_ENABLED=true`，`AI_DIAGNOSIS_ENABLED=false`。Schema 未变，迁移服务确认无待应用 migration，旧快照和业务数据未修改。
- 当前解包插件为 `0.2.4` / Bridge `6` / 采集协议 `4` / 指纹 `27f61909cf44`；Chrome 现场仍是旧指纹 `c89a0fd283d4`，必须由用户手动重新加载后才会生效。
- 当前工程基线为 lint、typecheck、build 和 340 项测试通过；API `/ready`、`/version` 与任务大屏 HTTP 200。真实平台 API 现场验收仍待用户重载插件后主动触发。

## 2026-08-08 任务页自动恢复状态

- 当前本地解包插件为 `0.2.4` / Bridge `6` / 采集协议 `4` / 指纹 `c89a0fd283d4`。本轮仅重建解包测试制品；此前候选 ZIP 不代表当前源码。
- 桥接状态请求在“已配对、已绑定、精确任务页 URL 的任务 ID 等于本地绑定任务”时触发恢复：先复验 `/extension/context`，再上报 `TASK_TABLE / UNKNOWN / collectable=false / VISIBLE`。不再依赖不可靠的 `sender.tab.active`，其他任务页仍失败关闭。
- 新增行为回归和源码守卫后，全仓 334 项测试、lint、typecheck、build、Prisma validate/generate、版本检查和差异检查已通过；本地 API `/ready`、`/version` 与 Web 任务页均正常。
- 用户已完成配对并保留本地凭证。真实 Chrome 重载 `c89a0fd283d4` 后，任务页刷新即在固定周期内自动显示“插件已连接 · 0.2.4”，无需重新配对；该状态同时要求 Bridge `READY` 和服务端当前任务心跳。
- 同一现场确认本地任务页返回“当前页面不在采集白名单内”，分栏保持待确认；自动连接没有放宽只有真实平台内容脚本可确认采集页面的安全边界。

## 2026-08-08 工程质量与安全基线

- 当前产品版本 `0.2.4`，Schema `20260731_v035_ai_skill_diagnosis`，Bridge 协议 `6`，采集协议 `4`；本地 unpacked 指纹 `3012e6dbc930`。
- 直播内部 API 契约为 `2026-08-08.1` / Adapter `1.1.0`。服务端会重算 room_id 来源、核对 URL 候选及实际声明，并执行逐端点与总响应大小门禁；内部 API 开关仍默认关闭。
- 实时脉冲上传支持主动取消和 4 秒超时，停止后的请求不会继续刷新。PULSE 仍只进入单实例有界内存，不创建快照、业务记录或审计。
- Web 运行依赖为 Next.js `16.3.0`，API 为 Express `4.22.2`；生产依赖审计 0 漏洞，peer 依赖无冲突。
- 工程门禁已覆盖显式 `any`、空 `catch`、关键大屏行长、关键文件行数、构建指纹完整性、生产 ZIP 安全边界及构建后源码非预期改写。
- 当前验证基线：Shared 47、Extension 77、Web 33、Diagnosis Skills 4、Decision Engine 39、LLM 14、API 114，共 328 项测试；lint、typecheck、build、Prisma validate/generate、版本检查与 Extension 本地制品检查通过。
- 未变更数据库结构、业务数据、运行容器或生产环境；未启用 AI、Worker 或直播内部 API。真实 Chrome 页面仍待用户手动重载新 unpacked 后验收。

## 2026-07-30 真实数据准确性与可信度校准

- 当前 Schema 基线为 `20260729_v034_metric_binding_calibration`。新增的 `CollectionBindingCalibration` 是加法式结构，记录字段卡片或表格行列签名的人工确认；不回填、不改写历史快照。
- 五条路线已有独立的字段白名单、精确同义名、表头语义和统计周期规则。所有新指标保留后台显示值、精度、单位、周期、字段标签和位置等最小证据；多个候选、周期不一致、单位语义错误、ROI 交叉校验失败均标为异常。
- 正式诊断以整个当前快照集合为门禁范围：任一无效字段、未确认表格结构或缺少历史表格绑定证据，都会产生 `UNREVIEWED` 输入并阻断正式 DecisionRun，不能用其他有效数据绕过。
- 首次未知表格结构必须逐格核对完整张表，不能用单独的结构确认快捷操作放行；完整核对后才记录同路线、同页面指纹和同表签名的结构校准。后续稳定结构通过全部门禁时才能批量确认单元格。Extension 可读取当前渲染的原生/ARIA 表格，但不自动滚动、翻页、点击或调用平台接口。
- API 会用实际 `rawTableData` 复核插件上报的表头、列数、唯一行标识和表签名；元数据错位、空表头、列宽漂移或重复行标识均失败关闭。
- 服务端对同一快照的重复标准字段也失败关闭，不再根据来源优先级任选一个候选值；历史 `CONFIRMED` 指标若缺少 v034 字段绑定证据，同样不能绕过正式诊断门禁。页面结构签名保留周期位置而不包含“今日/昨日”等周期值，避免稳定结构因统计周期滚动而失去校准，同时保留周期缺失、位置变化和不一致的阻断。
- 规范化指标值以精确十进制文本持久化并用于复核展示；规则边界集中执行受限数值转换。摘要优先显示后台原始文本，百分比规范值明确标为“比例”，不以 `0.04%` 冒充后台 `4%`。ROI 与支付金额/消耗的一致性使用 `BigInt` 精确分数和页面精度判断，不再依赖浮点容差。
- v034 迁移的索引名截断冲突已修复；独立临时空库已成功应用全部 15 个 migration。全仓 lint、typecheck、247 项测试、build、Prisma validate/generate、版本检查和差异格式检查通过。
- 当前源码生成的本地 unpacked Extension 指纹为 `d1c80aee42ea`，Schema 为 v034；旧 `b4de6606e3f5` ZIP 是校准前制品，不能代替本轮真实页面验收。本轮未生成或发布新的正式 ZIP。
- 尚未取得用户提供的五条路线脱敏截图和真实后台逐页验收，因此路线校准清单保持保守，结构变化会继续降为待核对。

## 2026-07-29 任务页插件重连可恢复性

- 历史快照不再遮蔽当前插件离线状态：任务页会保留“恢复采集插件连接”面板，提供重新检测、当前任务重新绑定与手动配对码。
- 该修复仅恢复用户主动配对和采集的入口；仍不自动打开平台页面、不自动点击、不自动上传，也不改变历史证据或人工复核状态。
- 全仓 typecheck、215 项测试、Prisma validate 与串行 Web production build 已通过；根 `pnpm build` 暴露已有的并行 shared `dist` 清理竞态，等待单独处理。仍需用户在重新登录后的真实 Chrome 页面复验。

## 2026-07-28 采集一致性与校准大屏状态

- 当前产品版本为 `0.2.4`，共享采集协议为 `1`。插件会在每次采集前读取 `/extension/context`，协议不兼容时停止上传并提示更新本地服务或插件；API 对快照协议做相同的服务端强制校验。
- 可信快照写入已成为原子闭环：快照、标准指标、待复核记录、路线状态、心跳和采集批次必须同时成功。账号归属只按服务端任务链和可撤销插件凭证验证，不读取页面账号 ID。
- 历史派生记录修复已完成并验证幂等；四条 `VERIFIED` 路线已补齐 24 条指标与 24 条待复核记录，首条 `MANUAL_PENDING` 概览仍保持 0 条派生记录。最终 dry-run 没有候选任务。
- 校准大屏已采用单路线总览口径：优先 `LOCAL_PROMOTION_DASHBOARD`，否则回退 `LIVE_DATA_SCREEN`，不把不同路线同名指标相加。五条路线保留独立状态、来源时间与复核进度。
- 大屏自动刷新受草稿保护；运行活跃且没有编辑时更新，有未保存编辑时仅提示发现新数据。空任务显示“尚无采集数据 / 待采集”；桌面、移动端和空数据视觉回归均通过。
- 本地 Web/API/PostgreSQL 正常运行，API `/version` 返回 `0.2.4`、v033 与协议 `1`。工程基线为 lint、typecheck、213 项测试、build、Prisma validate/generate 和版本检查通过。
- 2026-07-29 已在用户实际 Chrome 中确认运行 `0.2.4` / 桥接协议 `2` / 构建 `b4de6606e3f5`，与本地测试制品一致。下一步为真实后台五路线点击采集与大屏刷新验收；正式候选包已生成但尚未发布。

## 2026-07-28 页面账号 ID 已取消

- 页面账号 ID 不再是采集、上传、复核或诊断的输入：插件不读取/上传该字段，网页不展示或要求填写该字段，快照清洗器会丢弃旧客户端字段。
- 服务端继续以“登录用户 -> 账号档案 -> 项目 -> 任务”和 Extension 凭证归属保护隔离；跨账号任务访问和状态上报仍被拒绝，路线可信度与人工复核门禁不变。
- 新快照和手工指标写入兼容状态 `MATCHED`，仅表示服务端任务绑定已验证；数据库历史列不做破坏性迁移，旧页面账号值按 30 天原始证据留存策略到期清除。
- 当前本地 unpacked 插件指纹为 `33dc39c2b5c4`。全仓 lint、typecheck、199 项 test、build、Prisma validate/generate 和版本检查已通过；用户重新加载插件后即可继续真实页面验收。

## 2026-07-27 真实后台识别反馈处理

- 已复核两个真实巨量本地推页面的路线均正常：`liveboard2` 为数据总览，`promotion/roi2` 为任务列表；已识别路线时不显示下拉选择，只有无法识别或证据冲突才显示人工兜底。
- 当前用户任务的页面 `advid=1870840348951692` 与账号档案存储的旧 ID `1` 不一致，因此被安全阻止上传，不是路线识别失败。系统不会自动改写长期账号档案，需用户在账号页人工更新后继续。
- 插件将在用户点击采集后、采集开始前从服务端刷新绑定账号和任务；账号档案更新立即在下一次采集生效，无需重新配对，且服务端跨账号校验保留。Popup 已将易误导的“下一路线”改为“本轮待采集路线”，并单独提示当前自动识别结果。
- 本轮没有数据库、Cookie、权限或平台自动化变更；本地 unpacked 插件已重新构建，指纹 `a18d187a5997`。全仓 lint、typecheck、207 项测试、build、Prisma validate、版本检查和差异格式检查通过。
- 本机 Prisma generate 因运行中的 Node 进程锁定 Windows 引擎 DLL 报 EPERM；本轮未修改 schema，API build/test 已通过。未重启用户正在使用的本地服务，用户重新加载插件后即可验证。

## 2026-07-27 任务配对状态已修复

- 修复了“插件已安全配对，但任务页仍显示尚未绑定”的状态同步问题：同任务重复发起配对不再创建新的待确认状态，Popup 确认新任务时页面会自动读取最新桥接状态。
- 当前本地测试插件构建指纹为 `1a66aeabd108`；用户需在 Chrome 扩展管理页重新加载 `apps/extension/release/local-unpacked-test-extension`，再刷新任务页。任务页进入第 2 步后，仍须在用户手动打开的可信平台目标页面点击一次“采集并上传当前路线”才会识别并上传数据。
- 没有新增数据库迁移、Cookie、权限或自动化平台操作；原账号环境继续在 `127.0.0.1:3300/4300` 正常运行。

## 2026-07-27 原账号本地环境已升级至 v033

- `127.0.0.1:3300/4300` 已从 v032 升级到当前 v033，并继续使用原 PostgreSQL 数据卷；该数据库目前保留 9 个用户、5 条快照、5 个采集任务和 14 条 Prisma 迁移记录。
- 升级前的本机备份已在独立临时 PostgreSQL 成功恢复验证；v033 只应用 `TableCellReview` 加法式迁移，不删除或改写旧账号、任务、快照和复核记录。
- Web、API、PostgreSQL 均 healthy；API `/version` 报告 `20260722_v033_table_cell_reviews`，浏览器实测登录页正常显示、无控制台错误。未代替用户提交登录信息。
- 这是本地开发环境切换，不属于生产部署；没有生产迁移、提交、推送、真实平台操作或外部备份上传。

## 2026-07-26 本地验收登录可用性

- 隔离测试页面的首次登录会话检查已从通用 20 秒请求等待收敛为独立 3 秒上限；API 不可用时登录页会回落到可输入的登录表单，不会持续停在“正在确认登录状态…”。
- `127.0.0.1:3400` 已用指向 `127.0.0.1:4400` 的当前源码重新构建并运行。浏览器复验登录表单正常出现且无控制台错误；Web 23 项测试、Web typecheck 与 production build 均通过。
- 无数据库、配置、Cookie、Extension 或安全边界变化；未执行生产迁移、部署、提交或平台操作。

## 2026-07-26 v033 直连采集与校准大屏验收状态

- 已确认采集和校准链路由服务端闭环：可信 Extension 的一次 Popup 确认满足账号、任务、精确来源域名和无冲突路线证据后才写入 `VERIFIED`；路线证据缺失或冲突时保持 `MANUAL_PENDING`，不因 URL 推断而自动放行。
- 已确认有效快照会在入库事务内生成 `PENDING` 标准指标复核记录；校准大屏只读取当前路线真实快照、指标和表格，用户可独立校准而不改写原始快照。
- 已在隔离 API/Web 环境实际登录并检查校准大屏：桌面与移动端没有整体横向溢出；缺少趋势或媒体时显示缺失状态，不生成模拟数据。最新全仓验证已通过 lint、typecheck、201 项测试、build、Prisma validate/generate、版本一致性和差异格式检查；独立临时空库已按正式迁移链成功升级至 v033 后销毁。

## 2026-07-25 v033 多路线数据完整性

- 采集摘要和校准大屏的标准指标去重范围已从全任务收敛到单条路线：直播概览、本地推总览、任务列表等页面即使出现同名标准指标，也会各自保留一条来源证据，支持独立校准，不会因汇总展示而丢失数据。
- API 集成回归已覆盖两个路线同时采集“消耗”的场景，隔离 PostgreSQL `127.0.0.1:55432` 中 71 项 API 测试通过；API typecheck 和差异格式检查通过。未执行生产 migration、部署、提交、平台或生产数据操作。

## 2026-07-24 v033 采集直连与校准大屏完整性复核

- 正式决策输入已同步执行当前路线、账号匹配、路线确认、人工复核和快照新鲜度门禁；过期快照只能保留为历史证据，不会向正式诊断提供指标、表格或结构化记录。
- 新增 `docs/API_REFERENCE.md`，记录校准大屏及复核接口的外部契约与错误边界。
- 标准指标的单项、批量和全部确认已补齐与表格单元格相同的服务端门禁：任务归属、当前路线快照、账号/路线确认、快照版本及 Serializable 并发冲突。成功写入同步推进快照版本，旧页面不能覆盖新校准或新采集。
- 任务页在用户确认采集完成且本页观察到新快照时自动进入站内校准大屏；页面初次加载已有任务不会自动跳转，系统不会打开或操作外部平台页面。
- 最新全仓测试基线为 200 项，其中 API 集成测试在既有隔离 `55432` 测试数据库中通过 71 项；未执行生产 migration、部署、提交或平台操作。

## 2026-07-24 Popup 一次确认的服务端可信边界

- Extension Popup 的人工路线下拉选择不再额外触发网页二次路线确认，但该便利仅适用于可撤销 Extension 凭证、绑定账号任务、精确可信平台 HTTPS 来源和无冲突路线证据的组合。
- API 以 `EXTENSION_SOURCE_URL_FORBIDDEN` 拒绝 Extension 对其他域名的快照上传；网页/手工入口的 `manuallyConfirmed` 声明不被当作可信路线确认。
- 直播数据大屏的商品/流量路线在 Extension Popup 一次确认时可映射到共同的概览页面类型，其他页面类型不放宽冲突校验。
- 最新验证基线为 lint、typecheck、200 项测试、build、Prisma validate/generate、版本一致性和差异格式检查通过；local/production Extension 已重建，local unpacked 指纹为 `c2afc2ac46a8`。

## 2026-07-24 v033 采集证据与隐私状态

- 两个目标页面的路线规则已覆盖：`liveboard2` 为本地推总览，`promotion/roi2` 为任务列表。旧任务显示未识别的实际原因是尚未点击 Popup 触发采集，两个路线均未产生快照，不是路线规则或服务端拒绝上传。
- 页面原文不属于采集快照：可见文本只用于当前浏览器内的路线、账号和字段提取；共享上传契约、插件上传和 API 持久化三层均强制丢弃 `rawDomText`。系统保留经脱敏且白名单化的指标、结构化表格、来源元数据和校准审计，不保存或回传整页正文。
- 校准大屏提供路线、复核状态和指标类别筛选，表格仅展示实际采集到的来源路线、路线置信度与采集时间；历史快照缺元数据时明确显示缺失。
- 最新验证基线：lint、typecheck、197 项测试、build、Prisma validate/generate、版本一致性、差异格式检查与 local/production Extension 制品构建均通过。未执行生产 migration、部署、真实平台操作或生产数据操作；登录会话失效后尚待真人登录完成大屏视觉复验。

## 2026-07-23 v033 采集与校准状态

- 当前 Schema 版本为 `20260722_v033_table_cell_reviews`；API、Compose、镜像、环境示例和 Extension 构建元数据已统一。新增表为加法式结构，历史快照、历史复核和旧路线 URL 不回填、不改写。
- 新任务按全局模板自动创建直播概览、商品、流量、本地推总览和任务列表路线，不要求用户逐项录入 URL；旧任务保存的网址仍可作为只读打开链接使用，后端兼容接口未删除。
- Extension 只在两个精确可信平台域名运行。路线自动识别与采集上传分为两步，上传必须由 Popup 一次点击确认；当前任务下拉选项作为识别失败/冲突兜底。
- 任务页采集步骤已精简为状态、账号确认和校准大屏入口。大屏按任务汇总当前路线真实指标、小时趋势及二维/三维原始表格投影，支持指标和表格单元格独立校准，原始快照保持不可变。
- 正式决策证据源固定为 `REVIEWED_METRIC` 及已确认/已修改的表格单元格；必需路线过期、账号或路线未确认、待复核、忽略、缺失和非当前快照数据均被确定性门禁排除。
- 最新验证基线：全仓 lint/typecheck/test/build 通过，共 197 项测试；Prisma validate/generate、隔离空库 14 migration、生产/本地 Extension 制品安全检查和桌面/移动端浏览器验收通过。未部署生产、未操作真实平台或生产数据库。

## 2026-07-22 本地认证与运行镜像状态

- 本地预上线已从 v024 升级到 v032，13 个 migration 全部完成；既有 8 个用户均保留并标记为已验证，旧 bcrypt 密码可在成功登录时渐进升级为 Argon2id。
- Web 与 API 现统一使用 HttpOnly `UserSession + csrfToken` 协议，不再混用旧 JWT 登录响应。
- API runtime 镜像包含完整 pnpm Workspace 依赖链接，并通过构建期运行时导入检查；本地 API/Web/PostgreSQL 当前 healthy。
- 本地 HTTP 使用显式 `API_NODE_ENV=development`；Compose 默认值仍为 production，正式部署继续要求 Secure Cookie 和安全 SMTP 配置。
- 最新验证基线为全仓 lint/typecheck/build、Prisma validate/generate、Compose 静态配置和 192 项测试全部通过。

## 2026-07-20 首页备案号展示

- 根布局保留全站统一的工信部备案页脚链接；首页改用根内容区高度，使 `辽ICP备2026002223号` 在首页底部稳定可见。
- Web 回归测试覆盖备案链接和首页贴底布局；全仓 `lint`、`typecheck`、192 项 `test`、`build` 通过。
- 本地预上线 Web 已在 `127.0.0.1:3300` 重建并验证为 healthy；HTTP 和浏览器均确认备案号与链接可见。未变更数据库、API、环境变量、部署配置或兼容性契约。

## 2026-07-20 v032 审计留存状态

- 当前 Schema 版本为 `20260720_v032_audit_actor_snapshot`；API、Compose、镜像、环境示例和 Extension 构建元数据均使用该默认值。
- `AuditLog` 保留最小操作者快照，用户删除时仅将关联 `userId` 设为 `null`，不再级联删除审计；已有记录仅回填原有用户 ID，不回填或编造其他身份字段。
- 当前认证策略仍为仅隐藏登录页公开入口：后端注册、邮箱确认/重发与验证页继续保留，不是服务端邀请制。
- 最新验证基线：隔离空库 13 个 migration、v031 至 v032 升级与审计留存语义通过；全仓 lint/typecheck/test/build、Prisma validate/generate、生产依赖 audit、Compose 静态配置、v032 正式 Extension 制品安全测试和差异格式检查通过，共 191 项测试、0 个已知生产依赖漏洞。
- 未执行真实 SMTP、COS、部署、平台操作或生产数据操作；生产应用 v032 前仍必须先备份并在 staging 执行 `prisma migrate deploy`。

## 2026-07-20 输入安全与认证入口状态

- 公开注册与邮箱验证当前仅从登录页隐藏；后端注册、邮箱确认/重发、验证页和邮件验证数据模型仍完整可用，不是服务端邀请制。
- 外部自由文本和 JSON 现在统一拒绝 `password`、`cookie`、`token`、`authorization`、`secret` 等凭证形态；内部派生的决策/AI JSON 仅在再次脱敏后保存，兼容已有 `[REDACTED]` 标记。
- 工作区、账号、项目、任务、人工复核、确认备注、配对标签、心跳错误与审计请求元数据已纳入同一输入边界；未新增 schema、migration、环境变量或部署配置。
- API 路由职责进一步明确：工作区和系统健康接口已从 `server.ts` 拆出，架构依赖方向与原接口兼容。
- 最新验证基线：全仓 lint/typecheck/test/build、Prisma validate/generate 和 `git diff --check` 全通过，共 187 项测试；未执行真实 SMTP、平台操作、部署或生产数据操作。

## 2026-07-19 采集健康与标准任务数据状态

- 当前 Schema 版本为 `20260719_v031_collection_diagnostics`；新增字段均为 nullable，旧快照和旧 API 调用保持兼容。
- 采集健康状态已统一为 `UPLOADED / AGING / PARTIAL / UNVERIFIED / MANUAL_PENDING / STALE / FAILED / MISSING`，并提供稳定问题码、来源、完整度和恢复建议。
- 任务采集摘要以最新运行心跳和最新路线快照为准，不再依赖路线配置中的旧错误文本；系统健康接口提供路线状态与问题码聚合。
- 手动采集和巡检具备客户端单飞保护，服务端运行启动具备数据库并发保护；同任务重复启动不会产生多个活动运行或重复审计。
- 任务表已具备服务端标准化 `TASK_ROWS`；小时趋势和素材只有版本化契约，采集器仍处于等待真实脱敏样本的校准阶段。
- 任务页和工作台已接入安全诊断展示，不包含原始页面内容、未清洗异常或自动修复入口。
- 最新验证基线：lint/typecheck/test/build 全通过，共 183 项测试；空库 12 migration 和 Extension production target 安全检查通过。

## 2026-07-19 双栏诊断展示状态

- 任务页第 5 步现在并列展示两种用途不同的结果：正式诊断来自确定性 `decision-engine`，专家参考来自现有解释接口中的 Agency 方法论参考层。
- 正式栏展示经营结论、证据驱动方案和当前待审批动作；专家栏展示补证、人工验证、观察指标与停止条件。专家结果保持 `ADVISORY_ONLY`，不会写入或替代正式动作。
- 两栏使用独立按钮和独立记录；页面加载最近一次 `AiAnalysisTask` 时只读取安全展示字段，不下发其 `requestPayload`。
- （历史状态）旧专家参考曾使用本地 mock Provider；2026-07-31 后新请求不再创建该记录，历史数据继续只读。
- 最新验证：全仓 lint/typecheck/build 和 Web 18 项测试通过；全仓测试为 168 项通过、API 决策流 6 项既有失败。新增最新解释读取接口已通过 API typecheck/build，但其长流程断言被更早的既有快照失败阻断。

## 2026-07-19 第三方决策参考状态

- `packages/llm` 已具备固定来源、固定 revision、MIT 许可和人工筛选的 `agency-agents` 决策参考库；当前覆盖测量完整性、漏斗定位、直播商品验证、投流单变量验证和证据门禁。
- 参考库只产生 `ADVISORY_ONLY / REFERENCE_ONLY` 解释元数据，不进入正式规则、预算、审批或状态判断。`decision-engine`、人工审批、人工执行和平台动作红线保持不变。
- `/collection-tasks/:id/explain` 会持久化来源和参考项，历史解释结果保持兼容；没有数据库、采集、Extension 或部署配置变化。
- 最新验证：lint、全仓 typecheck/build、LLM 6 项测试通过；全仓测试当前 168 项通过、API 决策流 6 项失败，失败集中于当前账号证据/快照流程并早于解释接口断言，发布前仍需修复。

## 2026-07-19 认证与账号证据状态

- 登录页继续仅展示管理员发放账号的登录入口；公开注册和邮箱验证不是删除而是暂时隐藏，后端验证流程、数据模型和验证页保持可用。
- 自动账号匹配仅接受可信 HTTPS 页面中与声明参数一致的平台账号 ID；名称相同、未声明证据或伪造 URL 参数不会自动放行，仍需人工确认。跨账号 ID 保持服务端拒绝。
- 最新验证：全仓 lint/typecheck/test（171 项）/build、Prisma validate/generate 和 `git diff --check` 均通过；未执行真实 SMTP、部署或生产数据操作。

## 2026-07-19 登录入口状态

- Web 登录页当前只展示账号密码登录，并提示用户使用管理员发放的账号；公开注册、注册后邮件重发等入口暂时隐藏。
- 后端注册与邮箱验证能力保持完整：`/auth/register`、`/auth/email-verifications/confirm`、`/auth/email-verifications/resend` 及验证页均未移除，数据库 schema 和已有待验证记录不受影响。
- 该调整是前端访问入口收敛，不是服务端邀请制强制门禁；恢复公开注册只需恢复前端入口，仍沿用原有邮箱验证安全流程。
- 最新验证：全仓 lint/typecheck/171 项 test/build、Prisma validate/generate 与 `git diff --check` 均通过；未执行真实 SMTP、部署或生产数据操作。

## 2026-07-18 安全运行收口状态

- API 读取边界明确：GET 不再初始化复核指标、不再持久化动作建议过期状态；过期仅作为响应视图状态展示，实际状态转换仅发生在显式的决策/审批等写事务中。
- 数据留存已具备独立日常执行服务：Compose 的 `retention` 服务启动立即执行，后续间隔 24 小时；原始证据保留 30 天，结构化数据、审计和安全聚合指标保留 365 天，每批最多 500 条。
- `SecurityMetric` 仅存 UTC 小时粒度的指标名、计数和数值汇总；没有请求体、身份、账号、IP、Cookie、Token 或其他凭证字段。新增表通过 `20260718110000_v030_security_metrics` 加法式迁移创建；COS 备份成功后会尽力记录聚合结果，但指标写入失败不影响备份成功。
- SSE 回压会合并旧状态并保留最新待发送信号；账号匹配证据来源改为共享白名单契约，任意来源字符串不再进入新快照。
- Extension 的生产和本地测试构建已字节级分离：正式包仅允许 HTTPS 产品/API 与精确平台路线，不含 localhost/loopback/测试标识；本地包使用独立红色 `T` 图标并才允许本地桥接。unpacked 和最终 ZIP 共用制品硬校验。
- API、Compose 与 Extension 元数据的默认 Schema 统一为 `20260718_v030_security_metrics`；旧备份命令继续可用，新标准入口为 `backup:run`、`restore:verify`。
- 最新验证：全仓 lint/typecheck/164 项 test/build、Prisma validate/generate、生产依赖 audit、生产 Compose 静态配置、正式 ZIP 解压验收和差异格式检查均通过；隔离空库顺序应用全部 11 个 migration 成功。未执行真实 SMTP、COS 上传/恢复、服务器部署、DNS 变更或平台操作。

## 2026-07-17 认证与运行时收口

- 当前开放注册必须完成邮箱验证：`PendingRegistration` 和 `EmailVerificationToken` 只保存待验证注册信息与令牌哈希；确认成功后才原子创建用户、默认工作区和可撤销会话。既有 `User.emailVerifiedAt` 在加法式 migration 中以当前时间初始化，不伪造历史验证记录。
- 登录拒绝待验证账号；旧 bcrypt 密码在成功登录时渐进迁移到 Argon2id。会话继续只通过 HttpOnly Cookie 和内存态 CSRF Token 使用，接口不再返回 JWT。
- 当前快照的单条和批量账号确认均使用 Serializable 事务。批量请求必须提供每个快照的 `expectedUpdatedAt`，从而拒绝跨任务、旧路线或更新后的证据。
- Compose 服务已增加 `cap_drop: ALL`、PID/CPU/内存限制。API 收到终止信号后停止接收新业务请求、关闭 SSE，并最多等待 15 秒后断开连接与 Prisma。
- 当前生产依赖审计为 0 个已知漏洞；邮件发送使用 `nodemailer 9.0.1`。生产配置优先使用 `SECURITY_SECRET`，运行时仍兼容 `JWT_SECRET`，便于旧环境平滑迁移。
- 最新验证：全仓 lint/typecheck/test/build、Prisma validate/generate、生产依赖审计、Compose 静态配置均通过；隔离空库顺序应用全部 10 个 migration 成功。未执行真实 SMTP、COS、服务器部署或 DNS 变更。

## 2026-07-17 安全与部署基线

- API 已启用 Helmet、精确 CORS 与生产 `WEB_ORIGIN` 显式配置；Web 在 `proxy.ts` 统一下发 nonce CSP、HSTS、Referrer-Policy、权限策略与跨域隔离头。浏览器会话与 Extension 来源边界保持不变。
- Compose 运行时职责已拆分：`migrate` 服务执行一次 `prisma migrate deploy` 后退出，API 只提供服务；API/Web 采用多阶段、非 root、只读根文件系统和优雅停机配置。
- 运维脚本可执行 PostgreSQL custom dump、SHA-256 校验、COS 上传和隔离临时容器恢复验证；当前没有执行真实备份上传、恢复、服务器部署或 DNS 切换。
- 最新验证：API 50 项安全回归、Web 17 项测试、全仓 lint/typecheck/test/build、Prisma validate/generate、Compose 静态配置和两个 runtime 镜像构建均通过。

## 2026-07-16 认证范围调整

- 当前版本不包含邮箱验证、SMTP 邮件发送、待验证注册状态或“未验证邮箱禁止登录”。
- 注册和登录继续采用现有安全会话机制，邮箱验证不作为访问前置条件。

## 2026-07-16 架构稳定化状态

- 项目继续采用模块化单体。账号确认路由、当前快照仓储查询、可串行化事务、决策表分析、共享决策表契约和任务页数据加载已经形成独立模块；无需拆微服务或重写现有闭环。
- 当前快照语义已下沉到数据库：每个任务只使用最新巡检批次中每条配置路线的最新记录，不再受全局 100 条截断影响。
- 决策输入表格拥有明确的单元格、路线和页面类型契约，API 标准化后由 Zod 在规则入口验证；新生成经营建议必须携带真实证据，旧 DecisionRun 继续兼容读取。
- 任务页并发刷新采用最新请求胜出策略，避免轮询响应覆盖刚完成的账号确认、复核或诊断状态。
- CI 新增架构门禁，限制四个历史大入口继续增长并阻止 packages 反向依赖 apps。
- 最新验证：源码格式/架构 lint、全仓 typecheck、137 项测试和 production build 全部通过；未新增 migration，安全边界不变。

## 2026-07-16 任务页与经营诊断状态

- 任务页已经从功能总面板收敛为五步操作流：第 3、4 步的完整数据默认收起，第 5 步只保留正式诊断入口；审批动作、规则、AI 解读与高级证据仅从该页面隐藏，后端闭环和历史数据完整保留。
- 账号确认支持逐路线和一次批量两种方式。批量确认只处理调用时显式指定、且属于当前用户当前任务的路线最新快照，不会确认旧快照或未来新快照；`Serializable` 事务会在写入前重读归属与最新快照，并同步复核指标、心跳、巡检状态和审计。
- `DecisionEngineInput.tables` 的持久化输入开始保留表格路线来源，商品表和任务列表表可被确定性规则直接解析；未新增 Prisma 表或 migration。
- 商品角色由当前商品全集的相对表现生成，比例评分使用样本门槛与 Wilson 保守下界；分母为零、计数倒挂、异常比例、缺列和极小样本不会进入排名。
- 投流方案只使用已复核 `target_roi` 和真实投流单元数据，未复核预演不会生成 ROI 预算重分配方案。账号 ROI 未过目标线时不建议增加总预算；达标单元不存在时不输出扩流候选。
- 经营建议不再按固定数量补模板，`OptimizationRecommendation.evidence` 可记录具体商品、投流单元和指标，旧结果保持兼容。
- 并发 DecisionRun 写入已减少无动作回查并批量落审计，保留原有审计语义与 150ms p95 性能门槛。
- 最终验证：shared 24、Extension 19、Web 13、LLM 3、decision-engine 32、API 41，共 132 项测试通过；全仓 typecheck/build 通过。

## 2026-07-15 代直播首版范围

- 当前首要业务模式为代直播：以直播数据改善和成交增长为唯一目标，诊断维度为流量、直播承接、商品、平台活动权益、履约合规和数据可信度。
- 代直播不再混入服务商毛利、服务费后 ROI 或“平台收益”口径；账号支付/核销 ROI 只用于判断投流成交效率。
- 平台代金券、补贴、投放券和消返券按成交资源处理：只使用已核验权益，分析其对真实到手价、商品点击、订单和 GPM 的影响；未核验权益会进入人工核验建议。
- 其他合作和操盘模式暂不扩展新能力，保持兼容，后续版本再逐步实现对应经营口径。
- 最新验证为全仓 typecheck/build 和 120 项测试通过；本地 API/Web/PostgreSQL healthy，未新增 migration。

## 2026-07-15 经营诊断与建议输出状态

- 新生成的正式诊断和只读预演包含结构化 `businessAnalysis`，诊断范围从财务口径扩展到数据可信度、真实盈利、流量获取、直播承接、商品结构和规则/履约六个维度。
- 每条优化方案包含优先级、原因、人工执行步骤、验证指标和规则边界；缺少服务商后毛利 ROI 时仍能输出直播、商品和投流的低风险验证方案，只阻断依赖真实盈利的强动作。
- 正式待审批动作与经营优化方案分层保存和展示。正式动作即使被去重、冷却或证据门槛过滤，经营诊断仍可完整回答“哪里有问题、为什么、先改什么、如何验证”。
- 服务商财务卡片改为解释型口径：账号支付/核销 ROI、服务商后毛利 ROI、本次真实投入、已核验平台补贴抵扣分别说明含义、用途和限制。
- AI 解释层开始返回基于当前指标的问题与验证方向，但不会创建审批动作；确定性规则、审批、人工执行和复盘边界不变。
- 官方规则引用以抖音生活服务学习中心规则中心、直播经营知识和抖音开放平台生活服务行业规则为准，页面明确提示规则持续更新并要求执行前实时复核。
- 最新验证为全仓 typecheck/build、Prisma validate/generate 和 118 项测试通过；本地 API/Web/PostgreSQL healthy。

## 2026-07-15 本地登录与账号备忘状态

- 账号备忘是选填展示信息，前后端均不把它作为创建账号的必填条件，也不得用于保存任何认证凭证。
- Web 已把登录失效作为表单级错误展示，并将 API 的认证失败文案统一为“登录状态已失效，请重新登录”。
- Session Cookie 的 `Secure` 属性由 `SESSION_COOKIE_SECURE` 显式控制；未配置时生产环境默认开启、本地开发默认关闭。本地 Docker 验收环境明确关闭，正式环境不得沿用该本地值。
- 最新验证：全仓 typecheck、100 项测试、build、Prisma validate/generate 全部通过；本地 3300/4300 服务健康。

## V0.2.4 插件采集主流程（2026-07-15）

- 当前实现版本仍以根 `package.json` 的 `0.2.2` 为准，V0.2.4 尚未形成发布提交或制品。
- 项目页已压缩已知配置区：默认仅显示一行主体配置摘要，服务商和成本存档按需展开，主要采集功能更靠前。
- 任务页从“全量功能面板”改为渐进向导；无数据时只处理插件连接与配对。
- 插件配对可绑定任务，心跳将账号、任务、页面类型、可采集状态和版本同步到 Web，不写诊断表。
- Popup 普通流程为一次点击完成采集与上传；仍只读取当前已打开页面，不操作平台控件。
- `capture-summary` 和复核层按本轮每条路线的最新快照合并，解决多页采集后只能看到最后一页的问题。
- 已区分 `pay_roi` 与 `full_domain_pay_roi`，不再把整体支付 ROI 和全域支付 ROI 合并。
- Web Bridge、Popup、Service Worker 现在使用统一协议版本 2 和构建指纹；任务页不再只靠 DOM 标记猜测插件是否存在，并对所有状态请求设置 5 秒超时。
- 任务页支持一键任务配对；桥接仅在正式站点和本地开发源生效，只返回脱敏连接状态，不暴露 Extension 凭证、平台认证信息或采集内容。
- 直播大屏新增 `LIVE_DATA_SCREEN`、`LIVE_PRODUCT_TAB`、`LIVE_TRAFFIC_TAB` 三条同页分栏路线。用户手动切换分栏后采集，插件不自动点击；无法识别时必须进行本次人工确认。
- 分栏检测优先使用 URL 明确参数、真实选中标签和专属字段，不再用导航栏中普遍存在的“商品/流量”文字直接判断。
- 任务页路线卡片已支持当前任务级 URL 编辑，保存后复用既有服务端白名单校验、URL 清洗和审计记录；不会自动打开、跳转或操作平台页面。
- Popup 已支持在自动识别失败时从当前绑定任务的路线中选择本次采集路线，Service Worker 会拒绝不属于当前任务的人工路线；该选择只作用于本次上传。
- URL 识别已补齐巨量本地推 `liveboard2` 数据总览、`promotion/roi2` 任务列表，以及直播大屏 `mode=main/product/flow` 三类分栏。
- 本地 Compose schema 为 `20260715_v024_task_scoped_extension_pairing`，Web/API/PostgreSQL healthy；Chrome 已验证向导首步和任务配对码。
- 项目页的任务存档支持永久删除错误或重复任务；删除前使用站内确认框说明范围，服务端在事务中校验归属、级联删除快照与诊断闭环数据，并保留不依赖任务外键的项目级删除审计。
- 最新全仓验证为 97 项测试、typecheck、build 全部通过；本次未新增 Prisma migration。Extension 当前 unpacked 构建指纹为 `5c91d26add9d`。
- 当前本机 Chrome 测试包为 `apps/extension/release/collector-local-test-v0.2.2-5c91d26add9d.zip`，SHA256 `9c45a939adc7f57955c91c44f611f980ed0ee18e4115774f5dc29a28a414c556`，用于本地 unpacked 更新和真实页面验收，不代表正式 V0.2.4 发布。
- 真实 Extension 一键上传仍需对已加载的 unpacked 插件人工点击“重新加载”后完成最后验收。本地开发版无法由网页替 Chrome 重载 Manifest/Service Worker。

## V0.2.3 全流程可用性与防串档整改（2026-07-15）

- 当前实现版本仍以根 `package.json` 的 `0.2.2` 为准，V0.2.3 尚未形成发布提交或制品，不冒充已发布版本。
- Extension 改为账号级一次性配对：服务端保存凭证哈希，凭证只允许采集、上传和读取诊断，不能审批或执行。
- 项目复用由服务端 clone 接口完成；复用时可编辑新项目的主体、操盘、合作关系、服务商和本次分摊成本，源项目及其历史记录保持不变，URL 中账号与源项目不一致时禁止跨账号复制。
- 正式决策增加 readiness 硬门槛；账号、主体、复核或基础路线不完整时仅提供不落动作记录的保守预演。
- 手工指标/CSV 作为采集失败兜底，需明确确认账号；已识别指标直接人工复核，未知列进入字段漂移队列。
- 工作台、账号、项目、任务、决策中心和动作详情都携带账号上下文；决策中心不再逐项目 N+1 查询。
- 本地 Compose 已应用 V0.2.3 配对 migration，浏览器完成首次使用、第二账号隔离、配对码、手工导入和移动端验收。
- 当前 83 项测试、全仓 typecheck/build、Prisma generate/validate、migration status 和版本一致性检查通过；第一版安全边界保持不变。

## V0.2.2 账号档案复用与防串档（2026-07-14）

- 当前产品版本已统一为 `0.2.2`，schema 版本为 `20260714_v022_account_profiles`。
- 核心归属链路为 `平台账号档案 -> 多个诊断项目 -> 多次采集任务 -> 多条页面采集路线`。
- 平台账号 ID 是优先唯一标识；仅有名称时档案标记为待补 ID，不使用模糊名称合并。
- 项目复制只能在同一账号档案内进行，且只复制配置，不复制任何历史业务记录。
- 快照和 MetricPulse 均由服务端从任务反查账号归属；前端或插件不能任意指定最终归属。
- `MISMATCHED` 快照拒绝入库，`UNVERIFIED` 快照隔离且不生成正式指标，人工确认后才能进入诊断链路。
- 工作台、项目页和任务页持续显示当前账号、项目和任务上下文。
- 工作台允许永久删除错误或重复账号档案；操作前使用网页内确认弹窗展示删除范围、数量和不可恢复警告，服务端以事务级联清理账号全部历史数据并写审计。
- 未登录工作台和登录页已统一为响应式入口设计，明确账号、采集复核、人工决策三步流程，并在窄屏首屏保留登录操作。
- 本地预上线 migration 与浏览器主流程验收通过；真实平台页面的账号识别仍待人工校准。
- 第一版继续保持零自动点击、零自动改预算、零自动暂停、零自动创建计划、零自动提交。

## 当前版本

- 当前源码产品版本：V0.2.2
- 当前开发状态：V0.2.4 功能实现与本地验收收口中，尚未发布或打标签
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
- 已完成字段来源标记，用于区分可见页面、截图/OCR、CSV、人工输入和人工复核等来源。
- 已建立标准指标字典 `MetricKey`，作为指标口径入口。
- `normalize` / `review-metrics` / `decision-engine` 使用标准 key。
- `unknown` 字段不参与强动作判断，避免低置信或未知口径字段触发强投放动作建议。
- `packages/llm` 已降级为解释层，只做解释和辅助表达，不生成最终动作。
- `decision-engine` 负责最终结构化动作建议。
- 已新增 `ActionOutcome`，用于记录用户手动执行后的复盘结果。
- 已新增 outcome API，用于创建、查询动作复盘，以及项目维度复盘汇总。
- Web 动作详情页已有执行后复盘入口和复盘记录展示。

## 当前闭环

1. Chrome Extension 在用户授权且已打开页面中通过页面适配器采集可见 DOM、真实表格和白名单指标。
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

## 2026-07-15 采集可信度与决策可用性

- 采集完成、账号可信、指标复核和动作资格已拆成四个独立状态，不再用一个“路线完整”布尔值承载全部含义。
- 任务页和 `capture-summary` 按路线返回最新快照、账号匹配证据、覆盖率与完整度；必需路线必须逐条确认账号。
- Canvas、虚拟列表等页面可保留 `PARTIAL` 证据并进入正式诊断，动作资格仍由 `decision-engine.actionEligibility` 按证据判断。
- 缺少服务商后毛利 ROI 不再阻断整个 DecisionRun；支付/核销 ROI 只作为账号表现事实展示，不能冒充真实毛利 ROI。
- 直播概览已可提取 GPM；Extension 页面适配器版本为 `1.2.0`。
- 当前验证：102 项测试、全仓 typecheck/build、Prisma validate/generate、版本一致性检查全部通过。

## 当前不包含

- 不包含自动投放执行。
- 不包含自动预算调整。
- 不包含自动暂停或创建计划。
- 不包含自动提交平台表单。
- 不包含绕过验证码或平台风控。

## 2026-07-29 采集校准大屏与诊断衔接

- 真实五路线任务当前可聚合 31 项标准指标和 358 个表格单元格；校准大屏核心区展示全部标准指标，并明确保留各自来源路线。
- 普通流程不再要求逐个查看和确认表格单元格。详细指标、趋势和原始表格默认收起，一键确认在服务端事务中完成剩余待复核数据的确认。
- 一键确认后会继续执行决策预演：正式就绪时创建 DecisionRun；未就绪时打开保守诊断，不再让用户停留在校准页却看不到分析。
- 当前真实任务的数据已超过正式决策时效窗口，因此预期结果是保守诊断和补采提示，不是强行动建议。
- 决策时效与复核状态已解耦：路线过期会阻断正式决策，但不会再错误显示“尚未开始复核”。
- 当前验证基线：shared 39、Extension 29、Web 27、LLM 6、decision-engine 34、API 79，共 214 项测试通过；typecheck、build、Prisma validate 通过。
- 数据库结构和 Extension 权限未变化；所有平台操作继续由用户人工完成。

## V0.1.2 安全加固状态（2026-07-10）

- 主体确认、人工复核覆盖率、关键指标置信度和数据完整性现在共同决定是否允许产生强动作。
- 服务商诊断已使用广告消耗、服务费、商家补贴、已核验平台权益和核销毛利计算真实成本及毛利 ROI。
- API 已有服务端二次脱敏、请求体限制、幂等写入、事务审计和并发状态保护。
- 最终动作唯一来源是 `packages/decision-engine`，解释接口不再创建旧动作口径。
- Extension 仍是 MV3 只采集插件；网络捕获需用户点击开始，XHR 仅补丁原型方法，不替换构造器。
- 内部包生产入口改为 `dist`，类型入口保留 `src`，避免生产运行直接加载工作区 TypeScript。
- 测试状态：58 项通过，API 集成测试无需人工启动数据库。
- 部署状态：Compose 本机完整冒烟通过，服务器 staging 尚未执行。

## V0.1.2 发布收尾（2026-07-10）

- Extension `0.1.2` 的 unpacked 目录和 ZIP 已由当前安全源码重新生成，测试直接验证最终 ZIP。
- 旧 Recommendation 双轨已从 API/Web/Prisma Client 主线移除。
- Web 浏览器会话已迁移为 HttpOnly Cookie，不再持久化 JWT；Extension Bearer 上传能力保持不变。
- API 列表已支持 cursor 分页，Outcome 项目汇总使用数据库聚合。
- BullMQ/queue 未启用预留已删除；StrategyRule 仅作为数据库兼容旧表保留，不进入生成客户端。
- API 已拆出 `routes/auth`、`http-security`、`ownership`、`pagination`、`server-utils`。
- 当前测试总数为 64 项，全部通过。

## V0.2.0 固定页面巡检与建议治理（2026-07-12）

- 采集主线从单个快照扩展为 `CollectionRun -> CollectionRouteHeartbeat -> DataSnapshot`，可以追踪一次巡检覆盖了哪些固定目标页面。
- 默认必需路线为本地推数据总览、直播数据大屏和任务列表；页面库、小时趋势和素材库可按页面能力补充。
- 5 分钟内为新鲜、10 分钟后判定过期；路线不完整、数据过期和连续失败会降级巡检，并由服务端阻断强动作。
- 插件巡检必须由用户主动开始，只采集当前已打开且在白名单内的页面；没有新增权限，也没有自动导航、点击或表单操作。
- 建议生命周期支持 `EXPIRED` 和 `SUPERSEDED`，并有 15 分钟有效期、30 分钟冷却、同类建议去重和每项目每小时频控。
- 决策预演为纯只读接口，不持久化决策、建议或审计记录。
- 业务健康中心展示数据库、巡检批次、降级状态和 AI 解释服务状态；AI 熔断不影响确定性规则决策。
- Extension 当前版本为 `0.2.0`；全仓 69 项测试、typecheck、build、Prisma validate 通过。
- 浏览器验收已确认仪表盘健康中心、决策中心新状态、任务页路线质量和预演入口可正常渲染，浏览器控制台无错误或警告。

## V0.2.0 审查修复（2026-07-12）

- 最新巡检批次现在是决策数据的唯一优先锚点；存在新批次时，不允许旧批次快照绕过路线完整性检查。
- 连续失败路线会同时反映在巡检状态、质量 DTO、Web 强建议门槛和决策阻断原因中。
- 建议生命周期的项目级并发检查已串行化；自动过期写入和审计使用同一事务。
- 当前验证状态：71 项测试、typecheck、build、Prisma validate、Prisma generate 全部通过。

## V0.2.1 实时性、采集安全与发布一致性（2026-07-12）

- 生产 Extension 网络响应拦截已移除，新增 Side Panel、页面适配器和覆盖率元数据。
- `MetricPulse` 每 5 秒最多上报一次，只保存在单实例有界内存；SSE 向 Side Panel 推送事实型实时信号。
- 正式建议继续由服务端 `decision-engine` 生成，全部需要人工审批且只能人工执行。
- `globalSafetyBlock` 与 `actionEligibility` 分离；未知字段按依赖动作降级，人工别名可热校准，漂移事件可审计。
- 动作建议有效期按动作分为 60-90 秒、5 分钟和 30 分钟。
- `ActionProposalGate`、`ActionProposalQuota` 和任务级非阻塞批次门禁取代项目级粗锁。
- 旧 AI 解释熔断使用 provider/model 状态机和确定性模板；该兜底不适用于 v035 AI 诊断，v035 Provider 失败必须进入 `FAILED`。
- 版本唯一来源、构建元数据、`/version`、SHA256 制品清单和 CI 发布门禁已接入。
- Prisma migration 的全新安装与 V0.2.0 升级路径均已通过临时 PostgreSQL 验证。
- 当前本地验证为 75 项测试全部通过；typecheck、build、版本检查、Prisma validate/generate 与生产依赖审计通过。
- 最终 Extension ZIP 已按源码提交 `d08d7d12c7bf` 生成并通过制品安全测试，SHA256 为 `7f882564185bc4ddb2bba671d6dc21c0a7320451148bfaf6476558294a9d38cb`。

## V0.2.1 本地预上线验收（2026-07-13）

- 生产 Compose 三服务 healthy，PostgreSQL 不发布宿主端口，Web/API 只绑定回环地址。
- API 容器通过 `prisma migrate deploy` 应用正式 migration，不再使用 `db push`。
- `/ready`、`/version`、Web 首页、浏览器注册和 Dashboard 均通过；容器版本元数据包含 Git SHA 与 Extension SHA256。
- 完整服务商人工决策闭环通过，服务端敏感信息二次脱敏和空 `rawNetworkJson` 通过。
- 真实平台页面、Chrome Memory Saver/discards 和腾讯云反向代理仍需 staging 人工验收。

## v035 AI Skill 诊断状态（2026-07-31）

- 新诊断主线是 `可信复核数据 -> DeepSeek 编排 -> 版本化 Skills -> 综合诊断 -> 规则裁决 -> 人工闭环`；规则引擎不再作为新任务页的诊断主体。
- `AiAnalysisTask` 仅保留历史只读；新 explain/analyze 请求进入同一异步 AI DecisionRun，不生成 mock 成功记录。
- API 与独立数据库租约 Worker 已接通；同任务活动运行唯一，Worker 崩溃可在租约过期后恢复，失败运行不再重用。
- 案例库按工作区隔离，只有人工高分确认或完整 Outcome 的案例可人工纳入；检索按问题标签、指标区间、路线、动作和结果加权。
- v035 migration 已通过空库和历史数据升级验证；Docker Compose 已声明 Worker，但本轮未部署、未启动生产服务、未修改生产数据库。
- `AI_DIAGNOSIS_ENABLED=false` 仍是默认值；DeepSeek 密钥只在一次性评测进程中使用，未持久化。
- 真实 `deepseek-v4-pro` 已在 Prompt v13 / SkillSet v2 / Orchestration v19 上串行完成 24 例：结构 100%、核心命中 100%、虚构证据 0、安全违规 0；Fake Provider 同样为 100%/100%/0/0。
- DeepSeek thinking 下不支持 named/required `tool_choice`；编排器因此先确定性执行 readiness audit，再使用 Tool Calls 选择领域 Skills，并以短 thinking 核心裁决 + 无 thinking 完整 JSON 综合满足 120 秒边界。
- 真实任务人工验收仍未完成。本地业务库未登记现有 16 个 migration，只读 Prisma 检查因缺少 `CollectionTask.idempotencyKey` 失败；未执行 migration、部署或开关启用。
- 当前最终工程验证为 267 项测试通过；全仓 typecheck、build、lint/架构检查、Prisma validate/generate、版本检查和 Compose 配置检查通过。密钥片段工作区扫描为 0。
- 2026-08-01 已对锁定目标 `douyin_subject_diagnosis` 完成备份、克隆演练和一次性结构对账：演练库与 v035 Prisma Schema 无差异，16 条迁移已登记，迁移状态、历史读取与行数清单均一致。原库没有执行 DDL、迁移登记或业务写入。
- 原库升级被安全门禁阻断：真实验收任务 `cms4wmzes000uqs07m0a4q8ze` 位于另一套 `pxxis_prelaunch` 数据库，未在锁定目标库中。不得复制任务、切换目标库或绕过任务存在性检查；真实五路线采集和 AI 验收保持未执行。

## 2026-08-01 历史数据复盘状态

- 用户允许针对任务 `cms4wmzes000uqs07m0a4q8ze` 的 2026-07-28 五路线快照进行只读历史复盘，输出制品为 `artifacts/v035-history-replay-2026-07-28.md`。
- 复盘确认原始页面证据仍可解释当时的商品集中度、退款线索和任务暂停状态；但旧标准化记录存在单位与字段错绑，已明确排除，不能作为 AI 或正式动作依据。
- 本次复盘不写入数据库、不创建 AI 诊断或动作、不改变运行开关；`AI_DIAGNOSIS_ENABLED` 仍为 false。V035 完成状态仍取决于重新采集并人工复核当前五路线数据。

## 2026-08-01 V035 本机数据库与验收环境状态

- 真实验收路径已纠正为 `pxxis_prelaunch`：该本机运行库包含任务 `cms4wmzes000uqs07m0a4q8ze`，其历史状态为 `UPLOADED`，原有快照数为 `5`。`douyin_subject_diagnosis` 的历史演练记录只保留为独立库验证，不能代表本任务验收。
- `pxxis_prelaunch` 已按“停止写入 -> 备份 -> 克隆演练 -> 同一 DDL -> 迁移登记 -> 独立复核”升级到 v035。最终数据库有 16 条成功 Prisma migration、4 张新增 v034/v035 业务表、空 Schema diff、迁移状态一致；逐表行数和验收任务快照数与第二份备份 manifest 一致。
- 第二份升级前 custom-format 备份已实际恢复到隔离验证库，恢复后仍包含 14 条 v033 migration、验收任务、5 条任务快照和 12 条总快照，证明恢复点可用而非仅文件存在。
- 本地验收 API/Web 已替换为当前 v035 构建，地址仍为 `http://127.0.0.1:4300` 与 `http://127.0.0.1:3300`，均 healthy；旧 v033 容器作为停止的回退副本保留。该切换仅发生在本机，不是服务器部署或生产启用。
- AI 仍未进行真实验收：API 设置 `AI_DIAGNOSIS_ENABLED=false`，Worker 未运行且没有 DeepSeek 密钥。仓库 `.env.example` 和 Compose 默认值继续为 false。
- 仍需用户完成时效内五路线采集和人工复核，之后才能进行一次本地真实 DeepSeek DecisionRun、规则裁决与评价/案例门禁验收。

## 2026-08-03 本机验收入口状态

- 已恢复之前正常退出的 v035 API/Web 容器，`127.0.0.1:4300` API 和 `127.0.0.1:3300` Web 均可用；运行元数据仍为 `a0cef5b` / `20260731_v035_ai_skill_diagnosis`。这只是本机验收入口恢复，不是部署或生产启用。
- 任务会话失效时会安全回跳至原任务登录：站内任务路径经编码传入登录页，登录成功后返回该路径；外站、协议相对 URL 和反斜杠输入被拒绝。这样用户可以继续手动配对，不会被丢回 Dashboard。
- 当前工程验证为 270 项测试全部通过，且 lint、typecheck、build、Prisma validate/generate、版本检查、Compose 配置检查均通过。真实五路线采集、可信复核、真实 DeepSeek 调用和用户评价仍为未完成事项。

## 2026-08-03 页面可验证性补齐

- 任务不存在状态已提供“返回登录”入口，避免用户进入无任务链接后无法恢复。
- 采集校准大屏已把待复核的 `originalValue` 纳入摘要展示回退，原始采集值存在时不会再渲染为只有单位的空白指标；该值仍明确标记为待复核，不能进入 AI。
- 重新对账后确认用户本轮数据实际写入的是任务 `cmscuy6al0005qs07q1nz32hl`，而非原 V035 验收任务 `cms4wmzes000uqs07m0a4q8ze`。当前任务共有 11 条快照，最新五路线约采集于 `2026-08-03 15:50`，均为 `VERIFIED/MATCHED`；原任务仍保留 5 条历史快照。
- 最新五路线包含 14 个指标和 353 个表格单元格，共 367 项待校准。14 个指标原始显示值全部为空，绑定证据均未通过；系统拒绝确认和 AI 输入符合失败关闭规则。根因是隐藏重复 DOM 与父子标签重复命中，适配器已按可见性、最内层标签和最小唯一值组件修复；缺少可见统计周期时仍保持待复核。
- Popup 现在实时向本机 API 校验配对上下文，五路线已有记录后仍允许重复采集；任务页仅把服务端确认的凭证、当前任务绑定和心跳视为连接成功。当前 unpacked 构建指纹为 `3c517c1a983e`，Web 镜像为 `pxxis-v035-local-web:20260803-capture-binding-fix`。
- 本轮完成 lint、typecheck、全仓 273 项测试、build、Prisma validate/generate、版本检查、Compose 配置检查与差异检查。API `/ready`、`/version` 和 Web 任务页均可用；AI 开关仍关闭，无 DeepSeek 密钥和诊断 Worker，没有 migration、平台操作、真实 AI 调用、提交或推送。

## 2026-08-03 旧插件协议门禁与本机运行态

- 浏览器实际加载的插件是旧构建 `ac1f90e08ade`，虽与新插件同为产品版本 `0.2.4`，但仍包含“本轮路线已完成”旧交互和旧字段取值逻辑。此前仅比较产品版本不足以阻止同版本旧构建继续采集。
- 共享 Web Bridge 协议现为 `3`，采集写入协议现为 `2`。任务页会把协议 `2` 的旧 Web Bridge 判为不兼容；API 会拒绝采集协议 `1`、缺失协议或其他不一致快照。
- 页面周期证据改为严格语义匹配：“实时在线人数”、开播时间、商品上架日期等业务文本不再冒充统计周期；表格行内日期不会被表格绑定读取为页面周期。缺少明确周期时保留真实数值并继续待复核，不补造周期。
- 当前 unpacked 构建为 `0.2.4` / `5b8ac43c56ca`。本机 API/Web 已使用新共享协议重建，`127.0.0.1:4300/3300` 均 healthy；旧运行容器停止保留为协议升级回退副本。数据库任务 `cmscuy6al0005qs07q1nz32hl` 仍有 11 条快照，没有因服务切换增删。
- 最新工程基线为 275 项测试、lint、typecheck、build、Prisma validate/generate、版本检查、Compose 配置和差异检查全部通过。AI 仍关闭，无 DeepSeek 密钥和诊断 Worker；真实复采与人工复核尚未完成。

## 2026-08-04 当前连接状态与验收入口

- 历史快照与当前插件连接已在状态机中明确分离：任务第 1 步只在 Web Bridge、服务端当前任务绑定和近期心跳均通过时完成。历史快照不再令用户跳过配对/连接，也不再把离线插件伪装成可继续采集。
- 连接未恢复时，任务页面把路线区域明确标为历史记录并提示其仅供复核；旧桥接协议不兼容时，手动配对码入口也被关闭。
- 本机 Web 已更新为 `pxxis-v035-local-web:20260804-connection-state-v2` 且健康；原容器保留为 `pxxis-prelaunch-20260713-web-1-connection-state-rollback-20260804` 停止回退副本。API、PostgreSQL 和任务快照均未修改。
- Chrome 当前目标后台没有插件注入标记，尚未重新加载新版 unpacked。因此尚未发生新版真实采集；验收状态仍是“可验证，待人工重载插件和复采”。

## 2026-08-06 直播大屏固定节拍实时链路

- 已完成直播大屏 API/DOM 字段级混合采集实现，范围严格限于 `https://eos.douyin.com/dp/liveScreen` 和固定的十个 `/life/api/live_screen/v5/*` 端点。服务端功能开关 `LIVE_SCREEN_INTERNAL_API_ENABLED` 保持默认 `false`，因此当前运行态不会调用平台内部接口，原有 DOM 五路线未受影响。
- 实时脉冲为用户在 Popup 显式开启的内存态任务：`key_index` 对齐整 5 秒节拍，耗时跨越节拍时跳到下一整点；分钟趋势仅在整分钟请求。脉冲只进入单 API 实例的有界内存，不产生 `DataSnapshot`、不进入正式诊断。
- 已增加可见性、页面卸载、标签关闭、URL 导航、直播结束、401/429、敏感响应、Schema 漂移和连续失败三次的停止门禁。API/DOM 冲突不能自动取值，必须由人工在校准大屏选择 API、DOM 或忽略。
- 本轮没有启用开关、没有访问真实平台 API、没有数据库 migration 或业务数据写入；AI 仍保持关闭，真实灰度验收待用户在 Chrome 手动重载当前 unpacked 插件后完成。
- 已将正式 SNAPSHOT 的已验证分钟趋势投影为现有 `HOURLY_ROWS`，供校准大屏读取；PULSE 不产生 `DataSnapshot`，继续只保存在单实例有界内存。服务端同时校验分钟行对应 `room_minute_indicator` 端点成功，开关关闭时 API 指标和分钟行都被拒绝，纯 DOM 脉冲不受影响。
- 2026-08-06 实际验证通过：lint、typecheck、282 项全仓测试、build、Prisma validate/generate、版本检查、带临时占位变量的 Compose 静态配置检查、差异检查和 Extension 本地构建。测试分布为 Shared 46、Extension 52、Web 32、Decision Engine 39、Diagnosis Skills 4、LLM 14、API 104；当前 unpacked 指纹为 `e97a2c747e3b`。

## 2026-08-06 直播链路审查优化状态

- 正式 SNAPSHOT 已真实接通服务端内部 API 灰度状态；只有精确直播概览、可信唯一 `room_id` 和开启开关同时成立时才调用内部 API。其他情况以及开关关闭时均回退 DOM。
- 纯 DOM PULSE 已恢复，仍只写单实例有界内存。服务端 API 证据改为逐字段匹配共享契约，重复来源字段、伪造端点字段、敏感响应后的部分结果和超安全整数浮点误判均已失败关闭。
- 当前工程基线：lint、typecheck、312 项测试、build、Prisma validate/generate、版本检查、Compose 配置检查和差异检查通过；测试分布为 Shared 47、Extension 66、Web 33、Decision Engine 39、Diagnosis Skills 4、LLM 14、API 109。
- 本地 unpacked 指纹为 `f8f1e42ff28f`。内部 API 开关与 AI 仍为默认关闭；没有真实平台 API 请求、数据库写入、migration、部署、提交或推送。

## 2026-08-07 本机配对协议状态

- 本机 API/Web 已更新到当前采集协议 `4`，`http://127.0.0.1:4300/version`、`/ready` 和 `http://127.0.0.1:3300/tasks/cmscuy6al0005qs07q1nz32hl` 均实测 HTTP 200。
- 插件在配对码兑换前校验 `/version`，避免旧服务消耗一次性配对码后才发现协议不兼容；Popup 保留失败原因。当前解包构建指纹为 `fe4f32506ca1`。
- 本次仅替换本机 API/Web 容器；PostgreSQL、既有任务快照、数据库 schema/migration、`LIVE_SCREEN_INTERNAL_API_ENABLED` 默认关闭、`AI_DIAGNOSIS_ENABLED=false` 与未启动的 Worker 保持不变。切换后实测任务 `cmscuy6al0005qs07q1nz32hl` 有 `16` 条快照，旧交接数字不再作为当前依据。

## 2026-08-07 自动连接恢复状态

- 已修复“Popup 已配对、任务页仍显示插件后台未响应”的 Web Bridge 通讯问题：网页与扩展隔离上下文之间只交换已校验的 JSON 字符串，不再依赖对象型 `CustomEvent.detail`。
- 已配对且已绑定当前任务的插件，在任务页打开或每 5 秒固定刷新时会先向本机 API 复验上下文，再上报一个不可采集的任务页连接心跳。因此任务页能先确认插件连接；用户仍必须手动打开真实平台后台页面后才能采集。
- Web Bridge 协议为 `5`，采集写入协议仍为 `4`。当前本机 unpacked Extension 指纹为 `f8f1e42ff28f`，API/Web 镜像为 `pxxis-v035-local-api:20260807-protocol5-auto-connect` 与 `pxxis-v035-local-web:20260807-protocol5-auto-connect`，端口仍仅绑定 `127.0.0.1:4300/3300`。
- 任务页刷新顺序已固定为“先桥接恢复、后服务端状态”，避免连接心跳与状态读取并行造成短暂误报。
- Chrome 现场仍注入旧构建 `fe4f32506ca1 / 协议 4`，尚未执行用户手动重载；旧构建被协议 5 任务页拒绝是预期的失败关闭。
- 当前 API `/ready`、`/version` 和任务页均实测可用。PostgreSQL、任务快照、迁移、AI/Worker 和 `LIVE_SCREEN_INTERNAL_API_ENABLED=false` 未改动。旧协议 4 API/Web 容器停止保留为本机回退副本。

## 2026-08-07 自动恢复超时保护状态

- 服务端审计确认最近一次插件配对已经成功创建有效凭证；配对后没有产生新的恢复心跳，浏览器现场当前已退回登录页，因此不能把任务页“后台未响应”归因于凭证兑换失败。
- 扩展后台现对任务页恢复所需的上下文刷新和心跳分别设置 `1.8` 秒超时，两次总预算小于 Web Bridge 的 5 秒等待上限。网络异常会返回明确的本机 API 超时信息，避免把网络卡住误报成扩展后台无响应。
- 配对预览、确认和版本检查同步改为有界请求；任务页恢复心跳仍为 `TASK_TABLE / collectable=false`，不会让任务页或历史快照获得采集能力。
- 当前 unpacked Extension 指纹为 `7861690c4cc4`，Bridge 协议 `5`、采集协议 `4`。全仓 lint、typecheck、315 项测试、build、Prisma validate/generate、版本检查、Compose 配置检查和差异检查通过。
- 本轮没有替换运行容器、修改数据库、启用 AI/Worker 或内部 API。真实 Chrome 验收仍需用户重新登录并手动重载当前 unpacked 插件。

## 2026-08-08 Bridge 协议 6 状态

- Web Bridge 现在使用同源校验的 JSON `window.postMessage` 信封替代 `CustomEvent`，修复网页与扩展 isolated world 之间可能丢失请求或响应的问题；消息仍仅包含脱敏状态。
- 共享 Bridge 协议为 `6`，采集写入协议仍为 `4`；当前本地 unpacked 指纹 `3012e6dbc930`。任务页继续仅通过 `TASK_TABLE / collectable=false` 心跳确认连接，真实平台页才可采集。
- 服务端“历史授权”与当前 Chrome 本地凭证已经在界面上明确区分。空插件不能依据服务端历史授权自动恢复，因为服务端不下发凭证。
- 本机 API/Web 已切换至 `20260808-protocol6-postmessage` 镜像，`127.0.0.1:4300/3300` 健康；PostgreSQL 与数据卷未修改，AI、Worker 和 `LIVE_SCREEN_INTERNAL_API_ENABLED` 继续关闭。
- 实际 Chrome 现场仍注入旧 `Bridge 5 / 7861690c4cc4`，且本地 Web 登录会话已过期；协议 6 的真实自动恢复尚待用户手动重载扩展、重新登录后验收，不能仅凭构建和单元测试标记完成。

## 2026-08-28 经营总览与本地推全域查询状态

- Web 经营总览已经收敛为一块分层面板，并直接使用 `buildDashboardOverviewCards` 的统一语义卡片；同名直播/本地推指标不再在上下区域重复展示。
- 本地推内部 API 当前固定为 3 个只读端点：`pageMetrics`、`getLiveReportPromoteMeta`、`statQuery`。元数据端点只在内存中提供直播时间区间与 roi2 广告 ID，不进入快照、日志或服务端业务数据。
- `roi2_promotion` 查询现在具备平台页面实际使用的广告主、房间、时间区间和广告 ID 四类过滤条件；后 5 项全域指标不再因缺少过滤条件而固定返回 0。
- 服务端会根据指标分组动态要求端点证据：基础指标要求 pageMetrics/statQuery；任何全域指标额外要求 promote metadata 成功。请求总量上限由 192 KiB 调整为三个端点合计 256 KiB，各端点独立上限仍生效。
- 当前源码、测试和本地解包构建已完成，构建指纹 `aba831dcc7db`；未切换本机 API/Web 容器，未写数据库，真实登录页面最终验收待人工完成。

## 2026-08-28 本机 API 运行契约已对齐

- 当前 `127.0.0.1:4300` API 容器使用镜像 `pxxis-prelaunch-20260713-api:local-promotion-contract-v2-20260828`，运行中的共享契约为 `2026-08-28.2 / Adapter 1.2.1`，与本地 unpacked 插件 `aba831dcc7db` 一致。
- API 容器、数据库检查均 healthy，`/ready` 返回 database ready，`/version` 保持产品 `0.2.5` 与采集协议 `8`；3300 Web 仍返回 HTTP 200。
- 原 `local-plugin-v0.2.5` API 容器已停止保留为 `pxxis-prelaunch-20260713-api-1-before-contract-v2-20260828`。PostgreSQL、数据卷、Schema、Web 容器、AI/Worker 和生产环境均未变化。

## 2026-08-29 校准大屏内联诊断状态

- 校准大屏不再在确认可信数据后路由回任务向导：同页下方新增固定诊断结果区，正式任务会显示异步运行阶段与 Skill 状态，完成后显示诊断、证据、规则裁决和待人工审批建议；保守预检只显示保守诊断，且不创建动作建议。
- 任务向导从“连接插件 / 采集页面 / 数据汇总 / 人工核对 / 诊断建议”改为四步。人工确认并未取消，而是收敛到数据汇总对应的校准大屏和服务端复核门禁。
- 诊断的业务摘要由共享组件统一渲染，任务页保留历史结果入口，校准大屏成为用户点击确认后的主结果位置。
- 本机 Web 已切换到 `pxxis-prelaunch-20260713-web:diagnosis-inline-v2-20260829`，3300 首页 HTTP 200；上一版 Web 停止保留为 `pxxis-prelaunch-20260713-web-1-rollback-inline-diagnosis-v1-20260829`。API、PostgreSQL、数据卷、Schema 和插件源代码没有为本轮改动。

## 2026-08-30 实时脉冲入口安全状态

- 源码已将实时趋势历史按 `routeKey` 隔离，并在 `/metric-pulses` 写入前确认任务配置路线。
- 实时入口现只接受已配对 Extension 的直播概览和本地推数据总览两条 API 路线；用户网页会话、直播商品/流量路线和纯 DOM 直播脉冲均不可进入实时内存。直播 API 脉冲必须携带有效内部 API 指标证据；正式快照仍保留 DOM 与人工复核链路。
- 已通过定向回归、API typecheck 与隔离 PostgreSQL API 测试（30 文件、147 项）。尚未重建或切换本机 API 容器，故运行态与真实 Chrome 验收仍未完成；数据库、Schema、扩展制品、平台数据与生产环境未变。

## 2026-08-31 本机 Docker 资源状态

- 已删除 10 个本项目已退出、无挂载的较早 Web/API/Worker 回退容器；当前保留运行中的 Web、API、Worker、PostgreSQL 与最近一整套可回退容器。
- 未删除镜像、数据卷、数据库、业务数据或其他项目容器。清理后 Web 3300、API 4300 `/ready`、`/version` 均为 HTTP 200；Web/API/PostgreSQL healthy，Worker running。

### 候选与过旧回退容器补充清理

- 2026-08-31 已删除本轮临时验证使用且已退出、无挂载的 Web 候选容器（3301）、API 候选容器（4304）以及 7 个更旧的 Web/API/Worker 回退容器。当前运行服务与最近完整回退集保持不变；删除后 3300、4300 `/ready`、4300 `/version` 均为 HTTP 200。

## 2026-09-02 本机 Docker 资源状态

- 已删除其余 21 个已退出、无挂载的本项目 Web/API/Worker 历史容器（含候选与回退副本）。当前本项目不存在停止容器。
- 运行服务未改变：Web 为 `decision-experiment-view-v14-20260901`，API/Worker 为 `decision-experiment-transaction-v15-20260902`，PostgreSQL 保持运行且 healthy。
- 镜像、数据卷、数据库、业务数据、网络和其他项目容器均未删除；3300 Web、4300 `/ready`、`/version` 实测均为 HTTP 200。

## 2026-09-03 本地推换账号身份识别兼容

- 用户现场 URL 已确认同时包含数字 `advid=...` 与 `selected_advid=ALL`；后者是平台“全部广告主”筛选哨兵，不是广告主 ID。旧代码因将所有非数字身份值视为冲突，错误阻止本地推启动。
- 共享身份解析已仅排除精确 `selected_advid=ALL`，保留数字广告主 ID 的 URL/DOM 交叉校验、唯一性与身份变化停止机制。没有新增平台端点、采集字段、数据库字段或 DOM 采集回退。
- 本地解包插件已重建，构建指纹 `2fa18f68ee91`；真实 Chrome 换号后手动启动和服务端接收仍待用户验收。

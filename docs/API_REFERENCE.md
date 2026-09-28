# 采集校准 API

## 失败步骤审计（编排 v37）

已有 `GET /projects/:id/audit-logs` 在项目归属检查后可返回新增事件 `AI_DIAGNOSIS_VALIDATION_FAILED`，请求和分页不变。`detailJson` 包含 `decisionRunId`、`attemptCount`、`stage`、`finalErrorCode`、`promptVersion`、`orchestrationVersion` 与至多 3 项 `validationDiagnostics`。每项仅为 `{version:1, rule:"OBSERVATION_STEP_CHANGE", path, stepText, textRedacted, detectedVariables, unresolvedAdjustment}`；敏感文本可能整体为 `[REDACTED_SENSITIVE_STEP]`。片段为被拒方案，不是可执行建议；最终诊断查询仍返回 FAILED/空结果。自动纠正成功不生成失败审计，历史失败不回填。未登录或项目无权访问仍按原认证/归属规则拒绝，无新增权限。

## 诊断场景与经营解释（v27/v35/v11 源码契约）

- `POST /collection-tasks/:id/decision-runs` 使用已有登录会话与任务归属检查。请求可为 `{ "scenario": "POST_LIVE_REVIEW" }`；允许 `UNSPECIFIED`、`LIVE_MONITORING`、`POST_LIVE_REVIEW`，省略按未指定。场景在服务端冻结，决定领域问题、顺序及综合要求，不能作为开播/下播证据。`Idempotency-Key` 同键重放仍返回原运行；修改场景需新的创建意图，活动运行不被覆盖。
- 创建成功以既有信封返回运行 DTO：新建/运行中 HTTP 202，已成功复用 HTTP 200。非法场景或额外请求字段返回 `400 VALIDATION_ERROR`；任务不可访问返回 `404 TASK_NOT_FOUND`；无快照/实时输入返回 `409 SNAPSHOT_REQUIRED`；证据门禁未通过返回 `409 DECISION_NOT_READY`。本轮没有新增错误码或修改原接口。
- `GET /decision-runs/:id` 的既有 `decisionView` 新增 `analysis` 数组，至多三项，每项为 `{title, conclusion, supportingFacts, conflictingFacts, missingEvidence}`，后三项均为字符串数组。这些是待验证解释，不是原因确认或动作许可；成功页面仍以 `nextStep/primaryExperiment` 管理审批。空数组表示无可展示的有据解释；旧 Web 可忽略此字段，新 Web 兼容字段缺省。
- 展示片段示例：`{"analysis":[{"title":"承接与商品贡献尚待区分","conclusion":"已有成交不能区分两者贡献，需要同口径商品对照。","supportingFacts":["直播间成交订单数：100"],"conflictingFacts":[],"missingEvidence":["核对同口径商品点击与成交"]}]}`。示例只解释字段，不是实际诊断数据。失败仍为 `FAILED`，只展示独立 `trustedFacts`；确定性冲突和未复核输入不提供分析。
- 未新增数据库字段或端点；当前服务是否已启用本契约以 [NOW.md](./NOW.md) 为准。

## 当前插件连接核验（Bridge 9）

- 用途：把当前浏览器插件的连接与账号历史授权区分开；下列字段不改变任务权限、采集协议或业务数据库。
- `POST /extension/heartbeat` 仍只允许 Extension 凭证；新增可选 `connectionSessionId`（UUID），Worker 每次启动新建。任务页请求示例：`{"collectionTaskId":"task-1","connectionSessionId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","extensionVersion":"0.2.6","bridgeProtocolVersion":9,"buildFingerprint":"71da1f485d4f","currentUrl":"https://www.pxxis.cn/tasks/task-1","pageType":"TASK_TABLE","routeKey":"UNKNOWN","collectable":false,"tabState":"VISIBLE","observedAt":"2026-09-03T03:00:00.000Z"}`。
- 心跳成功返回标准信封：`{"success":true,"data":{"receivedAt":"2026-09-03T03:00:00.000Z"},"error":null}`。参数无效返回 `400 VALIDATION_ERROR`；非 Extension 身份返回 `403 EXTENSION_CREDENTIAL_REQUIRED`；任务不属于凭证账号返回 `403 EXTENSION_ACCOUNT_MISMATCH`。
- `GET /collection-tasks/:id/extension-status?connectionSessionId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` 使用网页登录会话，先验证任务归属和有效凭证，再筛选对应连接。省略查询参数保持原账号级历史查询兼容。非法/重复会话参数返回 `400 VALIDATION_ERROR`，无权访问或任务不存在返回 `404 TASK_NOT_FOUND`。
- 状态成功示例：`{"success":true,"data":{"state":"PAGE_UNSUPPORTED","installedDetectedByWeb":false,"paired":true,"boundTaskId":"task-1","boundTaskTitle":"任务一","connectionSessionId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","extensionVersion":"0.2.6","bridgeProtocolVersion":9,"buildFingerprint":"71da1f485d4f","currentUrl":"https://www.pxxis.cn/tasks/task-1","pageType":"TASK_TABLE","routeKey":"UNKNOWN","collectable":false,"tabState":"VISIBLE","lastHeartbeatAt":"2026-09-03T03:00:00.000Z","lastError":null,"message":"当前页面不在采集白名单内，请打开任务列出的目标网页。"},"error":null}`。
- `paired` 只表示服务端存在有效授权；网页仍须比对 Bridge 本地 `paired`、`boundTaskId`、`connectionSessionId`、版本/指纹与 15 秒内心跳。仅任务页连接时不可采集；另一浏览器或旧 Worker 心跳不得放行。失败信封示例：`{"success":false,"data":null,"error":{"code":"VALIDATION_ERROR","message":"插件连接标识无效"}}`。
- 2026-09-03 源码及候选已验证，正式本机是否切换必须以 [NOW.md](./NOW.md) 为准；本页以下较早的运行态提示属于历史说明。

> 当前接口可用性、运行版本和 AI 开关以 [NOW.md](./NOW.md) 为准。本页描述接口契约；请求成功不等于当前运行环境已开启对应能力。

## 当前运行态提示

- 当前本机运行态以 [NOW.md](./NOW.md) 为准；当前记录为 `0.2.6 / code-boundaries-v33-20260920`，Schema 为 `20260731_v035_ai_skill_diagnosis`。
- AI DecisionRun 接口受 `AI_DIAGNOSIS_ENABLED` 控制，当前保持关闭；不可将接口契约理解为已完成真实 AI 验收。
- 实时采集只在受限白名单、用户显式启动和服务端开关满足时可用；正式平台操作始终由人工完成。

## 项目历史对比

- 2026-09-05 修复契约：分析前后比较必须等待观察窗口到期，两侧分别选取距目标不超过 15 分钟的样本，禁止同点复用及未来样本。周期累计值要求每天 1440 个分钟桶均有数据、当日单一采集轮次、计数非负且不回退；任一日不满足则该指标无完整周期总量。原始比例、均值与瞬时值不跨日求和；ROI 只从符合完整性要求的同口径成交额/消耗重算。接口字段保持兼容。
- 复用成功诊断时，新请求键映射到唯一 `REUSED` 存档；同键后续或并发重试从该映射读取原运行，不重复建档、计入诊断限流或调用模型。读取仍按当前用户任务归属限制；已完成运行重放返回 HTTP 200，活动运行返回 202。

- 入口位置：`账号 → 项目 → 历史对比`。它与“采集任务”并列，按当前登录用户拥有的账号和项目隔离；不会跨项目、跨账号合并数据。
- `GET /projects/:id/history`：读取项目的分析存档、采集轮次、默认最近两次分析对比和默认 7 天周期对比。每个采集轮次只会标为“进行中”或“因无活动归档”；后者表示连续 3 小时没有服务端接受的有效采集或新分析，不代表直播完整结束。
- `GET /projects/:id/history/comparison`：读取单种对比结果。`mode=archives` 默认比较最近两次分析，也可附带同一项目内的 `baselineArchiveId` 和 `currentArchiveId`；`mode=analysis-window` 可附带 `archiveId` 和 `minutes=30|60`；`mode=session` 比较最近两轮已归档采集；`mode=period` 可附带 `days=7|30`，只统计北京时间已经结束的自然日。
- 对比返回 `status`（`IMPROVED`、`WORSENED`、`NO_CHANGE`、`MIXED` 或 `INSUFFICIENT`）、路线化指标行和不能判断的原因。效率结论只在同一路线、同统计口径且具有可信成交额和消耗时重新计算；不同路线、不同统计范围和不完整自然日不会相加、平均或强行判断。
- 历史点只保存白名单数值、固定指标名、路线、口径指纹、时间和可信等级；不保存页面正文、平台响应、URL、Cookie、Token 或原始证据。读取历史对比不会追加模型调用、不会创建平台动作，也不会改写既有诊断。
- 这两条接口均需网页登录会话；项目不存在或不属于当前用户时返回 `404 PROJECT_NOT_FOUND`。非法模式、天数、窗口或历史标识分别返回 `400 HISTORY_COMPARISON_MODE_INVALID`、`HISTORY_COMPARISON_DAYS_INVALID`、`HISTORY_COMPARISON_WINDOW_INVALID` 或 `HISTORY_COMPARISON_ID_INVALID`。

## 实时脉冲入口

- 请求：`POST /collection-tasks/:id/metric-pulses`。该接口仅供已配对 Extension 使用，网页登录会话、人工请求和其他客户端均返回 `403 METRIC_PULSE_EXTENSION_REQUIRED`。
- 路线：只接受任务中已配置的 `LIVE_DATA_SCREEN` 或 `LOCAL_PROMOTION_DASHBOARD`，其他路线返回 `400 METRIC_PULSE_ROUTE_INVALID`；未配置路线返回 `409 COLLECTION_ROUTE_NOT_CONFIGURED`。
- 直播脉冲：必须使用精确直播大屏页面和服务端开启的内部 API 契约，且至少包含可复核的 `PULSE_ONLY` 白名单 API 指标。纯 DOM、双来源、分钟趋势和商品/流量分栏路线不会进入实时内存。
- 本地推脉冲：继续使用 `pageMetrics`、`getLiveReportPromoteMeta`（涉及全域指标时）和 `statQuery` 的严格固定契约，不允许静默回退 DOM。
- 实时脉冲继续写入有界内存并通过 SSE 展示，且不会创建 `DataSnapshot`；服务端接受有效脉冲后另写入一条脱敏、白名单的项目历史趋势点，供同项目历史比较使用。趋势基线按 `routeKey` 隔离，正式 `/snapshots` 仍保留 DOM 采集和人工复核兼容能力。
- 当前源码的上述门禁已通过 API 测试；是否已进入本机 `4300` 运行实例以 [NOW.md](./NOW.md) 为准。

本页记录 v034 采集校准大屏的认证接口约定。除配对后的 Extension 专用接口外，均需已登录用户会话；服务端始终按当前用户校验任务归属。

## 读取任务校准大屏

- 用途：读取某一采集任务当前路线的真实指标、结构化表格、路线状态和复核覆盖率。
- 请求：`GET /collection-tasks/:id/collection-dashboard`，其中 `:id` 是采集任务 ID。
- 示例：`GET /collection-tasks/ck_task/collection-dashboard`。
- 返回：`task`（任务、账号、项目名称）、`summary`（当前路线快照、真实指标、趋势记录、表格和路线诊断）、`decisionTargets.targetRoi`（当前任务的人工目标 ROI）、`reviewCoverage`（标准指标复核计数）、`tableReviewCoverage`（表格单元格复核计数）。摘要指标同时返回内部精确 `metricValue` 与优先供展示的后台原样 `displayValue`；百分比不将内部比例值伪装成后台百分比。没有采集数据时，相应数组为空，不生成模拟值。
- 成功示例：`{"success":true,"data":{"task":{"id":"ck_task","title":"7月直播","accountName":"门店账号","projectName":"夏季投流"},"summary":{"metrics":[],"tables":[],"routes":[]},"reviewCoverage":{"confirmedCount":0,"modifiedCount":0,"ignoredCount":0,"pendingCount":0,"totalCount":0},"tableReviewCoverage":{"confirmedCount":0,"modifiedCount":0,"ignoredCount":0,"pendingCount":0,"totalCount":0}},"error":null}`。
- 常见错误：`404 TASK_NOT_FOUND` 表示任务不存在或不属于当前用户。

## 保存本次目标 ROI

- 用途：为当前采集任务记录人工经营目标。该输入不是平台采集数据，但以可信人工证据进入下一次正式诊断；服务端会与全域支付 ROI 对标，不能触发任何平台动作。
- 请求：`PUT /collection-tasks/:id/decision-targets`，请求体为 `{"targetRoi":50}`；传 `{"targetRoi":null}` 可清除目标。
- 限制：只接受大于 `0` 且不超过 `10000` 的有限数字。服务端校验当前登录用户与任务归属，并写入审计；同一任务处于 `PENDING` 或 `RUNNING` 的 AI 诊断期间返回 `409 DECISION_RUN_ACTIVE`，避免一次运行前后对标口径改变。
- 返回：`{"targetRoi":50,"updatedAt":"2026-08-31T00:00:00.000Z"}`。写入后会更新诊断证据指纹；已创建的历史运行保持不变。

## 批量保存表格校准

- 用途：确认、修改或忽略当前路线最新快照中的表格单元格。原始快照和原始单元格值不会被改写。
- 请求：`POST /collection-tasks/:id/table-cell-reviews/bulk`。
- 参数：`snapshotId` 为当前快照 ID；`expectedSnapshotUpdatedAt` 为读取大屏时返回的快照版本；`items` 为 1 至 240 个单元格，每项包含 `tableIndex`、`rowIndex`、`columnIndex`、`reviewStatus`（`CONFIRMED`、`MODIFIED` 或 `IGNORED`），`MODIFIED` 时还需 `reviewedValue`。
- 示例：`{"snapshotId":"ck_snapshot","expectedSnapshotUpdatedAt":"2026-07-24T00:00:00.000Z","items":[{"tableIndex":0,"rowIndex":1,"columnIndex":1,"reviewStatus":"MODIFIED","reviewedValue":"120"}]}`。
- 返回：每个已写入单元格的坐标、原始值、校准值、复核状态和复核时间。
- 成功示例：`{"success":true,"data":[{"id":"ck_review","snapshotId":"ck_snapshot","tableIndex":0,"rowIndex":1,"columnIndex":1,"originalValue":"100","reviewedValue":"120","reviewStatus":"MODIFIED","reviewedAt":"2026-07-24T00:00:01.000Z"}],"error":null}`。
- 常见错误：`400 VALIDATION_ERROR` 为坐标或校准值非法；`400 SENSITIVE_DATA_FORBIDDEN` 为校准值含敏感凭证；`404 TASK_NOT_FOUND` 为跨账号或任务不存在；`409 SNAPSHOT_NOT_CURRENT` 为旧快照或并发版本过期；`409 SNAPSHOT_UNVERIFIED` 为账号或路线尚未确认；`409 TABLE_BINDING_REQUIRES_REVIEW` 表示当前结构尚未完成整表逐格核对，不能直接确认原值；`409 TABLE_CELL_NOT_FOUND` 为页面表格结构已变化；`409 TABLE_CELL_REVIEW_CONFLICT` 为并发保存冲突。

## 兼容确认表格结构

- 用途：兼容旧客户端在整张表已经逐格核对后显式写入结构校准。同路线、同页面指纹、同表签名的后续快照通过全部门禁时可批量确认原始单元格。当前大屏不提供单独的“确认表头”快捷入口，逐格核对完整张表时会自动记录结构校准。
- 请求：`POST /collection-tasks/:id/table-bindings/confirm`，请求体为 `{"snapshotId":"ck_snapshot","expectedSnapshotUpdatedAt":"2026-07-30T00:00:00.000Z","tableIndex":0}`。
- 返回：已更新快照的 `snapshotId` 与 `updatedAt`；成功后必须重新读取大屏取得新的并发版本。
- 限制：仅当前、已验证路线且所有单元格均已逐格核对的表格可确认；未完成整表核对时返回 `409 TABLE_BINDING_REQUIRES_CELL_REVIEW`。表头重复、缺少/重复行标识或表格绑定为 `INVALID` 时返回 `409 TABLE_BINDING_INVALID`，不能通过此接口一键放行。

## 标准指标校准

- 用途：读取、初始化、单项/批量修改和批量确认当前快照的标准指标，正式诊断仅接受 `CONFIRMED` 或 `MODIFIED` 数据。
- 接口：`GET /collection-tasks/:id/review-metrics`；`POST /collection-tasks/:id/review-metrics/initialize`；`PATCH /review-metrics/:metricId`；`POST /collection-tasks/:id/review-metrics/bulk`；`POST /collection-tasks/:id/review-metrics/confirm-all`。
- 单项示例：`PATCH /review-metrics/ck_metric`，请求体 `{"expectedSnapshotUpdatedAt":"2026-07-25T00:00:00.000Z","reviewStatus":"MODIFIED","reviewedValue":"1.25"}`。`expectedSnapshotUpdatedAt` 必须是校准大屏当前路线返回的快照版本。
- 批量示例：`POST /collection-tasks/ck_task/review-metrics/bulk`，每一项都必须带对应快照的 `expectedSnapshotUpdatedAt`。`POST /collection-tasks/ck_task/review-metrics/confirm-all` 需要提交当前全部快照的 `snapshotVersions`，例如 `{"snapshotVersions":[{"snapshotId":"ck_snapshot","expectedSnapshotUpdatedAt":"2026-07-25T00:00:00.000Z"}]}`。
- 返回：指标 ID、规范指标名、后台字段标签（`fieldLabel`）、后台显示原值（`displayValue`）、系统规范值（`normalizedValue`）、单位来源、展示精度、字段位置、统计周期、异常原因、校准值、来源、置信度、页面类型、复核状态和时间。
- 常见错误：`400 VALIDATION_ERROR` 为状态、修改值或快照版本非法；`400 SENSITIVE_DATA_FORBIDDEN` 为修改值含敏感凭证；`404 REVIEW_METRIC_NOT_FOUND` 为指标不存在或无权访问；`404 TASK_NOT_FOUND` 为任务不存在或无权访问；`409 SNAPSHOT_NOT_CURRENT` 为旧快照、旧版本或路线已被新采集替代；`409 SNAPSHOT_UNVERIFIED` 为账号或路线尚未确认；`409 REVIEW_METRIC_CONFLICT` 为并发校准冲突。

## 数据边界

- 当前路线是同一采集批次内每条路线最新的一份快照；旧快照、账号不匹配、路线未确认、待复核、已忽略和过期数据均不进入正式诊断。
- 正式诊断还要求字段绑定与表格行列证据全部放行：任一字段为 `INVALID`、任一表格结构未确认或历史表格缺少绑定证据，整次输入均降为保守诊断，不会因其他字段有效而继续生成正式诊断。
- 所有复核写入都记录审计；标准指标和表格单元格都以当前快照版本进行乐观并发校验，成功写入会推进该快照版本；新采集创建新的快照，不覆盖历史快照或历史校准。
- 插件只在用户点击 Popup 的“采集并上传当前路线”后读取可见指标和表格；不上传页面正文、Cookie、Token、密码或网络响应正文。

## v035 AI Skill 诊断 API

- `POST /collection-tasks/:id/decision-runs`：执行正式就绪门禁；成功创建 `PENDING` 运行并返回 HTTP 202。相同幂等键返回原运行，同一任务已有活动运行时返回该运行。功能开关关闭返回 `AI_DIAGNOSIS_DISABLED`，未就绪返回 `DECISION_NOT_READY`。每次真正新建的运行会冻结本次历史/周期比较上下文并创建分析存档；幂等重放或活动运行合流不重复建档，完全相同的当前输入和历史上下文复用成功运行时会标记为 `REUSED`，不追加模型调用。
- `GET /decision-runs/:id`：返回运行状态、当前阶段、Skill 执行摘要、结构化诊断、规则裁决、动作建议、评价和案例状态。
- `GET /collection-tasks/:id/decision-runs/latest`：恢复任务页轮询所需的最新运行。
- `POST /collection-tasks/:id/explain` 与 `POST /collection-tasks/:id/analyze`：兼容一个周期，带弃用响应头并委托同一 AI DecisionRun；不再创建 mock `AiAnalysisTask`。
- `POST /decision-runs/:id/feedback`：保存主问题是否正确、1–5 分有用度、已采纳且已通过规则裁决的动作类型和纠错说明。
- `POST /diagnosis-cases/:id/status`：人工标记 `ELIGIBLE` 或 `EXCLUDED`。纳入前必须满足高质量人工评价，或具备完整前后指标和明确 Outcome。

失败运行的 `finalResult` 为空，不创建动作；错误响应和查询结果只包含安全错误码与公开错误信息，不返回模型隐藏推理。

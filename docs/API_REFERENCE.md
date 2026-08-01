# 采集校准 API

本页记录 v034 采集校准大屏的认证接口约定。除配对后的 Extension 专用接口外，均需已登录用户会话；服务端始终按当前用户校验任务归属。

## 读取任务校准大屏

- 用途：读取某一采集任务当前路线的真实指标、结构化表格、路线状态和复核覆盖率。
- 请求：`GET /collection-tasks/:id/collection-dashboard`，其中 `:id` 是采集任务 ID。
- 示例：`GET /collection-tasks/ck_task/collection-dashboard`。
- 返回：`task`（任务、账号、项目名称）、`summary`（当前路线快照、真实指标、趋势记录、表格和路线诊断）、`reviewCoverage`（标准指标复核计数）、`tableReviewCoverage`（表格单元格复核计数）。摘要指标同时返回内部精确 `metricValue` 与优先供展示的后台原样 `displayValue`；百分比不将内部比例值伪装成后台百分比。没有采集数据时，相应数组为空，不生成模拟值。
- 成功示例：`{"success":true,"data":{"task":{"id":"ck_task","title":"7月直播","accountName":"门店账号","projectName":"夏季投流"},"summary":{"metrics":[],"tables":[],"routes":[]},"reviewCoverage":{"confirmedCount":0,"modifiedCount":0,"ignoredCount":0,"pendingCount":0,"totalCount":0},"tableReviewCoverage":{"confirmedCount":0,"modifiedCount":0,"ignoredCount":0,"pendingCount":0,"totalCount":0}},"error":null}`。
- 常见错误：`404 TASK_NOT_FOUND` 表示任务不存在或不属于当前用户。

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

- `POST /collection-tasks/:id/decision-runs`：执行正式就绪门禁；成功创建 `PENDING` 运行并返回 HTTP 202。相同幂等键返回原运行，同一任务已有活动运行时返回该运行。功能开关关闭返回 `AI_DIAGNOSIS_DISABLED`，未就绪返回 `DECISION_NOT_READY`。
- `GET /decision-runs/:id`：返回运行状态、当前阶段、Skill 执行摘要、结构化诊断、规则裁决、动作建议、评价和案例状态。
- `GET /collection-tasks/:id/decision-runs/latest`：恢复任务页轮询所需的最新运行。
- `POST /collection-tasks/:id/explain` 与 `POST /collection-tasks/:id/analyze`：兼容一个周期，带弃用响应头并委托同一 AI DecisionRun；不再创建 mock `AiAnalysisTask`。
- `POST /decision-runs/:id/feedback`：保存主问题是否正确、1–5 分有用度、已采纳且已通过规则裁决的动作类型和纠错说明。
- `POST /diagnosis-cases/:id/status`：人工标记 `ELIGIBLE` 或 `EXCLUDED`。纳入前必须满足高质量人工评价，或具备完整前后指标和明确 Outcome。

失败运行的 `finalResult` 为空，不创建动作；错误响应和查询结果只包含安全错误码与公开错误信息，不返回模型隐藏推理。

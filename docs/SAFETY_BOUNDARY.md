# Safety Boundary

本文件是项目长期安全红线，所有版本、所有 Codex 对话和所有部署环境都必须遵守。

## Chrome 插件采集边界
- 不绕过验证码。
- 不绕过平台风控。

## 平台动作红线

- 不自动点击。
- 不自动改预算。
- 不自动暂停任务。
- 不自动创建计划。
- 不自动提交表单。
- 不绕过平台限制。

## 决策与执行边界

- 所有动作建议必须人工审批。
- 所有平台动作必须用户在线下或平台页面手动完成。
- 系统只记录审批、人工执行、复盘结果。
- `mark-manual-executed` 只记录用户手动执行结果。
- `ActionOutcome` 只记录复盘结果，不触发平台动作。

## 数据边界

- 系统只记录用户授权采集后经清洗的白名单指标、结构化表格、来源元数据、人工复核结果、审批记录、人工执行记录和复盘结果；不记录整页页面正文或平台原始画面。
- 原始快照不可由校准流程改写；指标和表格单元格的确认、修改、忽略必须独立持久化并写审计。
- 历史维护工具只允许为 `VERIFIED` 当前快照补建缺失的派生指标、复核、路线与心跳记录；不得升级 `MANUAL_PENDING`、冲突或未知证据，不得改写原始快照。维护操作必须默认 dry-run、幂等并对实际变更写审计。
- 已验证快照的标准指标必须以 `PENDING` 复核状态随快照事务建立；只有后续人工确认或修改的校准记录能作为正式决策输入。
- 正式决策只允许使用当前路线中已确认或已修改的数据；待复核、忽略、过期、路线未确认、旧快照和非当前任务数据必须排除。
- 读取页面数值不代表字段语义已证明。当前快照任一字段绑定为 `INVALID`、任一表格结构未完成可信校准，或历史表格缺少绑定证据时，整次正式诊断必须降为保守模式；不得仅剔除异常值后继续放行。
- 主按钮的任务级确认允许将全部 `PENDING` 指标和当前表格单元格按原值确认，以便直接进入诊断预演；该确认只改变复核记录，不修改原始快照，也不会让异常证据进入正式 `DecisionRun.inputJson`。
- 首次未知表格结构只有在完整逐格核对后才能记录表头、行标识、列关系、路线及页面指纹校准；稳定且全部门禁通过的后续同结构快照才可自动放行。结构变化必须重新核对。
- 指标与表格单元格的校准写入必须由服务端校验登录用户、任务归属、当前快照并发版本、路线状态和敏感字段；单项、批量和全部确认均不得信任前端声明或覆盖新快照。
- `MetricPulse` 只进入单 API 实例的有界内存缓冲区，不写业务表和审计表；`RealtimeSignal` 只描述事实变化，不包含平台动作。
- 名称和界面声明为 API 的实时脉冲只能使用固定白名单内部 API，不得静默降级为 DOM。开关关闭、页面不合格、可信 `room_id` 缺失或 API 无有效指标时必须明确失败并停止；同一精确 `liveScreen` 页内切换概览、商品或流量分栏不改变其房间级内存语义，也不得借脉冲创建任何路线快照。
- 直播 PULSE 的 `key_index` 只允许以下 7 项及其精确平台路径：直播间成交金额 `data.PayGmv.value`、在线人数 `data.CurrentUserCnt.value`、人均观看时长 `data.ClientAvgWatchDuration.value`、千次观看成交金额 `data.GPM.value`、成交订单数 `data.PayOrderCnt.value`、成交人数 `data.PayUvAll.value`、商品转化率 `data.GoodsCvr.value`。不得用商品点击率替代商品转化率，不得用开播时长替代人均观看时长，也不得递归扫描或上传未知字段。
- 直播分钟趋势只有在用户主动正式采集的 SNAPSHOT 中、对应 `room_minute_indicator` 端点已通过全部内部 API 门禁时，才可投影为既有 `HOURLY_ROWS` 结构化数据；PULSE 的分钟行不得创建快照、写入业务表或审计表。
- 直播大屏内部 API 仅能在用户显式开启脉冲或主动正式采集、服务端 `LIVE_SCREEN_INTERNAL_API_ENABLED=true`、且当前页精确为 `https://eos.douyin.com/dp/liveScreen` 时直调固定白名单路径。不得拦截、替换或观察全局 `fetch/XMLHttpRequest`，不得拼接任意 URL、请求体、翻页或全量拉取。
- `room_id` 只能来自精确 URL 参数或登记的只读 `[data-room-id]`；Extension 只能上报实际请求 ID 与有界去重候选，服务端必须重新解析来源 URL、重算来源并核对一致性，不能直接信任客户端枚举。缺失、来源伪造、多值冲突或 URL/DOM 不一致时必须禁用 API；正式 SNAPSHOT 可明确回退 DOM，API PULSE 必须停止且不得改用 DOM。响应必须先过逐端点及总量字节限制、敏感键值检测和端点 Schema 校验；不得持久化、记录或回传平台原始响应。
- 直播实时脉冲只能按固定约 30 秒节拍发送 `key_index` 的 `PULSE_ONLY` 指标；不得在整分钟或任何其他节拍追加 `room_minute_indicator`、分钟行或正式快照证据。分钟趋势只属于用户主动 SNAPSHOT，且不得以补跑、重试或并发方式形成少于 30 秒的请求间隔。用户切到网页端查看结果、关闭 Popup 或打开可选侧栏不终止已显式启动的会话；刷新或导航离开精确直播页、切换房间、标签关闭、直播结束、401/429、敏感响应、Schema 漂移或连续三次失败时必须停止，页面重新加载后不得自动重启。Extension Popup 只是控制面板，重新打开后仍可手动停止。
- 系统不得采集、保存或回传 `password` / `cookie` / `token` / `authorization` / `secret`。
- 任何未知来源或低置信字段必须进入人工复核或降低决策权重，不得触发强动作判断。
- 本地推实时 API 只允许精确 liveboard2 页面、已配对 Extension 和服务端 LOCAL_PROMOTION_INTERNAL_API_ENABLED=true；固定端点为 GET pageMetrics、GET getLiveReportPromoteMeta 与 POST statQuery。启动必须在创建采集会话和任何平台请求前精确核对服务端契约与 Adapter 版本。`pageMetrics` 只校验固定 frame/module/dataset 和 `ModuleInfos` 元数据；`getLiveReportPromoteMeta` 只瞬时投影直播时间区间与本广告主下的 roi2 广告 ID，用于构造 `stat_time BETWEEN` 和 `ad_id IN` 固定过滤条件，不得持久化、记录或回传这些原始 ID；实际指标值只允许来自 `statQuery` 的固定路径 `data.StatsData.Totals[metric].Value`。平台指标 ID 只能由固定中文标签在 `group_total_data`、`promotion`、`roi2_promotion` 中唯一解析，且仅在请求期间使用；标签、分组、时间区间、广告 ID 或指标定义缺失、重复、歧义必须停止。不得递归发现、调用 `batchStatQuery` 或其他未登记端点、持久化平台 ID。平台请求只能由 Extension Service Worker 根据共享固定契约生成，Content Script 不得提供任意 URL、路径或请求体；请求禁止缓存和重定向，同一固定端点的分组请求必须共享累计字节上限，响应仍须先经过有界读取、敏感字段和固定投影门禁。服务端必须确认 pageMetrics/statQuery 均成功；存在 `roi2_promotion` 指标时还必须确认 getLiveReportPromoteMeta 成功，且指标键不得重复。
- 本地推 PULSE 只允许共享契约登记的 13 项指标：`group_total_data` 的累计观看、整体成交、订单、GPM、累计观看人数、商品点击、人均观看时长、实时在线人数，以及 `roi2_promotion` 的全域消耗、全域成交金额、全域订单、全域支付 ROI、全域商品点击；daily_budget 未经稳定 API 证据不得从其他字段推导。URL/DOM 广告身份缺失、冲突、来源无法复核或持续期间身份变化时必须停止，不能回退 DOM PULSE。服务端必须同时核对显示值、标准值、字段路径、字段标签、单位、精度、语义口径和成功端点，不能只信任客户端字段声明。
- 本地推当前入口只允许 API 持续采集，不提供 DOM 快照按钮，也不得借旧 Popup 消息创建本地推 `DataSnapshot`。用户切到网页端或其他标签不终止已显式启动的本地推会话；刷新或导航离开精确页、身份变化、标签关闭、401/429、敏感响应、Schema 漂移或连续三次失败仍必须停止。失败状态只能保存白名单固定码和脱敏端点；不得把外部响应正文、异常文本或认证上下文写入日志、存储或 Popup。
- 本地推实时帧只能覆盖 LOCAL_PROMOTION_DASHBOARD 路线；服务端按路线保存、校验、限流和保留 SSE 背压更新，SSE 与 DecisionRun.inputJson.realtimeEvidenceItems 及每项指标证据均保留 routeKey，不得跨路线混用。Worker 必须复用 DecisionRun 创建时保存的路线化实时输入，不得依赖另一进程的内存帧重建。

## AI Skill 诊断边界

- DeepSeek 只接收当前任务已确认、未过期且已人工复核的结构化证据；首期只支持代直播增长。
- 模型隐藏推理不得写入数据库、日志、审计、案例或前端；只保存结构化事实、假设、支持/冲突/缺失证据、实验和候选动作。
- 模型失败、超时、限流或结构校验失败必须记录为 `FAILED`，不得用规则或模板冒充 AI 诊断成功。
- AI 候选动作不能直接创建平台操作；只有通过服务端确定性裁决的动作才进入人工审批，执行仍由用户手动完成。
- 案例检索必须限制在当前工作区；发送给 AI 的案例只含脱敏摘要，不含原始表格、页面正文或身份信息。
- Outcome 与用户评价只进入案例和离线评测，不允许在线自动修改 Skill、Prompt、规则或权重。

# Current Task

> 当前执行项以本文最上方最新日期为准；下方旧“待完成/下一步”仅用于历史追溯，若与本节冲突，以本节和最新安全边界为准。

## 2026-08-14 经营数据统一大屏（代码与本机运行态已完成，待真实任务刷新确认）

### 已完成

- 将“API 实时数据”和“全任务核心指标”合并为单一“经营数据总览”，运营界面不再显示 API、端点等技术术语。
- 总览分为“投放经营”和“直播现场”，继续分别使用快照指标与 SSE 实时帧；不同路线不跨口径相加。
- 恢复并优化中间采集线路：本地推数据总览、直播数据大屏两条有效线路清晰汇入统一总览。
- 历史任务列表等旧路线显示为“已退出当前采集”，不计入当前进度、待采集数和诊断门禁，不恢复任务列表采集。
- 将“确认可信数据并生成诊断”提升到主大屏标题区，删除下方重复操作块。
- 页面改为更明亮的浅色运营工具风格，保留暖黄、蓝、绿、橙等业务状态色；详细校准区默认折叠。

### 验证结果

- `corepack pnpm --filter @douyin-local-life/web typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/web test`：通过，9 个测试文件、36 项测试。
- `corepack pnpm --filter @douyin-local-life/web build`：通过。
- 根级 `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（409 项）和 `corepack pnpm build`：通过。
- `git diff --check`：受影响文件通过。
- 线路流程已提取到独立组件，页面入口 1494 行，低于 1600 行架构预算。
- 1488×900：无横向溢出，主诊断按钮首屏可见，线路汇聚图完整。
- 390×844：无横向溢出，主诊断按钮首屏可见；线路区依次显示两条有效线路、汇入提示、统一总览和历史线路说明。
- 本机 Web 已切换到 `pxxis-prelaunch-20260713-web:unified-dashboard-20260814`，`http://127.0.0.1:3300` 健康；API `http://127.0.0.1:4300/ready` 正常。

### 待人工确认

1. 刷新真实任务的经营数据大屏，确认当前实际指标和实时帧按新布局显示。
2. 确认两条有效线路均存在；旧任务列表如出现，应只在“历史线路”中展示。
3. 确认无需下拉即可点击“确认可信数据并生成诊断”。

### 下一阶段

- 增加可修改“目标 ROI”。实现前先确定工作区/项目权限、审计记录、数值范围，以及人工目标值与采集 `target_roi` 同时存在时的优先级。

## 2026-08-14 本机插件连接恢复（协议故障已修复，待用户确认重新绑定）

### 已完成

- 已确认连接失败根因：当前插件为采集协议 `8`，本机旧 API 为协议 `7`，插件按协议门禁失败关闭。
- 已构建并切换本机 API/Web 到 `protocol8-seven-metrics-20260814`；API `/version` 返回采集协议 `8`，`/ready` 返回 database ready，Web 首页 HTTP 200。
- 已保留旧协议 7 API/Web 停止容器作为回退副本；PostgreSQL 容器和原数据卷未替换。
- 已核对数据库切换前后计数不变：Project `10`、CollectionTask `11`、CollectionRun `7`、DataSnapshot `52`、DecisionRun `1`。
- Chrome 任务页刷新后协议不兼容提示已消失，Web Bridge 已识别 `0.2.4 / Bridge 7 / 1a4bc20a9d72`。
- Shared `51`、Extension `135`、Web `36`、API `129` 项测试通过；API、Web、Shared、Extension typecheck 通过。API 测试临时数据库已销毁。

### 当前阻断

- 当前 Chrome 插件没有已由网页验证的本地凭证；服务端仅能看到历史授权，尚未收到当前任务心跳。
- 重新绑定会创建一枚新的本机 ExtensionCredential 并绑定当前任务，属于持久访问凭证创建，需用户在执行时明确确认。

### 下一步

1. 用户确认后点击任务页“重新绑定当前任务”，在插件中完成本机配对。
2. 重新检测，要求页面同时显示当前插件本地凭证已验证、本机 API 已确认当前任务。
3. 刷新直播大屏与本地推数据总览，完成一次用户主动采集/连接回归。
4. 连接通过后再继续原任务的七项直播指标、两入口采集和实时 API 诊断验收。

### 约束

- 不执行 migration、`db push`、数据库清理、平台自动点击或平台数据修改。
- `AI_DIAGNOSIS_ENABLED=false` 保持不变；本机 `LIVE_SCREEN_INTERNAL_API_ENABLED=true` 仅延续既有本地灰度状态。

## 2026-08-14 直播七项核心指标与插件精简（代码完成，待真实 Chrome 验收）

### 已完成

- PULSE 的 `key_index` 白名单固定为 7 项：直播间成交金额、在线人数、人均观看时长、千次观看成交金额、成交订单数、成交人数、商品转化率。
- 精确平台字段为 `PayGmv`、`CurrentUserCnt`、`ClientAvgWatchDuration`、`GPM`、`PayOrderCnt`、`PayUvAll`、`GoodsCvr` 的 `.value`；不再上传曝光、看播人数、直播间点击率、开播时长或小时速度等旧 PULSE 字段。
- 新增人均观看时长秒数和商品转化率标准指标语义；`59.76s` 可规范为 `59.76` 秒，`48.24%` 可规范为 `0.4824`。
- 采集协议升级到 `8`，旧插件与旧持久化实时状态失败关闭。状态仅保存 7 项白名单键名，不保存指标值或完整响应。
- Popup 主界面收口为直播按钮、运行状态、`核心指标 N/7` 和必要错误；本地推只保留数据总览上传。任务/计划列表、`2/3`、三格统计与重复技术上下文不再占用主流程。
- 已解决 Shared 的 TS2589：指标键清单抽至 `metric-keys.ts`，ActionOutcome 继续严格拒绝 `unknown`，没有使用 `any`、`@ts-ignore` 或放宽 schema。
- 本地 unpacked 已重建，source fingerprint 为 `1a4bc20a9d72`。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm build`、`corepack pnpm version:check`、`git diff --check`：通过。
- 全仓测试通过：Shared 51、Extension 135、Web 36、Decision Engine 39、Diagnosis Skills 5、LLM 14、API 129。
- Extension 390×600 视觉验收通过：直播和本地推主按钮均首屏完整可见，页面无需滚动。
- API 测试使用独立临时 PostgreSQL 并在结束后销毁；未连接或修改当前业务库。

### 下一步人工验收

1. 在 `chrome://extensions` 手动重载 `apps/extension/release/local-unpacked-test-extension`，确认指纹 `1a4bc20a9d72`。
2. 刷新直播数据大屏，点击一次开始，确认网页端实时栏最多展示上述 7 项，缺失项按名称提示，不由旧指标替代。
3. 切到网页端持续观察至少 60 秒，确认采集不中断；回到直播页点击停止后不再上传。
4. 打开本地推数据总览，确认无 `2/3` 且只有数据总览上传；任务/计划列表页面没有采集入口。
5. 发起后续诊断，确认直播概览实时 API 不要求保存正式快照；本地推仍走原快照流程。

### 后续任务

- 在网页主数据大屏增加可修改“目标 ROI”。先设计权限、审计、数值范围和与平台采集值的优先级，本轮未修改数据库或接口。

## 2026-08-14 默认采集路线收口与 Popup 精简（代码完成，待真实 Chrome 验收）

### 已完成

- 新任务和新采集批次的默认路线只保留 `LOCAL_PROMOTION_DASHBOARD` 与 `LIVE_DATA_SCREEN`，不再计算或展示 `2 / 3` 路线进度。
- Extension 可采集 URL 收口为精确 `liveboard2` 与 `/dp/liveScreen`；`promotion/roi2` 和任务/计划列表不再采集。
- Popup 删除人工路线选择和主界面冗余信息；直播 API 主按钮前移，本地推只保留“采集并上传数据总览”。
- 历史旧默认三路线集合读取时归一化为两路线，但显式 `TASK_TABLE`、旧五路线与历史快照继续兼容。
- 已重建本地 unpacked，source fingerprint 为 `8392fc95dd48`。

### 验证结果

- `corepack pnpm --filter @douyin-local-life/shared typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/extension typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/api typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/web typecheck`：通过。
- Shared 50、Extension 133、Web 36、API 129 项测试全部通过。
- `corepack pnpm --filter @douyin-local-life/extension build:local`、API build、Web build：通过。
- 根级 `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（406 项）和 `corepack pnpm build`：通过。

### 下一步人工验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 高级区构建指纹为 `8392fc95dd48`。
2. 打开巨量本地推 `.../lamp/pc/liveboard2`：确认没有 `2/3`，只有数据总览采集按钮；打开 `.../lamp/pc/promotion/roi2`：确认页面不可采集且没有任务列表上传入口。
3. 打开直播 `.../dp/liveScreen`：确认 API 开始/停止按钮首屏可见，无需向下滚动；点击一次后切到网页端，确认实时数据栏持续更新。
4. 从实时栏进入后续诊断时，确认直播概览不要求保存正式快照或确认路线；本地推总览仍按原快照流程处理。

### 下一阶段

- 在网页主数据大屏增加“目标 ROI”可修改能力。实现前需明确工作区/项目权限、审计记录、数值范围，以及人工目标值与采集 `target_roi` 同时存在时的优先级。本轮不修改数据库或接口。

## 2026-08-14 直播概览实时 API 直接进入 AI 诊断（代码完成，待真实页面验收）

- 已收尾 `apps/api/src/ai-diagnosis/worker.ts` 类型问题：`storedDecisionInput` 只复用已通过 schema 且确认为 `LIVE_DATA_SCREEN` / `LIVE_SCREEN_INTERNAL_API` / `REALTIME_API` 的直播概览实时输入，并规范化 `networkJsonSummary.responseJson` 与 `latestAnalysis`，避免静态类型继续报可选/必填不匹配。
- Worker 不再在处理排队运行时盲目重建输入；对于直播概览实时 API 证据，会复用创建 `DecisionRun` 时保存的正式输入，因此实时帧过期或未保存快照时也不会回到“必须保存正式快照/确认路线”的旧路径。非实时概览输入仍按原有快照流程重建和校验。
- 诊断技能审计同步改为“已放行正式证据层”：已人工复核快照继续通过；服务端已校验的直播概览实时 API 输入也可通过。其他实时路线、无指标或来源不匹配的输入仍拒绝。
- 已新增回归测试覆盖无 `DataSnapshot` 的实时 API 脉冲创建 `REALTIME_API` 诊断运行，并由 Worker 成功处理；同时确认实时脉冲不创建正式快照。

### 验证结果

- `corepack pnpm --filter @douyin-local-life/api typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/web typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/diagnosis-skills typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/diagnosis-skills test`：通过，5 项测试。
- `corepack pnpm --filter @douyin-local-life/api test`：通过，27 个测试文件、128 项测试。
- `corepack pnpm --filter @douyin-local-life/api build`：通过。

### 真实页面验收

1. 手动重载 `apps/extension/release/local-unpacked-test-extension`，刷新直播数据大屏。
2. 点击一次“开始 API 持续采集”，确认网页端实时数据栏持续收到 `LIVE_DATA_SCREEN/key_index` 实时数据。
3. 在网页端发起后续 AI 诊断流程，确认无需先点击“保存为正式快照”或走旧的路线确认流程。
4. 如失败，只记录固定错误码、发生时间、任务/房间和构建指纹；不得保存 Cookie、Token 或完整平台响应。

## 2026-08-13 插件同步取消商品/流量补充路线（代码完成，待真实页面验收）

- 已按用户补充要求同步收口 Extension：在精确直播数据大屏页面，Popup 不再把 `mode=product` / `mode=flow` 展示为当前正式路线，也不再显示正式快照按钮、路线下拉或 0/N 路线进度；API 持续采集只作为独立采集端展示。
- `collectPageContext()` 的直播大屏 API 上下文统一固定到 `LIVE_DATA_SCREEN`，确保 API 持续采集不受商品/流量视觉分栏影响；PULSE 仍只使用平台内部 API 白名单数据，不读取 DOM 数值补齐。
- Service Worker 已校验自动识别路线必须属于当前任务的 `routeSources`。当前任务已取消的商品/流量路线即使被旧页面上下文识别，也会被拒绝上传并提示刷新插件状态。
- 兼容性保持：商品/流量路线定义和适配器未删除，历史快照、旧任务和显式补回路线仍可使用。

### 验证结果

- `corepack pnpm --filter @douyin-local-life/extension test -- live-screen-pulse-page.test.ts popup-lifecycle.test.ts source-guard.test.ts`：实际运行了 Extension 全部测试文件，22 个测试文件、132 项测试通过。
- `corepack pnpm --filter @douyin-local-life/extension typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/extension build:local`：通过，已重建 `apps/extension/release/local-unpacked-test-extension`，source fingerprint `c410e959c2ec`。
- 未执行 Prisma migration、`db push`、提交、推送、部署或真实平台自动操作。

### 真实页面验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，Popup 指纹应为 `c410e959c2ec`。
2. 刷新直播大屏，分别进入 `mode=main`、`mode=product` 或 `mode=flow`。
3. Popup 应只显示 API 持续采集入口和状态，不再显示商品页/流量页正式路线、正式快照进度或“采集并上传当前路线”按钮。
4. 点击一次“开始 API 持续采集”，确认网页端实时数据栏持续更新，且服务端日志仍为 `LIVE_DATA_SCREEN` 的 `metric-pulses`。

## 2026-08-13 取消直播大屏商品/流量补充路线（已完成）

- 已按用户要求取消当前任务 `cmsr0iq7h000dpc07mwockp6c` 中的两条非基础补充路线：`LIVE_PRODUCT_TAB`（直播大屏商品页）和 `LIVE_TRAFFIC_TAB`（直播大屏流量页）。本次只删除 `CollectionRouteSource` 配置行，历史 `DataSnapshot` 保留，不回写、不删除、不伪造数据。
- 新建任务的默认路线已从全量 `collectionRouteTemplates` 收口为 `defaultCollectionRouteTemplates`，即只自动生成三条基础路线：`LIVE_DATA_SCREEN`、`LOCAL_PROMOTION_DASHBOARD`、`TASK_TABLE`。商品/流量路线类型、标签、识别、旧任务和历史快照兼容仍保留；只有显式补充路线时才会加入任务配置。
- Web 项目页的新建任务卡片同步只展示基础路线，并提示直播 API 持续采集数据在网页端实时数据栏查看，避免继续把商品/流量补充页面误导成必经采集流程。

### 验证结果

- 当前业务库查询确认任务 `cmsr0iq7h000dpc07mwockp6c` 的 `CollectionRouteSource` 仅剩 3 条基础路线；`LIVE_PRODUCT_TAB`/`LIVE_TRAFFIC_TAB` 历史快照仍存在。
- 已写审计 `COLLECTION_SUPPLEMENTAL_ROUTES_CANCELLED`，记录两条被取消路线的 ID、routeKey、标签、URL 和最近采集时间。
- `corepack pnpm --filter @douyin-local-life/shared test -- collection-routes.test.ts`：通过，50 项测试通过。
- `corepack pnpm --filter @douyin-local-life/web test -- task-page-source.test.ts`：通过，36 项测试通过。
- `corepack pnpm --filter @douyin-local-life/api test -- decision-flow.test.ts`：通过，125 项 API 测试通过。
- `corepack pnpm --filter @douyin-local-life/shared typecheck`、`corepack pnpm --filter @douyin-local-life/api typecheck`、`corepack pnpm --filter @douyin-local-life/web typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/shared build`、`corepack pnpm --filter @douyin-local-life/api build`、`corepack pnpm --filter @douyin-local-life/web build`：通过。

## 2026-08-13 插件 API 采集端切页不中断修复（代码完成，待真实页面验收）

- 现场反馈确认：上一轮把直播页 `document.hidden`/`tabState=HIDDEN` 当成停止条件，导致用户切到网页端实时数据栏查看时，API 采集立即断开，体验比旧版更差。这不是用户操作问题，而是采集生命周期规则过严。
- 已修复为：切换到网页端、关闭 Popup 或打开/关闭可选侧栏都不会停止已启动的 API 持续采集；插件和服务端都允许 live PULSE 以 `tabState=HIDDEN` 上传。仍然会在刷新/导航离开精确直播页、切换房间、直播结束、401/429、协议不匹配、敏感响应或连续三次普通失败时停止。
- 服务端 `metric-pulses` 入站移除对 PULSE 的 `tabState !== VISIBLE` 拒绝，仍保留精确 URL、room_id、协议、白名单字段、响应安全和时间窗口校验，并在接收日志中记录 `tabState` 方便排查。
- Extension content script 不再在 `visibilitychange` 或 `pagehide` 时停止 live loop，也不再在每轮开始前因 hidden 提前退出；Service Worker 的活动判断只按精确直播页 URL 和页面类型判停。
- 侧栏文案已改为“切到网页端查看实时栏不会停止 / 后台采集中”，避免继续把隐藏直播页描述成“页面非活跃停止”。

### 验证结果

- `corepack pnpm --filter @douyin-local-life/extension typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/extension test`：22 个测试文件、130 项测试通过。
- `corepack pnpm --filter @douyin-local-life/api typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/api test`：27 个测试文件、125 项测试通过；新增覆盖 `tabState=HIDDEN` 的 live PULSE 可被服务端接受且不创建正式快照。
- `corepack pnpm --filter @douyin-local-life/extension build:local`：通过，已重建 `apps/extension/release/local-unpacked-test-extension`，source fingerprint `1940fbacecdc`。

### 真实页面验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，Popup 指纹应为 `1940fbacecdc`。
2. 刷新直播数据大屏，点击一次“开始 API 持续采集”。
3. 立刻切到网页端任务实时数据栏观察至少 60 秒；预期仍持续收到实时数据，服务端日志可出现 `tabState: HIDDEN` 的 `live-screen pulse accepted`。
4. 再回到直播页点击停止；停止后网页端不应再收到新数据。

## 2026-08-13 插件 API 采集端改造（代码完成，待真实页面验收）

- 上一版“插件内展示趋势、AI 建议、正式诊断或审批入口”的实时方案作废。本轮只修改 Extension，采集链路固定为：抖音直播大屏内部 API → 插件持续采集白名单数据 → 上传现有 `metric-pulses` 接口 → 网页端实时数据栏持续更新。
- 用户操作流程已收口为：进入支持 API 的直播数据大屏并识别 `room_id` 后，在 Popup 顶部点击一次“开始 API 持续采集”；插件立即采集第一轮，之后约每 5 秒上传一次。无需点击“保存当前数据为正式快照”，也无需先做 DOM 快照采集。
- Content script 负责维持持续循环，避免 MV3 后台休眠导致循环中断；每轮完成后再安排下一轮，请求不重叠。同一标签页重复点击开始会替换旧循环；Popup、可选 Side Panel 关闭后继续运行。普通切到网页端查看实时栏不停止；刷新、切换房间、离开支持页、直播结束或安全错误会停止，页面重新加载后不暗中恢复。
- Service Worker 只做启动校验、来源/room_id 校验、上传和状态维护。上传成功结果收窄为 HTTP 成功即可；插件忽略服务端附加的 `signals`、`suggestion`、`pulseCount` 等分析字段，并移除插件侧 `decision-runs/latest` 请求、指标展示、趋势/异常/观察建议、正式诊断和行动建议。
- API 模式下 Popup 只显示开始/停止、运行状态、最近成功上传时间、成功上传次数、最近指标数量和最近错误。API 入口已前移到顶部，侧边栏不再自动打开，仅在高级区保留可选状态查看；正式快照按钮和路线进度在 API 模式隐藏。

### 验证结果

- `corepack pnpm --filter @douyin-local-life/extension typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/extension test`：22 个测试文件、128 项测试通过。
- `corepack pnpm --filter @douyin-local-life/extension build:local`：通过，已重建 `apps/extension/release/local-unpacked-test-extension`，source fingerprint `16a45c2a6d59`。
- `corepack pnpm typecheck`、`corepack pnpm test`（395 项）、`corepack pnpm build`、`corepack pnpm lint`、`corepack pnpm version:check`、`git diff --check`：均通过。
- 未修改 Web、API、数据库、Prisma、LLM、诊断或决策引擎；未执行 migration、`db push`、提交、推送、部署或真实平台自动操作。

### 真实页面验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，Popup 指纹应为 `16a45c2a6d59`。
2. 刷新已登录的 `https://eos.douyin.com/dp/liveScreen?...` 直播大屏，并打开对应任务网页端的实时数据栏。
3. 在 Popup 顶部只点击一次“开始 API 持续采集”，确认第一轮立即上传，不需要保存正式快照。
4. 保持直播页可见至少 60 秒，确认网页端实时数据栏约每 5 秒更新；关闭 Popup 后继续观察，采集不应中断。
5. 对照服务端日志确认任务、房间、指标数量正确，没有 DOM 回退，没有重复循环。
6. 点击“停止 API 持续采集”，确认网页端不再收到新数据。

## 2026-08-13 任务详情页手动返回按钮（代码完成）

- 已将任务详情页顶部的弱提示文字链接改为“← 返回上一级”描边按钮，并增加 `aria-label="返回上一级：项目详情"`。
- 返回目标使用当前任务的 `project.id`，固定进入所属项目详情页；不使用 `router.back()`，避免用户从登录页、外部平台页或直接链接进入任务时返回不可预测的位置。
- 新增 Web 回归断言，覆盖按钮文案、父级项目链接和按钮化样式。未触及采集、诊断、数据库、配置或平台操作边界。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（393 项）、`corepack pnpm build`：通过。
- 内置浏览器打开目标任务时会话已失效，按既有流程显示“需要重新登录”；未代替用户输入账号密码，因此登录后按钮的最终视觉点击待用户刷新页面确认。

## 2026-08-13 实时脉冲限流根因修复（待真实 Chrome 验收）

- 最新截图中的 `RATE_LIMITED` 已按当前代码和容器日志核对：它不是平台 `key_index` 的 `HTTP_429`，而是本机 `POST /collection-tasks/:id/metric-pulses` 返回的服务端限流码。截图中“本次未向服务端发送实时脉冲”对此情形不准确；请求已抵达本机服务端但被拒绝，平台 API 与 DOM 回退均不是本次根因。
- 根因是首帧在用户点击后立即开始，而旧后续调度追赶全局整 5 秒边界。若首帧在边界前 1 至 4 秒完成，下一轮会在不足 5 秒后上传，触发服务端 4 秒突发保护。现在下一轮取“本轮启动后满 5 秒”与“上一次上传完成后满 4.1 秒”中的较晚时间；正常网络仍约 5 秒一次，慢请求时只延后以避免服务器接收端突发。
- 本机服务端确实返回 `429 / RATE_LIMITED` 时，Extension 现在仅解析受控 `Retry-After`，保持当前会话并通过唯一计时器等待到指定时间后继续；状态明确显示“本机服务端正在限流”，不会增加计时器或静默回退 DOM。平台 `HTTP_429` 仍按安全边界立即停止。
- 已重建本机 unpacked 制品 `apps/extension/release/local-unpacked-test-extension`，构建指纹为 `033f8991f437`。已实际通过 Extension typecheck、126 项扩展测试、Extension 本地构建、`corepack pnpm lint`、`corepack pnpm version:check` 和 `git diff --check`。

### 立即现场验收

1. 在 `chrome://extensions` 对 `apps/extension/release/local-unpacked-test-extension` 点击“重新加载”，Popup 指纹必须为 `033f8991f437`，再刷新当前直播数据大屏。
2. 在当前页面只点击一次“开始 API 持续采集”，保持直播页可见 35 至 60 秒。第二帧不得因首帧后追赶整 5 秒边界而触发本机 `RATE_LIMITED`。
3. 若服务端仍返回限流，Popup 应保持“停止 API 持续采集”按钮并显示按 `Retry-After` 等待到的具体时间，稍后继续；不应显示“已停止”或“未向服务端发送”。
4. 同步核对容器日志至少有 7 条 `live-screen pulse accepted`，相邻启动约 5 秒；30 秒后出现趋势结论或稳定状态。若仍失败，提供 Popup 的固定错误码、发生时间和构建指纹即可。

## 2026-08-13 实时采集“页面尚未识别”根因修复（待真实页面复验）

- 最新真实页面截图显示：已打开 eos.douyin.com/dp/liveScreen，但 Popup 同时显示“当前页面/当前路线：尚未识别”。此前 PULSE 为遵守 API-only 边界而不读取 DOM 指标文本，但页面身份也依赖同一空文本推断，导致 Service Worker 在首次启动校验中拒绝该标签页，表现为“开始 API 持续采集”没有后续。
- 已修复：精确直播数据大屏 URL（仅 HTTPS 的 eos.douyin.com/dp/liveScreen）现在在页面上下文中固定识别为 LIVE_DATA_SCREEN；PULSE 仅以该精确页作为房间级 key_index 观察身份，仍不读取 DOM、不创建快照、不改变正式路线进度。正式 SNAPSHOT 的概览/商品/流量分栏识别与人工确认门禁保持不变。
- Popup 对未识别正式路线明确区分两个动作：可直接启动 API 持续采集；仅在保存正式快照时才需要选择/确认当前可见路线。不会因此放宽 API 白名单、URL 精确匹配、页面可见性、房间 ID 或连续失败停止规则。
- 同时修复“点击后看起来没反应”的首帧延迟：用户显式点击后立即请求一次固定 key_index；仅首帧立即发起，后续仍保持固定 5 秒节拍，且一次完成后不会补跑已经错过的时间点。
- 新增启动前 room_id 预检：当前直播页未提供可信 room_id 时 Popup 立即显示固定错误并禁用启动，绝不等待三轮失败或静默改用 DOM。已重建本机 unpacked 制品：apps/extension/release/local-unpacked-test-extension，构建指纹为 db8a0c9dfe14。扩展 typecheck、123 项扩展测试、49 项 Shared 测试、Extension 本地构建和 git diff --check 已通过；API /ready、/version 与 Web 首页均为 HTTP 200。

### 立即现场验收

1. 在 chrome://extensions 对 apps/extension/release/local-unpacked-test-extension 点击“重新加载”，Popup 指纹必须变为 db8a0c9dfe14，再刷新当前直播数据大屏。
2. 在 mode=main 或 mode=product 页面点击一次“开始 API 持续采集”。应立即显示“正在发起首轮请求”，随后显示成功次数和实际 API 指标；不需要先保存正式快照。
3. 保持直播页可见 35 至 60 秒，验收至少 7 次成功帧、30 秒后的趋势/稳定状态，以及没有 RATE_LIMITED、协议不匹配、空指标或重复循环。若仍失败，只记录 Popup 固定错误码、端点和时间。

## 2026-08-13 当前执行记录：P0 本机复核完成，等待真实页面联合验收

- 已完成本机运行态与工程验证：API `/ready`、`/version`、Web 首页均可用；运行版本为 `realtime-loop-20260812`、采集协议 `7`，本地 unpacked 指纹为 `42432566bed9`。
- 已实际执行并通过：`corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（386 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check` 和 `git diff --check`。
- API 容器日志中没有本轮新的实时脉冲成功、限流、协议错误或失败记录；这表示尚未触发真实页面采集，不能将工程验证替代为 P0 通过。
- 已在 2026-08-13 10:35:17 至 10:36:48（Asia/Shanghai）持续监控 API 容器 90 秒，匹配到的实时脉冲接收、限流、协议错误和失败日志均为 `0`；本轮仍没有真实插件上传证据。
- 当前阻塞仅为人工浏览器动作：Codex 会话无法附着运行中的 Chrome，且不得代替用户重载业务插件、登录账号或点击平台页面。Chrome 进程、Codex 浏览器扩展和 Native Messaging 配置检查均正常。

### 下一步人工验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，在 Popup 核对构建指纹为 `42432566bed9`。
2. 刷新已登录的直播大屏 `mode=main`，点击一次“开始 API 持续采集”，保持页面可见 35 至 60 秒；重复点击不得增加循环。
3. 核对至少 7 次连续成功帧，间隔约 5 秒；实时栏应显示来源“平台 API”、更新时间、成功次数、基线进度、最近状态和实际返回指标。平台未返回字段应明确显示“平台未返回”。
4. 30 秒后核对出现趋势信号或“暂未发现显著变化”；同时确认无 `RATE_LIMITED`、协议不匹配、空指标或重复采集循环。切换 `mode=product` 后按同一方式重新验收一次。
5. 核对实时脉冲未改变正式快照路线进度；只有用户明确点击“保存当前数据为正式快照”后才允许更新对应路线证据。若失败，仅提供 Popup 固定错误码、端点和发生时间以定位，不导出完整平台响应或认证信息。

## 2026-08-12 API 实时采集闭环（待用户重载后现场验收）

### 已完成

- 用户指出“看到了数据，但没有后续、数据太少”属实：旧实时服务端只判断 ROI、消耗与订单，而直播 `key_index` 实际上传的是 GMV、在线人数、看播人数、直播间点击率和 GPM，因此真实直播脉冲几乎不可能产生信号。
- 已依据当前平台直播大屏脚本中明确使用的字段，将固定白名单从 6 项扩到 10 项：新增开播时长、小时看播、小时自然看播和小时商业看播；不递归扫描未知字段，也不保存响应正文。Contract 为 `2026-08-12.3`，Adapter 为 `1.5.0`，兼容采集协议仍为 `7`。
- 服务端现在以至少 30 秒窗口比较直播数据，确定性生成在线/小时流量变化、直播间点击率变化、GPM 变化、GMV 增量速度，以及“新增看播但 GMV 未增长”等观察信号，并附人工检查建议。实时信号不创建投流动作、不自动操作平台。
- Extension 只解析服务端返回的有界信号展示字段，不保留服务端证据对象；右侧栏会展示基线进度、显著变化/无显著变化状态和人工建议。正式诊断建议继续要求另存正式快照并完成校准，防止瞬时数据绕过可信证据门禁。
- 本地 unpacked 指纹为 `42432566bed9`；本机 API 已切换到 `pxxis-prelaunch-20260713-api:realtime-loop-20260812` 并健康运行，旧 API 容器停止保留用于回退。数据库、数据卷、Web 和 Schema 未改变。

### 已验证

- lint、typecheck、build、Prisma validate/generate、version check、diff check 通过。
- 全仓 386 项测试通过：Shared 49、Extension 120、Web 35、Diagnosis Skills 4、Decision Engine 39、LLM 14、API 125。
- 容器内直接确认 Contract `2026-08-12.3`、Adapter `1.5.0` 和十条精确字段路径；API `/ready` 与健康检查通过。

### 仅剩现场验收

1. 用户在 Chrome 扩展管理页重新加载 `apps/extension/release/local-unpacked-test-extension` 并刷新直播大屏。
2. 点击一次“开始 API 持续采集”；首轮应显示最多 10 项平台实际返回的指标，30 秒后应显示服务端趋势状态或观察建议。
3. 同步复核 API 日志的每帧 `metricCount`、合同拒绝和限流状态；字段若由平台返回空值则不会伪造补齐，因此实际显示可能少于 10 项。

## 2026-08-12 API 实时指标可见性修复（待最终现场验收）

### 已完成

- 用户等待约 20 轮后仍“看不到效果”的反馈属实：服务端已连续接受 `key_index / 5 metrics`，但 Popup 只显示成功次数，没有展示指标值；同时 `0/5` 实际是正式快照路线计数，API 脉冲不写快照，因此该数字不会变化，造成了“请求发生但产品无反馈”的误导。
- Service Worker 现仅把每轮已通过白名单校验的最多 6 个 `{key,name,displayValue}` 投影保存在会话内存中，不返回 `rawEvidence` 或响应正文。Popup 和 Chrome 右侧栏会每秒读取并展示最新值、成功次数和更新时间。
- 点击“开始 API 持续采集”会先向 Worker 发出启动请求，再自动打开常驻右侧实时数据栏。用户保持直播页为当前可见页面即可直接看到数据变化，不需要切到任务页，也不需要点“保存当前数据为正式快照”。
- Popup 文案将 `0/5` 明确标为“正式快照”，并说明实时脉冲不会增加该计数。隐藏/离开直播页仍按既有安全规则停止，不通过放宽页面可见性门禁解决展示问题。
- 新本地 unpacked 制品已生成，指纹为 `a373b9ea0eb2`；扩展 116 项测试以及全仓 lint、typecheck、377 项测试、build、Prisma validate/generate 已通过。

### 当前待办

1. 用户在 `chrome://extensions` 重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 指纹 `a373b9ea0eb2`，并刷新直播大屏。
2. 在直播大屏只点击一次“开始 API 持续采集”；右侧栏应自动出现并在首个 5 秒点后显示 5 个当前指标。同步核对 API 日志出现新的 `live-screen pulse accepted` 且无 `RATE_LIMITED`。

## 2026-08-12 API 持续采集服务端链路验收

### 已完成

- 真实 Chrome 现场首次启动后，服务端连续接受 2 次 `key_index` 脉冲（每次 5 个指标），随后 Popup 显示 `RATE_LIMITED` 并停止。由此确认启动动作、平台 API 投影和 `/metric-pulses` 上传均已生效，失败不再位于采集或字段适配层。
- 根因是 Extension 以 5 秒节拍启动每轮采集，而服务端也按接收时间使用严格 5 秒单请求窗口；平台请求和网络耗时的微小变化会让相邻两次到达间隔低于 5 秒，从而误伤正常节拍。服务端窗口已改为 4 秒，保留对重复/突发上传的限制，并为 5 秒正常节拍留出 1 秒调度余量。
- 新增限流回归测试，覆盖“相邻 4.1 秒允许”和“4 秒内重复请求拒绝”。本地 API 已切换为 `pxxis-prelaunch-20260713-api:rate-limit-jitter-fix-20260812`，无需重载 Extension。

### 现场证据

- 修复后真实持续采集连续观察到 20 次 `live-screen pulse accepted`，均为 `routeKey=LIVE_DATA_SCREEN`、`successfulEndpoints=['key_index']`、`metricCount=5`；同一观察窗口内 `RATE_LIMITED=0`。
- 这条链路是 API-only PULSE，不读取或合并 DOM，也不创建正式快照；用户不需要点击“保存当前数据为正式快照”。
- API 隔离测试库 27 个测试文件、123 项测试全部通过；当前容器 healthy，`/ready` 为 HTTP 200，`/version` 为产品 `0.2.4`、采集协议 `7`。

### 当前结论

- “在可 API 采集的直播大屏点击一次并持续上传”已在真实页面完成服务端验收；用户可见的实时指标区此前缺失，已按本文件最新一节修复，仍待用户重载新制品后的最终 UI 验收。

## 2026-08-12 `key_index` 真实响应适配与本机切换

### 已完成

- 已在用户当前登录的真实直播大屏复核页面数据与已加载脚本。平台 `getKeyIndex` 调用 `POST /life/api/live_screen/v5/key_index`，组件从响应的 `data` 对象执行 `Object.keys(data)`，并从每个指标对象的 `value` 字段渲染数值；此前合同错误地读取 `data.current_online_viewers` 等扁平字段，是 `PULSE_KEY_INDEX_NO_USABLE_METRICS` 的根因。
- PULSE 白名单已改为真实且可在平台脚本中核验的固定路径：`data.PayGmv.value`、`data.CurrentUserCnt.value`、`data.BusinessShowCnt.value`、`data.LiveServerWatchUcnt.value`、`data.LiveCtr.value`、`data.GPM.value`。不遍历未知字段、不保存完整响应，也不读取 Cookie、Token 或 Authorization。
- API 合同升级至 `2026-08-12.2`，Adapter 升级至 `1.4.0`，采集协议升级至 `7`，确保旧扁平字段插件不能继续向新服务端上传。
- 本地 unpacked 插件已重建为 `0.2.4 / 63f19f31aba9 / Bridge 7 / 采集协议 7`。本机 API 已切换到同一协议、合同和 Adapter，`/ready` 为 HTTP 200 / database ready；旧 API 容器保留为停止状态的 `pxxis-prelaunch-20260713-api-1-contract132-rollback-20260812`。

### 已验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（375 项）、`corepack pnpm build`、Prisma validate/generate、`version:check` 与 `git diff --check` 全部通过。
- Extension 113 项、Shared 49 项、API 121 项均通过；回归覆盖真实对象响应投影、未知字段丢弃、服务端固定字段路径复核、旧/伪造路径拒绝和 PULSE 只请求 `key_index`。
- 运行中 API 容器内复核：采集协议 `7`、合同 `2026-08-12.2`、Adapter `1.4.0`，六个字段路径与新插件产物一致。

### 仅剩现场验收

1. 当前 Chrome 实际加载的仍是旧构建 `b6a950b35273`；浏览器安全策略禁止 Codex 打开或操作 `chrome://extensions`。用户需对 `apps/extension/release/local-unpacked-test-extension` 手动点击一次“重新加载”，再刷新直播大屏和任务页。
2. Popup 应显示构建 `63f19f31aba9`。随后在直播大屏点击一次“开始 API 持续采集”，无需点击“保存当前数据为正式快照”；等待一个完整 5 秒点后复核 Popup 成功次数、`/metric-pulses` 日志和任务大屏实时帧。

## 2026-08-12 实时脉冲 API-only 与失败可观测性修复

### 已完成

- PULSE 模式现在只使用内部 API 投影结果，明确禁止 DOM 与 API 合并；DOM 合并逻辑仅保留给用户主动的 SNAPSHOT。
- `key_index` 成功响应若没有任何可用的已批准字段，保留端点 SUCCESS，同时标记 `PULSE_KEY_INDEX_NO_USABLE_METRICS`，不会伪造实时帧或静默回退 DOM。
- Popup/Service Worker 对可恢复失败显示“第 N/3 次失败（端点）：固定白名单原因”；连续三次后停止并仅保存最小失败信息。敏感响应正文、原始异常文本和原始 API 包体不落盘。
- 共享内部 API 契约升级为 `2026-08-12.1` / Adapter `1.3.0`，已批准字段路径支持主路径及后续经证据审核的别名；服务端严格验证实际使用路径。当前生产字段仍只有既有主路径，未凭空添加别名。
- 采集协议升级为 `6`，用于让旧插件在服务端上下文校验处失败关闭；Bridge 协议保持 `7`。

### 已验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（372 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、`git diff --check` 均通过。
- 本地 unpacked 插件已重建：`apps/extension/release/local-unpacked-test-extension`，指纹 `b6a950b35273`，产品 `0.2.4` / Bridge `7` / 采集协议 `6`；每次可恢复失败会写入脱敏 `live_pulse.failure` 日志。
- 本地 API 容器已按当前源码替换，`/version` 返回 `a0cef5b788b6`、采集协议 `6`，`/ready` 返回 database ready；PostgreSQL 和数据卷未替换。
- 复核发现旧 Web 镜像仍内嵌采集协议 `5`，已重建并替换 Web；新 Web 镜像内嵌协议 `6`，登录页 HTTP 200，API/Web/Extension 三方协议已统一。

### 下一步人工验收

1. 在 `chrome://extensions` 手动重载上述 unpacked 目录，确认 Popup 指纹为 `b6a950b35273`。
2. 保持真实直播商品/数据页可见，刷新后只点击一次“开始 API 持续采集”；不需要先保存正式快照，Popup 关闭也不停止。
3. 等待一个完整 5 秒节拍：成功时应显示成功次数、指标数和端点；失败时先显示第 1/3、2/3 及固定原因，第三次才停止。任务大屏应通过 SSE 显示最新实时帧，API 日志应出现 `/metric-pulses`。
4. 若 `PULSE_KEY_INDEX_NO_USABLE_METRICS`，请只提供 Network 中 `key_index` 响应的脱敏字段结构（字段名、层级、类型、示例值）；不要提供 Cookie、Token 或完整响应正文。只有有证据的路径才会加入别名白名单。

## 2026-08-12 本机登录链路恢复与验收

### 已完成

- 已修复本机 Web 制品构建期遗漏 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300` 所致的登录 HTTP 404；运行时设置同名变量不能替代 Next.js 的浏览器构建期注入。
- 已同步未跟踪本机 `.env` 的 `WEB_ORIGIN` 与 `NEXT_PUBLIC_API_URL` 至当前 `127.0.0.1:3300/4300`，后续 Compose 重建不会恢复到旧 `localhost:3000/4000`。
- 当前 Web 容器已使用 `pxxis-prelaunch-20260713-web:protocol7-pulse-gate-loginfix`，入口保持 `http://127.0.0.1:3300`。API、PostgreSQL、数据卷、认证配置、迁移与业务数据没有变更。

### 已验证

- `GET /login` 为 HTTP 200，响应 CSP 的 `connect-src` 包含 `http://127.0.0.1:4300`；浏览器静态脚本已包含该基址。
- `Origin: http://127.0.0.1:3300` 对 `POST /auth/login` 的预检返回 `204`，空参数请求返回预期 JSON `400 / VALIDATION_ERROR`，不再是 Web HTML 404。

### 下一步人工验收

1. 在浏览器对 `http://127.0.0.1:3300/login` 执行一次硬刷新后，用管理员发放的账号自行登录。
2. 登录成功后再打开任务 `cmscuy6al0005qs07q1nz32hl`；实时脉冲现场验收仍须在已重载的 `a583f51b0107` 插件和保持可见的真实直播页中完成。

## 2026-08-11 旧插件实时脉冲硬门禁与现场验收

### 现场结论与已完成

- 最新截图显示 `room_minute_indicator / SCHEMA_MISMATCH`，按钮已恢复为“开始 API 持续采集”。真实 Chrome 任务页注入标记确认实际加载的是 `0.2.4 / 6928d7cc541e / Bridge 6`，不是最终 Bridge 7 制品；主要阻塞仍是旧运行构建，不是用户少点按钮、切换任务大屏或未保存正式快照。
- Bridge 协议已升至 `7`，采集协议已升至 `5`；服务端 `/extension/context` 强制校验 `x-pxxis-collection-protocol`。旧插件缺少请求头或版本不一致时，在平台 API 请求前返回 `EXTENSION_COLLECTION_PROTOCOL_MISMATCH`，避免继续用旧分钟调度或旧 Popup 状态参与真实采集。
- 修复旧失败结果跨构建残留：持久化结果新增构建指纹和采集协议，Popup 读取时只接受当前构建；旧插件留下的分钟端点失败会自动删除，不再伪装成新制品刚刚发生的失败。
- 本机 API 已恢复为协议 5 镜像，Web 已切换为 Bridge 7 镜像，PostgreSQL 和数据卷保持不变。API/Web/PostgreSQL 均 healthy，`/ready` 与 Web 首页为 HTTP 200，`/version` 返回采集协议 `5`；API 启动日志没有错误。
- 本地解包插件已重建为 `0.2.4 / a583f51b0107 / Bridge 7 / 采集协议 5`。产物内确认 PULSE 只返回 `['key_index']`，并包含协议头、两个新协议常量和旧失败结果清理门禁。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check` 与 `git diff --check` 均通过。
- 共 363 项测试通过：Shared 48、Extension 105、Web 35、Diagnosis Skills 4、Decision Engine 39、LLM 14、API 118。新增回归覆盖旧构建/旧协议失败结果丢弃和当前构建结果保留。
- 未执行 migration、`db push`、业务数据写入、历史快照修复、真实平台请求、AI/Worker、提交、推送或生产部署。

### 待用户人工验收

1. 在 `chrome://extensions` 手动重载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 指纹为 `a583f51b0107`；当前实际加载的 `6928d7cc541e` 及更早版本不得继续用于验收。
2. 刷新并保持真实直播平台页可见，点击一次“开始 API 持续采集”。任务大屏请放在另一个窗口，避免平台页隐藏触发安全停止。
3. 等待至少一个整 5 秒点，确认 Popup 显示成功次数、指标数和 `1 个端点`，API 出现 `/metric-pulses` 接收日志，任务大屏显示最新实时帧。跨整分钟后不得再请求 `room_minute_indicator`。
4. 若重载后仍失败，记录 Popup 显示的具体白名单失败码、端点和时间；不要保存平台响应正文，也不要用“保存正式快照”补救实时链路。

## 2026-08-11 实时脉冲多标签页可靠性修复

### 现场结论与已完成

- 截图中显示 `THREE_CONSECUTIVE_FAILURES` 且“本次未向服务端发送实时脉冲”；本机 API 当前启用内部 API，但其脱敏日志没有 `/metric-pulses`，再次确认故障发生在 Extension 上传之前。
- 修复 PULSE 调度读取全局 `PAGE_ACTIVITY` 的多标签竞争风险。新增 `LIVE_PULSE_ACTIVITY`，仅由启动 PULSE 的精确直播标签初始化、更新与清理；其他标签的活动事件仍用于常规连接心跳，但不能停止直播会话。
- 启动时立即读取直播标签 `GET_PAGE_CONTEXT` 的可见状态；隐藏、导航、关闭、离开精确直播页、任务切换或解除配对仍按既有安全语义停止，且不会自动重启。采集端点白名单、API-only 规则和分钟趋势职责隔离均未改变。
- 连续三次非致命失败后，Popup 会显示固定白名单内的最后失败码，避免只显示笼统的 `THREE_CONSECUTIVE_FAILURES`；原始响应、任意异常文本和敏感内容仍不会保存或展示。
- 本地解包制品已更新为 `0.2.4 / 6928d7cc541e / Bridge 6 / 采集协议 4`。

### 验证结果

- 已通过 `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（360 项：Shared 48、Extension 102、Web 35、Diagnosis Skills 4、Decision Engine 39、LLM 14、API 118）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check` 与 `git diff --check`。

### 待用户人工验收

1. 在 `chrome://extensions` 手动重载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 指纹为 `6928d7cc541e`，并刷新直播数据大屏页面。
2. 保持直播平台页可见，点击一次“开始 API 持续采集”。任务大屏请在另一个窗口查看；同一窗口切换仍会触发安全停止。
3. 另开或切换其他已授权平台标签页时，直播 PULSE 不应因该标签的活动上报而停止；只有直播标签本身隐藏、导航、关闭或 API 失败才停止。

## 2026-08-11 实时脉冲与分钟趋势职责隔离

### 现场结论与已完成

- 用户商品页截图与 `17:56:59`、`17:57:04` 记录确认：`room_minute_indicator` 的 `SCHEMA_MISMATCH` 发生在 Extension 内容脚本，服务端未收到任何 `/metric-pulses`；任务大屏的“已连接，等待采集”不是 SSE 故障，也不是用户切换任务页或未保存正式快照导致。
- 修复根因：`PULSE` 现在固定只请求 `key_index`，不再在整分钟追加 `room_minute_indicator`。分钟趋势只允许由用户主动 `SNAPSHOT` 读取并投影为既有 `HOURLY_ROWS`；分钟端点的结构漂移不再影响实时指标。
- 服务端源码同步限制 PULSE 仅接收 `key_index`，任何分钟行都以 `LIVE_SCREEN_PULSE_PURPOSE_INVALID` 拒绝；Popup 已在失败后立即展示端点和“本次未向服务端发送实时脉冲”，并将按钮恢复为“开始 API 持续采集”。
- 本地解包 Extension 已从当前源码重建为 `0.2.4 / c49f72be4e03 / Bridge 6 / 采集协议 4`。本机 API 已于 2026-08-11 08:54 原地重建为当前源码；Web、PostgreSQL 容器和数据卷未替换，未执行 migration、`db push`、业务数据写入、平台请求、AI 启动、提交或推送。

### 验证结果

- 已实际通过 `corepack pnpm test`（355 项：Shared 48、Extension 97、Web 35、Diagnosis Skills 4、Decision Engine 39、LLM 14、API 118）、`corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check` 与 `git diff --check`。
- 解包制品检查确认 PULSE 路径只会选择 `key_index`，`minuteDue` 已不存在；`room_minute_indicator` 仅保留在 SNAPSHOT 白名单和正式分钟行投影中。运行中的 API 容器直接读取共享包结果为 `PULSE=["key_index"]`，`/ready`、`/version` 均为 HTTP 200。

### 待用户人工验收

1. 在 `chrome://extensions` 手动重载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 指纹为 `c49f72be4e03`，再刷新保持可见的直播数据大屏商品页。
2. 手动点击一次“开始 API 持续采集”，等待至少一个整 5 秒点，并可在独立窗口查看任务大屏。Popup 应显示成功次数、指标数和 `1 个端点`，服务端应出现 `/metric-pulses` 接收记录。
3. 跨越整分钟后，实时会话不得再因 `room_minute_indicator` 停止；需要分钟趋势或正式证据时，才由用户另行点击“保存当前数据为正式快照”。

## 2026-08-11 Popup 失败停止后的控制状态修复

### 已完成

- 修复 `refreshLivePulseStatus()` 只刷新状态文案、不刷新 `livePulseBtn` 的遗漏。实时脉冲因 `SCHEMA_MISMATCH`、`THREE_CONSECUTIVE_FAILURES` 等原因停止后，按钮现在立即切换为“开始 API 持续采集”。
- 按钮文案和 disabled 状态集中由 `livePulseButtonState()` 计算；轮询只使用脱敏 `GET_STATE`，不会重复触发页面探测、配对校验或平台请求。
- 新增 Extension 回归：active → stopped 文案切换、失败后重新启动入口、配对/API 开关门禁；后续职责隔离制品已更新为 `c49f72be4e03`。

### 验证结果

- 已通过此前的 `corepack pnpm lint`、`corepack pnpm typecheck`，以及本轮重新执行的 `corepack pnpm test`（354 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、`git diff --check`。

### 待用户人工验收

1. 在 `chrome://extensions` 重载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 指纹 `c49f72be4e03`。
2. 保持直播平台页可见并观察一次 API 失败；确认失败文案与按钮状态一致，按钮显示“开始 API 持续采集”。

## 2026-08-10 直播 API Schema 漂移修复与即时失败反馈

### 已完成

- 从运行日志确认故障位于 Extension 内容脚本的 API Schema 校验前：本机开关已开，但服务端没有收到任何 `/metric-pulses`，故大屏无实时帧。已排除“保存正式快照”“用户切页”与服务端 SSE 为主要根因。
- API 契约升级为 Adapter `1.2.0`：保留严格字段类型、敏感键值、大小和未知包装门禁，同时兼容安全等价的 `status_code + data/result` 外层、`data` 中新增字段和单项 `null`。所有非白名单字段都在解析后剥离，绝不进入采集数据。
- 实时脉冲停止时记录按任务隔离的最小结果（失败码、端点、时间），新开会话/任务切换/解除配对时清除。Popup 每秒刷新，`SCHEMA_MISMATCH` 明确显示具体端点并提示“本次未向服务端发送实时脉冲”。
- 已重建本地 API 容器并确认 Adapter `1.2.0`，且重建解包插件为 `ed4b04e82725`。无 migration、`db push`、业务数据改写、AI 启动或真实平台请求。

### 验证结果

- 已通过 `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、`git diff --check` 与 Extension `build:local`。
- 全仓 350 项测试通过：Shared 47、Extension 95、Web 35、Diagnosis Skills 4、Decision Engine 39、LLM 14、API 116。API `/ready`、`/version` 均为 HTTP 200，运行容器 healthy。

### 待用户人工验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 指纹为 `ed4b04e82725`，再刷新 `https://eos.douyin.com/dp/liveScreen` 商品页。
2. 保持直播平台页可见，点击一次“开始 API 持续采集”，等待下一个整 5 秒点；任务大屏可在独立窗口查看，避免隐藏平台页触发安全停止。
3. 若新响应只含新增字段、等价外层或空指标，应收到实时帧；若仍为未知结构，Popup 将立即显示失败端点，且服务端仍不会收到伪造或不完整脉冲。届时仅据端点名和时间继续做白名单适配，不保存响应正文。

## 2026-08-09 一键 API 持续采集闭环

### 当前目标

- 用户在精确 `https://eos.douyin.com/dp/liveScreen` 页面点击一次“开始 API 持续采集”后，Extension 按固定 5 秒节拍持续读取白名单 API；关闭 Extension Popup 不终止本次显式会话。
- 最新 API 指标通过“Extension -> API 有界内存 `MetricPulse` -> 任务 SSE -> 校准大屏实时区”持续更新。实时帧不创建 `DataSnapshot`、不写业务表或审计表；“保存当前数据为正式快照”作为独立次要动作，用于校准和正式诊断。

### 已完成

- Popup 已把 API 持续采集提升为可采集直播页的主操作，正式快照降为次要操作；移除 Popup 自身关闭时发送停止消息的行为。平台数据页隐藏、卸载、导航离开、直播结束、401/429、敏感响应、Schema 漂移或连续失败仍由内容脚本和 Service Worker 立即停止。
- API 的既有 SSE `/collection-tasks/:id/signals/stream` 保持 `signals` 事件兼容，并新增 `pulse` 事件；连接时先发送 15 分钟保留窗口内的最新帧，后续逐帧推送。Web 使用带登录凭证的流式请求订阅并自动重连。
- 校准大屏新增“API 实时数据”区域，展示连接状态、最近采集时间、当前直播分栏、成功端点数和最多 12 项最新指标；正式快照与人工校准区保持原逻辑。
- 本地解包插件已从当前源码重建为 `0.2.4 / 622478e337aa / Bridge 6 / 采集协议 4`。本机 API/Web 已替换为当前源码镜像，运行时 `LIVE_SCREEN_INTERNAL_API_ENABLED=true`、`AI_DIAGNOSIS_ENABLED=false`。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 与 `git diff --check` 通过。
- Shared 47、Extension 89、Web 35、Diagnosis Skills 4、Decision Engine 39、LLM 14、API 116，共 344 项测试通过；新增回归覆盖 Popup 关闭不停止、平台页生命周期仍停止、SSE 分块解析/重连和最新实时帧发布。
- 本机 API/Web/PostgreSQL healthy；`/ready`、`/version` 和任务 `cmslcimbi000loz077k91p0vq` 校准大屏均返回 HTTP 200。迁移日志显示 14 个 migration、无待应用项，API/Web 启动日志无错误。

### 待用户人工验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 显示指纹 `622478e337aa`，再刷新直播数据大屏。
2. 在可 API 采集的直播页点击一次“开始 API 持续采集”，等待 5 秒以上；关闭 Popup 后保持平台页可见，并在任务校准大屏确认“API 实时数据”持续刷新。
3. 如需把某一时刻的数据用于校准或正式诊断，再点击“保存当前数据为正式快照”；该动作与持续实时展示相互独立，旧缺值快照不会被改写。

## 2026-08-09 直播采集缺值与 API 优先收口

### 现场结论

- 已核对 API/Web/PostgreSQL 日志和任务 `cmslcimbi000loz077k91p0vq` 的真实快照。`5 / 5` 表示五条路线都至少上传了一条快照，不表示每个字段都有原值；13:16–13:17 的六条快照中，两次直播概览都只得到 `2 / 8` 个有值指标，商品页为 `0 / 2`，流量页为 `3 / 3`，本地推总览为 `5 / 5`。
- 当时两条直播概览快照的 `captureMeta.liveScreenInternalApi.enabled=false` 且没有成功端点；运行容器也确认 `LIVE_SCREEN_INTERNAL_API_ENABLED=false`。所谓“实时脉冲”因此静默走了 DOM，且脉冲本来只更新内存信号、不创建路线快照，所以用户点击后看不到采集记录变化。
- 直播概览 DOM 的数值容器是“直接文本数值 + 单位子节点”，旧适配器只接受叶子或多子节点结构，导致明明可见的成交订单数、在线人数、GPM、商品点击率等被识别成只有字段名而没有原值；图表单选项又会被误当成 GMV 卡片标签。

### 已完成

- API 实时脉冲不再静默降级为 DOM：服务端开关未开、页面不合格或 API 无有效指标时明确失败并展示原因。精确 `liveScreen` 页面内的概览、商品和流量分栏都可启动同一直播间 API 脉冲；脉冲仍只写有界内存，不创建路线快照。
- 用户主动正式采集直播概览时采用 API 值优先、DOM 仅对账/明确兜底。DOM 只有标签、空值、无周期或无效绑定时不会覆盖有效 API 值；完整 API/DOM 数值冲突仍失败关闭，不伪造确定值。
- 修复直播概览直接文本数值容器解析，排除 radio/option/tab 图表选择器噪声；覆盖率、路线指标数和大屏顶部计数现在只统计真正有原值的字段，不再把空占位算成“已采集指标”。
- Popup 明确显示本次来源、API 成功端点数、识别字段数/真实原值数/缺失数；API 脉冲显示成功次数、最近指标数和端点数，点击后的成功或失败提示不再被刷新覆盖。
- API 新增不含平台原始响应的安全运行日志：记录脉冲接受/拒绝、正式快照 API/DOM 来源与端点计数，便于下次按请求和任务定位。
- 本机开发环境已按用户本轮授权开启 `LIVE_SCREEN_INTERNAL_API_ENABLED=true`，API/Web 保持 `127.0.0.1:4300/3300` healthy；AI 仍关闭。解包插件已重建为指纹 `27f61909cf44`。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm build` 通过。
- Shared 47、Extension 88、Web 33、Diagnosis Skills 4、Decision Engine 39、LLM 14、API 115，共 340 项测试通过；新增回归覆盖直播真实 DOM 结构、API 脉冲不降级、商品/流量分栏脉冲、API/DOM 合并和真实原值计数。
- API 26 个测试文件、115 项测试在隔离 PostgreSQL 中通过；测试脚本固定关闭本地内部 API 开关，避免开发机 `.env` 影响默认关闭场景。
- 本机 API `/ready`、`/version` 和任务大屏均返回 HTTP 200；运行时确认 `LIVE_SCREEN_INTERNAL_API_ENABLED=true`、`AI_DIAGNOSIS_ENABLED=false`，API/Web/PostgreSQL healthy，迁移服务报告无待应用 migration。

### 待用户人工验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认指纹 `27f61909cf44`，再刷新直播数据大屏页面。
2. 在任一精确 `liveScreen` 分栏开启 API 实时脉冲，等待整 5 秒点后确认 Popup 出现成功次数、指标数和成功端点数；这一步不会增加 `5 / 5` 路线记录。
3. 切到直播概览并点击“采集并上传当前路线”，确认结果明确显示 `API 采集` 或 `API 优先并保留 DOM 对账`，然后刷新校准大屏检查新快照。旧的缺值快照不会被追溯改写。

## 2026-08-08 任务页自动连接回归收口

### 已完成

- 将“桥接状态请求恢复已保存任务绑定”的门禁抽为独立单元：仅当插件本地凭证存在、已绑定任务，且请求来自与本地绑定任务 ID 一致的精确任务页时，才刷新服务端上下文并上报连接心跳。
- 真实 Chrome 验收发现 `chrome.runtime.MessageSender.tab.active` 在该跨上下文链路中不可靠：桥接会返回已配对，但恢复心跳被静默跳过。现已取消 active 依赖，改为解析精确任务页 URL，并强制 URL 中的任务 ID 等于插件本地绑定任务 ID；其他任务、任务子页面与非任务页继续失败关闭。
- 恢复心跳固定为 `TASK_TABLE / UNKNOWN / collectable=false / VISIBLE`；任务页只用于确认连接，不能被标记为可采集，真实平台页仍必须由内容脚本确认。
- 新增 6 项扩展回归，覆盖精确绑定任务恢复、不依赖 active、其他任务/子页面失败关闭、任务页不可采集状态、上下文优先顺序，以及上下文或心跳失败时立即停止；源码守卫同步检查该安全门禁。
- 已重新构建本地解包插件：`0.2.4` / Bridge `6` / 采集协议 `4` / 指纹 `c89a0fd283d4`。此前生成的 ZIP 候选包仍是旧制品，不能用于本次本地回归。
- 真实 Chrome 已在保留本地凭证和当前任务绑定的前提下完成最终回归：重载最新解包插件并刷新任务页后，无需生成新配对码，页面在固定刷新周期内自动进入“插件已连接 · 0.2.4”。

### 验证结果

- `corepack pnpm test`：通过，共 334 项测试（Shared 47、Extension 83、Web 33、Diagnosis Skills 4、Decision Engine 39、LLM 14、API 114）。
- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、`git diff --check`：通过。
- 本机 API `/ready`、`/version` 与任务页 `http://127.0.0.1:3300/tasks/cmsjxwt0t0003s707u51mbh38` 均可用；API 采集协议为 `4`。
- 真实任务页注入标记为 `c89a0fd283d4 / Bridge 6`；“插件已连接”在 Web 中必须同时满足 Bridge `READY`、服务端当前任务绑定和最近心跳，因此现场结果同时证明了本地凭证与本机 API 当前任务恢复成功。
- 同一现场明确显示当前 URL 为本地任务页、分栏待确认，并返回“当前页面不在采集白名单内”；任务页没有被提升为可采集页面。

### 现场验收结论

1. 用户完成配对并重载 `apps/extension/release/local-unpacked-test-extension` 后，刷新任务页即可自动恢复，无需再次配对。
2. 本轮只验证连接恢复与安全门禁，没有代替用户点击、采集或操作真实平台页面；真实平台采集仍必须由用户打开白名单页面并在 Popup 中主动触发。

## 2026-08-08 工程审查问题修复

### 已完成

- 修复服务端信任客户端 `roomIdSource` 的缺口：上传最小 room_id 来源证据，由服务端重算、核对 URL 并失败关闭伪造或冲突来源。
- 修复只检查内部 API 总响应大小的问题：新增逐端点 `maxResponseBytes` 与成功端点非空门禁。
- 修复停止实时脉冲无法取消本地上传的问题：停止信号会中止当前请求，完整上传预算为 4 秒，迟到结果不会恢复调度。
- 修复版本检查空 `catch`、Popup 显式 `any`、校准大屏超长 JSX、Extension 构建改写跟踪制品、指纹输入遗漏新模块及 CI 检错目标错误。
- 将 Schema 默认值集中到根包元数据并加入一致性检查；新增 LF 属性策略，减少跨平台行尾漂移。
- 升级 Next.js/Express 及受影响传递依赖，生产依赖审计从 16 个已知漏洞降为 0，peer 依赖无冲突。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`：通过；共 328 项测试。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`：通过。
- `corepack pnpm audit --prod`：0 漏洞；`corepack pnpm peers check`：无问题。
- Extension 本地/生产构建、14 项制品安全测试与候选包完整性检查通过；两类候选 ZIP 和 unpacked 当前统一指纹为 `3012e6dbc930`。
- API 测试临时 PostgreSQL 已自动删除；未执行业务库 migration、`db push`、部署、提交或推送。

### 仍需人工验收

1. 在 `chrome://extensions` 手动重载 `apps/extension/release/local-unpacked-test-extension`，核对指纹 `3012e6dbc930`、Bridge `6`、采集协议 `4`。
2. 保持 `LIVE_SCREEN_INTERNAL_API_ENABLED=false`，先回归纯 DOM 脉冲的启动、停止、页面隐藏和导航中止；只有另行授权本机灰度后才能开启内部 API。
3. 当前工作区仍包含此前积累的大量未提交源码、文档和制品改动；未经用户明确要求，不提交、不推送，也不删除或回退这些改动。

## 2026-07-30 真实数据准确性与可信度校准

### 已完成

- 建立统一展示值解析：保留后台原始显示值、展示精度、单位来源和倍率，严格区分 `0`、`0.00`、缺失与 `--`；金额、千/万、百分比和 ROI 倍数不再由各层各自猜测。
- 五条路线分别建立字段白名单、精确同义名、表头语义和统计周期规则；只接受明确卡片或“表头 + 唯一行标识 + 单元格”绑定。字段、周期、位置或候选值不唯一时写入最小绑定证据并标记异常，不保存整页正文或敏感信息。
- 新增加法式 `20260729120000_metric_binding_calibration`：按工作区、路线、页面结构指纹、字段/表签名保存人工校准；历史快照不回填为可信。
- 正式诊断改为全局失败关闭：当前快照出现任一 `INVALID` 字段、未确认表格行列结构或缺少绑定证据的历史表格时，整次输入为 `UNREVIEWED`，正式 `decision-runs` 返回 `DECISION_NOT_READY`。
- 首次出现的未知表格结构必须逐格核对完整张表，不能通过“确认表头”快捷操作直接放行；完整核对后才记录同路线、同页面指纹和同表签名的结构校准。后续稳定结构通过全部门禁时才允许批量确认原值，结构异常仍只能逐项修改或忽略。
- 服务端会把插件上报的表头、列数、行标识和表签名与实际 `rawTableData` 重新核对；元数据与原始表格错位时直接标记 `INVALID`，客户端声明不能绕过。
- 校准大屏的指标行完整展示“后台字段标签 -> 后台显示原值 -> 系统规范精确值 -> 单位/精度 -> 周期 -> 位置 -> 异常原因”；该证据由服务端 DTO 返回，不依赖前端猜测。概览优先按后台原样展示，百分比的系统精确值明确标为“比例”，不会把 `4%` 静默显示为 `0.04%`。
- Extension 兼容原生表格、ARIA `role=table` 与 `role=grid`，只采集用户当前已渲染的可见行；不滚动、不翻页、不点击平台控件。
- 采集、规范化、入库和复核展示统一保留规范化十进制文本与后台显示原文，不再先转为 JavaScript `number` 再写回字符串；正式规则输入只在共享的安全数值边界内显式转换，超大或超精度值不会静默近似。
- 同周期的支付金额、消耗和 ROI 交叉校验改为 `BigInt` 精确分数比较，并按 ROI 页面展示精度容纳正常四舍五入，不再使用浮点除法和经验容差。
- 修复 v034 迁移中两个超长索引名被 PostgreSQL 截断后重名的问题；Schema 与迁移统一使用显式短索引名。
- 服务端规范化不再按来源优先级静默选择同一快照中的重复标准字段；重复 `ROI` 或同键指标统一标记 `FIELD_BINDING_AMBIGUOUS` 并失败关闭。历史已确认但缺少字段绑定证据的指标同样不能进入正式诊断。
- 页面结构签名只记录统计周期的语义位置，不包含“今日/昨日”等周期值；同一结构跨周期采集可复用人工校准，周期位置变化、缺失或不一致仍会降为待核对。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check` 与 `git diff --check` 通过；Shared 46、Extension 37、Web 28、LLM 6、Decision Engine 37、API 93，共 247 项测试通过。
- 独立临时空 PostgreSQL 已按正式链路执行 15 个 migration 至 `20260729120000_metric_binding_calibration`，`prisma migrate status` 确认最新；临时容器和数据卷已销毁。
- 本地 unpacked Extension 已由当前源码重建，构建指纹为 `d1c80aee42ea`，Schema 为 `20260729_v034_metric_binding_calibration`。既有文件名含 `b4de6606e3f5` 的 ZIP 是本轮校准前制品，不能用于 v034 真实页面验收；本轮未生成或发布新的正式 ZIP。
- 未对本地业务数据库或生产数据库执行 migration，未部署、提交、推送或执行平台自动操作。

### 待人工验收

验收清单：`10_项目档案/project-001-字节投流/04_交付物/2026-07-30_v034五路线真实采集验收清单.md`。

1. 在五个真实后台页面分别手动采集，逐项核对“字段名 -> 后台原值 -> 系统值 -> 单位/周期 -> 卡片或表格位置”。
2. 对首次出现的每种表格结构逐格核对完整张表；完成后，同路线、同页面指纹和同表签名的后续快照才可自动识别为稳定结构。页面指纹、表头或行标识变化后应重新进入待核对。
3. 故意保留一个重复 ROI 或错位表头，确认校准大屏显示异常且正式诊断只能进入保守模式。

### 计划外限制

- 未调用或拦截平台内部接口，未读取 Cookie、Token、密码或整页正文；真实页面验收只能由用户主动登录、切换页面并点击 Popup 完成。

## 2026-07-29 P1 已有采集数据后的插件重连入口

### 已完成

- 修复登录、复用计划或重启插件后，任务已有历史采集数据却只进入第 2 步、无法恢复插件连接的问题。
- 任务页在当前插件未连接时始终展示连接状态：可重新检测网页桥接与服务端状态；网页桥接可用时可重新绑定当前任务；桥接不可用时仍可安全生成手动配对码。
- 历史采集、校准、人工核对和诊断流程继续保留，不会因临时离线错误地丢失进度或改写已有证据。
- Web Bridge 轮询补全未激活/协议不兼容状态回写，重新检测不会沿用已过期的 UI 状态。

### 验证结果

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：全部 215 项通过。
- `corepack pnpm exec prisma validate`：通过。
- `corepack pnpm --filter @douyin-local-life/shared build` 后执行 `corepack pnpm --filter @douyin-local-life/web build`：通过。
- `git diff --check`：通过。
- `corepack pnpm build`：未通过。根递归构建并行执行 shared 与 Web 时，shared 清理 `dist` 使 Web 暂时无法解析 `@douyin-local-life/shared`；串行构建已复现通过，该问题不由本次任务页改动引入。

### 待人工验收

1. 登录后复用一个已有采集数据的计划，确认离线时页面同时保留历史数据和“恢复采集插件连接”面板。
2. 打开已登录目标后台页面并刷新后，点击“重新检测插件”；连接恢复时可继续通过 Popup 主动采集。
3. 若插件本地任务绑定已丢失，点击“重新绑定当前任务”并在 Popup 完成人工确认；不得出现自动平台操作。

## 2026-07-28 采集一致性与校准大屏 0.2.4 收口

### 已完成

- 共享采集协议版本固定为 `1`，`/version`、`/extension/context` 与快照请求使用同一协议；旧插件访问新 API、新插件访问旧 API 都会以明确错误停止上传，不能静默产生半成品快照。
- 已验证 Extension 采集在同一事务内创建原始快照、标准化指标、`PENDING` 复核记录、路线成功状态、路线心跳和采集批次状态。页面账号 ID 已彻底退出判断链路，账号隔离继续由登录用户、账号档案、项目、任务和插件凭证保证。
- 新增显式幂等历史修复工具，仅补建 `VERIFIED` 快照缺失的派生记录并写审计；原任务四条可信路线共补建 24 条指标和 24 条待复核记录，首条 `MANUAL_PENDING` 直播概览保持原样。最终只读复跑为 `candidateTasks: 0`。
- 采集汇总使用最新快照时间，不再停留在首条采集；“全任务概览”只选择一个来源路线，优先本地推总览、缺失时回退直播概览，同名指标不跨路线相加。
- 校准大屏已改为深蓝数据驾驶舱，展示任务新鲜度、五路线覆盖、待复核数量、单项来源路线与时间、真实趋势和真实表格。采集批次活跃且无草稿时自动刷新；存在未保存编辑时只提示新数据，不覆盖草稿。空任务明确显示“尚无采集数据 / 待采集”，不会把 0 条数据误写为校准完成。
- 路线状态已区分 `MANUAL_PENDING`、`STALE` 与 `FAILED`：已采集但过期的数据不会被误标红为失败；运行卡住仍会保留问题码并阻断强动作。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（213 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate` 和 `corepack pnpm version:check` 全部通过。
- 本地与生产目标 Extension 均已重新构建并通过解压后的产物边界校验；本地 ZIP SHA256 为 `89be2c0b283edce1c4b9136a1993259b6ed607d61eb539fd88c6d7850fb2059b`，生产候选 ZIP SHA256 为 `75b519e56f63fef211d6d6719b04cbc1bcab4d671dd1b081a1425716b2628ee3`。
- 本地 `127.0.0.1:3300/4300` 的 Web、API 与 PostgreSQL 均健康；API 报告产品 `0.2.4`、Schema `20260722_v033_table_cell_reviews`、采集协议 `1`。
- 已完成 1440px 桌面与 390px 移动端视觉回归：页面无整体横向溢出，移动端宽表只在表格容器内横向滚动，不生成模拟指标或图表。
- 本轮没有新增数据库 migration，没有改写原始快照，没有采集 Cookie、Token、密码或页面原文，也没有增加任何平台自动操作。

### 待人工验收与发布

1. 2026-07-29 已在用户实际 Chrome 中确认本地插件更新为 `0.2.4` / 桥接协议 `2` / 构建 `b4de6606e3f5`，与本地测试制品一致；旧插件阻塞已解除。
2. 使用真实已登录页面重新采集首条仍为 `MANUAL_PENDING` 的直播概览，并完成五路线真实点击验收。确认任务页收到新快照后自动刷新，并在有编辑草稿时只提示刷新。
3. `collector-production-candidate-v0.2.4-b4de6606e3f5.zip` 仅为通过校验的正式候选包，尚未提交 Chrome 正式渠道；发布前仍需干净工作树、正式审核和人工发布。

## 2026-07-28 取消页面账号 ID 输入与拦截

### 已完成

- 已移除页面账号 ID 的采集、上传、展示、账号档案录入和诊断门禁；页面 URL 参数或可见文本中的账号 ID 不再影响任务采集。
- 任务归属仍由登录用户、账号档案、项目、任务与 Extension 凭证在服务端校验；路线仍要求可信域名、无冲突证据和 Popup 点击确认。
- 新快照和手工指标固定写入兼容 `MATCHED` 状态，表示服务端任务绑定已验证；共享快照清洗器会剥离旧页面账号字段，历史字段按既有 30 天留存策略清理。
- 已更新 API、Web、Extension 与共享契约回归测试；本地 unpacked 插件构建指纹为 `33dc39c2b5c4`。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（199 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm extension:build` 和版本检查通过。
- 未新增 Prisma migration，未执行部署、提交、推送、真实平台采集或生产数据操作。

### 待人工验收

1. 在 `chrome://extensions` 重新加载 `apps/extension/release/local-unpacked-test-extension`，刷新目标后台页面。
2. 在已登录目标页面直接点击 Popup 的“采集并上传当前路线”；确认不再显示或要求页面账号 ID，采集完成后进入任务校准大屏。
3. 验证插件仍不能切换或上报其他账号档案下的任务。

## 2026-07-27 真实后台识别与账号档案同步修复

### 已完成

- 根据真实截图复核：`/lamp/pc/liveboard2` 已识别为巨量本地推数据总览，`/lamp/pc/promotion/roi2` 已识别为巨量本地推任务列表；不存在路线识别失败。已识别时不显示路线下拉框，符合只在 `UNKNOWN` 或冲突时人工确认的安全设计。
- 查明上传被拦截的真实原因：任务账号档案 ID 为 `1`，当前页面 `advid` 为 `1870840348951692`；跨账号隔离保持不变，系统不会自动改写账号档案。
- 实现点击采集前的服务端账号/任务上下文刷新：已配对插件会读取并验证 `/extension/context`，使用当前账号档案 ID 进行本地校验；账号页保存后下次点击采集自动生效，无需重新配对，服务端二次校验不变。
- Popup 明确区分“当前已识别路线”和“本轮待采集路线”；账号 ID 不匹配时显示两个 ID 与账号档案人工核对指引。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（207 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm version:check` 和 `git diff --check` 通过。
- 本地 unpacked 插件已重新构建，指纹 `a18d187a5997`；其 Popup 与 Service Worker 已包含账号上下文刷新和新路线文案。
- `corepack pnpm prisma:generate` 未通过：运行中的 Node 进程锁定 Windows Prisma 引擎 DLL（EPERM）。本轮没有 Prisma schema 或 migration 变更，API build/test 使用现有生成客户端通过。

### 待完成

1. 用户在账号档案中人工确认平台账号 ID `1870840348951692` 后保存；重新加载插件、刷新真实页面并点击一次采集，验证两条路线独立上传。
2. 在不占用本地服务的维护窗口关闭锁定 Prisma 引擎的 Node 进程后，重新运行 `corepack pnpm prisma:generate`。

## 2026-07-27 任务配对状态同步修复

### 已完成

- 查明任务 `cms29dr83000dq307hgs9ga02` 已完成过同任务配对；后续重复生成的配对码未被确认，造成网页旧桥接响应覆盖真实本地绑定状态。
- Popup 现在对同账号、同任务的重复请求直接返回已绑定；对不同任务仍显示确认面板并要求用户点击确认。任务页新增 3 秒桥接状态刷新，完成 Popup 确认后自动切换到第 2 步。
- 已重新生成本地 unpacked 插件，构建指纹 `1a66aeabd108`；Web 容器已重新构建并恢复原入口 `127.0.0.1:3300`。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm build` 通过。
- Shared 39、Extension 30、Web 24、LLM 6、Decision Engine 34、API 71 项测试通过，共 204 项。首次全仓 API 测试因隔离测试库启动后 Prisma Schema Engine 未展开错误而中断；保留隔离库后单独复跑 API 71 项通过。
- `corepack pnpm exec prisma validate` 与版本检查通过；本机 `prisma:generate` 被运行中的 Node 进程锁定 Windows 引擎 DLL（EPERM），Docker Web 构建内的 Prisma generate 已成功。未执行迁移、提交、推送或真实平台操作。

## 2026-07-27 原账号环境 v033 升级

### 已完成

- 已保留原 PostgreSQL 数据卷并升级本地预上线环境 `127.0.0.1:3300/4300` 至 v033；升级前备份已在独立临时 PostgreSQL 恢复通过。
- 已应用 `20260722090000_v033_table_cell_reviews` 加法式迁移，升级后保留 9 个用户、5 条快照和 5 个采集任务；现有迁移总数为 14。
- API、Web、PostgreSQL 均 healthy，`/version` 为 `20260722_v033_table_cell_reviews`；浏览器实测登录表单正常出现且无控制台错误。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm version:check` 通过。
- 201 项测试通过：Shared 39、Extension 29、Web 23、LLM 6、Decision Engine 34、API 71。API 测试复用隔离数据库，避免与已运行的本地验收库争用 `55432` 端口。
- 未执行生产迁移、部署、提交、推送、真实平台操作或生产数据操作。

## 2026-07-26 本地验收登录阻塞修复

### 已完成

- 首次 `/auth/me` 会话确认改用独立 3 秒超时；API 临时不可用时会清理内存会话并直接显示登录表单，不再被通用 20 秒请求超时卡住。
- 已重新构建并重启隔离测试 Web：`http://127.0.0.1:3400/login` 指向 `http://127.0.0.1:4400`，浏览器实测重新加载后登录表单正常显示且控制台无错误。

### 验证结果

- `corepack pnpm --filter @douyin-local-life/web test` 通过（23 项）。
- `corepack pnpm --filter @douyin-local-life/web typecheck` 通过；使用隔离 API 地址的 Web production build 通过。
- 未变更数据库、迁移、Cookie、Extension 或生产配置，未执行生产操作、提交或部署。

## 2026-07-26 v033 直连采集与校准大屏验收收口

### 已完成

- 服务端在受信插件上传事务中为已匹配账号、已验证路线的标准指标自动创建 `PENDING` 复核记录；校准大屏可以直接展示真实采集值，不再依赖页面读取时补建复核数据。
- 自动识别出现 URL、选中分栏或可见标题冲突时统一返回 `UNKNOWN`，由 Popup 在当前任务允许路线内做一次性人工选择；缺失或冲突的 Extension 路线证据保持 `MANUAL_PENDING`，不会被 URL 推断静默升级为已验证。
- 已使用隔离环境完成校准大屏生产构建与登录后的浏览器验收：1280px 桌面和 390px 移动端均只展示真实指标、真实表格和明确缺失状态；页面无整体横向溢出，宽表仅在自身容器内横向查看。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 全部通过，共 201 项测试：Shared 39、Extension 29、Web 22、LLM 6、Decision Engine 34、API 71。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、`git diff --check` 通过；隔离 Web 生产构建和 API 就绪检查也已通过。
- 使用独立的临时 PostgreSQL 空库按 `prisma migrate deploy` 顺序成功应用全部 14 个 migration，包含 `20260722090000_v033_table_cell_reviews`；临时容器已销毁。
- 未执行生产 migration、部署、提交、真实平台操作或生产数据操作。

## 2026-07-25 v033 多路线指标汇总完整性修复

### 已完成

- 校准大屏与采集汇总改为按“路线 + 标准指标”去重；不同路线采集到同名指标（例如“消耗”）会保留为独立真实证据，分别显示来源、时间和复核状态，不能再互相覆盖。
- 新增 API 集成回归：同一任务的直播概览与本地推总览各自上传“消耗”后，汇总接口同时返回两条带独立路线和值的指标。

### 验证结果

- API 定向集成测试在隔离 PostgreSQL `127.0.0.1:55432` 通过 71 项；API typecheck 与差异格式检查通过。
- 未执行生产 migration、部署、提交、平台操作或生产数据操作。

## 2026-07-24 v033 Popup 一次确认路线核验收口

### 已完成

- Popup 的一次“选择当前路线并采集上传”现在在服务端可验证条件成立时直接完成该路线确认，不再要求任务页第二次确认。
- 自动验证严格要求 Extension 采集凭证、账号绑定任务、精确可信 HTTPS 平台域名、任务已配置路线和无冲突路线证据；直播大屏商品/流量分栏仅在该范围内允许与概览页面类型共存。
- 非 Extension 请求不能借 `manuallyConfirmed` 绕过人工路线确认；使用 Extension 凭证上传非可信来源也会被拒绝。

### 验证结果

- 全仓 lint、typecheck、200 项测试、build、Prisma validate/generate、版本一致性和差异格式检查通过；其中 Shared 38 项、Extension 29 项、Web 22 项、LLM 6 项、Decision Engine 34 项、API 71 项。
- API 集成测试使用临时隔离数据库完成，未触碰现有本地或生产数据。

### 完整性复核补充

- 正式决策输入新增快照新鲜度门禁：即使账号、路线和复核均已通过，超过新鲜度阈值的指标、表格和结构化记录也不会进入判断；新增 API 回归测试覆盖该边界。当前完整测试基线为 200 项通过。
- 新增 `docs/API_REFERENCE.md`，补充校准大屏、表格批量校准和标准指标校准接口的用途、参数、请求/返回示例、错误码及数据边界。
- 标准指标校准已与表格单元格校准统一为当前快照、账号/路线确认和乐观并发版本门禁；单项、批量和全部确认均拒绝旧版本或旧快照，成功校准会推进快照版本并保留审计。
- 任务页仅在本次已打开的页面观察到新的用户确认采集完成时，自动跳转至站内校准大屏；不会自动打开、跳转或操作任何外部平台页面。

## 2026-07-23 v033 采集直连与校准大屏

### 已完成

- 生产 Extension 使用精确可信域名授权，按 URL、标题、选中标签和少量可见标题自动识别路线；保留 Popup 一次点击采集确认和当前任务路线下拉兜底。
- 删除自动巡检、自动上传及非 Popup 采集入口；不自动导航、点击、翻页、提交或读取网络响应正文和认证信息。
- 新任务自动继承全局路线模板，不再要求逐路线 URL；旧任务 URL 继续只读展示和兼容后端更新接口。
- 新增任务校准大屏、汇总 API、表格单元格批量校准 API、`TableCellReview` 数据模型和 v033 migration。
- 指标与表格校准均保留原始值、当前值、来源、置信度、时间、状态和审计；写入执行所有权、当前快照、账号、路线、并发版本和敏感字段校验。
- 正式诊断统一只读取当前路线已确认或已修改的数据，并阻断待复核、忽略、过期、账号/路线未确认、跨账号和旧快照证据。
- 已核验两个目标路径：`/lamp/pc/liveboard2` 识别为本地推总览，`/lamp/pc/promotion/roi2` 识别为任务列表。旧记录未识别的根因是两个路线均未实际触发确认采集，因此保持 `PENDING` 且无快照。
- 页面可见文本仅在本次点击采集的浏览器内存中用于提取允许字段；共享快照契约、插件上传和 API 入库均强制清空 `rawDomText`，AI 与决策不读取页面原文。大屏新增指标类别筛选，并只展示真实表格来源、路线置信度和采集时间。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 通过；共 197 项测试：Shared 37、Extension 29、Web 21、LLM 6、Decision Engine 34、API 70。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate` 通过；隔离空 PostgreSQL 顺序应用全部 14 个 migration 并确认 schema 最新。
- Extension production/local 构建和制品硬校验通过；本地 unpacked 指纹为 `84d44c50f4a6`。
- `corepack pnpm version:check` 和 `git diff --check` 通过；本轮未执行生产 migration、部署、平台操作或生产数据操作。
- 浏览器在 1280px 与 390px 实测大屏有数据和空数据状态；移动端无页面级横向溢出，宽表仅在表格容器内横向滚动，按钮和文字未重叠。

### 待人工验收

1. 在 Chrome 扩展页重新加载 `apps/extension/release/local-unpacked-test-extension`，使用真实已登录平台页面验证两域名、五路线和下拉兜底。
2. 用真实账号 A/B 验证跨账号上传拒绝，并确认未点击 Popup 按钮时不会上传。
3. 用户手动登录后，在 1280px 与 390px 复验校准大屏；当前本地会话已失效，未绕过登录进行自动化操作。
4. 生产应用 v033 前先备份，在 staging 执行 `prisma migrate deploy`，核对 `/version` 和正式 Extension 制品哈希后再安排发布。

## 2026-07-22 本地管理员登录修复

### 已完成

- 查明登录失败根因是新版 Web 与旧 v024 API 的认证协议错位，并非旧账号被删除或密码哈希不兼容。
- 保留 PostgreSQL 数据卷，成功应用 v025-v032 共 8 段缺失 migration；数据库现有 13 个 migration，原用户与项目数据未清理。
- 修复 API Docker runtime 未复制 Workspace 包级依赖的问题，新增镜像构建期入口导入门禁。
- Compose 支持显式 `API_NODE_ENV`，默认仍为 production；本地 HTTP 验收使用 development，生产 Secure Cookie 红线不变。
- 创建本地验收账号，实际完成 API 登录/会话/注销与 Web 登录/工作台/退出测试。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 全部通过，共 192 项测试。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、Compose 静态配置和 `git diff --check` 通过。
- API Docker 镜像构建期运行时导入门禁通过；本地 Web/API/PostgreSQL 均 healthy。

## 2026-07-20 首页备案号展示

### 已完成

- 首页内容区改为复用根布局的可伸缩高度，统一页脚中的工信部备案链接 `辽ICP备2026002223号` 现在固定处于首页底部可见位置，不再因首页自身的 `min-h-screen` 高度而被推到首屏以下。
- 新增回归测试，锁定备案链接、`target="_blank"` 和首页贴底布局。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 通过；全仓 192 项测试通过。
- 本地预上线 Web 容器已重新构建，`http://127.0.0.1:3300/` 返回 200、容器 healthy；HTTP 内容和浏览器视口均确认备案号显示在页面底部。
- 未涉及 API、Prisma、配置、生产部署或平台操作；API 与 PostgreSQL 容器未重建。

## 2026-07-20 对抗性审查收尾验证

### 已完成

- 审计留存改为最小操作者快照：v032 使用户删除只解除 `AuditLog.userId` 关联并保留 `{ userId }` 快照；关键复核、结果复盘和审计写入均完成事务收口。
- 修复生产 Web/API 同注册域的 CSRF Fetch Metadata 兼容性：仅在精确允许 Origin 和正确 CSRF Token 已通过时接纳 `same-site`，未配置来源继续拒绝。
- 运行时与制品默认 Schema 版本统一至 `20260720_v032_audit_actor_snapshot`。

### 验证结果

- 隔离 PostgreSQL 空库顺序应用 13 个 migration 通过；独立 v031 数据库升级至 v032 通过，并实测历史审计快照回填和用户删除后的审计保留。
- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm audit --prod`、带无敏感占位变量的 `docker compose config --quiet`、v032 正式 Extension 制品安全测试和 `git diff --check` 通过。
- 测试共 191 项：shared 36、extension 28、web 19、llm 6、decision-engine 34、API 68；生产依赖 audit 为 0 个已知漏洞。
- 未执行真实 SMTP、COS、部署、平台操作或生产数据操作。

## 2026-07-20 对抗性审查补充收口

### 已完成

- 完成剩余持久化输入边界审计：外部自由文本/JSON 改为拒绝敏感认证形态；决策、AI 等已清洗内部派生 JSON 改为二次脱敏后保存，兼容 `[REDACTED]` 标记。
- 收口工作区、账号资料、项目、任务、注册名、手工指标来源、复核值、账号确认备注、配对标签、心跳错误和审计 `User-Agent` 的入库路径；超长自由文本不再静默截断为可保存内容。
- 服务端继续重算插件心跳账号匹配，客户端声明 `MATCHED` 不具可信效力；回归测试覆盖该规则和 Popup 边界。
- 为保持入口文件预算，将工作区和系统健康路由拆分到 `routes/`；不改变 API 路径、权限、数据库 schema、migration 或认证产品策略。
- 明确公开注册与邮箱验证为“暂时隐藏入口”，而非移除、后端关闭或邀请制；管理员发放账号密码只是当前运营方式。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 全部通过。
- 测试共 187 项通过：shared 36、extension 28、web 19、llm 6、decision-engine 34、API 64。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`git diff --check` 通过。
- 未执行真实 SMTP、COS、部署、平台操作或生产数据操作；无数据库结构、环境变量和兼容性变更。

## 2026-07-19 采集完整性、健康诊断与标准化数据

### 已完成

- 修复快照和心跳的 `accountMatchEvidence -> evidence` 映射；心跳只接受安全枚举证据，`UNVERIFIED` 保持账号状态，不再伪装成普通采集异常。
- 新增共享确定性采集诊断模型，统一输出新鲜度、完整度、连续失败、卡死、来源、问题码、人工恢复建议和决策阻断信息。
- 扩展端增加手动采集与巡检启停单飞锁；服务端以任务级 PostgreSQL advisory transaction lock 保护采集运行启动，并校验路线属于当前任务且不含 `UNKNOWN`。
- 新增 v031 加法式 migration，持久化稳定失败码和服务端生成的版本化结构数据；成功采集会清除旧失败信息。
- 新增 `TASK_ROWS / HOURLY_ROWS / MATERIAL_ROWS` 数据契约；当前只从服务端可见任务表生成 `TASK_ROWS`，决策引擎优先读取标准任务行并兼容旧表格。
- 任务页展示逐路线诊断，工作台展示健康聚合；人工建议仅包含刷新、切换可见页面、确认账号/路线和重新点击采集。
- 小时趋势和素材只保留契约，未在插件巡检中启用，也没有新增自动点击、滚动、翻页或网络拦截。

### 验证结果

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 全部通过。
- 测试共 183 项通过：shared 35、extension 28、web 19、llm 6、decision-engine 34、API 61。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate` 通过。
- 隔离空 PostgreSQL 已按顺序应用全部 12 个 migration，`20260719180000_v031_collection_diagnostics` 成功。
- Extension production target 构建和制品安全策略通过；未生成正式发布 ZIP，未提交、推送、部署或操作生产数据库。

### 下一阶段

1. 使用用户主动采集的真实页面脱敏样本校准小时趋势和素材表头、URL、分页及虚拟列表特征。
2. 样本校准前保持两类路线禁用；依赖自动点击、自动滚动或自动翻页的页面只能标记 `PARTIAL`。
3. 在真实任务页人工验收新鲜度、缺失字段、失败恢复建议和工作台聚合；确认旧快照仍能通过通用表格回退生成诊断。

## 2026-07-19 正式诊断与专家参考双栏

### 已完成

- 任务第 5 步改为响应式双栏：桌面端并排展示“正式诊断”和“专家参考分析”，窄屏自动纵向排列。
- 正式诊断继续调用 `decision-engine`，展示系统结论、经营方案和当前 `PENDING_APPROVAL` 动作；动作只提供详情入口，审批和平台执行边界不变。
- 专家参考分析独立调用现有 `/collection-tasks/:id/explain`，展示 Agency 方法论视角、当前证据、待补证据、人工验证、观察指标和停止条件；明确标记为仅供参考，不创建正式动作。
- 新增只读 `/collection-tasks/:id/analysis/latest`，任务页刷新后可恢复最近一次专家参考结果；响应不包含 `requestPayload`，避免将保存的页面原始分析输入再次下发到浏览器。
- （历史状态）两栏曾分别运行，专家参考由本地 mock Provider 生成；该双栏主流程已被 2026-07-31 的统一 AI DecisionRun 取代。

### 当前验证

- 全仓 lint、typecheck 和 build 通过；Web 18 项测试全部通过。
- 全仓测试为 168 项通过、6 项失败。失败仍集中在 `apps/api/src/decision-flow.test.ts` 的账号证据、快照标准化和 Extension 状态流程，与本次任务页双栏及最新解释读取接口无直接调用关系。
- 新增 API 读取接口已通过 API typecheck/build；对应安全断言已加入决策流测试，但由于同一长流程在更早的既有快照断言处失败，当前不能宣称该新增断言已被完整执行。
- 未新增采集字段、Prisma schema、migration、环境变量或部署变化。

## 2026-07-19 第三方提示词决策参考库

### 已完成

- 将 `agency-agents` 的 Paid Media Auditor、Tracking & Measurement Specialist、Douyin Strategist、Livestream Commerce Coach 和 Reality Checker 固定到 revision `459dce837db3bdfdc4763d3fefd1fd854e73c8f1`，人工整理为可追溯参考库。
- 新增 `packages/llm/src/reference-playbooks.ts`：只保留证据审计、口径核对、漏斗定位、一次一变量验证和证据门禁；明确排除未公开算法排序、通用阈值、自动扩量/降量/暂停和效果承诺。
- LLM 解释结果新增 `decisionReference`，模式固定为 `ADVISORY_ONLY`，每条 insight 包含当前证据、待补证据、人工步骤、观察指标、停止条件、来源与安全边界。
- `/collection-tasks/:id/explain` 将参考结果持久化到 `AiAnalysisTask.responsePayload`；Prompt 版本升级为 `explanation-only-agency-reference-v0.2.0`，`finalActionsSource` 继续固定为 `decision-engine`。
- 新增来源、筛选规则和 MIT 声明文档 `docs/AGENCY_AGENTS_REFERENCE.md`；未修改 `packages/decision-engine`，未新增采集字段、数据库表或 migration。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm build`：通过。
- LLM 6 项测试通过；共享 32、Extension 25、Web 18、decision-engine 32、API 55 项通过。
- `corepack pnpm test` 当前为 168 项通过、6 项失败。失败均在 `apps/api/src/decision-flow.test.ts` 的快照标准化、账号匹配和 Extension 状态流程中，并发生在本次新增解释接口断言之前；本轮没有修改这些业务分支，但当前工作树尚不能声称全仓测试通过。
- 已实测 `decisionReference` 经过 `sanitizePersistedJson()` 后可安全持久化，返回 `ADVISORY_ONLY`、固定策略版本、5 个来源和按输入筛选的参考项。

### 待处理

1. 在发布前单独修复并复验当前 API 决策流的 6 项账号证据/快照回归失败。
2. （历史状态）当时真实 Provider 尚未配置、由 mock 返回结构化参考；新主线已改接 DeepSeek，但在真实评测完成前由功能开关保持关闭。

## 2026-07-19 认证入口与账号证据回归

### 已完成

- 明确当前策略是隐藏公开注册和邮箱验证入口，而非删除后端注册、邮箱验证或数据模型；管理员可继续发放已验证账号供登录。
- 修复可信账号证据在服务端的参数映射。只有精确白名单 HTTPS 页面、声明 URL 参数和检测到的账号 ID 三者一致时，快照才自动标记为 `MATCHED`；仅同名、缺少证据或伪造参数均需人工确认。
- 决策回归夹具覆盖可信自动匹配、伪造 URL 证据不自动匹配及跨账号拒绝；去除任务读取中未使用的历史分析和审计预加载，保持串行决策写入在性能门槛内。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`：通过（shared 32、Extension 25、Web 18、LLM 3、decision-engine 32、API 61，共 171 项测试）。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate` 与 `git diff --check`：通过。

### 待人工验收

1. 使用管理员已发放且已完成邮箱验证的账号登录，确认可进入工作台。
2. 在真实白名单平台页面采集同账号和跨账号快照，确认只有可信 ID 参数可自动匹配；名称或来源不足时必须走人工确认。

## 2026-07-19 登录入口暂时收敛

### 已完成

- 登录页仅保留已发放账号的邮箱与密码登录，并明确提示公开注册入口暂不展示。
- `/auth/register`、邮箱验证确认/重发接口与 `/email-verification` 页面保持可用，未删除用户、待验证注册或验证令牌数据模型；后续恢复入口不需要迁移或兼容改造。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`：通过（shared 32、Extension 25、Web 18、LLM 3、decision-engine 32、API 61，共 171 项测试）。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate` 与 `git diff --check`：通过。

### 待人工验收

1. 使用已发放且已完成邮箱验证的账号登录，确认可进入工作台。
2. 确认登录页不再展示创建账号、注册、重发验证邮件等公开入口；需要恢复开放注册时，仅恢复前端入口，不修改后端验证流程。

## 2026-07-18 审查计划最终代码收口

### 已完成

- 复核指标和动作建议读取路径改为纯读取；显式初始化接口、生命周期展示状态和回归测试已落地。
- 新增独立日留存服务、安全指标按小时聚合，以及 `20260718110000_v030_security_metrics` 加法式迁移；留存策略同样覆盖安全指标。
- SSE 回压改为合并旧状态并保留最新信号；账号匹配证据来源已收紧为共享枚举白名单。
- 正式/本地 Extension 构建已字节级分包：正式产物不含 localhost、127.0.0.1、泛域名或本地测试标识，本地产物保留醒目名称、红色 `T` 图标、构建元数据和本地权限。
- unpacked 与最终正式 ZIP 共用制品硬校验；Schema 元数据统一为 `20260718_v030_security_metrics`，维护脚本提供 `backup:run`、`restore:verify` 标准入口。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`：通过（共 164 项测试）。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm audit --prod`、生产变量下的 `docker compose config --quiet`、正式 ZIP 解压验收与 `git diff --check`：通过。
- 隔离空 PostgreSQL 已顺序应用全部 11 个 migration，`20260718110000_v030_security_metrics` 应用成功并确认 schema 最新。

### 待人工验收

1. staging 部署后确认 `retention` 服务启动即完成一次留存、随后每 24 小时运行；检查其日志只包含聚合结果且不含业务数据或凭证。
2. 在干净工作树执行正式发布并复核生成的 SHA256，再将其配置到 API；ZIP 内容安全检查已由发布脚本自动硬失败。
3. 在隔离环境执行一次真实 COS 备份上传与恢复演练；生产环境仍须按维护窗口、审批和恢复计划执行，禁止覆盖运行中数据卷。

## 2026-07-17 审查计划收口：认证、并发与部署规范化

### 已完成

- 后续审查计划已覆盖此前“暂不做邮箱验证”的阶段性说明：开放注册必须完成邮箱验证后才创建 `User`、默认工作区与浏览器会话；既有用户由加法式 migration 视为已验证。
- 注册和重发接口仅保存 32 字节随机令牌的哈希；令牌 30 分钟过期、单次使用、同一邮箱只保留最新未使用令牌。生产环境强制 TLS SMTP，测试环境仅保存在内存投递记录，不向响应暴露令牌。
- 登录会拒绝待验证注册；旧 bcrypt 哈希在正确登录后渐进迁移到 Argon2id。浏览器继续使用可撤销 HttpOnly 会话和 CSRF Token，不再返回 JWT。
- 批量快照账号确认改为每条快照携带 `expectedUpdatedAt`，在 Serializable 事务中同时校验任务归属、当前路线和版本，避免旧页面批量确认覆盖更新后的证据。
- Compose 为 `migrate`、API、Web 增加最小能力、PID、CPU 和内存限制；API 停机时先拒绝新请求、关闭 SSE，再在 15 秒连接排空期后断开数据库。
- 生产依赖已移除未使用 JWT 库，并升级 `nodemailer` 至 `9.0.1`；新的生产环境变量为 `SECURITY_SECRET`，运行时暂时兼容旧 `JWT_SECRET` 以便平滑迁移。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`：全部通过（shared 27、Extension 21、Web 17、LLM 3、decision-engine 32、API 56，共 156 项）。
- `corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm audit --prod`、生产变量下的 `docker compose config --quiet`：全部通过。
- 隔离临时 PostgreSQL 已从空库顺序执行全部 10 个 migration，并确认 `20260717100000_v029_email_verification` 成功升级；未执行真实 SMTP、COS、服务器部署、DNS 或平台操作。

### 待人工验收

1. 在 staging 配置可投递的 TLS SMTP 后注册新账号，确认验证邮件在 30 分钟内可用、验证后自动登录，旧链接与重复点击均被拒绝。
2. 部署前按迁移说明备份数据库，配置 `SECURITY_SECRET`、SMTP 与 HTTPS 域名，执行 `prisma migrate deploy` 后检查 `migrate` 为 `exited (0)`。

## 2026-07-17 安全与部署规范化准备

### 已完成

- API 生产环境强制显式精确 `WEB_ORIGIN`，CORS 仅允许已配置的 Web/Chrome Extension 来源；接入 Helmet、移除 `X-Powered-By`，并保留 Web 侧 CSP 的职责边界。
- Web 使用 Next `proxy.ts` 为每次请求生成 nonce CSP，并统一设置 HSTS（仅生产）、Referrer-Policy、权限策略与跨域隔离头；CSP 仅允许自身与构建时配置的 API 域名连接。
- API/Web Dockerfile 重构为多阶段、非 root 运行镜像；Compose 将 Prisma migration 拆为一次性 `migrate` 服务，API 仅在迁移成功后启动，并添加只读根文件系统、`no-new-privileges`、init 和优雅停机时间。
- 新增 PostgreSQL COS 备份与隔离恢复校验脚本：备份使用 custom-format `pg_dump` 和 SHA-256，恢复验证只启动临时容器，绝不覆盖生产卷。
- 本轮不新增邮箱验证、SMTP、邮件发送、待验证状态或未验证登录限制；不改变平台自动化与数据采集安全边界。

### 当前验证

- `corepack pnpm --filter @douyin-local-life/api typecheck`、`corepack pnpm --filter @douyin-local-life/web typecheck`：通过。
- `corepack pnpm --filter @douyin-local-life/api test`：14 文件、50 项通过。
- `corepack pnpm --filter @douyin-local-life/web build`：通过。
- 以无敏感占位环境变量执行 `docker compose config --quiet`：通过；API 和 Web runtime 镜像均已构建通过。
- `corepack pnpm lint`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、全仓 `corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build`：全部通过。
- 未执行真实 COS 上传/恢复、服务器部署、DNS 变更或生产数据操作。

## 2026-07-16 认证范围调整

- 本轮安全加固计划取消邮箱验证、SMTP 邮件发送、待验证注册状态和“邮箱未验证禁止登录”。
- 不新增邮件服务配置、验证令牌或邮件发送任务；现有注册与登录流程保持可用，不以邮箱验证作为访问前置条件。

## 2026-07-16 架构稳定化整改

### 已完成

- “每路线最新快照”改为数据库按任务、最新巡检批次和路线逐条查询；高频路线超过 100 条记录不会再挤掉其他路线的当前证据。采集汇总、任务详情、巡检质量和批量确认共用该查询口径。
- 批量账号确认使用可复用的 `Serializable` 事务执行器，`P2034` 自动有限重试，耗尽后返回明确 409；账号确认路由已从 `server.ts` 拆到独立模块。
- `DecisionEngineInput.tables` 改为明确的 `DecisionTableInput`，对象单元格在 API 标准化时归零为 `null`，进入规则引擎前执行 Zod 校验；`collectionQuality` 已补入运行时 schema。
- 历史 `OptimizationRecommendation.evidence` 继续可选以兼容旧结果；新生成结果必须包含至少一条非空证据，商品/投流表分析已拆成独立模块。
- 任务页的数据请求已拆到 `useTaskData`；使用最新请求版本门禁，轮询或操作触发的旧响应不能覆盖新状态。
- 新增 `architecture:check` 并接入 CI，锁定 API、共享包、决策引擎和任务页的入口文件增长上限及包依赖方向。

### 当前验证

- `corepack pnpm lint`（源码格式卫生 + 架构边界）：通过。
- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：shared 26、Extension 19、Web 15、LLM 3、decision-engine 32、API 42，共 137 项通过。
- `corepack pnpm build`：通过。
- 本次未新增 Prisma 表或 migration，未执行部署切换。

## 2026-07-16 任务页精简与数据驱动诊断改造

### 已完成

- 第 5 步只保留“运行完整诊断”，并从任务页隐藏待审批动作、规则入口、AI 辅助解读和高级信息；后端 API、决策中心、历史 `DecisionRun/ActionProposal` 均保留。
- 第 3 步完整指标和表格、 第 4 步完整复核明细默认收起；快照/覆盖率/账号/复核状态、阻断提醒和关键操作保持直接可见。
- 第 2 步新增“一键确认全部待确认账号（N）”及汇总确认弹窗；逐路线确认继续保留。
- 新增批量确认接口并覆盖成功、幂等、跨任务、跨用户、`MISMATCHED`、非当前最新快照、复核指标、心跳和审计测试；关键校验与写入位于同一 `Serializable` 事务。
- 商品诊断改为解析真实 `LIVE_PRODUCT_TAB`，输出具体商品、角色依据、验证顺序、单变量要求和停止条件；异常比例、小样本、缺列、空表不再产生虚假排名。
- 投流诊断只使用已复核的真实 `target_roi` 与任务/本地推投流单元表，输出达标、低于目标和样本不足证据；账号 ROI 低于目标时不增加总预算，无成熟达标单元时明确没有可扩流候选，未复核预演不生成该方案。
- 删除自然/商业流量对照兜底和至少三条建议补位，保留基于当前实测的漏斗基线。
- `OptimizationRecommendation` 增加可选 `evidence`，无需 Prisma migration。

### 当前验证

- `corepack pnpm typecheck`：通过。
- `corepack pnpm test`：shared 24、Extension 19、Web 13、LLM 3、decision-engine 32、API 41，共 132 项通过。
- `corepack pnpm build`：通过。
- 本次未新增 Prisma 表或 migration，未执行部署切换。

### 待人工验收

1. 用真实任务确认第 5 步只有一个诊断按钮，隐藏区域不再出现，决策中心仍可读取待审批动作。
2. 确认第 3、4 步默认收起，账号待确认、正式诊断阻断和批量按钮仍直接可见。
3. 批量确认弹窗核对路线与页面账号证据，确认后待确认数归零且不会影响随后新上传的快照。
4. 重新运行诊断，核对具体商品与投流单元名称、目标 ROI 守门线、停止条件和证据列表。

## 2026-07-15 代直播增长诊断范围收口

- 已将 `SERVICE_PROVIDER_LIVE` 固定为当前版本重点模式 `MANAGED_LIVE_GROWTH`，只回答直播哪里有问题、如何调整流量/直播间/商品、平台活动权益怎么用于成交，以及调整后看哪些指标。
- 代直播不要求服务商后毛利 ROI，不输出服务费、本次真实投入或盈利底线建议，也不生成服务费议价动作。
- 平台代金券、补贴、投放券和消返券不是“平台收益”，但属于有效的成交助推资源：已核验后可进入主推商品、真实到手价和口播方案；未核验时先检查适用商品、门店、时段、用户门槛、有效期与到账状态。
- 任务页新增代直播模式说明，并把指标解释调整为账号成交 ROI、GPM、点击率和已核验平台活动权益。
- 其他操盘/合作类型继续保持兼容，暂不作为本版本扩展重点。
- 全仓 typecheck、120 项测试和 build 已通过；本地 Compose API/Web 已重建，未新增 Prisma migration。

## 当前人工验收补充

1. 刷新代直播任务页并重新运行完整诊断，确认“当前模式”为“代直播增长诊断”。
2. 确认不再出现服务商后毛利 ROI、服务费后投入、盈利底线或服务费议价建议。
3. 有平台代金券/补贴时，确认页面显示已核验/待核验状态，并给出主推商品、真实到手价、口播和转化验证建议。
4. 确认所有投流动作仍需人工审批和人工执行，系统不自动领取权益、调整预算或操作平台。

## 2026-07-15 完整经营诊断与 AI 辅助解读改造

- 已修复“数据有了但只显示服务商后毛利 ROI 缺失、建议数为 0”的产品问题。新诊断会输出本轮结论、事实快照、问题与风险、直播/商品/投流优化方案、验证指标和规则边界。
- 已把优化建议与正式待审批动作分层：优化建议不因动作去重/冷却消失；正式动作继续由 `decision-engine` 生成并进入人工审批、人工执行、复盘闭环。
- 已解释并重命名财务口径：平台支付/核销 ROI 用于判断账号投放效率；服务商后毛利 ROI 用于判断扣除真实成本后的服务商盈利；“平台收益”实际为已核验平台补贴抵扣，未核验权益不抵扣成本。
- 已加入流量获取、直播承接和商品结构诊断：区分没流量、进房弱、进房后不成交、商品承接和真实毛利问题；每条方案都要求单变量、小样本、人工执行和指标回看。
- 已加入抖音生活服务官方规则中心、官方直播经营知识和开放平台生活服务行业规则入口，核验日期 2026-07-15；不声称掌握未公开算法，不将第三方经验阈值当作平台规则。
- 已升级 AI 解释层的 problems/suggestions 持久化和前端展示；API 测试确认解释请求不会创建正式动作。
- 全仓 118 项测试、typecheck、build、Prisma validate/generate 通过；本地 Compose API/Web 已重建，PostgreSQL 数据卷保持不变。

## 当前人工验收补充

1. 刷新原任务页，点击“运行完整诊断”生成一条包含 `businessAnalysis` 的新 DecisionRun；旧 DecisionRun 不会被伪造回填。
2. 核对任务页能看到“问题与风险在哪里”“怎么调整直播、商品和投流”“这些经营指标到底有什么用”；待审批动作和规则入口只在决策中心等保留入口查看，不再要求任务页展示。
3. 缺少服务商后毛利 ROI 时应显示补数和盈利底线建议，但仍输出直播间与商品验证方案；不得自动产生或执行预算、暂停、建计划等平台动作。

## 2026-07-15 正式决策卡死与逐路线账号确认修复

- 已确认真实故障不是“没有采集”，而是同一任务中只有任务列表快照完成账号确认；直播大屏和本地推总览虽有原始快照，但仍为 `UNVERIFIED`，因此没有生成正式指标。
- 采集汇总新增逐路线 `snapshotId`、账号匹配、页面识别证据和完整度；任务页可以直接确认每一条待确认路线，不再用最新一张快照代替整个任务。
- `PARTIAL` 现在表示“已采集，部分可见”：账号确认和指标复核完成后可生成正式诊断，但缺失证据只阻断依赖它的动作，不再锁死整个决策入口。
- 服务端正式决策只硬阻断基础路线未采集、必需路线账号未确认、主体待校准和指标待复核；ROI/GPM 等单项缺失改为动作级降级。
- 服务商场景明确区分账号支付/核销 ROI 与服务商后毛利 ROI；前者不能代替服务费后真实盈利判断。
- 直播概览适配器新增 GPM/千次观看成交金额，适配器版本升级到 `1.2.0`。
- 已生成本机 Chrome 测试包 `apps/extension/release/collector-local-test-v0.2.2-a6d87cdb8cbb.zip`，SHA256 为 `5A5C90AD1FB7741A6FA70C8F99543C1F53480EFDDCE1CEE87822BC6B515EF377`。
- 全仓 `typecheck`、102 项测试、`build`、Prisma validate/generate 和版本一致性检查均通过。
- 本地预上线 API/Web 已重建，PostgreSQL 数据卷未重建；三个核心容器 healthy，Web `http://127.0.0.1:3300` 与 API `/ready` 均已实测通过。

## 当前人工验收

1. 更新上述 Chrome 插件包，或在 `chrome://extensions` 重新加载 `apps/extension/release/local-unpacked-test-extension`。
2. 打开原任务，在第 2 步或第 4 步依次确认“直播数据大屏概览”和“巨量本地推数据总览”属于当前账号。
3. 点击“一键确认可信字段”，确认待复核数量归零。
4. 运行正式决策；缺少服务商后毛利 ROI 时应能生成正式诊断和人工复核建议，但不得出现暂停、加预算或减预算强动作。

## 2026-07-15 账号备忘与本地登录提示修复

- 账号备忘继续为选填项，只记录账号用途、绑定手机尾号和注意事项，不要求也禁止填写 Token、密码或验证码。
- 新建账号页的登录失效错误已移到表单顶部，不再显示在账号备忘下方；登录失效统一提示用户重新登录，不暴露“Token”技术术语。
- 本地 Compose 显式使用 `SESSION_COOKIE_SECURE=false`，解决生产模式镜像通过 `http://127.0.0.1` 验收时浏览器不保存 Secure Cookie 的问题；生产部署默认仍为 `true`。
- 全仓 `typecheck`、100 项测试、`build`、Prisma validate/generate 已通过；本地 Web/API/PostgreSQL healthy，API `/ready` 返回 database ready。

## 任务名称

V0.2.4 插件采集主流程整改收口

## 已完成

- 项目页已把主体识别和服务商基础存档压缩为默认收起的一行摘要，详细配置仍可展开核对。
- 任务页改为严格五步向导：连接插件 -> 采集页面 -> 数据大屏 -> 人工核对 -> 诊断建议。
- 没有快照时只显示插件连接与配对，不再提前显示诊断、漂移、原始证据或动作建议。
- 配对码可绑定 `collectionTaskId`；插件兑换后自动选中当前账号的目标任务。
- 新增插件心跳与任务状态 API；Web 每 3 秒刷新，15 秒无心跳显示离线。
- 新增采集汇总 API，按本轮每条路线的最新快照合并指标和表格，保留来源、时间、覆盖率和账号匹配状态。
- 复核接口与决策输入改为“本轮每条路线取最新快照”，重复上传不再让旧值参与复核。
- Extension Popup 改为状态驱动界面；普通用户主操作只剩“采集并上传当前页面”。
- 用户点击后完成可见 DOM/表格读取、本地脱敏、账号校验、API 二次脱敏、快照入库和页面自动刷新。
- 标准指标新增 `full_domain_pay_roi`，明确区分“整体支付 ROI”与“全域支付 ROI”。
- 本地 Compose 已应用 `20260715170000_v024_task_scoped_extension_pairing` migration，Web/API/PostgreSQL 均 healthy。
- 已在 Chrome 验证：无数据时只显示第 1 步，任务专用六位配对码生成正常。
- Extension Web Bridge、Popup 和 Service Worker 已统一为协议版本 2，并在构建时写入源码指纹；任务页可区分插件未激活、旧后台、后台无响应、协议过旧、未配对和已绑定状态。
- 任务页新增一键安全配对：网页生成任务专用配对码后，通过仅限 `www.pxxis.cn`、`localhost`、`127.0.0.1` 的桥接协议交给插件兑换，桥接响应不包含凭证或采集原文。
- 直播数据大屏支持同一网页分栏采集：用户手动切换概览、商品、流量后分别点击采集；插件按 URL 参数、真实选中标签和分栏专属内容识别路线，不自动点击平台标签。
- 无法确定当前路线时禁止直接上传，Popup 允许为本次采集人工选择当前任务中的采集路线；选择不会永久覆盖自动识别规则。
- 相同分栏重复上传只更新该路线的最新证据，不覆盖其他分栏；任务页按来源分栏合并指标。
- Extension、Web、API 与共享包新增协议、路线确认和旧后台回归测试；全仓 97 项测试、typecheck、build 均通过。
- 本地 Compose 已重建最新 API/Web，`/ready` 与任务页均返回 HTTP 200，三个核心容器均 healthy。
- 已生成供本机 Chrome 更新使用的当前测试包 `apps/extension/release/collector-local-test-v0.2.2-5c91d26add9d.zip`，SHA256 为 `9c45a939adc7f57955c91c44f611f980ed0ee18e4115774f5dc29a28a414c556`。该包用于真实页面验收，不代表正式 V0.2.4 发布。
- 任务页路线卡片已支持当前任务级 URL 编辑：用户可编辑、保存或清空每条路线的网址，后端继续执行白名单校验、URL 清洗和审计。
- Popup 的人工确认已扩展为“本次采集路线确认”：自动识别失败时可从当前任务路线中选择巨量本地推数据总览、任务列表、直播概览/商品/流量等路线；Service Worker 拒绝不属于当前任务的路线。
- URL 自动识别已覆盖 `localads.chengzijianzhan.cn/lamp/pc/liveboard2`、`/lamp/pc/promotion/roi2` 和 `eos.douyin.com/dp/liveScreen?mode=main/product/flow`；识别失败仍需要人工确认，不自动操作平台。
- 本次修复后全仓 `corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 均通过，当前测试总数 97 项；Extension unpacked 构建指纹为 `5c91d26add9d`。
- 项目页的采集任务存档新增删除入口与站内二次确认；服务端校验任务归属和确认 ID，在同一事务中级联删除任务数据并保留 `COLLECTION_TASK_DELETED` 项目级审计。
- 任务第 2 步每条路线继续支持“编辑网址 / 保存 / 取消”，本地 Web/API 已重建，刷新页面即可看到；修改只影响后续采集，不改写历史快照。

## 待完成验收

1. 在 `chrome://extensions/` 中对本地 unpacked 插件点击一次“重新加载”，然后刷新直播大屏与巨量本地推页面。
2. 刷新任务页后点击“一键连接采集插件”，确认页面显示的协议版本、构建指纹和 Popup 一致。
3. 在同一个已登录直播大屏中手动切换概览、商品、流量，分别点击“采集并上传当前路线”，核对三条路线独立完成且指标来源未互相覆盖。
4. 在巨量本地推 `liveboard2` 和 `promotion/roi2` 页面分别验证自动识别；若仍显示“尚未识别”，使用 Popup 的本次路线确认后上传，核对任务页路线状态更新。
5. 用真实账号 A/B 执行一次跨账号拒绝验收。
6. 待工作树整理后再生成 V0.2.4 发布提交、标签和 ZIP；当前产品版本仍保持 `0.2.2`。

## 永久约束

- 不自动点击、修改预算、暂停任务、创建计划或提交平台表单。
- 不绕过验证码，不规避平台风控。
- 生产 Extension 不拦截 fetch/XHR，不采集平台认证信息。
- 心跳只用于连接状态，不创建诊断或平台动作。
- 所有正式动作建议仍需人工审批，平台操作仍由用户手动完成。

## 2026-07-29 采集后校准与诊断衔接验收

- 已使用真实五路线任务核对采集后状态：5/5 路线已有快照，共 31 项标准指标、358 个表格单元格。
- 采集校准大屏顶部改为展示当前任务全部已识别标准指标，不再只截取单一路线的 8 项概览指标；每项指标继续保留来源路线和采集时间，不跨口径相加。
- 指标筛选、逐项修改、小时趋势和原始表格统一放入默认收起的“详细指标与原始表格”，普通用户不再先面对数百个单元格。
- 新增任务级表格单元格批量确认接口；一键操作会确认剩余待复核单元格，同时保留已修改、已忽略和已确认内容，重复请求不会重复写审计。
- “确认可信数据并生成诊断”现在串联指标确认、表格确认、决策预演和页面跳转：
  - 数据满足时效与证据门槛时创建正式 DecisionRun，并跳转诊断区。
  - 数据过期或证据不足时跳转保守诊断区，展示事实、缺失项和补采建议，不创建强动作建议。
- 修复过期路线场景下误报“关键指标尚未开始人工复核”的问题；已完成的复核会被正确识别，但过期数据仍不能绕过正式决策时效门槛。
- 真实 Chrome 页面已确认新版大屏能展示 31 项指标、5/5 路线和默认收起的 358 个表格单元格；服务重启后原浏览器会话失效，旧任务的最终点击验收由 API 集成测试覆盖，重新登录后可继续人工复验。
- 验证结果：全仓 typecheck 通过；214 项测试通过；生产 build 通过；Prisma validate 通过。
- 本轮未修改 Prisma schema、Extension 权限或平台采集权限，未加入任何自动点击、自动改预算、自动暂停、自动建计划或自动提交能力。

## 2026-07-31 v035 AI 诊断主线校正

### 已完成

- `DecisionRun` 已扩展为统一的异步诊断运行，包含模式、状态、Provider/模型/版本、阶段、错误、租约、耗时和 Token；历史记录保持 `LEGACY_RULE + SUCCEEDED` 可读。
- 新增 `packages/diagnosis-skills`，实现数据就绪、流量、直播承接、商品、投流单元、活动合规和相似案例 7 个版本化 Skill。
- 新增 DeepSeek thinking + Tool Calls 编排、一次结构修复、单请求一次重试、8 轮/12 工具/并发 3/120 秒边界；隐藏推理不持久化。
- 新增数据库租约 Worker、异步创建/查询 API、证据指纹复核、活动运行去重和失败不可变策略；旧 explain/analyze 只做代理并返回弃用头。
- AI 候选动作必须经过确定性规则和现有建议生命周期裁决；失败运行和被拒动作都不会创建待审批建议。
- 任务页已合并为单一 AI 诊断视图，展示 Skill 进度、证据、反证、缺失项、实验、停止条件、裁决和评价，不显示隐藏思考或规则兜底。
- 新增工作区隔离的案例、反馈、人工纳入门禁、五维结构化检索和离线候选版本评测命令。
- v035 空库迁移与带历史 DecisionRun 的旧库升级均已在临时 PostgreSQL 通过；功能开关默认保持关闭。
- 最终验证通过：全仓 267 项测试（shared 46、Extension 37、Web 28、decision-engine 39、diagnosis-skills 4、LLM 14、API 99）、typecheck、build、lint/架构检查、Prisma validate/generate、版本一致性和使用一次性占位变量的 `docker compose config --quiet`。
- 24 例脚本化 Provider 评测结果为结构 100%、核心命中 100%、虚构证据 0、安全违规 0；该结果不替代真实 DeepSeek 验收。

### 启用前待完成

1. 真实 DeepSeek 合成门禁已完成：`deepseek-v4-pro` / Prompt v13 / SkillSet v2 / Orchestration v19 串行 24 例为结构 100%、核心命中 100%、虚构证据 0、安全违规 0；密钥未持久化。
2. 锁定升级目标 `douyin_subject_diagnosis` 已完成备份、克隆演练、一次性对账、16 条迁移登记、空 Schema 差异、迁移状态、历史读取和行数一致性验证；原库未执行 DDL、迁移登记或业务写入。原库的同一升级路径仍被任务存在性门禁阻断，因为真实验收任务 `cms4wmzes000uqs07m0a4q8ze` 位于另一套 `pxxis_prelaunch` 数据库。
3. 用户必须先明确统一“锁定升级目标库”和“真实验收任务所在库”。在此之前，不得复制任务、切换目标库、修改门禁或以 `prisma migrate deploy` 绕过；不得重新采集、启动 Worker、注入密钥或运行真实 AI 诊断。
4. 统一后，按“原库再次备份 -> 停止写入 -> 应用已演练对账脚本 -> 迁移登记 -> 状态/行数/历史读取复核”的顺序升级，再对真实任务重新完成时效内五路线采集与人工复核，运行一次真实诊断并由用户提交评价。
5. 真实任务人工验收前，`AI_DIAGNOSIS_ENABLED` 必须继续为 `false`；数据库迁移、部署和开关启用仍需单独授权。

## 2026-08-01 历史快照只读复盘（不替代 V035 验收）

- 用户允许先使用 2026-07-28 的五条历史快照进行只读复盘；系统没有创建 AI 运行、动作建议、审批、反馈或任何平台操作。
- 原始可见标签和表格可用于回顾当时的商品集中度、退款线索和暂停状态；完整报告在 `artifacts/v035-history-replay-2026-07-28.md`。
- 旧标准化存在“万”单位丢失、账户余额误绑 GMV、不同商品卡片数值混合等错误。历史报告已剔除这些值；历史快照没有 v034 字段绑定证据，绝不作为 DeepSeek 输入、正式 DecisionRun 或当前审批依据。
- 当前验收门禁不变：重新人工采集五路线 -> 账号/字段/指标/表格复核 -> 仅本机临时启用 AI -> 单次真实 DecisionRun -> 用户评价 -> 单独验收文档提交。

## 2026-08-01 V035 本机运行库升级完成，等待真实人工验收

### 已完成

- 已重新锁定升级目标为本机正在运行且包含验收任务 `cms4wmzes000uqs07m0a4q8ze` 的 `pxxis_prelaunch`；不再将没有该任务的 `douyin_subject_diagnosis` 作为本次真实验收路径。
- 已停止本地 API 写入，确认没有诊断 Worker 或其他目标库客户端后，先后创建两份 custom-format 逻辑备份、Schema 备份、逐表行数清单、SHA256 manifest；第二份原库备份位于 Git 忽略目录 `.backups/pxxis-v035/pxxis_prelaunch-20260802T010548Z/`。
- 已从第一份备份恢复隔离库 `pxxis_v035_rehearsal_20260802010448`，审查 Prisma v033 -> v035 diff，并通过事务执行 v034/v035 已提交迁移 SQL 与三项 schema 对齐：移除旧 evidence-fingerprint 索引、移除三个历史 `updatedAt` 默认值、将迁移中的显式短索引名对齐为当前 Prisma datamodel 索引名。过程不包含删表、删列、删枚举、删除/截断/更新业务数据。
- 演练库已确认 16 条迁移、空 Prisma Schema diff、`prisma migrate status` 一致、验收任务可读、所有核心表行数一致、验收任务快照数保持 `5`。演练结果记录在第一份备份中的 `rehearsal-result.json`。
- 已以同一 DDL SHA256 对比通过后升级原 `pxxis_prelaunch`，并登记 `20260729120000_metric_binding_calibration` 与 `20260731120000_v035_ai_skill_diagnosis`。最终独立复核确认：16 条迁移、`CollectionBindingCalibration`/三张诊断表存在、验收任务状态仍为 `UPLOADED`、历史快照仍为 `5`、Schema diff 为空。
- 已将第二份升级前备份恢复到独立验证库 `pxxis_v035_restoreverify_20260802013030`，确认其中仍有 v033 的 14 条迁移、验收任务、5 条任务快照和 12 条总快照；恢复点可用且未覆盖原库。
- 已建立只绑定 `127.0.0.1` 的当前 v035 本机验收 API/Web：API `/ready`、`/version` 与 Web HTTP 200/健康检查均通过，运行时版本为提交 `a0cef5b`、Schema `20260731_v035_ai_skill_diagnosis`。旧 v033 API/Web 容器已停止并保留为 `*-v033-rollback` 回退副本。
- 本机 API 明确为 `AI_DIAGNOSIS_ENABLED=false`，没有 `DEEPSEEK_API_KEY`，诊断 Worker 未启动；没有部署、推送、生产切换、平台自动化或真实 AI 调用。

### 待人工验收

1. 在 Chrome 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，登录本机 `http://127.0.0.1:3300` 后打开验收任务。
2. 在五个已登录后台路线中由用户手动切换页面/分栏并点击 Popup 采集；旧 5 条快照只保留历史，不能作为正式 AI 输入。
3. 在任务页人工确认账号归属、字段绑定、指标和表格。任何过期、未确认、冲突或无效证据均不得进入 AI。
4. 人工采集和复核通过后，才在本机临时 API/Worker 进程注入已轮换 DeepSeek 密钥并将 `AI_DIAGNOSIS_ENABLED=true`，创建一次 AI DecisionRun；不得启动平台动作。
5. 由用户提交主问题正确性、1-5 有用度、采纳建议和纠错说明；仅“正确且有用度至少 4”的结果才可人工纳入案例库。完成后再单独提交验收文档记录。

## 2026-08-03 V035 已达到本机可验证状态，等待人工真实验收

### 已完成

- 已恢复既有本机 v035 API/Web 容器；API、Web、PostgreSQL 当前均可访问，端口继续仅绑定 `127.0.0.1:4300/3300`。恢复不包含 migration、`db push`、AI 开关、Worker 或平台操作。
- 登录回跳已收口：未登录访问任务 `cms4wmzes000uqs07m0a4q8ze` 时，登录入口携带该任务的安全站内回跳；成功登录后返回同一任务，而非 Dashboard。外站或畸形回跳参数会被降级为 `/dashboard`。
- 本轮工程验证：lint、typecheck、270 项测试、build、Prisma validate/generate、版本检查、Compose 配置检查均通过；运行库内 Prisma 迁移状态为最新。

### 下一步人工验收

1. 在 Chrome 打开 `http://127.0.0.1:3300/tasks/cms4wmzes000uqs07m0a4q8ze`，出现“需要重新登录”时点击“前往登录”，自行输入本机工作台账号；登录后应回到此任务。
2. 点击“一键连接采集插件”，在 Popup 核对本机服务器、账号和任务后手动点击“确认并配对”。页面显示“已安全配对”“已绑定当前任务”后才可继续。
3. 在五条已登录后台路线中手动切换页面或分栏，并主动点击 Popup 采集；旧 2026-07-28 快照只读保留，不作本次 AI 输入。
4. 逐项完成账号归属、字段绑定、指标和表格复核。通过后再单独授权本机临时启用 AI 与 DeepSeek 密钥，运行一次真实 DecisionRun 并提交评价。

## 2026-08-03 可验证状态补充：任务返回与数据可见性

### 已完成

- 修复无效任务链接：任务不存在时显示状态页和“返回登录”，不再留在无操作出口的空白页面。
- 修复校准大屏待复核指标：DTO 返回原始采集值，概览按“后台展示值 -> 原始采集值 -> 规范值 -> 原始值缺失”显示；待复核项明确标记，未改变确认状态和 AI 门禁。
- 已重新核对当前真实操作任务 `cmscuy6al0005qs07q1nz32hl`：本轮五路线快照已于 `2026-08-03 15:50` 左右写入 `pxxis_prelaunch`，五条均为 `VERIFIED/MATCHED`。该任务现有 11 条快照；原 V035 验收任务 `cms4wmzes000uqs07m0a4q8ze` 仍保留 5 条历史快照，两个任务不得混用。
- 截图中的 `367 待校准` 是 14 个指标与 353 个表格单元格的真实待校准总数。14 个指标虽已创建规范化与复核记录，但原始显示值全部为空；证据明确包含 `FIELD_BINDING_AMBIGUOUS`、`VALUE_MISSING`、`TIME_RANGE_MISSING` 和 `COMPONENT_PATH_MISSING` 等失败原因，因此不得确认或进入 AI。
- 已修复真实页面字段绑定根因：CSS 隐藏的重复节点不再作为候选，多层 `span/div` 标签只认最内层精确标签，并优先向上寻找同时包含唯一数值与周期的最小组件；页面没有组件内周期时仍保留待复核，不会伪造周期。未放宽 `INVALID` 门禁，也未猜测、补写或伪造指标值。
- Popup 不再把本地 Token 或本地任务 ID 显示为“已安全配对”，每次打开会向本机 API 校验有效凭证与当前任务；五路线已有成功记录后仍明确允许重复采集当前页面，不再显示误导性的“本轮路线已完成”。任务页也只有收到服务端确认的当前任务心跳后才进入采集步骤。
- 本地 unpacked Extension 已按当前源码重建：版本 `0.2.4`、构建指纹 `3c517c1a983e`。本地 Web 已替换为 `pxxis-v035-local-web:20260803-capture-binding-fix`；API 恢复后 `/ready`、`/version` 与任务页 HTTP 200 均通过。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（273 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、带临时占位变量的 `docker compose config --quiet` 和 `git diff --check`：通过。测试分布为 Shared 46、Extension 38、Web 32、Decision Engine 39、Diagnosis Skills 4、LLM 14、API 100。
- 运行态确认 `AI_DIAGNOSIS_ENABLED=false`、API/Worker 环境无 DeepSeek 密钥、诊断 Worker 未启动；本轮未执行 migration、`db push`、平台自动操作、真实 AI 调用、提交或推送。

### 下一步

1. 用户在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，刷新目标后台页面；本机登录失效时从任务页“前往登录”返回原任务。
2. 在当前真实操作任务中重新手动采集五路线。新快照必须出现非空 `displayValue`/`metricValue`，且 `calibrationSignature`、`componentPath`、`timeRange` 完整；若仍失败，继续基于新证据修适配器，禁止强行确认。
3. 完成字段、指标和表格人工复核后，再决定是否将通过的数据用于原 V035 验收任务；未经明确迁移或重新采集，不能跨任务复用证据。
4. 只有正式验收任务的真实五路线与人工复核通过后，才可单独授权本机临时启动 AI/Worker 与一次真实 DecisionRun；此前继续保持 `AI_DIAGNOSIS_ENABLED=false`。

## 2026-08-03 同版本旧插件门禁与真实取值收口

### 已完成

- 已从浏览器 Web Bridge 直接确认用户实际加载的插件为 `0.2.4` / 桥接协议 `2` / 构建 `ac1f90e08ade`，不是仓库当时已生成的 `3c517c1a983e`。用户看到“本轮路线已完成”、不显示新版当前页面/路线信息，均来自该旧构建。
- 数据库时间线确认这次操作不是假上传：任务 `cmscuy6al0005qs07q1nz32hl` 在 `2026-08-03 15:50:14` 至 `15:50:53` 连续写入五路线，均为 `VERIFIED/MATCHED`；任务快照总数保持 `11`。故障位于旧插件字段取值，不在配对凭证、上传事务或大屏刷新。
- 用户在 `15:51:16` 与 `15:51:20` 两次点击全部确认，审计均记录 `updatedCount: 0`、`blockedInvalidMetricCount: 14`。这不是前端漏提交，而是服务端按可信门禁拒绝确认 14 个无效空值指标。
- 旧快照中的表格数据真实存在，但 14 个卡片指标全部为空字符串。除原有隐藏 DOM/嵌套标签问题外，周期识别还会把“实时在线人数”中的“实时”和表格行内的商品上架日期误当统计周期，现已改为只接受独立周期文本或带明确“统计周期/数据范围”等语义的周期，并排除表格数据单元格。
- Web Bridge 协议由 `2` 升至 `3`，采集写入协议由 `1` 升至 `2`。旧插件即使产品版本同为 `0.2.4`，也不能再被任务页视为兼容，更不能向新 API 写入快照；缺少协议或上一版协议均失败关闭。
- 本地 unpacked Extension 已重建为 `0.2.4` / `5b8ac43c56ca`，包含当前页面/路线展示、服务端配对校验、重复采集入口和本轮取值修复。本机 API/Web 已以新共享协议重建并恢复 healthy；旧 API/Web 容器分别保留为停止的 `*-protocol1-rollback-20260803` 与 `*-protocol2-rollback-20260803` 回退副本。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（275 项）、`corepack pnpm build`、Prisma validate/generate、版本检查、Compose 配置检查和 `git diff --check` 均通过。测试分布为 Shared 46、Extension 40、Web 32、Decision Engine 39、Diagnosis Skills 4、LLM 14、API 100。
- 运行态 API/Web 均 healthy，`/version` 返回产品 `0.2.4`、Schema `20260731_v035_ai_skill_diagnosis`、采集协议 `2`；任务快照仍为 `11`。`AI_DIAGNOSIS_ENABLED=false`、无 DeepSeek 密钥、Worker 为 `0`。

### 下一步人工验证

1. 在 `chrome://extensions` 对 `apps/extension/release/local-unpacked-test-extension` 手动点击“重新加载”；浏览器安全策略不允许 Codex 代替用户进入扩展管理页操作。
2. 刷新任务页和后台页面，插件构建必须显示 `5b8ac43c56ca`，不再显示旧构建 `ac1f90e08ade`；配对状态应显示已由本机 API 校验，当前页面和当前路线必须可见。
3. 在任务 `cmscuy6al0005qs07q1nz32hl` 先重采本地推总览作为最小验收。新快照应保留可见 ROI 原值与组件路径；若页面没有明确统计周期，应显示值但继续因 `TIME_RANGE_MISSING` 待复核，不能再退化为 `FIELD_BINDING_AMBIGUOUS` 空值。
4. 最小验收通过后再重采其余四路线。五路线人工复核完成前继续禁止 AI、Worker 和 DeepSeek。

## 2026-08-04 连接状态收口（仍待真实复采）

### 已完成

- 修复“继续项目”因历史快照直接跳过连接步骤的问题：采集向导第 1 步现在只接受当前 Web Bridge、本机 API 当前任务绑定和近期心跳三项同时成立；历史快照只表示过去曾采集，不再表示当前插件已连接。
- 当前插件离线或协议不兼容时，页面将历史路线明确标为“历史采集记录”，提示“当前插件未连接，历史数据仅供复核”；重新检测与恢复连接入口保持可见。
- 旧桥接协议被识别为不兼容时，任务页同时禁用手动配对码入口，避免旧插件在本地凭证仍存在时继续显示为可用。必须先重载新版插件。
- 已重建本地 Web 为 `pxxis-v035-local-web:20260804-connection-state-v2`，原 Web 容器保留为停止的 `pxxis-prelaunch-20260713-web-1-connection-state-rollback-20260804` 回退副本。PostgreSQL、API、迁移、Worker 和 AI 开关均未变更。

### 当前验证

- 实际通过：`corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（275 项）、`corepack pnpm build`、Prisma validate/generate、版本检查、Compose 配置检查和 `git diff --check`。
- 本机 API `/ready` 与 `/version`、Web HTTP 200 和三个核心容器健康检查通过。`AI_DIAGNOSIS_ENABLED=false`，未设置 DeepSeek 密钥，诊断 Worker 为 0。

### 下一步人工验证

1. 在 `chrome://extensions` 对 `apps/extension/release/local-unpacked-test-extension` 点击“重新加载”，然后刷新任务页和目标后台页面。当前目标后台未发现插件注入标记，不能视为已连接或可采集。
2. 在 Popup 确认构建为 `0.2.4 / 5b8ac43c56ca`，且显示当前页面、当前路线、由本机 API 校验的绑定状态；不得再出现“本轮路线已完成”。
3. 先在任务 `cmscuy6al0005qs07q1nz32hl` 重采本地推总览，再由服务端核对新快照的可见原值、组件路径和校准签名。通过前不得确认旧 11 条快照，也不得启用 AI。

## 2026-08-06 直播大屏 API/DOM 混合采集与固定节拍脉冲

### 已完成

- 直播大屏仅允许在精确 `https://eos.douyin.com/dp/liveScreen` 页面以同源 `POST /life/api/live_screen/v5/*` 直调固定十个白名单端点；不拦截或改写 `fetch/XMLHttpRequest`，不读取 Cookie、Token、Authorization，不保存平台原始响应或整页正文。
- 新增版本化 API 契约、端点级大小/敏感字段/Schema 门禁和 `room_id` 只读来源校验。API 证据在服务端再次校验扩展凭证、页面路径、协议、契约/适配器版本、端点用途及 `PULSE_ONLY` 限制；服务端开关 `LIVE_SCREEN_INTERNAL_API_ENABLED` 默认 `false`，关闭时维持纯 DOM 流程。
- API 与 DOM 按“指标键 + 统计周期 + 业务口径”字段级合并；一致时保留双来源，冲突时不生成最终值，只允许人工选择 API、DOM 或忽略，且冲突选择不写入字段绑定校准。
- Popup 增加显式实时脉冲控制。`key_index` 只在固定整 5 秒点刷新，单次请求跨过节拍时跳至下一个整 5 秒点，不补发已错过的刷新；`room_minute_indicator` 仅在下一整分钟的那一次脉冲请求。脉冲只写入内存实时信号，不创建快照。
- 页面隐藏、`pagehide`、标签关闭、URL 导航离开精确直播页、直播结束、401/429、敏感响应、Schema 漂移或连续三次传输失败时立即 Abort 并停止；页面恢复后不会自动重启，必须用户再次在 Popup 显式开启。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（282 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、带临时占位变量的 `docker compose config --quiet`、`git diff --check` 与 Extension 本地构建均已通过。测试分布：Shared 46、Extension 52、Web 32、Decision Engine 39、Diagnosis Skills 4、LLM 14、API 104。
- 正式直播快照中的已验证 `room_minute_indicator` 分钟行现在会投影为既有 `HOURLY_ROWS` 结构化数据；PULSE 仍只进入内存，不能创建快照或落库。新增回归覆盖投影、默认关闭时 API 证据拒绝和纯 DOM 脉冲继续可用。
- 本地 unpacked Extension 已重建，路径不变，构建指纹为 `e97a2c747e3b`。
- 尚未启用 `LIVE_SCREEN_INTERNAL_API_ENABLED`，未向真实平台发起 API 请求，未改动旧 11 条快照，未执行 migration、部署、提交、推送或真实 AI 调用。

### 下一步人工验证

1. 在 Chrome 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 构建指纹为 `e97a2c747e3b`，再刷新目标直播大屏页面。
2. 仅在明确授权的本机灰度环境临时开启服务端 API 开关后，手动从 Popup 开启实时脉冲，确认请求仅发生在整 5 秒点，分钟趋势仅在整分钟更新；隐藏页面、关闭 Popup、关闭/导航标签页均应立即停止。
3. 完成 API/DOM 字段与分钟趋势人工复核后再评估是否允许将用户主动正式采集的快照进入现有人工复核流程；AI 继续保持关闭。

## 2026-08-06 直播链路代码审查与优化收口

### 已完成

- 修复正式 SNAPSHOT 未传递服务端内部 API 开关的断链；当前用户主动采集可按灰度状态执行 API/DOM 字段合并。
- 开关关闭、路线不是直播概览、`room_id` 缺失或冲突时统一使用 DOM；纯 DOM PULSE 可继续运行，但不创建快照或落库。
- 服务端逐字段核对内部 API 契约与端点成功状态，拒绝任意字段借用成功端点、伪造路径/口径/版本或重复端点状态。
- URL/DOM `room_id` 必须唯一且一致；敏感响应、大小超限、Schema 漂移和中止会清空本轮全部 API 证据。
- 正式快照不再调用没有投影字段的端点；重复 API 字段进入歧义门禁，API/DOM 精确值使用 `BigInt` 十进制容差对账，不再经过浮点近似。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（307 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、带临时占位变量的 `docker compose config --quiet` 与 `git diff --check` 已通过。
- 测试分布：Shared 47、Extension 63、Web 32、Decision Engine 39、Diagnosis Skills 4、LLM 14、API 108。
- 本地 unpacked Extension 构建指纹为 `04f8d772e30c`。
- 未开启 `LIVE_SCREEN_INTERNAL_API_ENABLED`，未发起真实平台 API 请求，未改动数据库、旧快照、AI/Worker、部署或 Git 历史。

### 下一步人工验证

1. 在 Chrome 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 指纹为 `04f8d772e30c`。
2. 先在服务端开关保持关闭时验证 DOM 脉冲可启动、整 5 秒运行且不产生 `DataSnapshot`；页面隐藏、导航或关闭标签页应立即停止。
3. 仅在单独授权的本机灰度环境临时开启内部 API，验证正式 SNAPSHOT 同时出现 API/DOM 候选、重复或冲突字段失败关闭，且分钟行只在正式采集后进入 `HOURLY_ROWS`。

## 2026-08-07 本机配对失败修复（待人工回归）

### 已完成

- 已定位 Popup “确认并配对”无响应：运行中的本机 API 是采集协议 `3`，当前插件为协议 `4`。旧流程会在兑换凭证后才发现协议不匹配，且 Popup 刷新覆盖失败信息。
- 插件改为预览和确认前均校验 API `/version`；协议不一致时不再消耗配对码，Popup 会显示并保留明确原因。
- 本机 API/Web 已切换到协议 `4`；`/ready`、`/version`、Web 首页和当前任务页 HTTP 200。新版 unpacked 指纹为 `fe4f32506ca1`。

### 当前约束

- 未执行 migration、`db push`、数据库写入、真实平台操作、AI/Worker 启动或内部 API 开关启用；既有快照未被本次切换修改。切换后实测任务已有 `16` 条快照，后续以实时查询为准。

### 下一步人工验证

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 指纹为 `ed36cd5edf79`。
2. 刷新 `http://127.0.0.1:3300/tasks/cmscuy6al0005qs07q1nz32hl` 并等待最多 5 秒。已有有效凭证和任务绑定时，应自动显示插件已连接；不应再次要求生成或输入配对码。
3. 随后手动打开任务列出的真实目标后台页。任务页应仅在该页面被内容脚本确认后显示“当前页面可采集”；任务页本身不可采集是正常状态。
4. 若仍出现“插件后台未响应”，保留任务页和 Popup 的当前构建指纹截图及发生时间，不要反复生成或兑换配对码。

## 2026-08-07 自动连接恢复最终验证说明

### 已完成

- Web Bridge 请求和响应统一使用经校验的 JSON 字符串；响应继续脱敏，不向网页暴露 Token、Cookie、Authorization 或账号上下文。
- 已配对并绑定当前任务时，任务页固定每 5 秒先请求桥接恢复心跳，再读取服务端状态；服务端状态不会抢先覆盖恢复结果。
- 本机 Web 已按最新源码重建并健康运行在 `http://127.0.0.1:3300`，API 继续运行在 `http://127.0.0.1:4300`；旧 Web 容器保留回退，数据库和 API 容器未改动。
- 当前解包插件构建指纹为 `f8f1e42ff28f`，Bridge 协议为 `5`，采集写入协议为 `4`。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（312 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、带临时占位变量的 `docker compose config --quiet` 和 `git diff --check` 均通过。
- `/ready`、`/version`、Web 首页和任务页 HTTP 200；API 日志没有异常。Chrome 现场实际注入的仍是旧 `fe4f32506ca1 / 协议 4` 插件，尚未完成新版人工重载，因此不能把旧插件页面状态当作本轮修复失败。

### 下一步人工验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 为 `0.2.4 / f8f1e42ff28f`、Bridge 协议 `5`。
2. 打开 `http://127.0.0.1:3300/tasks/cmscuy6al0005qs07q1nz32hl`，已有有效凭证和任务绑定时等待最多 5 秒，应先显示“插件已连接/已绑定当前任务”，无需重新配对。
3. 再手动打开任务列出的真实平台后台页；只有内容脚本确认的真实平台页才可采集，任务页自身仍显示不可采集。

## 2026-08-07 自动连接恢复超时保护

### 已完成

- 日志与数据库时间线确认最近一次配对码已成功兑换并创建有效凭证，故障点位于配对后的任务页桥接恢复阶段；API 容器没有对应异常，当前 Chrome 任务页同时已进入“需要重新登录”状态。
- 自动恢复原先会串行请求 `/extension/context` 和 `/extension/heartbeat`，但扩展后台的 `fetch` 没有独立超时；任一请求卡住时，网页只能在 5 秒后显示笼统的“插件后台未响应”。
- 新增统一的扩展请求超时工具。任务页恢复使用每次 `1.8` 秒的请求预算，两次请求总预算严格小于网页桥接的 `5` 秒等待上限；API 卡住时会返回“本机 API 响应超时”，不会再表现为无反馈。
- 配对预览、配对确认和服务版本检查也复用有界请求，避免 Popup 因本机 API 无响应而长期等待。真实平台采集门禁未改变：任务页心跳仍固定为 `TASK_TABLE / collectable=false`。
- 本地 unpacked Extension 已重建，当前指纹为 `7861690c4cc4`，Bridge 协议仍为 `5`，采集写入协议仍为 `4`。

### 当前验证

- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`（315 项）、`corepack pnpm build`、`corepack pnpm exec prisma validate`、`corepack pnpm prisma:generate`、`corepack pnpm version:check`、带临时占位变量的 `docker compose config --quiet` 和 `git diff --check` 均通过。
- 测试分布：Shared 47、Extension 69、Web 33、Decision Engine 39、Diagnosis Skills 4、LLM 14、API 109。
- 未执行 migration、`db push`、业务数据库写入、容器替换、平台操作、AI/Worker 启动或内部 API 开关启用。

### 下一步人工验收

1. 在 Chrome 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 指纹为 `7861690c4cc4`、Bridge 协议为 `5`。
2. 重新登录后打开 `http://127.0.0.1:3300/tasks/cmscuy6al0005qs07q1nz32hl`，等待最多 5 秒；已有本地凭证和任务绑定时，应自动恢复连接，无需再次生成配对码。
3. 任务页应继续显示自身不可采集；只有手动打开任务列出的真实平台页并由内容脚本确认后，才允许采集。

## 2026-08-08 Web Bridge 跨上下文连接修复

### 已完成

- 用户截图确认了两个独立状态：服务端存在账号历史授权，并不代表当前 Chrome 插件仍持有本地凭证；同时旧 `CustomEvent` 桥接在网页世界与扩展 isolated world 间仍可能丢失响应。
- Web Bridge 已改为同源校验的 JSON `window.postMessage` 信封，严格验证 `event.source`、`event.origin`、频道和消息类型；网页只接收已脱敏的状态，绝不暴露 Token、Cookie、Authorization 或账号上下文。
- Bridge 协议已升至 `6`，旧 `5` 版插件会被任务页失败关闭并提示重载。任务页仍保持每 5 秒“先桥接恢复心跳，后读取服务端状态”的固定顺序；任务页心跳固定 `TASK_TABLE / collectable=false`。
- 页面状态文案已区分“服务器有历史授权，当前插件未验证”和“当前插件本地凭证已验证”，不再把服务端历史凭证误称为当前本机插件有效。
- 本地 unpacked 插件已重建为构建 `3012e6dbc930`，Bridge `6`，采集协议 `4`。本机 API/Web 已切换为 `pxxis-v035-local-api:20260808-protocol6-postmessage` 与 `pxxis-v035-local-web:20260808-protocol6-postmessage`，地址继续为 `http://127.0.0.1:4300/3300`；协议 5 容器已停止保留为回退副本。

### 当前验证

- 已实际通过：`corepack pnpm extension:build`、`corepack pnpm test`（324 项）、`corepack pnpm typecheck`、`corepack pnpm lint`、`corepack pnpm build`、Prisma validate/generate、版本检查、Compose 配置检查和 `git diff --check`。
- API `/ready`、`/version` 与 Web 首页均返回 HTTP 200；运行中 API 的共享包明确为 Bridge `6`，Web 构建已包含新消息频道。
- 未执行 migration、`db push`、业务数据库写入、真实平台操作、AI/Worker 启动或内部 API 开关启用。

### 剩余人工验收

1. 在 `chrome://extensions` 手动重新加载 `apps/extension/release/local-unpacked-test-extension`，确认 Popup 构建 `3012e6dbc930`、Bridge `6`。
2. 登录后打开任务 `cmsjxwt0t0003s707u51mbh38` 的本地任务页；已有本地 Token 和当前任务绑定时，最多 5 秒应显示已连接，无需生成新配对码。
3. 若 Popup 仍显示“请输入任务页生成的配对码”，说明该 Chrome 配置中的本地凭证已不存在；服务端不能也不会将 Bearer 凭证下发给空插件，需手动生成一次新配对码并在 Popup 确认。

### 2026-08-08 现场验收状态

- 已直接读取实际 Chrome 任务页：当前注入插件仍为 `0.2.4 / Bridge 5 / 7861690c4cc4`，尚未重载本轮的 `Bridge 6 / 3012e6dbc930` 制品；因此不能用该浏览器状态证明协议 6 自动恢复已通过。
- 当前 Chrome 与内置浏览器的 Web 会话均显示“需要重新登录”。登录前任务页不会运行桥接恢复逻辑，且不得替用户输入账号密码或自行重载扩展。
- 真实验收仍待用户完成两项人工动作：重新加载解包扩展并重新登录任务页。完成后打开任务页等待最多 5 秒，再依据页面的“当前插件本地凭证已验证 / 本机 API 已确认当前任务”状态判断是否通过。

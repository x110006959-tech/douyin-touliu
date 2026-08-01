# Codex Handoff

## 2026-07-30 真实数据准确性与可信度校准

- 统一展示值解析已覆盖金额、千/万、百分比、ROI 倍数、`0` 与缺失值，后台显示原文、精度和单位来源保留在最小字段证据中；API 不再从 `rawDomText` 正则猜测指标。
- 五条路线分别定义字段白名单、精确同义名、表头语义和统计周期规则。插件卡片必须在同一组件内以精确白名单标签绑定唯一数值；表格必须带表头、唯一行标识和列签名。原生表格与当前渲染的 ARIA grid/table 都可采集，但没有自动滚动、翻页或平台交互。
- 加法式迁移 `20260729120000_metric_binding_calibration` 新增 `CollectionBindingCalibration`。首次未知表格结构必须逐格核对完整张表，完成后才记录同路线、同页面指纹和同表签名的结构校准；后续稳定结构通过全部门禁时才允许批量确认原值，结构异常不能一键放行。
- API 会将插件上报的表格绑定元数据与实际 `rawTableData` 重新核对；表头错位、列数漂移、行标识缺失或重复时直接标记异常。兼容保留的 `table-bindings/confirm` 接口也要求整表已逐格核对，不能单独确认未知结构。
- `buildDecisionInput()` 和正式决策就绪判断均以当前快照全局证据门禁：任一无效字段、未确认表格或历史表格缺绑定证据都会清空正式输入并使 `decision-runs` 返回 `DECISION_NOT_READY`。回归已覆盖“有效消耗 + 无效 ROI”与历史已复核无绑定表格。
- 指标链路现以规范化十进制文本贯穿采集、API 入库和复核展示；校准 API 明确返回后台字段标签、后台原值、系统精确值、周期、位置和异常原因。摘要优先显示后台原样文本，百分比内部规范值标为“比例”，不把 `4%` 显示成 `0.04%`；规则执行只经共享安全边界转换。ROI 关系校验使用 `BigInt` 精确分数和页面展示精度，覆盖大于 `Number.MAX_SAFE_INTEGER` 的回归值。
- v034 迁移的唯一索引和查询索引已改用显式短名称，避免 PostgreSQL 63 字符截断碰撞；独立临时空库已成功应用全部 15 个 migration 并销毁。
- 服务端同一快照出现重复标准字段时不再按来源优先级任选候选值，而是写入 `FIELD_BINDING_AMBIGUOUS` 并整体失败关闭；旧 `CONFIRMED` 指标缺失绑定证据时同样不能进入正式输入。周期值本身不再写入卡片或表格结构签名，避免“今日/昨日”滚动误伤稳定结构；周期位置、缺失和不一致仍属于门禁证据。
- 全仓 lint、typecheck、247 项测试、build、Prisma validate/generate、版本检查和差异格式检查通过。仍需用户在五条真实后台页面主动采集验收；未执行本地原业务库 migration、部署、提交、推送或平台自动操作。
- 当前源码已重建 `apps/extension/release/local-unpacked-test-extension`，指纹 `d1c80aee42ea`、Schema v034。文件名含 `b4de6606e3f5` 的既有 ZIP 是本轮校准前制品，不能用于 v034 验收；未生成或发布新的正式 ZIP。

## 2026-07-29 已有采集数据时的插件重连入口修复

- 修复任务页在历史快照存在、插件离线时隐藏连接面板的问题。连接状态现始终可见，用户可重新检测网页桥接与服务端心跳，并在任务绑定丢失时重新绑定当前任务或生成手动配对码。
- 既有数据汇总、人工复核和诊断进度保持可用；向导不会因插件暂时离线而倒退，只把继续采集前的恢复入口明确展示出来。
- Web Bridge 轮询现在能将扩展未激活或协议过旧的状态重新写入界面，避免“重新检测”仍显示旧的正常状态。
- 回归覆盖历史采集存在但插件离线的恢复入口；全仓 typecheck、215 项测试、Prisma validate 与 Web production build 通过。根 `pnpm build` 在并行清理 shared `dist` 时触发 Web 解析共享包失败，按 shared 后 Web 的串行构建已通过。未修改 Extension、API、数据库、权限或采集边界。

## 2026-07-28 采集一致性、历史修复与校准大屏交接

- 共享采集协议版本为 `1`，定义于 shared 并同时暴露于 `/version` 和 `/extension/context`。Extension 在采集前校验服务端协议，快照请求携带协议；API 使用 `EXTENSION_COLLECTION_PROTOCOL_MISMATCH` 拒绝缺失或不一致版本。
- Extension 的可信快照流程已在服务端同一事务内完成：创建 `DataSnapshot`、`NormalizedMetric`、`PENDING ReviewedMetric`、路线状态、路线心跳和 `CollectionRun` 状态。任一步失败整笔回滚；页面账号 ID 不参与判断。
- 维护工具位于 `apps/api/src/capture-derived-data-repair.ts` 与 CLI，只处理当前任务中 `VERIFIED` 且缺失派生记录的快照；默认 dry-run、显式 `--run`、重复执行幂等、实际修复才写审计。禁止将 `MANUAL_PENDING` 自动升级或改写原始快照。
- 已对任务 `cms4m8hw9000dq3076zgbw1o4` 安全补建四条可信路线的 24 条标准指标、24 条待复核记录、4 条路线状态和心跳；首条直播概览仍为 `MANUAL_PENDING`。最终 dry-run 为 `candidateTasks: 0`。
- `getCaptureSummary()` 以最新路线快照更新时间驱动任务新鲜度；总览指标只取一个路线，优先 `LOCAL_PROMOTION_DASHBOARD`、缺失时回退 `LIVE_DATA_SCREEN`，绝不跨路线相加。同名指标在路线间继续作为独立证据。
- 校准大屏位于 `apps/web/src/app/tasks/[id]/collection-dashboard/`。页面按运行状态受控刷新；有未保存校准草稿时只检查新数据并显示刷新提示。大屏只展示真实指标、趋势和表格，移动端页面不横向溢出。
- 路线诊断语义已修复：存在旧快照且无连续失败时为 `STALE`，路线待确认为 `MANUAL_PENDING`，只有明确连续失败或运行卡住且从未产生快照时为 `FAILED`；卡住问题码和强动作阻断没有放宽。
- 空任务浏览器验收确认五条路线均显示待采集，指标、趋势和表格都明确缺失且不生成模拟数据；顶部文案已修复为“尚无采集数据 / 待采集”。验收账号、项目和任务已通过站内级联删除并确认清理。
- 本地运行版本为 `0.2.4` / v033 / 采集协议 `1`，Web/API/PostgreSQL healthy。全仓 lint、typecheck、213 项测试、build、Prisma validate/generate 与版本检查通过。
- 本地验收包：`apps/extension/release/collector-local-test-v0.2.4-b4de6606e3f5.zip`，SHA256 `89be2c0b283edce1c4b9136a1993259b6ed607d61eb539fd88c6d7850fb2059b`。
- 正式候选包：`apps/extension/release/collector-production-candidate-v0.2.4-b4de6606e3f5.zip`，SHA256 `75b519e56f63fef211d6d6719b04cbc1bcab4d671dd1b081a1425716b2628ee3`。它未发布，不能标记为线上版本。
- 2026-07-29 已在用户实际 Chrome 中通过网页桥接标记确认加载 `0.2.4` / 桥接协议 `2` / 构建 `b4de6606e3f5`，与本地测试制品一致。仍需由用户在真实已登录页面手动触发五路线采集；不得把“插件已加载”误写成“真实采集已验收”。
- 本轮无新 migration、无生产部署、无提交/推送、无真实平台自动操作。视觉回归图位于 `artifacts/capture-dashboard-desktop.png` 与 `artifacts/capture-dashboard-mobile.png`。

## 2026-07-28 取消页面账号 ID 采集与校验

- 页面账号 ID 已从 Extension 心跳、采集快照、Popup、任务页、校准大屏和账号档案表单中移除；插件不再读取、显示或上传页面账号 ID，服务端也不以页面 URL 参数或页面文本判断账号归属。
- 保留账号档案、项目和任务的服务端归属链，以及 Extension 凭证到账号档案的绑定。Extension 访问其他账号档案下的任务仍由 `EXTENSION_ACCOUNT_MISMATCH` 拒绝；路线仍须经可信域名、任务配置和 Popup 一次确认验证。
- 兼容保留数据库历史列。本轮新增快照和手工指标均固定写入 `MATCHED`，其含义为“服务端任务绑定已验证”，不表示页面身份匹配。历史页面账号字段在既有 30 天原始证据留存清理时一并清空，不执行即时数据清理。
- 已补充回归：携带任意页面账号 ID 的快照仍可按任务入库，但这些字段均为 `null`；跨账号插件凭证继续被拒绝。全仓 lint、typecheck、199 项 test、build、Prisma validate/generate、版本检查和本地 Extension 构建均通过。
- 本地 unpacked 插件目录已更新：`apps/extension/release/local-unpacked-test-extension`，构建指纹 `33dc39c2b5c4`。用户需在 `chrome://extensions` 点击一次“重新加载”；未执行迁移、部署、提交、推送、真实平台采集或停止本地服务。

## 2026-07-27 真实后台路线识别与账号上下文刷新

- 用户提供的 `localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=1870840348951692...` 已自动识别为“巨量本地推数据总览”；`/lamp/pc/promotion/roi2?...&advid=1870840348951692` 已自动识别为“巨量本地推任务列表”。第二张截图没有下拉框是预期行为：下拉仅在路线为 `UNKNOWN` 或冲突时出现。
- 第一张未上传的根因是账号档案当前保存的平台账号 ID 为 `1`，而两个真实后台页面均为 `1870840348951692`；本地与服务端都会按精确 ID 拒绝跨账号上传。不得自动替用户修改账号档案，用户应在账号档案页人工核对并保存正确 ID。
- 插件现在在每次 Popup 点击“采集并上传当前路线”后、读取页面可见指标前，请求受信 `/extension/context` 刷新当前账号/任务上下文；若 Web 端已更新账号 ID，不必重新配对，刷新后的精确 ID 会参与本地校验，服务端二次校验仍保留。返回内容会验证结构，任务不再属于绑定账号或上下文异常时会停止采集。
- Popup 将“下一路线”改为“本轮待采集路线”，另行显示“当前已识别路线”及自动识别提示，避免将采集顺序误认为页面识别结果。账号不一致提示会同时显示页面账号 ID 与任务账号 ID，指向账号档案人工校正。
- 新增 Extension 上下文解析与刷新回归测试；已重新生成本地 unpacked 插件，构建指纹为 `a18d187a5997`。全仓 lint、typecheck、207 项测试、build、Prisma validate、版本检查和 `git diff --check` 已通过。
- Windows 本机 `corepack pnpm prisma:generate` 仍因运行中的 Node 进程锁定 Prisma `query_engine-windows.dll` 而报 EPERM；本轮未改 Prisma schema，API build/test 已使用现有生成客户端成功。未重启用户正在使用的本地服务，未执行真实平台采集、生产迁移、部署、提交或推送。

## 2026-07-27 任务绑定状态同步修复

- 用户截图任务 `cms29dr83000dq307hgs9ga02` 的数据库记录表明：首次任务配对码已在 `2026-07-26 20:36:54` 完成兑换，插件凭证仍有效且当时已经绑定该任务；随后 `20:37:08` 再次生成的任务配对码未被兑换。该任务没有 `CollectionRun`、路线心跳或快照，因此尚未执行 Popup 的“采集并上传当前路线”，也尚未发生平台页面路线识别或上传。
- 根因是已配对插件再次收到同一任务的一键配对请求时，旧 Popup 会隐藏待确认卡片；任务页同时只读取了一次桥接结果，保留了“待确认”旧响应，导致页面显示“已安全配对 / 尚未绑定”。这不表示账号凭证失效，也不表示路线识别失败。
- 修复后，同账号且同任务的重复配对请求直接返回已绑定状态；需要切换到另一任务时，Popup 即使已配对也会显示待确认卡片，仍必须人工点击确认。任务页每 3 秒刷新一次脱敏桥接状态，Popup 确认完成后自动进入第 2 步；没有增加自动采集、平台操作或任何凭证暴露。
- 本地 unpacked 插件已重新生成，构建指纹为 `1a66aeabd108`。原数据环境的 Web 已重建并恢复 `http://127.0.0.1:3300`，API 为 `http://127.0.0.1:4300`，三容器 healthy；数据库仍为 9 个用户、5 个采集任务。定向与全仓测试已通过至 API 71 项（全仓共 204 项）；`prisma validate` 和构建通过，Windows 本机 `prisma generate` 因某个 Node 进程锁定引擎 DLL 出现 EPERM，但 Docker 构建内的 generate 成功。

## 2026-07-27 原本地账号环境升级至 v033

- 用户确认将保留旧账号数据的本地预上线环境从 v032 升级至 v033。升级前已对 `pxxis-prelaunch-20260713` PostgreSQL 数据卷生成自定义格式备份 `pxxis-prelaunch-before-v033-20260727T040440Z.dump`，SHA-256 为 `3C55D1560678A87746411B7BA800A2579AD0F4FBF6D20D49089146C2DB007778`。备份已在独立临时 PostgreSQL 完整恢复，包含 33 张业务表、13 条既有迁移和 306 条归档对象；备份文件位于被 Git 忽略的本地 `.backups/`，未上传或提交。
- 已在原数据卷上通过 `prisma migrate deploy` 应用加法式 `20260722090000_v033_table_cell_reviews`，仅新增 `TableCellReview`、索引和外键，不回填、删除或改写历史数据。迁移后实测保留 9 个用户、5 个快照与 5 个采集任务，迁移记录为 14 条。
- 原本地 Web/API 已使用当前源码重建并切换回相同入口：`http://127.0.0.1:3300` / `http://127.0.0.1:4300`。三项容器均 healthy，`/ready` 返回 database ready，`/version` 返回 `20260722_v033_table_cell_reviews`；未登录会话返回预期 401 且 CORS 允许 `127.0.0.1:3300` 携带凭证。浏览器实测登录表单正常显示、控制台无错误；未代替用户提交登录密码。
- 本次仅为本机环境升级，不是生产部署。全仓 lint、typecheck、build、Prisma validate、version check 通过；201 项测试通过（API 使用已存在的隔离数据库，避免占用端口冲突）。Windows 中文工作目录的 BuildKit 构建失败已由 `DOCKER_BUILDKIT=0` 兼容模式处理。未执行提交、推送、真实平台操作或生产数据库操作。

## 2026-07-26 本地登录初始化不再长时间阻塞

- 本地隔离验收入口 `http://127.0.0.1:3400/login` 此前在 API 临时不可用时会等待通用请求的 20 秒超时，页面全程只显示“正在确认登录状态…”。现将首次 `/auth/me` 会话确认限定为 3 秒并在组件卸载时取消请求；超时或网络失败即清理内存会话状态并显示登录表单，正常已登录会话的 CSRF 初始化逻辑不变。
- 已以 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4400` 重新构建并重启隔离 Web 服务；浏览器实际重新加载后 700ms 内显示登录表单，控制台无警告或错误。`3400` 与隔离 API `4400` 当前均在监听；既有 `3300/4300` 环境未修改。
- Web 定向测试 23 项与 TypeScript typecheck 通过，生产构建通过。未变更数据库、迁移、平台采集权限、Cookie 策略或 Extension 制品；未执行生产操作、提交或部署。

## 2026-07-26 v033 服务端证据收口与隔离大屏验收

- 已复核快照写入的服务端门禁：Extension 只有在可撤销采集凭证、账号任务归属、`https://eos.douyin.com/*` 或 `https://localads.chengzijianzhan.cn/*` 来源、任务路线配置及无冲突路线证据同时成立时，Popup 的一次确认才写入 `VERIFIED`。来源不可信直接拒绝；证据缺失或冲突保持 `MANUAL_PENDING`。
- 每个满足账号和路线确认的新增快照会在同一事务内创建标准指标的 `PENDING` `ReviewedMetric`；表格单元格继续以独立校准记录保存。正式诊断只读取当前、已确认或已修改且未过期的证据。
- 已在 `127.0.0.1:55432` 隔离数据库配套的 API/Web 环境完成生产构建和登录后视觉验收：1280px 与 390px 页面无整体横向溢出，宽表只在自身容器滚动，空趋势或媒体明确显示缺失且不填充模拟值。验收任务已有历史复核，未为演示改写其数据。
- 已恢复 `prisma:generate`；最终全仓 lint、typecheck、201 项测试、build、Prisma validate/generate、版本一致性和差异格式检查均通过。独立临时空库已用 `prisma migrate deploy` 成功应用全部 14 个 migration（含 v033）后销毁；隔离验收服务及其临时配置已经清理。未执行生产 migration、部署、提交、真实平台或生产数据操作。

## 2026-07-25 v033 多路线指标汇总完整性

- 修复 `getCaptureSummary()` 对已标准化指标按全任务键去重的问题。现在去重键包含路线，因此不同路线的同名标准指标（例如两个后台页面各自的“消耗”）会在校准大屏中分别返回、分别复核，且不影响同一路线内的重复指标归并。
- 在 API 集成流程中补充两条路线分别上传“消耗”的回归断言，实际通过隔离 PostgreSQL `127.0.0.1:55432` 的 71 项 API 测试；API typecheck 与 `git diff --check` 通过。未运行生产 migration、部署、提交或真实平台操作。

## 2026-07-25 v033 校准并发边界与站内入屏收口

- 标准指标复核此前只依赖后续决策读取时筛除旧快照；现已与表格单元格复核统一为服务端当前快照、账号/路线确认和 `expectedSnapshotUpdatedAt` 乐观并发校验。单项、批量、全部确认都拒绝旧版本，成功写入会推进同一快照版本并写入原有审计。
- 校准大屏前端会携带路线当前快照版本；单项保存后刷新版本，全部确认提交当前全部路线的版本清单。服务端返回 `SNAPSHOT_NOT_CURRENT`、`SNAPSHOT_UNVERIFIED` 或 `REVIEW_METRIC_CONFLICT` 时，用户刷新后重新校准，不会覆盖新证据。
- 任务页只在当前会话的轮询先完成一次基线读取、随后观察到新的采集时间时，通过站内路由进入 `/tasks/:id/collection-dashboard`。这不触发浏览器外部导航，不改变 Popup 的一次用户确认，也不操作平台页面。
- 定向 API 回归测试使用既有隔离 PostgreSQL `127.0.0.1:55432` 实际通过 71 项，覆盖缺少版本令牌、指标校准后的旧版本拒绝及表格旧编辑令牌失效。未停止或改写该既有容器，未执行生产 migration、部署、提交或平台操作。

## 2026-07-24 v033 Popup 一次确认路线核验收口

- 修复了 Popup 已手选路线并点击采集后，API 仍将快照标为 `MANUAL_PENDING`、要求第二次网页确认的问题。现在仅当请求使用可撤销的 Extension 采集凭证、该凭证已通过账号/任务归属 scope 校验、来源为 `https://eos.douyin.com/*` 或 `https://localads.chengzijianzhan.cn/*`，且路线证据未冲突时，才将 Popup 这一次确认直接写为 `VERIFIED`。
- 直播大屏的商品/流量分栏与概览共用 `LIVE_DATA_SCREEN` 页面类型；在上述受信 Extension 条件内，`LIVE_PRODUCT_TAB` / `LIVE_TRAFFIC_TAB` 的一次性手选允许作为该页面的合法分栏确认。其他路线冲突、未配置路线、账号不匹配和非可信来源保持原有阻断或待确认。
- 普通 Web 会话、手工/CSV 等非 Extension 入口即使伪造 `manuallyConfirmed` 仍为 `MANUAL_PENDING`，可继续使用已有网页人工路线确认流程；Extension 伪造非可信域名来源则由 API 以 `EXTENSION_SOURCE_URL_FORBIDDEN` 拒绝。
- 本轮已通过全仓 lint、typecheck、200 项测试、build、Prisma validate/generate、版本一致性和差异格式检查；Shared 38 项、Extension 29 项、Web 22 项、LLM 6 项、Decision Engine 34 项、API 71 项均通过。API 测试使用既有隔离 PostgreSQL `127.0.0.1:55432`，未停止或修改该容器，也未执行生产 migration、部署或平台操作。当前本地 unpacked 制品指纹为 `c2afc2ac46a8`。
- 完整性复核补充：`buildDecisionInput()` 现在会在选择当前、账号与路线已确认的证据后，再排除超出新鲜度阈值的快照；因此过期指标、表格和结构化数据即使已有复核也不能进入正式判断。对应 API 回归测试通过，接口约定见 `docs/API_REFERENCE.md`。

## 2026-07-24 v033 隐私边界收口与页面识别核验

- 用户截图中的 `https://localads.chengzijianzhan.cn/lamp/pc/liveboard2` 已映射为 `LOCAL_PROMOTION_DASHBOARD`，`https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2` 已映射为 `TASK_TABLE`。本地预上线数据核验显示旧路线均为 `PENDING`、没有失败码和快照；根因是旧流程未在这些已打开页面实际触发用户确认采集，而非上传后识别被拒绝。
- v033 大屏补齐路线、复核状态、指标类别筛选；顶部指标同步受筛选影响。表格明确显示真实来源路线、路线识别置信度和采集时间；旧快照缺少该元数据时显示缺失，不补造值。
- 页面可见文本只在插件一次用户确认采集的内存流程中用于识别路线、账号和白名单字段。共享快照清洗器强制清空 `rawDomText`，插件上传再次清空，API 入库强制写入 `null`，AI/正式决策也不读取该字段；客户端伪造页面原文同样不会进入持久化快照。历史快照不在本轮回写。
- 本轮实际通过全仓 lint、typecheck、197 项 test、build、Prisma validate/generate、版本一致性与差异格式检查；production/local Extension 均按顺序重建并通过制品策略。当前本地 unpacked 制品指纹为 `84d44c50f4a6`，Schema 为 `20260722_v033_table_cell_reviews`。
- 本地 Web 会话在本轮结束时已失效，未重新进行需要登录的桌面/移动端大屏视觉验收；待用户手动登录后按任务页与本地插件目录完成真人验收。未执行生产 migration、部署、平台操作或生产数据操作。

## 2026-07-23 v033 直连采集与任务校准大屏

- Extension 生产授权已收敛为 `https://eos.douyin.com/*` 与 `https://localads.chengzijianzhan.cn/*` 两个精确平台域名。插件只用 URL、标题、选中标签和少量可见标题识别当前路线；识别成功后仍必须由用户在 Popup 点击“采集并上传当前路线”，识别失败或冲突时只允许从当前任务路线下拉确认。
- 已移除自动巡检、自动快照上传及侧栏采集入口；Service Worker 校验采集消息必须来自 Popup。系统不自动打开网页、不点击平台控件、不拦截网络响应，也不采集密码、Cookie、Token 或授权信息。
- 新任务不再提交逐路线 URL，服务端直接继承全局路线模板；任务页不再提供 URL 编辑主流程。旧任务已有 `sourceUrl` 仍可只读展示并打开，原更新接口和数据字段继续保留兼容。
- 新增任务专属 `/tasks/:id/collection-dashboard`、大屏汇总接口和表格单元格批量校准接口。大屏只展示真实指标、趋势和表格；无数据时明确显示缺失，支持路线/状态筛选、指标确认/修改/忽略、表格分页与单元格批量保存。
- v033 新增 `TableCellReview` 加法式 migration。原始快照不改写；写入按当前快照、路线、表格、行列和并发版本校验任务归属、账号/路线确认及敏感字段，并写审计。正式决策只接收当前路线中 `CONFIRMED` 或 `MODIFIED` 的指标和表格单元格，`PENDING`、`IGNORED`、过期、账号或路线未确认的数据均不进入正式判断。
- 全仓 lint、typecheck、build、Prisma validate/generate、正式/本地 Extension 制品检查与 197 项测试通过；隔离空库顺序应用 14 个 migration 成功。浏览器实测 1280px 桌面与 390px 移动端：页面无整体横向溢出，宽表在自身容器横向滚动，空数据不会生成占位数值或模拟图表。

## 2026-07-22 本地登录链路与 API 镜像修复

- 本地 Web 已是新会话协议，但 API 仍停留在 v024 JWT 响应，导致正确登录后前端因缺少 `csrfToken` 立即回到未登录状态。现已保留原 PostgreSQL 数据卷并顺序应用 v025-v032，数据库共 13 个 migration，原 8 个用户和业务数据均保留。
- API 生产镜像此前只复制根 `node_modules`，遗漏 pnpm Workspace 包级依赖链接，运行时无法加载 `express-async-errors`。Dockerfile 现复制 API、shared、llm、decision-engine 的包级 `node_modules`，并在镜像构建阶段执行服务入口导入检查。
- Compose 的 API `NODE_ENV` 改为 `${API_NODE_ENV:-production}`：正式环境默认仍为 production 并强制 Secure Cookie；本地 HTTP 验收显式使用 development 与非 Secure Cookie，不削弱生产边界。
- 已创建一个本地验收账号并实测 Web 登录、工作台加载、会话读取和退出；临时密码未写入仓库或文档。当前 Web/API/PostgreSQL 均 healthy，API Schema 为 `20260720_v032_audit_actor_snapshot`。
- 全仓 lint、typecheck、build、Prisma validate/generate、Compose 静态配置与差异检查通过，共 192 项测试。

## 2026-07-20 首页备案号展示

- 全站根布局页脚已使用 `https://beian.miit.gov.cn/` 链接展示 `辽ICP备2026002223号`。首页不再使用独立 `min-h-screen` 高度，避免将该页脚推到首屏下方；根内容区与首页内容均使用 flex 伸缩高度，短页面的备案号稳定落在底部。
- 新增首页备案页脚回归测试，锁定备案链接、外部打开方式和短页面贴底布局。
- `corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm test`、`corepack pnpm build` 通过；全仓共 192 项测试。本轮仅涉及 Web 布局、测试与交接文档，无数据库、API、环境变量、部署或安全边界变更。
- 本地预上线 Web 容器已使用当前源码重新构建；`http://127.0.0.1:3300/` 返回 200 且容器 healthy。浏览器实测备案号位于 720px 视口底端，链接和文案正确；API、PostgreSQL 及其数据卷未重建。

## 2026-07-20 v032 审计操作者快照与全仓收尾验证

- 新增加法式 migration `20260720110000_v032_audit_actor_snapshot`：`AuditLog.userId` 改为可空并使用 `ON DELETE SET NULL`，新增最小 `actorSnapshotJson`；升级时仅回填已有 `userId`，不伪造其他身份信息。审计写入统一保存 `{ userId }` 快照，用户删除后审计仍保留操作者标识。
- 复核初始化、单条/批量复核和全部确认已在事务内重新读取当前任务及指标，业务写入与审计同事务提交；执行结果复盘也在事务内重验 `MANUAL_EXECUTED` 状态和幂等记录。
- CSRF 在精确允许 Origin 与正确 Token 前提下允许 `same-origin` 和生产 Web/API 同注册域的 `same-site` 请求；未配置兄弟域仍拒绝。
- 所有 API、Compose、镜像和 Extension 构建的默认 Schema 版本已统一为 `20260720_v032_audit_actor_snapshot`。
- 隔离 PostgreSQL 已实测空库顺序应用全部 13 个 migration，以及从 v031 升级至 v032；升级夹具确认旧审计记录回填快照、删除用户后外键置空而快照保留。
- 全仓 `lint`、`typecheck`、`test`、`build`、Prisma validate/generate、生产依赖 audit、带无敏感占位变量的 Compose 静态配置和 `git diff --check` 通过；191 项测试（shared 36、extension 28、web 19、llm 6、decision-engine 34、API 68），audit 为 0 个已知漏洞。v032 正式 Extension unpacked 制品也已通过安全测试。未执行真实 SMTP、COS、部署、平台操作或生产数据操作。

## 2026-07-20 持久化输入边界与 API 入口收口

- 认证策略不变：登录页只隐藏公开注册与邮箱验证入口，管理员可发放账号密码；后端 `/auth/register`、`/auth/email-verifications/confirm`、`/auth/email-verifications/resend` 和验证页继续保留，不能误改为服务端邀请制。
- `persisted-input.ts` 现区分两类数据：外部自由输入、审计详情使用 `sanitizePersistedJson()` 拒绝任何凭证形态；来自已清洗快照、规则引擎或 AI 的内部派生 JSON 使用 `sanitizeDerivedPersistedJson()` 再次脱敏后保存，避免 `[REDACTED]` 标记被误拒。
- 工作区名、项目/服务商名、任务标题、账号资料（含 memo）、注册名、配对标签、心跳错误、手工录入来源、复核文本和账号确认备注均在写库前统一拒绝凭证形态；审计 `User-Agent` 改为截断脱敏后保存。不得恢复直接写入未经校验的自由文本。
- 决策与 AI 的 `DecisionRun` / `AiAnalysisTask` JSON 在持久化前再次清洗；共享证据测试覆盖伪造心跳 `MATCHED` 声明无法绕过服务端可信 URL/账号 ID 校验。
- 为符合架构门禁，`/workspaces` 和 `/system-health` 从 `server.ts` 拆到独立路由，路径、权限和响应保持兼容。
- 全仓 `lint`、`typecheck`、`test`、`build`、Prisma validate/generate 和 `git diff --check` 均通过；共 187 项测试（shared 36、Extension 28、Web 19、LLM 6、decision-engine 34、API 64）。测试仅使用临时 PostgreSQL 容器，未执行真实 SMTP、COS、部署或生产数据操作。

## 2026-07-19 采集诊断与标准化数据交接

- 共享包新增 `collection-diagnostics.ts` 和 `collection-records.ts`。所有采集运行质量、任务摘要、决策输入和系统健康聚合应复用 `evaluateCollectionRouteDiagnostic()`，不要重新推导第二套状态。
- 诊断阈值保持：5 分钟 `AGING`、10 分钟 `STALE`、连续失败 3 次降级；只有 `ACTIVE/DEGRADED` 运行会判定卡死。缺快照、账号未验证、路线未验证阻止正式决策；过期、卡死和连续失败阻止强动作；部分采集只告警。
- 采集运行启动使用任务级 PostgreSQL advisory transaction lock。同路线集合重放现有运行且不重复审计；变化路线集合会在同一事务停止旧运行并创建新运行。请求路线必须是任务配置的非 `UNKNOWN` 子集。
- Extension 的单飞键分别为手动采集 `taskId + tabId + routeKey + collectionRunId` 和巡检 `taskId + action`；原上传队列、指纹和幂等逻辑继续保留。小时趋势和素材路线未校准，不出现在巡检选择中。
- `DataSnapshot.structuredDataJson` 只由 API 从经过安全清洗的可见表格生成，Extension 不能直接提交可信结构结果。当前实现 `TASK_ROWS`；空值和非法值保持缺失并写解析警告，不补默认数据。
- 决策引擎优先使用有效的 `TASK_ROWS`，旧快照和旧 DecisionRun 继续走通用表格回退；历史快照不回填。留存任务会与原始表格同时清理结构数据。
- 失败上报只接受稳定 `errorCode`；可选技术详情经服务端清洗和截断后保存。界面及审计只展示安全问题说明，不回显原始异常。
- 验证已完成：lint/typecheck/build、183 项测试、Prisma validate/generate、空库 12 migration、Extension production target 制品安全检查。
- 尚需真实脱敏页面样本才能进入第二阶段小时趋势和素材采集器开发；禁止为了“采全”引入自动点击、自动滚动、自动翻页或 fetch/XHR 拦截。

## 2026-07-19 正式诊断与专家参考双栏

- 任务页新增 `diagnosis-comparison.tsx`，桌面端并排展示正式诊断和专家参考分析，移动端保持纵向可读。
- 正式栏继续使用既有 `DecisionRun`，恢复展示当前 `PENDING_APPROVAL` 动作及其详情入口；没有增加自动审批、自动执行或平台操作。
- 专家栏独立调用现有解释接口并展示 `decisionReference` 的证据、补证、人工步骤、验证指标和停止条件。它仍为 `ADVISORY_ONLY`，不会生成 `ActionProposal`。
- `useTaskData()` 会读取最新专家分析；新增的 `/collection-tasks/:id/analysis/latest` 只返回展示所需字段，刻意排除保存的 `requestPayload`。
- 全仓 lint/typecheck/build、Web 18 项测试通过；全仓测试为 168 项通过、6 项失败，仍是 `decision-flow.test.ts` 中更早发生的账号证据、快照标准化和 Extension 状态回归。新增安全读取断言因此未执行到，不能宣称全仓测试通过。本轮没有 Prisma、采集字段、配置或部署变化。

## 2026-07-19 Agency Agents 决策参考库

- 新增 `packages/llm/src/reference-playbooks.ts`，把上游 `agency-agents` revision `459dce837db3bdfdc4763d3fefd1fd854e73c8f1` 的 5 个角色人工整理为结构化参考。没有运行上游安装脚本、桌面应用或角色原始指令，也没有把第三方工具权限引入项目。
- 安全整理只保留指标口径、测量审计、漏斗定位、直播/商品的一次一变量验证和证据门禁；未公开算法、通用阈值、自动扩量/降量/暂停、固定出价与效果承诺均被排除。
- `mockAnalyze()` 现在返回 `decisionReference`，解释 API 会持久化来源、证据、待补证据、人工步骤、验证指标、停止条件和安全边界；Prompt 版本为 `explanation-only-agency-reference-v0.2.0`。正式动作来源仍写为 `decision-engine`，规则引擎未修改。
- 来源、筛选规则与 MIT 声明见 `docs/AGENCY_AGENTS_REFERENCE.md`；相关 LLM 测试覆盖固定 revision、许可、参考模式、证据必填、禁止动作字段以及通用算法阈值过滤。
- lint、全仓 typecheck/build、LLM 6 项测试通过；全仓测试为 168 项通过、6 项失败。失败位于 `decision-flow.test.ts` 的快照标准化、账号匹配和 Extension 状态流程，并早于新增解释接口断言；当前不能宣称全仓测试通过，发布前须修复这些回归。
- 本轮未新增 Prisma migration、环境变量、采集字段、部署变化或平台操作。

## 2026-07-19 认证入口与账号证据回归

- 认证策略保持为“前端暂时隐藏公开入口”：登录页仅保留管理员发放账号的密码登录；后端 `/auth/register`、邮箱确认/重发接口和 `/email-verification` 页面完整保留。当前不是服务端强制邀请制，恢复开放注册只需恢复前端入口。
- 修复服务端账号证据映射：`evaluateAccountMatch()` 现在显式将快照的 `accountMatchEvidence` 映射为共享证据工具的 `evidence` 入参。可信 HTTPS 页面、精确白名单路径、声明 URL 参数与页面账号 ID 一致时才自动匹配；缺少、伪造或仅同名的证据均保持 `UNVERIFIED`，跨账号 ID 仍拒绝上传。
- `decision-flow.test.ts` 的可信、伪造和跨账号夹具已与服务端规则对齐；同时移除 `getOwnedTask()` 中未被调用方使用的历史分析和审计预加载，缩短串行决策事务但不改变读取数据边界。
- 已通过全仓 lint、typecheck、test（shared 32、Extension 25、Web 18、LLM 3、decision-engine 32、API 61，共 171 项）、build、Prisma validate/generate 和 `git diff --check`；未执行真实 SMTP、部署、生产数据或平台操作。

## 2026-07-19 登录入口暂时隐藏

- 用户澄清当前不是移除公开注册或邮箱验证，而是先隐藏入口并由管理员发放账号密码。`apps/web/src/app/login/page.tsx` 已只保留登录表单，并提示使用管理员发放的账号。
- 后端 `/auth/register`、邮箱确认/重发接口及 `apps/web/src/app/email-verification/page.tsx` 均保留可用；`PendingRegistration`、`EmailVerificationToken` 和现有验证安全约束不变。
- 这不是服务端强制邀请制：直接调用注册 API 仍遵循既有公开注册和邮箱验证流程。若未来要实施真正邀请制，需另行设计邀请码、发放审计、有效期与服务端注册门禁，不能把本次前端隐藏误当作安全控制。
- 新增登录页源码回归测试，锁定仅调用登录接口、展示管理员发放提示且不再含公开注册/验证邮件重发入口；全仓 lint/typecheck/171 项 test/build、Prisma validate/generate 与 `git diff --check` 均通过。

## 2026-07-18 生命周期读取边界、留存与制品安全收口

- 动作建议和复核指标的 GET 接口现在严格只读：`GET /action-proposals/:id`、项目/全局建议列表只虚拟展示过期状态，不再更新建议状态或创建审计；`GET /collection-tasks/:id/review-metrics` 不再初始化数据。初始化已移至显式 `POST /collection-tasks/:id/review-metrics/initialize`，任务页刷新复核指标也改走该写接口。
- `proposal-lifecycle.ts` 集中管理建议的展示状态与状态筛选；审批、观察和人工执行仍在原子条件更新中拒绝过期建议。`decision-flow.test.ts` 覆盖详情/列表读取不改写数据库、过期写操作返回 `ACTION_EXPIRED`。
- Compose 新增独立 `retention` 维护服务：启动后执行一次留存、随后每 24 小时执行一次；不暴露端口，使用非 root、只读文件系统、最小能力和受限资源。留存任务现同时清理超过 365 天的安全指标聚合数据。
- 新增加法式 migration `20260718110000_v030_security_metrics` 与 `SecurityMetric`：按 UTC 小时仅聚合安全事件类别和数值，不保存请求体、IP、用户、账号或凭证。当前覆盖 CSRF/限流/配对失败/账号路线不匹配/SSE 数量/快照字节/决策冲突/数据库错误/备份、恢复演练和留存结果；API 正常停机时会刷盘。
- SSE 写缓冲满时保留最新待发送信号，连接恢复后发送最新状态而不是静默丢弃；独立单元测试覆盖回压合并与关闭边界。
- `accountMatchEvidence` 已拆到共享账号证据契约，只接受四种已登记 URL 参数来源、可见名称标签或人工确认来源；任意字符串在 API 入参校验阶段被拒绝，历史快照 JSON 不改写。
- Extension 构建目标配置集中至 `build-target.ts`，制品规则集中至 `artifact-policy.mjs`。正式构建只接受精确权限并拒绝 localhost、127.0.0.1、泛域名和“本地测试”；本地构建使用带红色 `T` 角标的独立图标资产。发布脚本生成 ZIP 后会重新解压并执行同一套硬校验。
- 运行时和 Extension 构建元数据默认 Schema 已统一为 `20260718_v030_security_metrics`；备份/恢复维护入口新增 `backup:run` 与 `restore:verify`，旧命令保留兼容别名。
- 已通过全仓 lint、typecheck、test（shared 28、Extension 25、Web 17、LLM 3、decision-engine 32、API 59，共 164 项）、build、Prisma validate/generate、生产依赖 audit、Compose 静态配置、正式 ZIP 解压验收与 `git diff --check`；隔离 PostgreSQL 从空库顺序应用全部 11 个 migration 成功。备份脚本会回读远端 dump、校验 SHA-256 并用 `pg_restore --list` 验证可读性。未执行真实 SMTP、COS、服务器部署、DNS 或平台操作。

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

## 2026-07-29 采集后流程交接

- 真实验收任务 `cms4wmzes000uqs07m0a4q8ze` 已完成 5/5 路线采集，服务端汇总为 31 项标准指标和 358 个表格单元格。
- `apps/web/src/app/tasks/[id]/collection-dashboard/page.tsx` 顶部已展示全任务标准指标；过滤、逐项修改、趋势和原始表格默认收进“详细指标与原始表格”。
- 主按钮“确认可信数据并生成诊断”会批量确认剩余指标和表格单元格，再调用决策预演。正式就绪时写入 DecisionRun；不满足门槛时跳转 `/tasks/:id?preview=1#diagnosis` 展示保守诊断。
- `apps/api/src/routes/collection-dashboard.ts` 新增任务级表格单元格批量确认，校验最新快照版本、任务所有权和路线确认状态，写入与审计在同一事务内完成。
- `apps/api/src/server.ts` 的正式决策 readiness 会从当前 ReviewedMetric 计算复核覆盖率，避免过期路线被误报为“未开始人工复核”。
- 回归覆盖表格批量确认的幂等性、已修改值保留、审计唯一性、过期数据保守降级以及 Web 跳转契约。
- 2026-07-29 全量验证：typecheck 通过；214 项测试通过；build 通过；Prisma validate 通过。
- 本地 Web/API 仍为 `http://127.0.0.1:3300` / `http://127.0.0.1:4300`。服务重启后旧浏览器 Cookie 已失效，需要重新登录才能继续真实任务的点击验收。
- 本轮没有修改 Extension 权限、采集范围或自动执行边界。

## 2026-07-31 AI 诊断主线交接

- 数据库变更位于 `prisma/migrations/20260731120000_v035_ai_skill_diagnosis`；新增 `DiagnosisSkillExecution`、`DiagnosisCase`、`DiagnosisFeedback`，历史 DecisionRun 自动回填为旧版成功记录。
- 核心实现位于 `packages/diagnosis-skills`、`packages/llm/src/deepseek.ts`、`packages/llm/src/tool-loop.ts` 和 `apps/api/src/ai-diagnosis`。
- 新 API 路由位于 `apps/api/src/routes/decision-runs.ts`；旧同步 DecisionRun/mock explain 死路由已从 `server.ts` 删除，历史 analysis GET 保留。
- Worker 启动入口为 `apps/api/src/decision-worker-main.ts`；Compose 服务名为 `diagnosis-worker`。密钥不得进入 Web、Extension、数据库、日志或前端。
- UI 主入口为 `apps/web/src/app/tasks/[id]/diagnosis-comparison.tsx`，轮询位于 `use-task-data.ts`。
- 评测命令见 `docs/AI_DIAGNOSIS.md`。Fake Provider 的 24 例门禁已达到 100%/100%/0/0；它只证明状态机和契约，不替代真实 DeepSeek 质量验收。
- 用户临时提供的 DeepSeek 密钥仅用于当前进程评测，没有写入文件、数据库或日志；因已在聊天中暴露，应由用户轮换。
- 正式真实评测版本为 Prompt v13 / SkillSet v2 / Orchestration v19；`deepseek-v4-pro` 串行 24 例结果为结构 24/24、核心命中 24/24、虚构证据 0、安全违规 0，详见 `docs/evaluations/2026-07-31-deepseek-v4-pro-ai-diagnosis.md`。
- 真实任务 `cms4wmzes000uqs07m0a4q8ze` 未完成验收：旧证据已过期，本地业务库 16 个 migration 均未登记，Prisma 只读加载因缺少 `CollectionTask.idempotencyKey` 失败。本轮没有迁移业务库。
- 功能开关必须继续为 false；下一步需要单独授权升级数据库，然后重新采集/复核真实五路线并由用户评价诊断。
- 最终工程验证：shared 46、Extension 37、Web 28、decision-engine 39、diagnosis-skills 4、LLM 14、API 99，共 267 项测试；typecheck、build、lint/架构检查、Prisma validate/generate、版本检查和 Compose 配置检查全部通过。工作区未发现临时 DeepSeek 密钥片段。

## 2026-08-01 V035 历史库升级演练与验收阻断

- 已为锁定目标库 `douyin_subject_diagnosis` 生成全量逻辑备份、Schema 备份、行数清单和清单记录，并从该备份克隆演练库。备份仅保留在 Git 忽略的本机 `.backups/`，不纳入源码提交。
- 演练库已使用 `tools/reconcile-v035-legacy-database.ps1` 生成并审查一次性对账 SQL，在事务、执行前数据库/Schema/行数断言和失败回滚保护下补齐至 v035 Schema；空差异、16 条迁移登记、`prisma migrate status`、历史读取与行数对账均已通过。
- 原库尚未执行 DDL、迁移登记或写入。对账脚本要求目标库中存在验收任务 `cms4wmzes000uqs07m0a4q8ze`，但该任务实际位于另一套 `pxxis_prelaunch` 数据库；因此 `douyin_subject_diagnosis` 的原库升级被门禁主动阻断。
- 不得复制任务、切换升级目标库、改写任务门禁或使用 `prisma migrate deploy` 绕过该差异。待用户明确统一“锁定升级目标库”和“真实验收任务所在库”后，才可对原库再次备份、应用同一已演练脚本、登记迁移并开始重新采集与 AI 验收。

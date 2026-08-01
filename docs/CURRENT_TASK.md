# Current Task

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

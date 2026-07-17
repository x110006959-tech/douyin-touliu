# Current Task

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

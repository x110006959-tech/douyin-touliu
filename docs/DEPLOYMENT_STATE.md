# Deployment State

## 2026-09-08 14:23 失败步骤诊断 v26 已部署本机

- 用户明确要求部署。API/实际 Worker 使用 `pxxis-api:diagnosis-validation-v26-20260908`，镜像 ID `sha256:93a26d7d43d198db4765a805ffb2eb7c272323035ea6327fa06681d01ed6125d`；Web 保持 `pxxis-web:diagnosis-scenario-candidate-v24-20260906`，ID `sha256:0019e8a2e89e4e1f1a33be3f8c0fdd36cb8df42869f112ac947de7b25c561b70`。运行模块为 Prompt v28 / Orchestration v37 / SkillSet v11。
- 部署前补齐脱敏防线：常见 PAT/云密钥、长不透明标识、账号/身份字段、联系方式和 URL 整条替换为固定占位；普通“保持预算不变 / 核对预算 / 提高预算”仍可用于判断误判。观察实验、ROI、证据和动作门禁均未放宽。
- 源码全仓 734 项测试及 lint/typecheck/build/version/Schema/diff 通过，离线正常 24/24、综合失败事实保留 24/24；冻结 lockfile 构建候选。隔离候选 ready/version/login 均为 200，12 项本地与镜像制品哈希一致，候选数据库、容器和网络已清理。
- 切换前、排空后、切换后活动/诊断/建议均为 0/31/20；应用配置、网络、HostConfig 与 Schema 一致。正式 4300 ready/version、3300 login 为 200，API healthy，API/Worker/Web 均 running、重启 0，Web 7 项内容核验通过。
- `corepack pnpm runtime:verify` 退出 0，API/Worker 版本一致，无网络正常/失败各 24 例通过；删除本次 3 个旧应用容器和 1 个旧镜像标签。API/Worker 最近回退为 v25 `sha256:9af2a920eeb8052ab4ba1b9a58f66a7919de52ba4a7ca24ac500c0e050479e0d`，Web 回退仍为当前 v24；业务 PostgreSQL、数据卷、其他项目和运行中资源未改。
- 部署脚本位于 `10_项目档案/project-001-字节投流/02_执行过程/2026-09-08_失败步骤诊断/deploy-v26.mjs`。没有 migration、配置、插件、Git/生产操作、真实模型请求或历史改写；部署后失败审计仍为 0。旧失败原文无法追回，下一次真实诊断必须由用户显式发起。

## 2026-09-08 00:37 ROI 范围修复 v25 已部署本机

- 用户明确要求部署。API/实际 Worker 使用 `pxxis-api:diagnosis-roi-scope-v25-20260908`，镜像 ID `sha256:9af2a920eeb8052ab4ba1b9a58f66a7919de52ba4a7ca24ac500c0e050479e0d`；Web 沿用 `pxxis-web:diagnosis-scenario-candidate-v24-20260906`，ID `sha256:0019e8a2e89e4e1f1a33be3f8c0fdd36cb8df42869f112ac947de7b25c561b70`。运行模块 Prompt v28 / Orchestration v36 / SkillSet v11。
- API 使用现有 Dockerfile 与冻结 lockfile 构建成功。隔离候选 ready/version/login 均 200，Web 7 项文案、11 项源码构建/镜像制品哈希（含 ROI 校验）、正常/综合失败各 24 例通过；候选新数据库、匿名卷、容器及内部网络已清理，无主机端口、实际 Worker 或真实模型调用。
- 原配置内存复用，Schema 哈希一致，无迁移；排空并成套替换应用容器，Web 使用同一已有镜像。切换前、排空后、切换后活动/诊断/建议均为 0/30/20，配置与网络一致。API healthy，三个服务 running/restarts=0，正式 4300 ready/version、3300 login 均为 200；实际 API 和 Worker 模块版本一致，未触发回退。
- `corepack pnpm runtime:verify` 退出 0，运行检查及无网络正常/失败各 24 例通过，清理本次 3 个旧容器、2 个旧镜像标签。复核只保留当前应用容器与业务 PostgreSQL；最近 API/Worker 回退标签均指向原 v24 `sha256:45422162458d01790b5ce7e082d0eaa41e7a734e1141b59c5687e6041656dbae`，Web 回退指向当前同一 v24 镜像。未清理业务库、数据卷、其他项目或执行全局 prune。
- 脚本和脱敏日志在 `10_项目档案/project-001-字节投流/02_执行过程/2026-09-08_ROI范围误拦截/`：`deploy-v25.mjs`、`api-image.log`、`candidate.log`、`deployment.log`、`runtime.log`。没有应用配置、接口、采集协议或生产环境变化，没有 Git 操作、自动诊断或历史改写；刷新网页即可，不需重载插件。新修复真实模型验收仍独立，旧失败记录不会因部署而变成功。

## 2026-09-07 10:41 场景诊断 v24 已部署本机

- 用户明确要求“部署”，直接启用已验证候选。API 与实际 Worker：`pxxis-api:diagnosis-scenario-candidate-v24-20260906`，ID `sha256:45422162458d01790b5ce7e082d0eaa41e7a734e1141b59c5687e6041656dbae`；Web：`pxxis-web:diagnosis-scenario-candidate-v24-20260906`，ID `sha256:0019e8a2e89e4e1f1a33be3f8c0fdd36cb8df42869f112ac947de7b25c561b70`。
- 先核验镜像、Schema 及配置，关闭 Web/API 后确认活动诊断为 0，再替换 Worker。应用环境仅在内存复用；除镜像构建元数据外，应用配置、HostConfig、网络一致。切换前、排空后、切换后均为活动 0、诊断 27、建议 19，没有自动创建诊断或改写历史。
- 正式 4300 `/ready`、`/version` 与 3300 `/login` 均为 200；API healthy，三个服务 running/restarts=0。API/Worker 实际模块一致为 Prompt v27 / Orchestration v35 / SkillSet v11，Web 7 项场景与分析文案通过。版本接口 productVersion 仍为 `0.2.6`；镜像身份以固定 ID 核验。
- `corepack pnpm runtime:verify` 退出 0，再次核对健康与实际 Worker，并在无网络临时容器内完成正常 24/24、综合失败保留事实 24/24。自动清理本次 3 个旧应用容器和 1 个旧镜像标签；复核本项目仅保留当前 Web/API/Worker 及既有 PostgreSQL，无 next/before 应用容器。没有全局 prune、业务数据库/卷或其他项目清理。
- 最近回退镜像：`pxxis-api:local-rollback` 与 `pxxis-api:local-worker-rollback` 均指向旧 API v23，ID `sha256:956a2c9fe9903df5b623e4e38d631129b5eeb8c8fe3a103f226922701efac858`；`pxxis-web:local-rollback` 指向旧 Web v22，ID `sha256:76f4657ff21382fee7b57f4cb791d58bde6aefd5fb3a2b13311d10b7af1e86c9`。本次未触发回退。
- 部署脚本及脱敏日志：`10_项目档案/project-001-字节投流/02_执行过程/2026-09-06_场景诊断验收/deploy-v24.mjs`、`deployment.log`、`runtime.log`。脚本语法检查通过；沿用上一轮配置克隆与失败恢复能力。
- 无 Schema、migration、应用配置、采集协议或生产环境变化，无 Git 操作。刷新网页即可使用，无需为此次 AI 改动重载插件；未调用真实模型，新场景实际分析质量需显式新建诊断后验收。运行检查仍提示既有 node_modules/lockfile 不同步警告，但检查退出 0；原候选冻结依赖构建已通过。旧 `.runtime-switch-v19` 文件此前删除被自动审批拒绝，仍保留，未重试或绕过。

## 2026-09-06 17:23 分句校验 v23 已部署

- API/Worker 镜像 `pxxis-api:diagnosis-uncertainty-v23-20260906`，ID `sha256:956a2c9fe9903df5b623e4e38d631129b5eeb8c8fe3a103f226922701efac858`；Web 仍用 v22 原制品。运行 Prompt v26 / Orchestration v34 / SkillSet v10。
- 隔离候选 ready/version/login 200、Web 5 项文案、10 项本地/镜像哈希、正常/部分失败各 24 例通过；候选资源已清理。初次验证调用 Windows PowerShell 5 将 UTF-8 中文脚本错解，已将 JS 校验文案改为 Unicode 转义，复验成功，不改产品文案或镜像来规避检查。
- 排空后成套替换原配置，Schema/环境及运行设置一致；活动诊断 0、诊断 26、建议 19 前后不变，三个服务重启 0，API healthy。用户的旧失败记录没有改写。
- 部署后 `runtime:verify` 实际通过：正式 HTTP 200、API/Worker 模块一致、无网络 24+24 评测，再自动删除本次 3 个旧容器与 2 个旧标签。本次累计 21 个旧容器、45 个镜像标签，另删除已确认无引用的本轮中间镜像 `1355e5ba…`。再次执行清理为 0。
- 回退镜像标签 API/Worker 指向上一轮 v22，Web 指向当前同一 v22 制品；不再保存退出的回退容器。数据库、卷、运行中与其他项目资源受保护。旧临时环境文件删除被策略拒绝，不属于已清理成果。
- 新页面两条线路在切换后停止，缺少新鲜输入，真实模型尚待用户手动启动采集后验收。详细日志均在 `10_项目档案/project-001-字节投流/02_执行过程/2026-09-06_诊断闭环候选验证/uncertainty-*.log`。

## 2026-09-06 旧 Docker 资源清理

- 按用户明确要求，已删除本项目 18 个退出的旧 Web/API/Worker 容器与 43 个未引用的历史镜像标签。仅处理固定项目应用名称和仓库，无 `prune`、`rm -f`、卷/数据库清理；运行中、挂载资源及其他项目引用受保护。
- v22 当前三个服务正常；不再保留以下历史条目中的已停止回退容器。最近回退制品保留为 `pxxis-api:local-rollback`、`pxxis-api:local-worker-rollback`、`pxxis-web:local-rollback`，本次对应 v21。后续成功切换后更新为最近一版，不累计旧容器。
- 删除 `.runtime-switch-v19` 的旧临时环境文件被自动审批审查拒绝（策略阻止），文件未改。清理回归与实际日志见候选验证过程目录内 `cleanup.log`，新入口为 `corepack pnpm runtime:verify`。

## 2026-09-06 16:43 诊断闭环 v22 本机成套部署（用户明确授权）

- 用户要求“部署”后，直接采用下文已验证的 API/Web 候选镜像，API 和实际 Worker 共用 API 镜像。镜像标签仍为 `diagnosis-closure-candidate-v22-20260906`，API ID `sha256:8719cec23d5e54cbea901e739246cf5c65f169ce50c90877f7ec4d6509e5c80e`；Web ID `sha256:76f4657ff21382fee7b57f4cb791d58bde6aefd5fb3a2b13311d10b7af1e86c9`。不是重新构建的不同制品。
- 原运行 Schema 与本地候选 Schema 哈希一致，无需迁移。切换前、关闭 Web/API 后再次排空、切换后，活动诊断均为 0，DecisionRun 25、ActionProposal 19；没有自动重跑历史或请求真实模型。
- 先创建未启动的新容器，复用原应用配置并逐项核验，再停止 Web/API、检查队列、停止 Worker、保留旧容器并启动三个新容器。Env 仅在内存复用，不写明文配置文件。除镜像构建元数据外，应用配置、完整 HostConfig、网络均一致，默认 OomKillDisable 的 null/false 归一化比较。
- 正式 `127.0.0.1:4300/ready`、`/version` 与 `127.0.0.1:3300/login` 均为 200；API healthy，三项服务 running/restartCount=0。API/Worker 实际模块均为 Prompt v25 / Orchestration v33 / SkillSet v10；Web 编译制品的 5 项新事实、趋势与失败展示文案通过。版本接口 `0.2.6` / `diagnosis-closure-candidate-v22-20260906`。
- 三个旧 v21 容器停止保留，名称为原名加 `-before-diagnosis-closure-v22-20260906`：`pxxis-prelaunch-20260713-api-1`、`pxxis-local-ai-validation-worker`、`pxxis-prelaunch-20260713-web-1`。没有遗留 next 容器，PostgreSQL、数据卷及其他项目服务不变。
- 实际切换脚本与脱敏日志在 `10_项目档案/project-001-字节投流/02_执行过程/2026-09-06_诊断闭环候选验证/deploy-v22.mjs`、`deployment.log`。脚本具有失败恢复原服务的路径，本次切换成功，未触发回退。
- 本次只启用本机服务，无 Git 提交/推送、生产环境发布、Schema/配置/采集协议变更。用户刷新网页即可使用，不需为本次 AI 修复重载插件；真实模型和登录态业务页面仍需用户显式新建诊断验收，不能用健康检查代替。

## 2026-09-06 诊断闭环候选验证，运行服务未切换

- 仅构建并验证 `pxxis-api:diagnosis-closure-candidate-v22-20260906` 与 `pxxis-web:diagnosis-closure-candidate-v22-20260906`，源码 v25/v33/v10。现有 API/Worker/Web 仍为 `comparison-recovery-v21-20260905`，没有改运行配置或业务数据库。
- 最终镜像 ID：API `8719cec23d5e54cbea901e739246cf5c65f169ce50c90877f7ec4d6509e5c80e`；Web `76f4657ff21382fee7b57f4cb791d58bde6aefd5fb3a2b13311d10b7af1e86c9`。最终隔离复验退出码 0，Web 编译制品的 5 项新展示文案核验通过。
- 使用独立内部网络及全新临时 PostgreSQL 验证 HTTP server；不启动 Worker/历史生命周期。API ready/version、Web login 为 200；无网络镜像评测成功与综合失败各 24 例，9 项关键制品哈希一致。候选容器和测试卷已清理，保留镜像。
- 正式切换、真实模型及登录态业务页面验收待后续明确指令。详细步骤与限制见 [闭环验收](./DIAGNOSIS_CLOSED_LOOP_ACCEPTANCE.md)。

## 2026-09-05 18:38 无依据评价修复 v21 本机成套部署（用户明确授权）

- 用户明确要求“部署”。以实际 v20 API/Worker、v18 Web 为基准，构建并同步切换至 `comparison-recovery-v21-20260905`；没有生产发布、Git 提交/推送、平台操作或真实模型请求。
- API/Worker 镜像为 `pxxis-local-ai-validation:comparison-recovery-v21-20260905`，ID `sha256:d01d226294950d13ddef70f8b5c4e666e3338d44efab40bcc399e1f4e0b318c6`；Web 镜像为 `pxxis-prelaunch-20260713-web:comparison-recovery-v21-20260905`，ID `sha256:a8847d0e1b8d915c426f6edbde8431b247c84fade345614ae2e92f33cdd0290a`。沿用现有 Dockerfile 与冻结 lockfile，两个镜像构建成功。
- 候选 API 4304 仅启动 HTTP server，不启动历史生命周期或 Worker；ready/version、候选 Web 3301 login 均为 200。编排、LLM tool-loop、诊断 Worker、诊断路由和 Prisma Schema 的镜像哈希与已验证本地制品一致；Web 编译产物含本轮具体评价/阈值失败提示。
- API 镜像在 `--network none` 且未注入应用环境的临时容器中完成 24/24 合成结构与主问题命中，虚构证据 0、安全违规 0；确认 Prompt v24 / Orchestration v32。源码阶段 653 项测试与 lint/typecheck/build 已通过，本次部署未重复运行数据库测试。
- 切换前活动诊断为 0，停止 Web/API 并排空后再次确认活动为 0，再停止 Worker。替换前后逐项核验端口、网络、命令、用户、健康检查、restart/init、资源、日志及安全配置；原应用环境仅在内存复用，排除镜像构建元数据后完全一致，没有新增明文环境文件。Docker 默认 OOM killer 设置旧值 null、新值 false 语义相同，明确归一化后比较；未关闭 OOM 保护。初次比较在停服务前发现这一默认表示差异并安全停止，处理后完成切换。
- 正式 API 4300 `/ready`、`/version` 和 Web 3300 `/login` 均为 200；API health=healthy，三个服务 running、restartCount=0。运行 API 与 Worker 均导入核验 Prompt v24 / Orchestration v32，版本接口为 `0.2.6` / `comparison-recovery-v21-20260905`。切换前后活动 0、DecisionRun 23、ActionProposal 19。
- 原容器停止保留：`pxxis-prelaunch-20260713-api-1-before-comparison-recovery-v21-20260905`、`pxxis-local-ai-validation-worker-before-comparison-recovery-v21-20260905`、`pxxis-prelaunch-20260713-web-1-before-comparison-recovery-v21-20260905`。两个候选确认无挂载后已停止移除，无本轮 next 遗留。
- 不修改 Schema、应用配置、PostgreSQL 或数据卷，不执行 migration；本次 AI 修复无需重新上传或重载插件。用户刷新网页后，在确认可信数据后显式运行一次诊断验收；真实模型与登录态业务页面尚未验收。

## 2026-09-05 12:09 审计修复 v20 本机部署（用户明确授权）

- 用户回复“部署”后，以实际运行容器为基准核验：API/Worker 原为 `diagnosis-language-repair-v19-20260905`，Web 为 `project-history-v18-20260903`；旧文档 v18 服务端记录已过期。诊断 PENDING/RUNNING=0、DecisionRun=23、ActionProposal=19，历史 migration 已存在，本轮无需数据库迁移。
- 使用现有 API Dockerfile 与冻结 lockfile 构建 `pxxis-local-ai-validation:audit-fixes-v20-20260905`，镜像 ID `sha256:36235ac404c84f9f0479d19fe2b774e000cb37f68083c26a0e8f3fc24afeb827`。无网络容器内 24/24 合成结构及核心命中通过，虚构证据/安全违规均为 0。
- 候选 4304 的 ready/version 均为 200；候选只启动 HTTP server，不启动历史生命周期或 Worker。四个关键编译模块（编排、变量解析、历史比较、诊断路由）SHA-256 与本轮已验证的本地制品逐一相同。
- 排空 API 并再次确认无活动诊断后，停止并保留原 API/Worker，再启动同镜像的新 API/Worker。应用环境在内存中复用，除镜像构建元数据外逐项一致；端口、网络、restart/init、资源、日志、安全选项均比对一致。没有落盘新的明文环境文件。
- 正式 API `127.0.0.1:4300/ready` 与 `/version` 为 200，Docker health=healthy；API/Worker running、restartCount=0，均读取 Prompt v24 / Orchestration v31，并通过未知调整拒绝、明确否定和未到期窗口检查。Web 未变，3300 `/login` 为 200。切换后仍为活动 0、诊断 23、建议 19。
- 回退容器：`pxxis-prelaunch-20260713-api-1-before-audit-fixes-v20-20260905`、`pxxis-local-ai-validation-worker-before-audit-fixes-v20-20260905`，均停止保留；候选 `pxxis-audit-v20-candidate` 确认无挂载后已清理。PostgreSQL、数据卷和插件未更新。
- 本次只部署本机服务端，不涉及生产发布、Git 提交/推送、真实模型调用或平台操作。用户刷新网页即可使用修复；真实诊断仍由用户在确认数据后显式发起。

## 2026-09-04 项目历史对比 v18 成套切换（用户已确认，本机）

- 切换前确认 `PENDING/RUNNING=0`，并创建数据库备份 `.backups/pxxis-project-history-20260903T222315Z.dump`（485,949 bytes，SHA-256 `7fddb94b0bc230b1d0b691ded9e2ec91728cb647280ecb3b49aecec46983914e`）。随后通过 Prisma 正式应用 `20260903210000_project_history_comparison`，迁移记录和 3 张新表均已核验。
- API/Worker 使用 `pxxis-local-ai-validation:project-history-v18-20260903`（`sha256:9ec50cea5217191223705ed2ff3a1b85166dcbcdab92fb84fd396661042a09c9`）；Web 使用 `pxxis-prelaunch-20260713-web:project-history-v18-20260903`（`sha256:5fe65c756b3e3a8f43796c5583c7e9ff7f9ac5065b32db8d1026b9e6e6027a8a`）。
- 正式容器继续使用 4300/3300、本地后端网络、`unless-stopped` 和 init 配置；4300 `/ready` 成功，`/version` 返回 `0.2.6` / `project-history-v18-20260903`，3300 `/login` HTTP 200，Worker running。切换后 `PENDING/RUNNING=0`。
- 旧 API、Worker、Web 停止保留为 `*-before-project-history-v18-20260903` 回退容器；候选容器已清理，临时环境文件已删除。没有生产部署、平台操作、业务数据清理、commit 或 push。
- Extension 源码、协议和本地解包制品未改动，本功能不需要重新上传、重新安装或重载插件。

## 2026-09-03 项目历史对比候选源码（未构建、未切换）

- 工作树已完成并通过隔离数据库验证，但尚未构建 API、Worker 或 Web 候选镜像，也没有启动候选容器。当前 3300/4300/Worker 仍是下述 v17 运行态。
- 该功能新增 Prisma migration `20260903210000_project_history_comparison`，会创建项目采集轮次、趋势点、分析存档并为 `DecisionRun` 增加输入指纹。没有对当前 PostgreSQL 运行 migration、`db push` 或任何业务写入。
- 将来本机切换需要同时更新 API、Worker、Web，并在切换前确认无活动诊断、备份和应用 migration；不能只替换 Web，因为 API/Worker 和数据库结构共同参与归档及存档状态。
- Extension 协议、源码和本地解包目录没有本次改动，项目历史对比不需要重新上传、安装或重载插件。没有发布、commit、push、真实模型调用或平台操作。

## 2026-09-03 20:13 实验变量 v17 成套切换（用户已确认，本机）

- 用户明确回复“是”后，API、Worker、Web 均已切换至下述已核验的 `diagnosis-experiment-scope-v17-20260903` 镜像，运行镜像 ID 与候选一致。端口仍为本机 API 4300、Web 3300；Worker 无对外端口。
- API/Worker 运行模块均读取到 Prompt v23 / Orchestration v29；“优化商品讲解话术、预算等保持不变、观察商品成交”只识别话术，“优化话术并降价”识别两个变量。3300 `/login`、4300 `/ready` 和 `/version` 均为 200；Web 制品含具体实验失败说明及原有 `connectionSessionId` 恢复逻辑。
- 原应用环境仅在进程内复用，没有输出或落盘明文配置；逐项比较应用环境、端口、网络、restart/init、资源、只读、日志与安全设置一致。三个新容器 running、restartCount=0；PostgreSQL 与数据卷未变。
- 原容器均停止保留，分别为 `pxxis-prelaunch-20260713-api-1-before-diagnosis-experiment-scope-v17-20260903`、`pxxis-local-ai-validation-worker-before-diagnosis-experiment-scope-v17-20260903`、`pxxis-prelaunch-20260713-web-1-before-diagnosis-experiment-scope-v17-20260903`；无遗留 candidate/next 容器。
- 切换前后 `PENDING/RUNNING=0`。最新运行仍为 `cmtkyn9aq000blr07zs55v12d`、FAILED，更新时间仍是 `2026-09-03T03:23:48.988Z`。没有自动模型调用、诊断入队、历史改写、Schema/migration/db push、插件上传、commit/push 或生产部署。
- 用户只需刷新网页，再在已确认数据下显式重新运行以验收真实模型；本轮无需再次上传或重新加载采集插件。此前 Chrome 连接恢复的真实验收仍独立记录。

## 2026-09-03 11:40 实验变量 v17 候选已核验（待授权切换）

- API/Worker 共用镜像 `pxxis-local-ai-validation:diagnosis-experiment-scope-v17-20260903`，ID `sha256:618f3c275646772417db95a7bd42c877874160ca08634e5a575d6ea6b74f29a5`。
- Web 镜像 `pxxis-prelaunch-20260713-web:diagnosis-experiment-scope-v17-20260903`，ID `sha256:b37c5d25ddefa343b080a91ffb3dad0cedb20276e4771f3ac7a7c6a78da6acbe`，构建 API 地址仍为 `http://127.0.0.1:4300`。
- 候选 API 4304 `/ready`、`/version` 为 200；镜像内 Prompt v23 / Orchestration v29、24/24 无网络合成评测通过，合法控制只识别话术，真实“话术+降价”识别两个变量。候选 Web 无外网环境登录页 200，编译制品含具体实验错误文案及既有连接恢复逻辑。
- 当前本机 Web/API 仍为连接恢复 v16，Worker v15。活动诊断为 0；本次失败仍为 FAILED、更新时间仍为 03:23:48.988Z。候选仅健康/版本检查，不创建诊断或消费队列。
- 切换范围必须包含 API、Worker、Web；不改已有应用配置、数据卷、Schema、插件或生产归档。按项目操作边界，需用户确认本次本机切换；真实模型由用户在确认数据后显式触发，不能把合成结果当成实际验收。
- 两个候选均确认无挂载后停止移除，镜像保留，没有遗留候选进程。

## 2026-09-03 11:20 连接恢复 Web/API 成套切换（用户已确认，本机）

- 用户明确确认后，`pxxis-prelaunch-20260713-api-1` 与 `pxxis-prelaunch-20260713-web-1` 已切换到下述已核验的 `connection-recovery-v16-20260903` 镜像，端口仍为本机 4300/3300。新镜像 ID 与候选记录一致。
- 原应用环境仅在进程内复用，切换后逐项比较一致；没有生成明文配置文件。网络、启动命令、运行用户、端口、restart/init 等配置保持。
- 3300 `/login`、4300 `/ready`、`/version` 为 HTTP 200，`gitSha=connection-recovery-v16-20260903`；运行 API 为 Bridge 9 / Collection 8；Web 编译制品核验到 `connectionSessionId` 与“当前任务连接尚未验证”。切换前后 `PENDING/RUNNING` 诊断均为 0。
- 两个旧容器停止保留，名称分别为 `pxxis-prelaunch-20260713-api-1-before-connection-recovery-v16-20260903`、`pxxis-prelaunch-20260713-web-1-before-connection-recovery-v16-20260903`；无遗留 next/candidate 容器。Worker 继续使用 v15，PostgreSQL、数据卷、Schema、历史诊断、生产环境、Git 未变。
- 本地插件文件已更新，用户仅需在 Chrome 对原目录重新加载，再刷新任务页与目标后台页；指纹为 `71da1f485d4f`，不需重新上传或卸载。Chrome 重载与配对恢复尚待用户实际验收。

## 2026-09-03 连接恢复候选制品（未切换 3300/4300）

- API 镜像 `pxxis-local-ai-validation:connection-recovery-v16-20260903`，镜像 ID `8a090cb47093e4839fce3e3b8de683c85819c518f6a65916526d1991e3704b04`；候选 4304 `/ready`、`/version` 返回 200，`gitSha=connection-recovery-v16-20260903`，Bridge `9` / Collection `8`。
- Web 镜像 `pxxis-prelaunch-20260713-web:connection-recovery-v16-20260903`，镜像 ID `deb2f23aa654c97a36b9830852eb4ef5152da483eb011482504758056858a39c`，构建目标 API 为 `http://127.0.0.1:4300`；无外网候选容器内 `/login` 返回 200。
- 本地解包插件路径不变，指纹 `71da1f485d4f`，Bridge `9` / Collection `8`；生产 ZIP、版本号和发布标签未修改。
- 两个候选已确认无挂载后停止并移除，镜像保留用于经授权切换。候选 API 只核验健康/版本，未触发诊断、配对或采集；测试在独立 PostgreSQL 完成。
- 当前用户端仍运行 Web `decision-experiment-view-v14-20260901` 与 API/Worker `decision-experiment-transaction-v15-20260902`；未修改其环境、容器、数据库、端口和生产部署。待用户明确授权后同时替换本机 Web/API；不应单独要求用户先重载 Bridge 9 插件。

> 当前部署/本机运行态结论以 [NOW.md](./NOW.md) 为准；本文件保留每次切换的完整历史，不得以较早镜像记录推断当前容器。

## 2026-09-02 v0.2.6 发布完成（非生产部署）

- 源码版本已统一为 `0.2.6`，发布脚本从源码提交 `89a5de704f91` 生成 `apps/extension/release/collector-v0.2.6-89a5de704f91.zip`；`buildTarget=production`、`localTestOnly=false`。
- 制品 SHA-256 为 `48668223d1a5dedfcae4c9ae59152ad36e20371facc95076632ba06c0d69720a`；本机 API/Web/Worker、数据库、Schema、迁移和生产环境均未因本次上传动作切换或修改。
- GitHub 主分支已上传，GitHub 对应制品提交为 `0b019b827a7d`，标签 `v0.2.6` 与 [Release](https://github.com/x110006959-tech/douyin-touliu/releases/tag/v0.2.6) 已创建并附带 ZIP 与 SHA-256 校验文件；标准 Git HTTPS 上传连接超时后改用 GitHub 标准 Git 数据接口，未强推或覆盖已有引用。

## 2026-09-02 诊断限流事务边界 v14 切换（本机，非生产）

- 在前一版决策/实验一致性运行态基础上，修复限流检查仍使用全局 Prisma 客户端的问题。新镜像 `pxxis-local-ai-validation:decision-experiment-transaction-v14-20260902` 由 API 与 Worker 共用；Web 继续运行 `pxxis-prelaunch-20260713-web:decision-experiment-view-v14-20260901`。
- 候选 API `127.0.0.1:4304` 通过 `/ready`、`/version` 与 Prompt v21 / Orchestration v27 / SkillSet v9 检查；切换前只读确认 `PENDING/RUNNING=0`。正式 4300 `/ready`、`/version` 与 3300 登录页均为 200，`/version.gitSha=decision-experiment-transaction-v14-20260902`，Worker running，活动诊断仍为 0。
- 原 API/Worker 停止保留为 `*-before-decision-experiment-transaction-v14-20260902` 回退容器；候选无挂载并已清理。PostgreSQL、数据卷、Schema、历史诊断、业务数据、平台状态和外部流量未改动。
- 切换后串行执行全仓质量门禁：526 项测试、lint、typecheck、build、Prisma validate/generate、version check、diff check、24/24 合成评测全部通过。未自动调用模型、创建建议、执行建议、迁移、`db push`、commit、push 或生产部署。

## 2026-09-01 决策/实验一致性 v13/v14 切换（本机，非生产）

- 构建 API/Worker `pxxis-local-ai-validation:decision-experiment-contract-v13-20260901` 与 Web `pxxis-prelaunch-20260713-web:decision-experiment-view-v14-20260901`。候选 API `127.0.0.1:4304` 和候选 Web `127.0.0.1:3301` 均返回 HTTP 200；候选镜像内核对为 Prompt v21 / Orchestration v27 / SkillSet v9。
- 切换前以只读数据库查询确认 `PENDING/RUNNING=0`，之后新 API、Worker、Web 接管 4300/3300/既有 Worker 名称。切换后 4300 `/ready`、`/version` 与 3300 登录页均为 200，`/version.gitSha=decision-experiment-contract-v13-20260901`，Worker 正在运行，活动诊断仍为 0。
- 原 API、Worker、Web 已停止并保留为 `*-before-decision-experiment-*-20260901` 回退容器；候选容器均无数据卷或宿主机挂载，已清理。PostgreSQL 容器、数据卷、Schema、历史诊断、业务数据和外部流量均未改动。
- 实际通过：定向诊断 18 项、API 31 文件/160 项、Web 49 项、全仓 526 项测试、lint、typecheck、build、Prisma validate/generate、version check、diff check 和 24/24 合成评测。未自动调用模型、创建或执行建议、执行 migration、`db push`、平台操作、commit、push 或生产部署。

## 2026-09-01 目标数值归一化 v12/v13 切换（本机，非生产）

- 构建 API/Worker `pxxis-local-ai-validation:diagnosis-target-normalization-v12-20260901` 与 Web `pxxis-prelaunch-20260713-web:diagnosis-review-view-v13-20260901`。候选 4304/3301 通过 `/ready`、`/version`、登录页 200；候选 API 对现有运行 `cmti43z490006se0104jnubtb` 实测返回 `DELIVERY_ROI` 和 44.59 < 60 的服务端复核结论后，正式接管 4300/3300/Worker，候选删除。
- 正式运行加载 Prompt v20 / Orchestration v26 / SkillSet v8；4300 `/ready`、`/version` 与 3300 登录页均为 200，Worker running，切换前后 `PENDING/RUNNING=0`。原 v11/v12 API、Worker、Web 停止保留为回退。
- 全仓 lint、typecheck、522 项测试、build、Prisma validate/generate、version check、diff check 与 24/24 合成评测通过。最新运行仍是原成功记录，没有自动模型调用、历史数据改写、Schema、migration、`db push`、平台操作、commit、push 或生产部署。

## 2026-09-01 诊断领域投影 v11/v12 切换（本机，非生产）

- 构建 API/Worker `pxxis-local-ai-validation:diagnosis-domain-projection-v11-20260901` 与 Web `pxxis-prelaunch-20260713-web:diagnosis-domain-view-v12-20260901`。候选 4304/3301 先通过 `/ready`、`/version`、登录页 HTTP 200 与镜像版本静态检查，再正式接管 4300/3300/Worker；候选随后删除。
- 正式运行加载 Prompt v19 / Orchestration v25 / SkillSet v8；4300 `/ready`、`/version` 和 3300 登录页均为 200，Worker 为 running，切换前后 `PENDING/RUNNING=0`。原 v10/v11 API、Worker、Web 已停止保留为回退容器。
- 全仓 lint、typecheck、521 项测试、build、Prisma validate/generate、version check、diff check 与 24/24 合成评测通过。最新 `DecisionRun` 仍为用户历史失败 `cmthewh1i0005mi0748luk3jh`；没有自动调用模型、创建建议、修改 Schema、migration、`db push`、平台操作、commit、push 或生产部署。

## 2026-08-31 诊断否定语义边界 v10/v11 切换（本机，非生产）

- 构建 API/Worker `pxxis-local-ai-validation:diagnosis-boundary-fix-v10-20260831` 与 Web `pxxis-prelaunch-20260713-web:diagnosis-error-view-v11-20260831`。候选 4304/3301 的 ready、version、HTTP 与镜像静态检查通过后，正式接管 4300/3300/Worker。
- 正式运行加载 Prompt v18 / Orchestration v24 / SkillSet v7；3300 登录页、4300 `/ready`、`/version` 均为 200，Worker 运行，切换前后 `PENDING/RUNNING=0`。候选已停止，原 v9/v10 运行容器停止保留为回退。
- 全仓 lint、typecheck、521 项测试、build、Prisma validate/generate 与 24/24 合成评测通过。历史失败运行和业务数据未改写；没有自动调用模型、创建建议、migration、`db push`、生产部署、平台操作、commit 或 push。

## 2026-08-31 诊断可信度 v9/v10 切换（本机，非生产）

- 构建 API/Worker `pxxis-local-ai-validation:diagnosis-trust-v9-20260831` 与 Web `pxxis-prelaunch-20260713-web:diagnosis-trust-view-v10-20260831`。候选 4304/3301 先通过 ready、version 和 HTTP 200；镜像内确认 Prompt v17 / Orchestration v23 / SkillSet v6、确定性冲突门禁存在，Web 构建产物不存在“AI 诊断尚未就绪”。
- 首次并行构建因外部依赖仓库连接超时失败，顺序重试后两镜像均成功。切换期间 Docker 容器操作锁死，重启本机 Docker Desktop 后恢复；PostgreSQL 数据卷保持不变，最终正式 API 4300、Web 3300 和 Worker 均运行，HTTP 健康检查为 200。
- 切换前后 `PENDING/RUNNING=0`。原 v8 API/Worker 与 v9 Web 停止保留为回退容器；3301/4304 候选也停止保留。历史诊断、两条既有建议、Schema、Extension 和业务数据未修改。
- 全仓 lint、typecheck、517 项测试、build、Prisma validate/generate 与 24/24 合成评测通过。没有自动调用模型、创建新运行、审批或执行建议，也没有 migration、`db push`、生产部署、commit 或 push。

## 2026-08-31 AI 结构修复详情切换（本机，非生产）

- 从当前工作树构建 `pxxis-local-ai-validation:diagnosis-repair-detail-v8-20260831`。候选 API 在 `127.0.0.1:4304` 返回 `/ready` 与 `/version` 200，并静态核对包含安全诊断门禁原因传递和 Skill 错误码保留逻辑。
- 切换前后数据库中 `PENDING/RUNNING` AI 运行均为 0。正式 API/Worker 随后接管 4300/既有 Worker；4300 `/ready`、`/version` 与 3300 首页均为 200，Worker 保持运行，运行版本为 `diagnosis-repair-detail-v8-20260831`。候选已删除。
- 原 `target-roi-v7-20260830` API/Worker 停止保留为 `*-before-diagnosis-repair-detail-v8` 回退容器。Web、PostgreSQL、数据卷、Schema、Extension 和历史诊断记录未修改。
- 没有自动调用 DeepSeek、创建动作建议、执行 migration、`db push`、平台操作、生产部署、commit 或 push。

## 2026-08-31 目标 ROI 视觉收口（本机，非生产）

- 目标 ROI 输入从独立白底小卡改为与经营总览头部一致的深色半透明横向控件；保存状态使用低干扰指示，不改动输入、自动保存、诊断或服务端逻辑。
- 已通过 lint、typecheck、全仓 514 项测试、build、Prisma validate/generate。候选 Web `pxxis-prelaunch-20260713-web:target-roi-view-v9-20260831` 在 `127.0.0.1:3301` 健康且返回 200 后接管 `127.0.0.1:3300`；候选容器已删除，v8 Web 停止保留为本机回退。
- API/Worker、PostgreSQL、数据卷、Extension 与 4300 API 未修改；切换后 Web 首页、API `/ready`、`/version` 均为 200。未发起诊断、模型调用、平台操作、migration、`db push`、commit、push 或生产部署。

## 2026-08-31 目标 ROI 自动保存并发收口（本机，非生产）

- 审计发现：自动保存请求已发出但尚未返回时立即创建诊断，会将同一草稿再次排入写入链。现在改为等待在途保存的结果；仅在保存确认后创建诊断，失败会明确阻止创建。没有修改服务端接口、Schema 或任何业务数据。
- 已通过根目录 lint、typecheck、全仓 514 项测试、build、Prisma validate/generate。候选 Web `pxxis-prelaunch-20260713-web:target-roi-view-v8-20260831` 在 `127.0.0.1:3301` 健康且返回 200 后接管 `127.0.0.1:3300`；候选容器已删除，v7 Web 停止保留为本机回退。
- API/Worker、PostgreSQL、数据卷、Extension 与 4300 API 未修改；切换后 Web 首页、API `/ready`、`/version` 均为 200。未发起诊断、模型调用、平台操作、migration、`db push`、commit、push 或生产部署。

## 2026-08-31 目标 ROI 本机切换（非生产）

- 从当前工作树构建 API/Worker `pxxis-local-ai-validation:target-roi-v7-20260830` 与 Web `pxxis-prelaunch-20260713-web:target-roi-view-v7-20260830`。候选 API 在 `127.0.0.1:4304`、候选 Web 在 `127.0.0.1:3301` 先后返回 HTTP 200；候选已在正式切换后删除。
- 切换前查询 `PENDING/RUNNING=0`；正式 API、Worker、Web 接管 4300/3300 后 `/ready`、`/version` 与首页为 200，容器内确认 `server-determined-skill-plan-v22`。旧 API、Worker、Web 停止并保留为本机回退，未删除数据库或数据卷。
- 真实 Chrome 登录态刷新经营大屏后，确认目标 ROI 输入在标题栏中央、保存按钮按草稿启停、清空能回到未设置状态。未点击保存或生成诊断，未调用模型、创建建议或执行平台动作。
- 本次没有 migration、`db push`、生产部署、commit 或 push。

## 2026-08-30 决策缺口精简 v6 本机切换（非生产）

- API/Worker 镜像 `pxxis-local-ai-validation:diagnosis-boundary-v6-20260830` 先在 4304 验证 ready 与 Prompt v16；Web 候选先后在 3301 验证，最终运行镜像为 `diagnosis-boundary-view-v6-1-20260830`。
- 切换前后 `PENDING/RUNNING=0`。当前 4300 ready/version、3300 首页均为 200，API/Web healthy，Worker 运行；候选容器均在确认零挂载后删除，上一版容器停止保留为本机回滚。
- 已在真实 Chrome 登录态刷新现有历史结果：重复历史缺口归并，页面无“同直播类型”、无旧实验区、业务主区无原始证据编号。未重跑模型或改写历史诊断。
- 未修改 PostgreSQL、数据卷、Extension、Schema 或业务动作状态；未执行 migration、`db push`、生产部署、平台操作、commit 或 push。

## 2026-08-30 经营化诊断 v5 本机切换（非生产）

- API 候选镜像 `pxxis-local-ai-validation:diagnosis-business-v5-20260830` 先在 `127.0.0.1:4304` 通过 ready 与 Prompt v15 / SkillSet v5 静态核验，Web 候选 `pxxis-prelaunch-20260713-web:diagnosis-business-view-v5-20260830` 在 `127.0.0.1:3301` 返回 HTTP 200；候选容器均为零挂载并在切换后删除。
- 切换前确认 `PENDING/RUNNING=0`。当前 API、Worker、Web 已分别接管 4300/3300；API 与 Web 健康，Worker 运行，镜像内加载 Prompt v15 / Orchestration v21 / SkillSet v5，模型仍为 `deepseek-v4-flash`。
- 上一版 API、Worker、Web 分别停止保留为 `*-before-business-v5-20260830` 本机回滚容器。PostgreSQL、数据卷、Extension、Schema 和既有业务记录未修改；未自动发起模型诊断或创建建议。
- Chrome 打开 3300 任务页时现有会话已过期，只能看到重新登录提示，因此本轮尚缺登录态业务页面目检。静态构建和 HTTP 200 不能替代该验收。
- 未执行 migration、`db push`、生产部署、平台操作、commit 或 push。

## 2026-08-30 成功诊断结果兼容切换与旧容器清理（本机，非生产）

- 候选 API `persisted-evidence-v25-20260830` 在 4304、候选 Web `diagnosis-result-v4-20260830` 在 3301 均返回 HTTP 200；切换前队列为空。随后 API/Worker/Web 分别接管 4300/3300，正式健康检查均为 200。
- 已使用用户实际 Chrome 会话重新加载两个原报错标签页，页面标题恢复为 `pxxis 本地生活投流诊断`，完整展示成功诊断、合法证据链接和 5 条待人工审批建议。
- 删除 18 个停止、无挂载的候选或历史回滚容器。保留当前 Web/API/Worker/PostgreSQL，以及 `evidence-repair-v24-20260830` API/Worker 和 `diagnosis-error-detail-v3-20260830` Web 三个最近回滚；所有数据卷、数据库、其他项目容器和镜像均未删除。
- 未执行 migration、`db push`、生产部署、平台操作、自动审批、commit 或 push。

## 2026-08-30 证据引用修复与失败详情切换（本机，非生产）

- API 候选使用 `pxxis-local-ai-validation:evidence-repair-v24-20260830` 在 `127.0.0.1:4304` 通过数据库 ready、version 及容器内 Prompt v14 / Orchestration v21 检查；随后 API 与 Worker 接管现有本机服务，模型仍为 `deepseek-v4-flash`。
- Web 候选使用 `pxxis-prelaunch-20260713-web:diagnosis-error-detail-v3-20260830` 在 `127.0.0.1:3301` 返回 HTTP 200，随后接管 `127.0.0.1:3300`。正式 3300 首页、4300 ready/version 均为 200。
- 切换前 `PENDING/RUNNING=0`。旧 v23 API/Worker 与旧 Web 均停止保留为回滚容器，两个候选也已停止保留；PostgreSQL、Extension、数据卷和业务记录未修改。
- 本次没有自动重跑真实诊断、没有执行 migration、`db push`、生产部署、平台操作、commit 或 push。

## 2026-08-30 DeepSeek Flash 模型切换（本机，非生产）

- 已构建 `pxxis-local-ai-validation:flash-v23-20260830`，候选 API 先在 `127.0.0.1:4303` 验证 ready、version 和 Flash 环境配置后，正式 API 接管 `127.0.0.1:4300`，Worker 随后切换为同一镜像。
- 实际核验：4300 `/ready`、`/version` 均为 HTTP 200，API 和 Worker 的 `DEEPSEEK_MODEL` 均为 `deepseek-v4-flash`。用正式 API 容器仅调用 DeepSeek `GET /models`，返回 HTTP 200 且该模型可用；没有发送提示词或创建业务记录。
- 切换前 `PENDING/RUNNING=0`。旧 v22 API 与 Worker、4303 候选均停止保留；未重建 Web、Extension 或 PostgreSQL，未执行 migration、`db push`、数据清理、生产部署、平台操作、commit 或 push。

## 2026-08-30 DecisionRun 版本留痕修复切换（本机，非生产）

- 已构建并切换 `pxxis-local-ai-validation:fixed-skill-plan-v22-20260830`。候选 API 先在 `127.0.0.1:4302` 通过 ready、version 与 SkillSet v4 核验；正式 API 及 Worker 随后接管现有本机服务。
- 实际核验：4300 `/ready`、`/version` 均为 HTTP 200，运行产物包含 `strategyVersion: diagnosisSkillSetVersion`，Worker 保持运行；切换时 `PENDING/RUNNING=0`。旧 v21 API/Worker 停止保留为可恢复回退，4302 候选停止保留。
- 以运行容器的服务端凭据对 DeepSeek 模型列表执行无生成校验，HTTP 200 且配置模型存在；未发送提示词、创建运行或产生平台动作。
- 未重建 Web、Extension 或 PostgreSQL；未执行 migration、`db push`、数据清理、生产部署、平台操作、commit 或 push。

## 2026-08-30 双路线实时 AI 诊断修复切换（本机，非生产）

- 已从当前工作树构建 `pxxis-local-ai-validation:fixed-skill-plan-v21-20260829`。候选 API 先在 `127.0.0.1:4301` 完成 ready、version 与容器内 SkillSet v4 检查；随后正式 API 接管 `127.0.0.1:4300`，Worker 也切换为同一镜像。
- 实际核验：4300 `/ready` 与 `/version` 均为 HTTP 200；API 与 Worker 均加载 `managed-live-growth-skills-v4`，且切换时 `PENDING/RUNNING` 队列为 0。旧 v20 API 和 Worker 已停止保留为本机回退，4301 候选已停止保留。
- 本次仅修复本机运行态中双路线实时证据的正式层误判；没有重建 Web/插件/PostgreSQL、没有 migration、`db push`、数据清理、生产部署、平台操作、commit 或 push。三条旧失败运行未删除。

## 2026-08-29 本机 AI 验收 API/Worker 切换（非生产部署）

- 从当前工作树构建 `pxxis-local-ai-validation:fixed-skill-plan-v20-20260829`；候选 API 先绑定 `127.0.0.1:4301`，通过数据库 ready、版本和 AI 配置预检后，正式实例接管 `127.0.0.1:4300`。运行 `/version` 为 `0.2.5 / local-ai-v20-20260829`，3300 Web、4300 API 和 PostgreSQL 均返回健康结果。
- 新增本机 Worker 容器 `pxxis-local-ai-validation-worker`，使用同一受限 Docker 网络与服务端环境。它通过配置预检并保持运行；切换前后均确认没有待领取的 AI 运行，所以未调用模型、未创建 `DecisionRun`、`ActionProposal` 或 `ActionOutcome`。
- 旧 API 停止保留为 `pxxis-prelaunch-20260713-api-1-rollback-ai-v20-20260829`；4301 候选容器已移除。Web、PostgreSQL、数据卷、Schema、migration、业务数据、生产环境、DNS 和平台页面均未修改。
- 这只使本机环境具备受控诊断条件。当前数据库缺少新鲜且完整人工复核的证据，仍需用户手动采集/复核后再显式创建一次诊断；所有平台动作继续由用户手动完成。

## 2026-08-29 本机运行态复核（非生产部署）

- 已只读核验当前容器：Web `pxxis-prelaunch-20260713-web-1` 使用 `dashboard-pulse-cadence-30s-20260828`，API `pxxis-prelaunch-20260713-api-1` 使用 `local-promotion-contract-v2-20260828`，PostgreSQL 均为 healthy。
- `http://127.0.0.1:3300/`、`http://127.0.0.1:4300/ready` 与 `/version` 均返回 HTTP 200；运行 API 报告产品/插件版本 `0.2.5`、构建 SHA `4ffdf9d3a639`、采集协议 `8`。
- 当前工作树另有未提交的实时趋势路线隔离补丁，尚未进入该 API 容器；本次仅记录事实，没有重建、替换容器、执行 migration、`db push`、平台操作或生产部署。

## 2026-08-28 v0.2.5 GitHub 发布（非生产部署）

- 已从源码基线 `4ddacd590d55` 生成生产扩展归档 `collector-v0.2.5-4ddacd590d55.zip`，发布清单标记 `buildTarget=production`、`localTestOnly=false`；SHA-256 为 `95ac90bb5bb7637d47c6586cd0db787702a201b93d2fdfdb3ef283b2b7f7b94b`。
- GitHub Release 使用标签 `v0.2.5`：[打开 Release](https://github.com/x110006959-tech/douyin-touliu/releases/tag/v0.2.5)。
- 本次是源码与扩展归档上传，不是生产部署；未执行 migration、`db push`、容器替换、平台操作或业务数据清理。数据库、Prisma Schema、数据卷和采集配置不变。

## 2026-08-28 实时采集 30 秒节拍 Web 本机运行态切换（非生产部署）

- 已从当前工作树构建 `pxxis-prelaunch-20260713-web:dashboard-pulse-cadence-30s-20260828`，构建时固定 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`；经营数据总览会明确显示“实时 API 约每 30 秒更新一次”。
- 候选容器先在 `127.0.0.1:3301` 验证 healthy、HTTP 200，且 `.next` 产物包含该 30 秒文案；随后新镜像已接管 `127.0.0.1:3300`，容器 healthy、首页 HTTP 200，API `/ready` 也为 HTTP 200。
- API、PostgreSQL、数据卷、Schema、采集配置和业务数据均未修改。之前的旧 Web 回退容器及不再使用的旧项目镜像标签已在随后按用户要求清理。
- 本次仅为本机验收运行态更新，不是生产部署；未执行 migration、`db push`、平台操作、commit 或 push。已打开的任务大屏需要硬刷新一次以加载新静态资源。

## 2026-08-28 本机 Docker 多余回退资源清理（非生产操作）

- 已删除以下 5 个已停止且无挂载的旧回退容器：旧 Web 节拍版、旧 API 版本、旧 Web 本地推直显版、旧 Web 视觉版、旧 Web 路线门禁版；同时移除对应 5 个不再被使用的项目镜像标签。
- 当前 `pxxis-prelaunch-20260713` 仅保留 Web `dashboard-pulse-cadence-30s-20260828`、API `local-promotion-contract-v2-20260828`、PostgreSQL 三个运行容器，均 healthy；3300/4300 HTTP 200。
- 其他项目容器、PostgreSQL 数据卷和业务数据均保留。旧回退资源删除后不可直接通过容器名回退，需要重新构建镜像；未执行数据清理、migration、`db push`、生产部署、平台操作、commit 或 push。

## 2026-08-28 经营大屏移除小时趋势运行态切换（非生产部署）

- 用户反馈页面仍显示“小时趋势”后，确认 `127.0.0.1:3300` 仍运行此前的 `dashboard-local-direct-20260828` 旧镜像；源码修改尚未进入运行容器。
- 已从当前工作树构建 `pxxis-prelaunch-20260713-web:dashboard-no-hourly-trend-20260828`，构建时固定 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`。候选容器先在 `3301` 通过 healthy、HTTP 200，且 `.next` 产物不含“小时趋势”。
- 新镜像现已接管 `3300`，容器 healthy、首页 HTTP 200；旧 Web 停止保留为 `pxxis-prelaunch-20260713-web-1-before-no-hourly-trend-20260828`。API、PostgreSQL、数据卷、Schema、采集配置和业务数据均未修改。
- 本次仅为本机验收运行态更新，不是生产部署；未执行 migration、`db push`、平台操作、commit 或 push。已打开的任务页需要硬刷新一次以加载新静态资源。

## 2026-08-28 采集路线门禁 Web 本机运行态切换（非生产部署）

- 从当前工作树构建 `pxxis-prelaunch-20260713-web:dashboard-route-gate-20260828`，用于交付采集页“两条路线完成后进入经营大屏”的灰色按钮、缺失路线提示和自动跳转逻辑；构建时固定 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`。
- 候选容器在 `127.0.0.1:3301` 通过 HTTP 200，且编译产物包含“两条路线均有完整实时指标或正式采集结果后，按钮将可用。”；正式 Web 已接管 `127.0.0.1:3300`，当前 healthy、首页 HTTP 200。
- 旧 Web 容器停止保留为 `pxxis-prelaunch-20260713-web-1-before-route-gate-20260828`。API 仍为 `pxxis-prelaunch-20260713-api:local-plugin-v0.2.5` 且 healthy；PostgreSQL、数据卷、业务数据、Schema、Extension 和采集配置均未修改。
- 本次为本机验收运行态更新，不是生产部署；未执行 migration、`db push`、数据清理、平台操作、commit 或 push。已打开的任务页需刷新一次加载最新静态资源。

## 2026-08-28 经营大屏 Web 本机运行态切换（非生产部署）

- 为解决用户看到旧版浅色布局的问题，已将本机 `127.0.0.1:3300` 的 Web 从旧镜像 `pxxis-prelaunch-20260713-web:current-bridge8-local-promotion-20260827` 切换为当前工作树构建的 `pxxis-prelaunch-20260713-web:dashboard-overview-20260828`。构建时注入 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`。
- 候选容器先在 `127.0.0.1:3301` 验证 HTTP 200，再按原 Web 的网络、端口、只读文件系统、资源限制和健康检查参数接管 `3300`；正式容器当前 healthy，首页 HTTP 200。独立浏览器标签页已实际确认新版任务大屏结构加载。
- 旧 Web 容器已停止保留为 `pxxis-prelaunch-20260713-web-1-before-dashboard-overview-20260828`，可供本机人工回退。API 容器仍为 `pxxis-prelaunch-20260713-api:local-plugin-v0.2.5` 且 healthy。
- 未修改 PostgreSQL、数据卷、业务数据、Prisma Schema、API/Extension 运行态或采集配置；未执行 migration、`db push`、生产部署、发布、平台操作、commit 或 push。用户应硬刷新已打开的旧任务页或重新进入大屏。

## 2026-08-28 插件 0.2.5 本机验收制品（非生产部署）

- 已从当前工作树重建本地 unpacked Extension：`apps/extension/release/local-unpacked-test-extension`，manifest/build metadata 为产品/插件 `0.2.5`、Bridge `8`、采集协议 `8`、源码指纹 `a8ed2e9f7b77`。
- 为保持 API 的插件版本门禁一致，4300 端口已切换到镜像 `pxxis-prelaunch-20260713-api:local-plugin-v0.2.5`；容器 healthy，`/ready` 返回 database ready，`/version` 返回产品/插件 `0.2.5`。旧容器 `pxxis-prelaunch-20260713-api-1-before-plugin-v0.2.5` 已停止保留。
- 本次只更新版本和本机运行制品；未执行 Prisma migration、`db push`、数据库清理、生产部署、发布或商店上架。ROI 采集契约没有变化。
- 用户需在 Chrome 扩展管理页手动重载本地解包目录，刷新已打开页面后再做真实采集验收。

## 2026-08-28 双页并行采集本地解包制品（未部署）

- 已从当前工作树重建本地 unpacked Extension：`apps/extension/release/local-unpacked-test-extension`，源码指纹 `a8ed2e9f7b77`，产品 `0.2.4`、Bridge `8`、采集协议 `8`。
- 本轮只更新插件的按标签页实时采集状态隔离；没有替换 API/Web 容器，没有修改 API 开关、数据库、Schema、数据卷或业务数据，也没有执行平台操作。
- 用户需手动在 Chrome 扩展管理页重载该目录并刷新两条目标页面后验收；本地 API 仍为此前已授权切换的 healthy 运行态。

## 2026-08-28 本地推 13 项契约本机运行态切换（非生产部署）

- 源码和最终本地解包插件已构建为契约 `2026-08-28.1 / 1.2.0`、指纹 `f4f61b2bb11d`；按用户授权已将本机 4300 端口切换到 `pxxis-prelaunch-20260713-api:local-promotion-api-20260828`。
- 切换后 API 容器 healthy，`/ready` 返回 database ready，`/version` 返回提交 `4ffdf9d3a639`、构建时间 `2026-08-28T00:00:00Z`；容器内共享契约核对为 `2026-08-28.1 / 1.2.0`。
- 原 API 已停止并保留为 `pxxis-prelaunch-20260713-api-1-before-local-promotion-api-20260828` 回退副本；Web healthy 且 `127.0.0.1:3300` HTTP 200。PostgreSQL、数据卷、业务数据、端口和开关未改动。
- 已删除 4 个更早、已退出且无挂载的 API/Web 回退容器；运行中的数据库、缓存、网关和其他服务未删除。Chrome 真实 13 项上传仍待用户重载插件、刷新精确页面并手动开始采集。

## 2026-08-25 本机任务页失效脚本恢复运行态（非生产部署）

- 本机 Web 已切换为 `pxxis-prelaunch-20260713-web:bridge-reload-recovery-20260825`，继续只绑定 `127.0.0.1:3300`；正式容器 healthy，任务页 HTTP 200，静态产物包含 `EXTENSION_CONTEXT_INVALIDATED` 与“刷新当前页面”。
- 候选容器先在 `127.0.0.1:3301` 通过任务页 HTTP 200。旧 Web 已停止保留为 `pxxis-prelaunch-20260713-web-1-before-bridge-reload-recovery-20260825`，未删除。
- Compose 启动在创建容器前因当前 shell 缺少必填 `POSTGRES_PASSWORD` 而退出；没有读取或输出任何密钥。新 Web 随后按旧容器等价的无密钥运行参数直接启动。
- API、PostgreSQL、数据库卷、Schema、业务数据及 `127.0.0.1:4300` 均未改变；这不是生产部署，未执行 migration、`db push`、平台采集、commit 或 push。
- 本地 unpacked 已重建为 `0.2.4 / Bridge 8 / 36d8284e5dd7`，仍需用户在 Chrome 手动重载并刷新已打开页面。

## 2026-08-25 本地 API-only Extension 稳定性制品（未部署）

- 本地 unpacked Extension 已从当前工作树重建为 `0.2.4 / Bridge 8 / 0718bfb63416`。制品修复持续采集瞬时通信断开、本地推请求执行上下文，并移除本地推快照入口。
- 编译产物已确认 Popup 不含“采集并上传数据总览”，Service Worker 包含固定本地推 API-only 适配器；重建后 Extension 149 项测试通过。
- 未替换 Web/API 容器，既有本机 `task-auto-sync-bridge8-20260824` 运行态和内部 API 灰度开关保持不变。PostgreSQL、数据卷、Schema、业务数据均未触碰。
- 该制品不是生产 zip、Chrome 商店上架或服务器部署；用户仍需在 Chrome 扩展管理页手动重新加载目录后验收。

## 2026-08-24 本机任务页插件自动同步运行态（非生产部署）

- 经用户明确授权，从当前工作树构建 `pxxis-prelaunch-20260713-api:task-auto-sync-bridge8-20260824` 与 `pxxis-prelaunch-20260713-web:task-auto-sync-bridge8-20260824`。构建前一次 BuildKit 因 Docker Hub IPv6 鉴权连接失败，未改运行容器；随后使用项目既有 Windows 兼容构建方式成功完成。
- API/Web 候选容器先分别通过 HTTP 200；随后标准容器 `pxxis-prelaunch-20260713-api-1`、`pxxis-prelaunch-20260713-web-1` 完成切换并均为 healthy，端口仍只绑定 `127.0.0.1:4300/3300`。
- 运行 API `/ready` 返回 database ready，`/version` 返回 `gitSha=task-auto-sync-bridge8-20260824`、产品 `0.2.4`、Schema `20260731_v035_ai_skill_diagnosis`、采集协议 `8`；运行 Web/API 共享 Bridge 协议均为 `8`，Web 静态产物包含 `SYNC_CURRENT_TASK`。
- 旧容器已停止保留为 `pxxis-prelaunch-20260713-api-1-before-task-auto-sync-bridge8-20260824` 与 `pxxis-prelaunch-20260713-web-1-before-task-auto-sync-bridge8-20260824`。PostgreSQL 容器 `4b3e9e0a2120`、数据卷 `pxxis-prelaunch-20260713_postgres-data` 未替换；切换前后 Project `11`、CollectionTask `12`、CollectionRun `8`、DataSnapshot `62`、DecisionRun `1`。
- 本机灰度配置原样复用：直播与本地推内部 API 开启，AI 诊断关闭；没有生成新密钥。Chrome 本机页面强制刷新后只读识别插件 `0.2.4 / Bridge 8 / c0fefa29d3f6`，协议错位已消除。
- 本次不是生产部署，没有执行 migration、`db push`、业务数据写入、真实平台采集、commit 或 push。用户原任务页仍需刷新并人工确认同账号/异账号/持续采集等交互场景。

## 2026-08-22 本地插件 Popup 路线状态修复（未部署）

- 本地 unpacked Extension 已重建为指纹 `2d98d7dfa35e`。Popup 仅显示当前标签且路线匹配的 PULSE，避免运行中的直播会话被误显示为本地推 API 已采集。
- 本轮未替换 API/Web 容器，没有修改 `LOCAL_PROMOTION_INTERNAL_API_ENABLED=true` 的本机灰度状态，也没有发起平台请求、迁移或业务数据写入。

## 2026-08-22 本机启用本地推 API 持续采集（非生产部署）

- 用户明确授权后，仅为本机 `127.0.0.1:4300` API 容器设置 `LOCAL_PROMOTION_INTERNAL_API_ENABLED=true`。`LIVE_SCREEN_INTERNAL_API_ENABLED=true` 保持既有本机灰度，`AI_DIAGNOSIS_ENABLED=false` 未改变；默认 Compose 值和其他环境仍为 false。
- 从当前工作树构建并替换 API/Web 为 `pxxis-prelaunch-20260713-api:local-promotion-api-20260822`、`pxxis-prelaunch-20260713-web:local-promotion-api-20260822`，端口继续仅绑定 `127.0.0.1:4300/3300`。`/ready` 返回 database ready，Web 首页 HTTP 200。
- 旧容器停止保留为 `pxxis-prelaunch-20260713-api-1-before-local-promotion-api-20260822` 与 `pxxis-prelaunch-20260713-web-1-before-local-promotion-api-20260822`。PostgreSQL、数据卷、Schema、迁移、Worker 和业务数据均未触碰。
- 本次不是生产部署、发布、DNS 或流量切换，也没有启动插件采集或向巨量平台发起请求；仍需用户手动重载本地 unpacked 插件并显式开始。

## 2026-08-22 本地推实时配置声明与本地制品（未部署）

- `.env.example` 与 API Compose 服务新增 `LOCAL_PROMOTION_INTERNAL_API_ENABLED=false`；默认关闭，只有用户另行授权的本机验收可临时开启。API 测试进程强制覆盖为 false，避免开发机环境污染测试。
- Compose 仅完成带占位环境变量的静态配置校验；没有构建或替换运行容器，没有修改现有本机 `LIVE_SCREEN_INTERNAL_API_ENABLED`、`AI_DIAGNOSIS_ENABLED` 或任何密钥。
- 本地 unpacked Extension 已从当前工作区重建，指纹 `a8e4d60ef126`，仍需用户在 Chrome 手动重新加载。该制品不是生产 zip、商店上架或 GitHub Release。
- 未执行 migration、`db push`、业务数据库写入、部署、发布、提交或推送。

## 2026-08-16 v0.2.4 发布制品与 GitHub Release（非商店上架）

- 已从干净 `main`（`48b3758adf51`）构建生产版 zip 并通过制品安全校验，发布到 GitHub Release `v0.2.4`，资产为 zip 与 sha256。
- 这是发布制品与版本标记，不是 Chrome Web Store 上架，也不是服务器部署、DNS 或流量切换；未执行 migration、`db push`、业务数据写入或平台操作。
- 本地运行态、PostgreSQL、API/Web 容器与采集协议均未改动。

## 2026-08-14 本机经营数据统一大屏运行态（非生产部署）

- 本机 Web 已切换为 `pxxis-prelaunch-20260713-web:unified-dashboard-20260814`，继续绑定 `127.0.0.1:3300`，构建时注入 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`；容器健康检查通过，首页 HTTP 200。
- 切换前 Web 已停止保留为 `pxxis-prelaunch-20260713-web-1-before-unified-dashboard-20260814`，镜像仍为 `protocol8-seven-metrics-20260814`，可用于本机人工回退。
- API 容器和镜像未替换，仍为 `pxxis-prelaunch-20260713-api:protocol8-seven-metrics-20260814`；`/ready` 返回 database ready，采集协议仍为 `8`。
- PostgreSQL 容器、`pxxis-prelaunch-20260713_postgres-data` 数据卷、认证配置、`LIVE_SCREEN_INTERNAL_API_ENABLED=true` 与 `AI_DIAGNOSIS_ENABLED=false` 均未改变。
- 本次只更新本机 Web 展示和响应式布局，不是服务器 staging、生产部署、发布、DNS 或流量切换。未执行 migration、`db push`、业务数据写入、提交或推送。

## 2026-08-14 本机采集协议 8 运行态修复（非生产部署）

- 本机旧 API 镜像 `default-routes-20260813` 仍返回采集协议 `7`，与当前 `1a4bc20a9d72` 插件的采集协议 `8` 不兼容。已构建并切换 API 为 `pxxis-prelaunch-20260713-api:protocol8-seven-metrics-20260814`，继续绑定 `127.0.0.1:4300`。
- 本机 Web 同步切换为 `pxxis-prelaunch-20260713-web:protocol8-seven-metrics-20260814`，继续绑定 `127.0.0.1:3300`，构建时注入 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`。
- 切换后 API `/version` 返回 `gitSha=protocol8-seven-metrics-20260814`、产品 `0.2.4`、Schema `20260731_v035_ai_skill_diagnosis`、采集协议 `8`；`/ready` 返回 database ready，Web 首页 HTTP 200。
- 旧协议 7 容器停止保留为 `pxxis-prelaunch-20260713-api-1-protocol7-rollback-20260814` 和 `pxxis-prelaunch-20260713-web-1-protocol7-rollback-20260814`。新容器复用原网络、端口和运行环境；`LIVE_SCREEN_INTERNAL_API_ENABLED=true`、`AI_DIAGNOSIS_ENABLED=false` 未改变。
- PostgreSQL 继续使用 `pxxis-prelaunch-20260713-postgres-1` 与 `pxxis-prelaunch-20260713_postgres-data`。未运行 migrate 服务、migration、`db push` 或数据修复；核心业务表计数切换前后相同。
- 本次只修复本机人工验收运行态，不是服务器 staging、生产部署、发布、DNS 或流量切换。Chrome 仍需用户确认后重新绑定当前任务，才能完成真实心跳和采集验收。

## 2026-08-13 本机默认路线收口运行态（非生产部署）

- 本机 `pxxis-prelaunch-20260713-api-1` 已切换为 `pxxis-prelaunch-20260713-api:default-routes-20260813`，继续绑定 `127.0.0.1:4300`，`/ready` 返回 database ready，`/version` 返回 `gitSha=default-routes-20260813`、采集协议 `7`。
- 本机 `pxxis-prelaunch-20260713-web-1` 已切换为 `pxxis-prelaunch-20260713-web:default-routes-20260813`，继续绑定 `127.0.0.1:3300`，首页 HTTP 200。Web 镜像构建时仍固定注入 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`。
- 旧容器已停止并保留为 `pxxis-prelaunch-20260713-api-1-before-default-routes-20260813-2053` 和 `pxxis-prelaunch-20260713-web-1-before-default-routes-20260813-2053`。PostgreSQL 容器、数据卷、认证配置、AI 开关和内部 API 本机灰度开关未替换。
- 本次没有执行 Prisma migration、`db push`、数据卷重建、生产部署、发布、commit 或 push。当前任务 `cmsr0iq7h000dpc07mwockp6c` 的商品/流量补充路线取消是一次精确业务库配置变更，历史快照保留。

## 2026-08-12 本机 API 实时闭环与 Extension 制品（非生产部署）

- 本机 `pxxis-prelaunch-20260713-api-1` 已切换为 `pxxis-prelaunch-20260713-api:realtime-loop-20260812`，继续绑定 `127.0.0.1:4300` 且健康检查为 healthy；`/version` 为 `gitSha=realtime-loop-20260812`、采集协议 `7`。
- 旧 API 停止保留为 `pxxis-prelaunch-20260713-api-1-realtime-loop-rollback-20260812`；独立候选容器停止保留在 4301。PostgreSQL、数据卷、Web、端口与数据库 Schema 未替换或修改。
- 本地 unpacked 已重建到 `apps/extension/release/local-unpacked-test-extension`，指纹 `42432566bed9`，包含 10 项字段投影、30 秒基线状态和服务端观察建议显示。用户仍需在 Chrome 扩展管理页手动重新加载。
- 未执行 migration、`db push`、业务数据修改、生产部署、发布、commit 或 push。

## 2026-08-12 本地 Extension 实时展示制品（非生产部署）

- 已从当前源码重建 `apps/extension/release/local-unpacked-test-extension`，指纹 `a373b9ea0eb2`，产品 `0.2.4`、采集协议 `7`；这是本机 unpacked 测试制品，未发布到 Chrome 商店或生产环境。
- 制品新增 Popup/Side Panel 的 API 实时指标显示与单击启动自动打开侧栏。API、Web、PostgreSQL 容器、端口、数据卷、认证配置和数据库 Schema 未因本次展示修复而更换。
- 用户仍需在 `chrome://extensions` 手动重新加载该目录。未执行 migration、`db push`、数据修改、提交、推送或生产部署。

## 2026-08-12 本机 API 实时脉冲限流修复（非生产部署）

- 本机 `pxxis-prelaunch-20260713-api-1` 已切换为 `pxxis-prelaunch-20260713-api:rate-limit-jitter-fix-20260812`（镜像 `sha256:1bf86b7e7d82...`），继续绑定 `127.0.0.1:4300`，健康检查为 healthy。
- `/version` 返回 `gitSha=rate-limit-jitter-fix-20260812`、产品 `0.2.4`、采集协议 `7`；PostgreSQL、数据卷、Web、Extension、端口和认证配置未更换。
- 原 API 容器停止保留为 `pxxis-prelaunch-20260713-api-1-contract132-ratelimit-rollback-20260812`。本次没有执行 migration、`db push`、数据清理、生产部署、发布、commit 或 push。
- 切换后真实直播页面连续接受 20 次 `key_index` 脉冲且无 `RATE_LIMITED`，证明 4 秒服务端保护窗口与 5 秒客户端节拍兼容。

## 2026-08-12 本机 API `key_index` 合同切换（非生产部署）

- 本机 `pxxis-prelaunch-20260713-api-1` 已切换到当前源码镜像，继续绑定 `127.0.0.1:4300`，健康检查为 healthy；`/ready` 返回 HTTP 200 / database ready，`/version` 返回采集协议 `7`。
- 容器内共享合同为 `2026-08-12.2`、Adapter `1.4.0`，六条 PULSE 白名单路径与 unpacked 插件 `63f19f31aba9` 一致。
- 原 API 容器已停止并保留为 `pxxis-prelaunch-20260713-api-1-contract132-rollback-20260812`；PostgreSQL 容器和数据卷、Web 容器、端口、认证及 SMTP 配置均未改动。
- 本次没有执行 migration、`db push`、数据清理、生产部署、发布、commit 或 push。

## 2026-08-12 PULSE API-only 本机运行时（非生产部署）

- 本地 unpacked Extension 已重建至 `apps/extension/release/local-unpacked-test-extension`，指纹 `b6a950b35273`，产品 `0.2.4` / Bridge `7` / 采集协议 `6`；Service Worker 每次可恢复失败写入脱敏 `live_pulse.failure` 日志。
- Compose 项目 `pxxis-prelaunch-20260713` 的 API 容器 `pxxis-prelaunch-20260713-api-1` 已按当前源码原地替换，`/version` 返回 `a0cef5b788b6`、协议 `6`，`/ready` 为 database ready；Web、PostgreSQL、数据卷未替换。
- 随后发现运行中的 Web 镜像仍内嵌采集协议 `5`，已仅重建并替换 `pxxis-prelaunch-20260713-web-1`；新镜像内嵌协议 `6`，`http://127.0.0.1:3300/login` HTTP 200，现与 API/Extension 兼容。旧 Web 回退容器仍保留。
- 替换过程复用了旧容器环境中的认证、SMTP 和数据库连接配置，仅保留本机灰度 `LIVE_SCREEN_INTERNAL_API_ENABLED=true`、`AI_DIAGNOSIS_ENABLED=false`；未新增密钥。
- Compose 的 migrate 服务只做既有迁移检查并退出，无待应用迁移；未执行 `db push`、业务数据写入、快照修复、生产部署、提交或推送。
- 真实平台验收仍需用户手动重载插件并点击一次 API 持续采集；当前运行时日志仅证明服务健康，尚未代替用户触发平台 API。

## 2026-08-12 本机 Web 登录基址修复（非生产部署）

- Web 容器 `pxxis-prelaunch-20260713-web-1` 已从 `pxxis-prelaunch-20260713-web:protocol7-pulse-gate` 切换到 `pxxis-prelaunch-20260713-web:protocol7-pulse-gate-loginfix`，端口仍只绑定 `127.0.0.1:3300`。
- 新镜像在构建阶段固定注入 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`；这是浏览器端 API 请求基址和 CSP `connect-src` 的必要条件。旧镜像容器已停止并保留为 `pxxis-prelaunch-20260713-web-1-protocol7-login-baseurl-rollback-20260812`，可用于人工回退。
- 未跟踪本机 `.env` 已同步 `WEB_ORIGIN=http://127.0.0.1:3300` 与 `NEXT_PUBLIC_API_URL=http://127.0.0.1:4300`，使后续 Compose 构建使用同一入口。
- API 仍为 `pxxis-prelaunch-20260713-api-1`，PostgreSQL 容器和数据卷未替换；没有执行 migration、`db push`、数据修改、提交、推送或生产部署。新 Web 的登录页 HTTP 200，API CORS 预检与参数校验已通过；真实账号登录由用户人工完成。

## 2026-08-11 协议 5/Bridge 7 本机恢复（非生产部署）

- API 镜像 `pxxis-prelaunch-20260713-api:protocol5-pulse-gate` 已恢复为运行容器 `pxxis-prelaunch-20260713-api-1`，绑定仍为 `127.0.0.1:4300`。环境变量从停止的回退容器直接复制并仅覆盖本机灰度项，没有生成新认证密钥；容器 healthy，`/ready` HTTP 200，`/version` 返回采集协议 `5`。
- Web 镜像 `pxxis-prelaunch-20260713-web:protocol7-pulse-gate` 已切换为运行容器 `pxxis-prelaunch-20260713-web-1`，绑定仍为 `127.0.0.1:3300`，首页 HTTP 200。原 Web 容器保留为停止状态 `pxxis-prelaunch-20260713-web-1-protocol7-rollback-20260811`。
- PostgreSQL 容器 `pxxis-prelaunch-20260713-postgres-1` 和原数据卷未替换；未运行 migrate、`db push`、数据修复或清理。API 保持 `NODE_ENV=development`、`LIVE_SCREEN_INTERNAL_API_ENABLED=true`、`AI_DIAGNOSIS_ENABLED=false`。
- 本地解包 Extension 已更新为 `0.2.4 / a583f51b0107 / Bridge 7 / 采集协议 5`。该制品会丢弃旧构建/旧协议留下的实时失败结果，PULSE 产物只请求 `key_index`。这是本机验收制品，不是生产发布；用户仍需在 Chrome 扩展管理页手动重载。
- API/Web 启动日志只有正常监听与既有 Next.js `outputFileTracingRoot` 警告。全仓工程门禁与带占位变量的 Compose 静态配置通过；没有提交、推送、生产部署或真实平台 API 操作。

## 2026-08-11 PULSE 职责隔离本地制品（非生产部署）

- 仅从当前源码重建本地解包 Extension，路径保持 `apps/extension/release/local-unpacked-test-extension`，新指纹为 `c49f72be4e03`。
- 该制品的实时 PULSE 只请求 `key_index`；`room_minute_indicator` 只在用户主动正式 SNAPSHOT 时可用。Compose 项目 `pxxis-prelaunch-20260713` 的 API 已于 2026-08-11 08:54 用当前源码原地替换，继续复用 PostgreSQL 容器、数据卷和 `127.0.0.1:4300`；运行容器直接确认 `PULSE=["key_index"]`，`/ready`、`/version` 为 HTTP 200。Web 未替换。
- 未执行 migration、`db push`、业务数据写入、生产部署、提交或推送。人工验收需要用户在 Chrome 扩展管理页手动重载该目录。

## 2026-08-11 本机 Extension Popup 状态修复（非生产部署）

- 后续职责隔离制品已将本地解包 Extension 更新为 `c49f72be4e03`。
- API、Web、PostgreSQL 容器和数据卷未替换；未执行 migration、`db push`、业务数据写入、生产部署、提交或推送。
- 人工验收需在 Chrome 扩展管理页手动重载该目录，并确认失败停止后按钮显示“开始 API 持续采集”。

## 2026-08-10 本机 API 适配器同步（非生产）

- Compose 项目 `pxxis-prelaunch-20260713` 的 API 已用当前源码原地替换，继续使用原 PostgreSQL 容器、卷与 `127.0.0.1:4300` 绑定；重建后容器 healthy，`/ready` 与 `/version` 均为 HTTP 200。
- 运行镜像确认加载直播内部 API Adapter `1.2.0` / Contract `2026-08-08.1`；`LIVE_SCREEN_INTERNAL_API_ENABLED=true` 维持用户此前授权的本机灰度，`AI_DIAGNOSIS_ENABLED=false` 未变。
- 本地解包插件已同步到 `0.2.4 / ed4b04e82725 / Bridge 6 / 采集协议 4`。没有运行 migration、`db push`、数据修复、平台请求、生产部署、提交或推送。

## 2026-08-09 本地一键 API 持续采集环境（非生产部署）

- Compose 项目 `pxxis-prelaunch-20260713` 的 API/Web 已由当前源码直接构建并替换，继续复用原 PostgreSQL 容器和数据卷；端口仍只绑定 `127.0.0.1:4300/3300`，三项核心容器 healthy。
- API 本地运行时为 `NODE_ENV=development`、`LIVE_SCREEN_INTERNAL_API_ENABLED=true`、`AI_DIAGNOSIS_ENABLED=false`。该开关只用于用户本轮明确授权的本机验收，`.env.example` 与 Compose 默认值仍为 false。
- API `/ready`、`/version` 与任务 `cmslcimbi000loz077k91p0vq` 校准大屏均返回 HTTP 200。API 日志正常监听，Web 正常启动；迁移容器报告 14 个 migration、无待应用项。
- 本地 unpacked Extension 已重建为 `0.2.4 / 622478e337aa / Bridge 6 / 采集协议 4`，路径为 `apps/extension/release/local-unpacked-test-extension`。用户仍需在 Chrome 扩展管理页手动重新加载，本轮没有代替用户触发真实平台 API。
- 本次没有新增或执行数据库 migration、`db push`、业务数据修复、历史快照改写、数据卷重建、服务器/DNS/生产部署、提交或推送。Web 启动日志仍有既有的 `outputFileTracingRoot` 提示，不影响健康检查和页面 HTTP 200。

## 2026-07-30 v034 可信度校准迁移准备

- 新增加法式 migration `20260729120000_metric_binding_calibration`：创建 `CollectionBindingCalibration` 及其工作区、路线、页面指纹、绑定类型/签名唯一约束和外键；不回填、不删除或改写历史快照、指标和表格复核。
- API、Compose、镜像、`.env.example` 与 Extension 制品元数据的默认 Schema 已统一为 `20260729_v034_metric_binding_calibration`。
- v034 唯一索引与查询索引使用显式短名称，避免 PostgreSQL 63 字符截断碰撞；独立临时空库已成功执行全部 15 个 migration 并确认最新后销毁。
- 本地原业务库与生产库仍未应用 v034；正式升级前继续要求备份、staging `prisma migrate deploy` 和迁移状态复核。
- 尚未对用户原有本地业务数据库执行该 migration，也没有重建或部署容器。应用前必须完成可恢复备份，在隔离库验证 `prisma migrate deploy` 后再由用户决定是否迁移本地预上线环境。

## 2026-07-28 本地 0.2.4 采集一致性环境

- 本地 Compose 项目 `pxxis-prelaunch-20260713` 已使用当前 API/Web 镜像运行，继续复用原 PostgreSQL v033 数据卷；Web `http://127.0.0.1:3300`、API `http://127.0.0.1:4300` 和 PostgreSQL 均 healthy。
- `/ready` 返回 database ready；`/version` 返回产品 `0.2.4`、Schema `20260722_v033_table_cell_reviews`、Extension `0.2.4`、采集协议 `1` 和本地制品 SHA256。
- 本次没有新增或执行数据库 migration。仅对指定历史任务运行显式派生记录修复；修复后 dry-run 为 0 候选，原始快照及首条 `MANUAL_PENDING` 数据未改写。
- 本地测试制品为 `collector-local-test-v0.2.4-b4de6606e3f5.zip`，SHA256 `89be2c0b283edce1c4b9136a1993259b6ed607d61eb539fd88c6d7850fb2059b`。2026-07-29 已确认用户 Chrome 加载 `0.2.4` / 桥接协议 `2` / 构建 `b4de6606e3f5`，下一步为真实五路线采集验收。
- 生产候选制品为 `collector-production-candidate-v0.2.4-b4de6606e3f5.zip`，SHA256 `75b519e56f63fef211d6d6719b04cbc1bcab4d671dd1b081a1425716b2628ee3`。已通过 production target 制品校验，但尚未提交 Chrome 正式渠道，不属于线上发布。
- Windows 中文路径的 BuildKit 会话头问题仍存在；本轮沿用直接构建镜像和 Compose 不重建数据卷的本地兼容方式。没有服务器、DNS、SMTP、COS、生产数据库、提交或平台操作。

## 2026-07-27 本地预上线环境 v033 切换

- 已将本地 Compose 项目 `pxxis-prelaunch-20260713` 的原数据卷从 v032 升级至 v033。升级前已生成 SHA-256 校验的自定义格式备份，并在独立临时 PostgreSQL 恢复验证；备份仅保留在被 Git 忽略的本机 `.backups/`，未执行 COS 上传。
- `20260722090000_v033_table_cell_reviews` 已通过 `prisma migrate deploy` 成功应用。该迁移只创建 `TableCellReview`、索引和外键，不删除或回写历史数据。升级后数据库为 14 条迁移、9 个用户、5 条快照和 5 个采集任务。
- API/Web 镜像已用当前源码重建并切换，继续使用 `http://127.0.0.1:3300` 和 `http://127.0.0.1:4300`；三个容器 healthy，`/ready` 返回 database ready，`/version` 返回 `20260722_v033_table_cell_reviews`。浏览器仅核验登录页加载，未提交用户密码。
- Windows 中文路径仍会触发 BuildKit 会话头错误，本地镜像使用 `DOCKER_BUILDKIT=0` 和 `COMPOSE_DOCKER_CLI_BUILD=0` 兼容构建。此操作仅影响本机预上线环境，不是生产部署；未执行服务器、DNS、SMTP、COS、提交或平台操作。

## 2026-07-23 v033 迁移与 Extension 制品准备

- 新增 `20260722090000_v033_table_cell_reviews` 加法式 migration：创建 `TableCellReview` 及快照坐标唯一约束、任务/快照/复核人外键和查询索引；不回填、不删除或改写历史快照与既有校准记录。
- API、Compose、API 镜像、`.env.example` 和 Extension 构建元数据默认 Schema 已统一为 `20260722_v033_table_cell_reviews`。
- Extension 正式制品权限精确包含两个平台域名及 PXXIS API/Web 域名，拒绝泛域名、localhost、loopback 和本地测试标识；本地 unpacked 制品指纹为 `67f3572cb3e7`。
- 已在隔离空 PostgreSQL 顺序应用全部 14 个 migration，并执行 Prisma validate/generate、全仓构建与 197 项测试。隔离验收环境使用本地临时数据库和 `127.0.0.1:3400/4400`，不属于生产部署。
- 本轮未执行生产 migration、服务器部署、DNS、SMTP、COS 或真实平台操作。生产应用前必须先离机备份，在 staging 执行 `prisma migrate deploy`，核对 `/version` 返回 v033，再发布同源码生成并通过制品硬校验的正式 Extension。

## 2026-07-22 本地 v032 认证环境恢复

- Compose 项目 `pxxis-prelaunch-20260713` 保留原 PostgreSQL 数据卷，已从 5 个 migration 顺序升级到 13 个，当前 Schema 为 `20260720_v032_audit_actor_snapshot`。
- API 镜像已使用当前源码重建，补齐 pnpm Workspace 包级依赖并增加构建期运行时导入检查；Web、API、PostgreSQL 均 healthy。
- 本地 HTTP 验收显式使用 `API_NODE_ENV=development`、`SESSION_COOKIE_SECURE=false`；`docker-compose.yml` 默认仍为 production，正式环境不得沿用本地参数。
- 本地 SMTP 仅为未启用的占位配置，没有发送真实邮件；本轮未执行生产部署、DNS、真实 SMTP 或生产数据操作。
- API `/ready` 返回 database ready，`/version` 返回 Schema `20260720_v032_audit_actor_snapshot`；Web 登录、工作台加载和退出已通过浏览器实测。

## 2026-07-20 本地预上线首页备案号

- 仅重新构建并替换 `pxxis-prelaunch-20260713` 的 Web 容器，继续使用 `127.0.0.1:3300`；API、PostgreSQL 和数据卷均未重建。
- Web 容器 healthy，首页返回 200；响应内容包含 `辽ICP备2026002223号` 和 `https://beian.miit.gov.cn/`。
- 浏览器在 720px 视口实测页脚范围为 659–720px，备案号稳定位于页面底部。本次不是生产部署，未执行 migration、服务器、DNS、SMTP、COS 或平台操作。

## 2026-07-20 v032 审计操作者快照迁移准备

- 新增加法式 migration `20260720110000_v032_audit_actor_snapshot`：为 `AuditLog` 增加 nullable `actorSnapshotJson`、回填现有 `userId`、将 `userId` 改为 nullable，并将用户外键替换为 `ON DELETE SET NULL`。不删除或重写既有审计记录。
- API、Compose、API 镜像、环境示例和 Extension 构建元数据默认 Schema 版本均更新为 `20260720_v032_audit_actor_snapshot`。
- 已在隔离 PostgreSQL 通过空库 13 个 migration 全量安装和 v031 升级到 v032；升级验证确认审计快照回填、删除用户后 `userId` 置空且快照仍在。带无敏感占位变量的 Compose 静态配置和 v032 正式 Extension 制品安全测试均通过。
- 本轮未部署、未执行生产 migration、未进行服务器、DNS、SMTP、COS 或平台操作。生产应用前先离机备份，在 staging 执行 `prisma migrate deploy`，再核对 `/version` 返回 v032 Schema 版本。

## 2026-07-19 v031 采集诊断迁移准备

- 新增加法式 migration `20260719180000_v031_collection_diagnostics`：为 `CollectionRouteHeartbeat` 增加 nullable `lastErrorCode`，为 `DataSnapshot` 增加 nullable `structuredDataJson` 与 `structuredDataVersion`。
- 运行时、Compose、API 镜像和 Extension 构建元数据的默认 Schema 版本已统一为 `20260719_v031_collection_diagnostics`。
- 隔离空 PostgreSQL 已从 baseline 顺序应用全部 12 个 migration，v031 应用成功；Prisma validate/generate 均通过。
- 迁移不回填、不重写历史快照；新字段为空时继续使用旧表格兼容路径。365 天留存清理会同时清除结构数据。
- Extension production target 已通过精确权限、域名白名单、localhost/loopback/测试标记及网络拦截禁用检查。
- 本轮未部署、未执行生产 migration、未生成正式发布 ZIP，也未进行服务器、DNS、SMTP、COS 或平台操作。部署前仍须备份数据库并在 staging 运行 `prisma migrate deploy`。

## 2026-07-18 留存与安全观测部署增量

- 新增 `20260718110000_v030_security_metrics` 加法式 migration。部署前仍先离机备份，随后由 `migrate` 服务应用；该迁移只新增按小时聚合的 `SecurityMetric` 表，不回填或改写既有业务数据。
- Compose 新增 `retention` 服务：依赖 `migrate` 成功后启动，执行一次留存后每 24 小时重复；该服务无端口、非 root、只读根文件系统、`cap_drop: ALL`、256 MiB 内存、0.5 CPU、128 PID 上限。
- API 在正常终止时刷写待提交的安全指标聚合。指标不包含请求体、用户、账号、IP、Cookie、Token 或其他凭证；保留策略为 365 天。备份脚本在 COS 上传后回读校验和与 dump、校验 SHA-256 并用 `pg_restore --list` 确认对象可读，再尽力记录聚合结果。
- API 镜像、Compose 和 Extension 构建元数据的默认 Schema 已统一为 `20260718_v030_security_metrics`。正式 Extension ZIP 在生成后自动解压，精确校验权限并拒绝 localhost、loopback、泛域名和测试标识；本地包使用独立测试图标。
- 备份与恢复演练的标准命令为 `corepack pnpm backup:run`、`corepack pnpm restore:verify`；`backup:postgres`、`backup:verify` 作为兼容别名保留。
- 已完成本地静态验证、空库 11 migration 验证、正式 ZIP 验收与全仓 164 项测试；尚未把 `retention` 部署到服务器，未执行真实 COS 上传、恢复演练、SMTP、DNS 或平台操作。

### 部署增量

1. 部署前完成 COS 离机备份，再执行 `docker compose config --quiet` 和 `docker compose up -d --build --wait`；检查 `migrate` 为 `exited (0)`，并确认 `retention` 处于运行状态。
2. 在 staging 观察 `retention` 首次日志，确认只输出聚合留存报告且不含敏感内容；24 小时后复核下一次运行。
3. 正式 Extension ZIP 必须从 production 构建生成；发布脚本自动解压并执行制品硬校验，通过后才配置其 SHA256 并发布。

## 2026-07-17 邮箱验证与运行时限制增量

- 生产 API 需要配置 `SECURITY_SECRET`（至少 32 字符）、`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE=true`、`SMTP_USER`、`SMTP_PASS` 和 `SMTP_FROM`。运行时暂时兼容旧 `JWT_SECRET`，但新的部署文件应只使用 `SECURITY_SECRET`。
- `20260717100000_v029_email_verification` 新增待验证注册与邮箱验证令牌，并为既有用户增加 `emailVerifiedAt` 默认值。迁移是加法式；部署前仍必须先备份，随后由一次性 `migrate` 服务执行 `prisma migrate deploy`。
- Compose 的 `migrate`、`api`、`web` 已启用 `cap_drop: ALL`、PID/CPU/内存限制；API 终止时会先拒绝新业务请求、关闭 SSE，再最多等待 15 秒排空 HTTP 连接。
- 已以隔离临时 PostgreSQL 从空库顺序执行 10 个 migration 并得到 `Database schema is up to date`；全仓 lint/typecheck/test/build、Prisma validate/generate、生产依赖审计和 Compose 静态配置均通过。
- 尚未执行真实 SMTP 投递、COS 上传/恢复、服务器部署、DNS 或任何平台操作。

### 部署增量

1. 在部署主机 `.env` 设置 HTTPS `WEB_ORIGIN`、`NEXT_PUBLIC_API_URL`、`SECURITY_SECRET` 和上述 SMTP TLS 配置；不要在生产环境设置 `SESSION_COOKIE_SECURE=false`。
2. 先完成离机备份，再执行 `docker compose config --quiet` 与 `docker compose up -d --build --wait`；确认 `migrate` 为 `exited (0)`，API/Web 为 healthy。
3. 在 staging 注册账号，验证邮件投递、30 分钟过期、重发限流、首次验证自动登录以及旧链接拒绝后，才开放新用户注册。

## 2026-07-17 部署安全基线与备份演练准备

- API 和 Web 镜像改为多阶段构建，运行阶段使用非 root `app` 用户；API/Web 文件系统只读，仅提供 `/tmp` 临时目录，Compose 启用 `no-new-privileges`，API/Web 使用 init 与明确的优雅停机时间。
- Prisma migration 从 API 启动命令移入一次性 `migrate` 服务；`api` 仅在 migration 成功后启动，避免多个 API 实例同时抢占迁移。迁移仍使用 `prisma migrate deploy`，不使用 `db push`。
- API 生产环境必须显式设置精确 `WEB_ORIGIN`，仅接受配置的 Web/插件来源；API 使用 Helmet，Web 使用 Next `proxy.ts` 下发 nonce CSP、HSTS、Referrer-Policy、权限策略和跨域隔离头。
- 新增 `tools/backup-postgres.sh` 与 `tools/verify-postgres-backup.sh`：前者执行自定义格式 `pg_dump`、SHA-256 校验并上传 COS，后者下载校验并恢复到临时 PostgreSQL 容器验证表与 Prisma migration。脚本不会连接、修改或恢复生产数据库。
- 未执行任何真实 COS 上传、恢复、服务器部署、DNS 变更或平台操作；全仓 lint/typecheck/test/build、Prisma validate/generate、本地 Compose 配置展开、API 50 项安全回归、Web 17 项测试及两个 runtime 镜像构建均通过。

### 部署顺序

1. 在部署主机 `/opt/pxxis` 创建权限为 `0600` 的 `.env`，设置 HTTPS `WEB_ORIGIN`、`NEXT_PUBLIC_API_URL`、至少 32 字节 `SECURITY_SECRET` 和数据库连接；生产环境不得设置 `SESSION_COOKIE_SECURE=false`。
2. 部署前运行 `COS_PREFIX=cos://<bucket>/pxxis-backups corepack pnpm backup:run`；确认 COS 同时有 `.dump` 与 `.sha256`，并在隔离环境运行 `COS_OBJECT_URL=cos://<bucket>/...dump corepack pnpm restore:verify`。
3. 运行 `docker compose config --quiet`，再执行 `docker compose up -d --build --wait`；检查 `migrate` 状态为 `exited (0)`，确认 `api` 和 `web` 为 healthy。
4. 经 HTTPS 反向代理验证 `/ready`、`/version`、登录会话、跨源 API 请求及 SSE；反向代理必须保留 `Set-Cookie`、关闭 SSE 缓冲并设置 `TRUST_PROXY_HOPS`。
5. 恢复操作仅允许在新建的隔离 PostgreSQL 实例上演练。任何生产恢复都需要维护窗口、经审批的恢复计划和人工复核，不能直接覆盖运行中的数据卷。

## 2026-07-15 代直播增长模式本地部署

- Compose 项目 `pxxis-prelaunch-20260713` 已用最新源码重建 API/Web，继续复用原 PostgreSQL 数据卷，未新增 migration。
- 新部署把代直播诊断收窄为流量、直播承接、商品成交、平台活动权益与履约合规；不再展示服务商利润口径。
- Web 仍为 `http://127.0.0.1:3300`，API 仍为 `http://127.0.0.1:4300`；Extension 权限、采集范围和人工执行安全边界没有变化。

## 2026-07-15 完整诊断输出本地部署

- Compose 项目 `pxxis-prelaunch-20260713` 已使用最新源码重建 API/Web，继续复用原 PostgreSQL 数据卷，未新增 migration。
- Web 仍为 `http://127.0.0.1:3300`，API 仍为 `http://127.0.0.1:4300`；首页返回 200，API `/ready` 返回 database ready，三项核心容器 healthy。
- 本次部署只增加结构化经营诊断、AI 辅助解读和前端展示，不修改 Extension 权限、采集范围或平台操作边界。
- 已使用 `DOCKER_BUILDKIT=0` 完成 Windows 本地镜像构建；正式服务器、DNS 和线上流量未变更。

## 2026-07-15 本地 HTTP 会话修复

- 本地 Compose API 继续使用生产模式镜像，但显式注入 `SESSION_COOKIE_SECURE=false`，使 `http://127.0.0.1:3300` 登录会话可被浏览器保存。
- `docker-compose.yml` 的默认值仍为 `true`；正式 HTTPS 部署不得设置为 `false`。
- Compose 项目 `pxxis-prelaunch-20260713` 已重建并确认 API/Web healthy；`GET http://127.0.0.1:4300/ready` 返回 database ready，账号创建页返回 HTTP 200。
- 本次仅调整 Web/API 与本地部署配置，不修改 Extension 制品、权限或采集边界。

## 2026-07-15 V0.2.4 本地预上线增量

- Extension unpacked 已按协议版本 2 重新构建，Web Bridge、Popup 和 Service Worker 的源码指纹统一为 `a6d87cdb8cbb`；本地开发版必须在 `chrome://extensions/` 手动重新加载后才会替换旧后台。
- 本地 Compose 项目 `pxxis-prelaunch-20260713` 已再次重建最新 API/Web 镜像，未清理 PostgreSQL 数据卷；Web、API、PostgreSQL 均 healthy。
- 运行时复核：`GET http://127.0.0.1:4300/ready` 返回 200/database ready，任务页返回 HTTP 200。
- 当前本地 Chrome 验收包为 `collector-local-test-v0.2.2-a6d87cdb8cbb.zip`，SHA256 `5A5C90AD1FB7741A6FA70C8F99543C1F53480EFDDCE1CEE87822BC6B515EF377`；此前的 `5c91d26add9d` 与 `133dc8305d40` 包不再用于验收。
- 本地 API/Web 镜像已再次重建并健康启动，包含任务删除入口、事务删除 API 和任务路线 URL 编辑；PostgreSQL 数据卷未清理，未新增 migration。
- Web 镜像已在本地 Compose 项目 `pxxis-prelaunch-20260713` 中重新构建并健康启动，项目页默认展示紧凑配置摘要。
- 复用 Compose 项目 `pxxis-prelaunch-20260713` 与原 PostgreSQL 数据卷，未删除原账号和项目数据。
- API 启动通过 `prisma migrate deploy` 成功应用 `20260715170000_v024_task_scoped_extension_pairing`。
- `/version` 返回产品版本 `0.2.2`、schema `20260715_v024_task_scoped_extension_pairing`；`/ready` 返回数据库 ready。
- Web 仍为 `127.0.0.1:3300`，API 仍为 `127.0.0.1:4300`，PostgreSQL 仍只在 Compose 内网。
- Docker Desktop BuildKit 仍出现 `x-docker-expose-session-sharedkey` 非打印字符错误；本轮继续使用 `DOCKER_BUILDKIT=0` 分别构建 API/Web 镜像，再以 `--no-build --force-recreate` 替换应用容器。
- Extension unpacked 目录已由当前源码重新构建；由于 Chrome 内部页不可由浏览器验收工具自动操作，需用户在 `chrome://extensions/` 手动重载后完成真实页面采集验收。

## 2026-07-15 V0.2.3 本地预上线增量

- 复用 Compose 项目 `pxxis-prelaunch-20260713` 和既有 PostgreSQL 数据卷，未创建第二套混淆环境。
- API 启动通过 `prisma migrate deploy` 成功应用 `20260715120000_v023_extension_pairing`。
- Web 仍绑定 `127.0.0.1:3300`，API 仍绑定 `127.0.0.1:4300`，PostgreSQL 不发布宿主机端口。
- `/version` 当前仍返回产品版本 `0.2.2`，schema 版本为 `20260715_v023_extension_pairing`；V0.2.3 发布前不伪造版本号。
- Windows Docker Desktop BuildKit 会话出现非打印字符错误，本地镜像改用 `DOCKER_BUILDKIT=0` 构建；运行中数据卷未清理。
- 最新 API/Web 镜像已重新创建且三服务 healthy；容器内 `prisma migrate status` 显示 4 个 migration 全部已应用。
- 浏览器已验证账号隔离、配对码入口、手工 CSV、任务创建自动跳转、删除确认和 390/410px 页面；真实平台与服务器 staging 尚未执行。

## 2026-07-14 V0.2.2 本地预上线

- 本地 Compose 项目 `pxxis-prelaunch-20260713` 已重建为 V0.2.2。
- Web 绑定 `127.0.0.1:3300`，API 绑定 `127.0.0.1:4300`，PostgreSQL 不发布宿主机端口。
- 升级前已在 PostgreSQL 容器内生成 `/tmp/pre-v022-account-profiles.dump` 备份。
- API 启动通过 `prisma migrate deploy` 成功应用 `20260714170000_v022_account_profiles`。
- PostgreSQL、API、Web 健康检查均通过，`/version` 显示产品版本 `0.2.2`。
- 本地预上线未绑定旧 V0.2.1 Extension SHA；V0.2.2 工作树正式提交后再生成并注入新 ZIP SHA256。
- 已精确删除用户确认的 3 条重复网址测试任务，保留其他任务，并写入 `CLEAN_DUPLICATE_COLLECTION_TASKS` 审计记录。
- 当前未修改腾讯云服务器、DNS 或 `www.pxxis.cn` 正式流量。
- 2026-07-14 已重新构建本地 API/Web 镜像并验证账号删除按钮与二次确认；未对现有业务账号执行真实删除。

## 当前部署状态

- 本地 Web/API 已跑通。
- Chrome 审核承接页已可访问。
- 当前尚未完成服务器 staging 部署。
- 当前尚未切换正式域名流量。
- V0.2.1 本地代码和正式 migration 已准备完成，最终 Extension 发布包待全仓验证后生成，尚未应用到服务器。

## 域名规划

- 域名：www.pxxis.cn
- API 域名规划：api.pxxis.cn
- 当前不建议未备案时把 www.pxxis.cn 指向广州服务器。

## 腾讯云服务器状态

- 腾讯云服务器：
- 系统：Ubuntu 22.04
- Docker 26.1.3
- Docker Compose v2.27.1
- 部署目录计划：`/opt/pxxis`

## 当前部署策略

- 下一步是服务器 IP staging 测试。
- 暂不切换 `www.pxxis.cn` 正式流量。
- 暂用服务器 IP 验证 Web/API 可访问性。
- PostgreSQL 不暴露公网，只允许容器内网访问。
- staging 通过后再处理备案、域名解析、HTTPS、反向代理和正式环境切换。

## 待完成

- 输出服务器 staging 部署方案。
- 准备 Docker Compose 运行所需部署文件。
- 在服务器 `/opt/pxxis` 目录完成部署验证。
- 记录 staging 环境验证结果。

## 2026-07-10 本地 Compose 验证

- 已新增 API/Web Dockerfile、数据库就绪探针和安全 Compose 配置。
- PostgreSQL 无宿主机端口映射；API/Web 默认仅绑定 `127.0.0.1`。
- Redis 当前未参与主链路，未在 staging Compose 中启动或暴露。
- `POSTGRES_PASSWORD`、`COMPOSE_DATABASE_URL`、`SECURITY_SECRET`、`WEB_ORIGIN`、`NEXT_PUBLIC_API_URL` 均需显式配置。
- 本地镜像构建通过，三个 Compose 服务均达到 healthy；容器内实测注册返回 201、Cookie 登录返回 200、Web 首页返回 HTTP 200。
- 生产 Cookie 已验证同时包含 `HttpOnly`、`Secure` 和 `SameSite=Lax`。
- 当前 Windows Docker Desktop 未将声明的 `127.0.0.1:4100/3100` 端口实际发布到宿主机；容器配置仍保留回环绑定。该问题未影响容器内应用验证，但必须在 Ubuntu staging 再验证宿主端口和反向代理链路。
- 本地验证结束后已删除容器、网络和测试卷。
- Windows 中文工作区需要兼容构建方式：`DOCKER_BUILDKIT=0`；Ubuntu `/opt/pxxis` 可使用默认 BuildKit。

## 服务器下一步

1. 在 `/opt/pxxis` 拉取代码并创建仅服务器可读的 `.env`。
2. 设置 URL 安全的数据库强密码、至少 32 字节随机 JWT secret、staging Web/API 地址。
3. 执行 `docker compose config --quiet` 和 `docker compose up -d --build --wait`。
4. 通过服务器本机回环地址验证 Web 和 API，再配置 Nginx/Caddy HTTPS 反向代理。
5. 域名备案、解析和证书完成前，不切换 `www.pxxis.cn` 正式流量。

## 2026-07-12 V0.2.1 部署要求

- 部署前备份数据库；既有 V0.2.0 数据库先将 baseline 标记为 applied，再执行 `prisma migrate deploy`，具体命令见 `docs/MIGRATION_NOTES.md`。
- API 新增进程内 MetricPulse 环形缓冲，当前仅支持单 API 实例；多实例前必须迁移到 Redis 或其他共享时序缓冲。
- Extension 新增 `sidePanel` 权限和 `api.pxxis.cn` 白名单，需要重新审核；生产包不含 injected/network capture。
- 反向代理必须关闭 SSE 响应缓冲并延长 `/signals/stream` 读超时。
- `GET /version`、Web 健康中心和 Side Panel 显示的版本与短 SHA 必须一致。
- 构建镜像前必须设置 `GIT_SHA` 和 `BUILD_TIME`，运行时设置 `EXTENSION_ARTIFACT_SHA256`；生产容器的 `/version` 不得返回 `unknown` 或空制品哈希。
- staging 用户需手动将关键平台站点加入 Chrome Memory Saver 例外列表，系统不会自动更改浏览器设置。

## 2026-07-13 本地预上线结果

- 独立 Compose 项目使用 Web `127.0.0.1:3300`、API `127.0.0.1:4300`，PostgreSQL 仅容器内网；三服务 healthy。
- 全新数据库实际执行 baseline 和 V0.2.1 增量 migration；生产 API 镜像启动命令已改为 `prisma migrate deploy`。
- `/version` 返回 `0.2.1`、12 位 Git SHA、构建时间、schema 版本和 Extension SHA256。
- 完整 API 人工决策闭环与浏览器注册/Dashboard 冒烟通过。
- 本轮未连接真实投放平台、未修改 DNS/服务器，也没有任何自动平台操作。

## Web 会话部署要求

- 生产环境 Cookie 带 `Secure`，必须通过 HTTPS 访问 `api.pxxis.cn`。
- `WEB_ORIGIN` 必须精确包含 `https://www.pxxis.cn`，API CORS 开启 credentials 但不接受任意来源。
- 反向代理必须保留 `Set-Cookie`，并正确设置 `TRUST_PROXY_HOPS`。
- Extension 不依赖浏览器 Cookie；V0.2.3 起通过 Web 生成的一次性配对码取得账号级可撤销凭证，不再要求用户手工配置通用 SaaS Token。

## 2026-07-12 V0.2.0 部署增量

- staging 启动前必须应用新增 `CollectionRun`、`CollectionRouteHeartbeat`、快照路线字段和建议生命周期字段对应的数据库 schema。
- 部署后需验证认证后的 `/system-health`、采集批次开始/停止、路线失败上报、只读决策预演和过期建议 409 拒绝。
- Extension staging 测试包为 `douyin-local-life-diagnosis-collector-v0.2.0.zip`；manifest 权限仍只有 `activeTab` 和 `storage`。
- 真实页面验收必须由用户手动打开页面并启动巡检，不允许通过自动导航或自动操作代替。
- 本轮仅完成本地实现和验证，没有重启 Docker Desktop，也没有修改服务器、DNS 或正式流量。
# 2026-07-15 本地预上线重建

- 预上线项目 `pxxis-prelaunch-20260713` 已使用传统 Docker 构建器重建 API/Web；PostgreSQL 容器和现有数据卷保持不变。
- 本地地址：Web `http://127.0.0.1:3300`，API `http://127.0.0.1:4300`。
- API、Web、PostgreSQL 三个容器均 healthy；`/ready` 返回 database ready，`/version` 返回产品版本 `0.2.2`，Web HTTP 200。
- Extension 本地测试包为 `collector-local-test-v0.2.2-a6d87cdb8cbb.zip`，制品 SHA256 已注入本地 API 容器。
- Windows 中文工作区下 BuildKit 仍会出现不可打印会话头错误，本次按既有方案使用 `DOCKER_BUILDKIT=0`；不影响服务器英文路径部署。

## 2026-07-31 v035 部署准备（未部署）

- 新增 schema 版本 `20260731_v035_ai_skill_diagnosis` 和独立 `diagnosis-worker` 服务；API 镜像已包含 `packages/diagnosis-skills` 构建产物。
- 对新建/已登记迁移的部署库，顺序为：数据库备份 -> `prisma migrate deploy` -> API 保持 `AI_DIAGNOSIS_ENABLED=false` 启动 -> 配置 Worker 密钥 -> 真实评测与真实任务验收 -> 人工批准后开启开关。未登记迁移历史的既有库不得沿用此路径，必须遵循一次性对账演练流程。
- Worker 环境变量：`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`、`AI_DIAGNOSIS_TIMEOUT_MS`。密钥只允许进入 Worker 服务端环境。
- 已在临时 PostgreSQL 验证空库完整迁移和旧库升级；历史 DecisionRun 保留结果并回填 `LEGACY_RULE + SUCCEEDED`，新活动运行允许结果为空。
- 本轮没有执行 staging/生产 migration、Compose 重建、服务重启、发布、DNS 或流量切换；功能开关仍默认关闭。

## 2026-08-01 v035 本地历史库升级演练（原库未升级）

- 锁定升级目标为本机 `douyin_subject_diagnosis`，已完成逻辑备份、Schema 备份、行数清单与校验，并由备份克隆出 `douyin_v035_rehearsal_20260801162145` 演练库；备份和生成 SQL 均只在本机 `.backups/`，不进入 Git。
- 演练库已在事务和执行前断言保护下执行 `tools/reconcile-v035-legacy-database.ps1` 的一次性对账路径，v035 Schema 差异为空，16 条迁移登记完成，`prisma migrate status`、历史读取与核心表行数均一致。
- 原库没有执行 DDL、迁移登记或写入。验收任务 `cms4wmzes000uqs07m0a4q8ze` 不在 `douyin_subject_diagnosis` 而在 `pxxis_prelaunch`，因此任务存在性门禁阻断了原库升级；没有改用 `prisma migrate deploy`、没有复制任务、没有启动 API/Worker 写入或启用 AI。
- 继续前必须由用户指定任务与锁定目标库的统一方案。获得明确决定后，仍须对原库再次备份、停止写入、复跑同一已演练脚本、登记迁移并复核备份可恢复性、迁移状态、行数和历史读取；本轮不是部署或生产变更。

## 2026-08-01 V035 本机验收环境（非部署）

- 本机运行库已改为 `pxxis_prelaunch` v035，升级前后 API/Worker 写入均已停止并完成两次 custom-format 逻辑备份、Schema 备份、行数清单和 SHA256 manifest。最终恢复点为 `.backups/pxxis-v035/pxxis_prelaunch-20260802T010548Z/`；该目录受 `.gitignore` 保护。
- 在隔离恢复库 `pxxis_v035_rehearsal_20260802010448` 成功后，原库以同一 DDL SHA256 升级并登记 v034/v035 两条 migration。独立核验结果：16 条 migration、Schema diff 为空、迁移状态一致、验收任务存在、快照数 `5`、核心表行数一致。
- 最后一个升级前备份还原到 `pxxis_v035_restoreverify_20260802013030` 后，v033 的 14 条 migration、验收任务和快照清单均可读取；恢复验证没有覆盖运行库或 Docker 数据卷。
- 本机 API 容器现为 `pxxis-v035-local-api:20260801`，端口仍绑定 `127.0.0.1:4300`；Web 为 `pxxis-v035-local-web:20260801`，端口仍绑定 `127.0.0.1:3300`。两个旧 v033 容器只改名并停止，保留为回退副本。
- 当前本机 API `/ready` 与 `/version` 均返回 HTTP 200；版本为 `a0cef5b`、Schema `20260731_v035_ai_skill_diagnosis`。API 显式 `AI_DIAGNOSIS_ENABLED=false`，没有 `DEEPSEEK_API_KEY`；诊断 Worker 未启动。
- 本轮没有服务器 Compose 重建、生产部署、DNS、推送或平台操作。真实 AI 验收只允许在用户完成五路线采集与人工复核后，于本机临时运行时单独注入密钥并手工打开开关。

## 2026-08-03 本机验收入口恢复（非部署）

- 既有 v035 API/Web 容器此前正常退出，2026-08-03 已直接重新启动同一容器，不重建镜像、不运行 migrate 服务、不变更数据库。当前 API/Web/PostgreSQL 均运行，API 端口为 `127.0.0.1:4300`，Web 端口为 `127.0.0.1:3300`。
- API `/ready` 返回数据库就绪，`/version` 为 `a0cef5b` / `20260731_v035_ai_skill_diagnosis`；容器内 `prisma migrate status` 显示数据库已最新。`AI_DIAGNOSIS_ENABLED=false`，无 `DEEPSEEK_API_KEY`，没有诊断 Worker。
- Web 包含安全登录回跳修复：用户重新登录后会回到验收任务以继续手动配对。该环境仍只用于本机人工验收，不代表服务器部署、生产切换或平台操作。

## 2026-08-03 本机采集协议升级（非部署）

- 因 Chrome 实际加载同版本旧构建，已将共享 Web Bridge 协议升级为 `3`、采集写入协议升级为 `2`，并重建本机 unpacked Extension、API 和 Web。未运行 migration、`db push` 或数据库修复脚本。
- 当前 unpacked 路径为 `apps/extension/release/local-unpacked-test-extension`，版本 `0.2.4`，指纹 `5b8ac43c56ca`。Chrome 仍需用户在扩展管理页手动重新加载；当前浏览器标记仍是旧构建 `ac1f90e08ade` / 协议 `2`，因此被新环境视为不兼容。
- 当前 API/Web 容器由本机传统 Docker 构建器生成并运行，端口仍为 `127.0.0.1:4300/3300`，两者 healthy；`/version` 返回采集协议 `2`。PostgreSQL 容器和数据卷未重建，任务 `cmscuy6al0005qs07q1nz32hl` 的快照数切换前后均为 `11`。
- 协议升级前 API/Web 容器停止并保留为 `pxxis-prelaunch-20260713-api-1-protocol1-rollback-20260803`、`pxxis-prelaunch-20260713-web-1-protocol2-rollback-20260803`。不要删除，待新插件真实复采通过后再单独确认。
- API 继续使用本机 development 运行模式和原 SMTP/会话配置，`AI_DIAGNOSIS_ENABLED=false`；无 `DEEPSEEK_API_KEY`、诊断 Worker 为 0。此次不是服务器部署、生产启用、发布或平台操作。

## 2026-08-04 本机 Web 连接状态修复（非部署）

- 本机 Web 已构建并切换为 `pxxis-v035-local-web:20260804-connection-state-v2`，端口继续仅绑定 `127.0.0.1:3300`；API 与 PostgreSQL 容器、数据库卷、迁移和 AI 配置未修改。
- 新 Web 健康检查和 HTTP 200 均通过。切换前容器保留为停止的 `pxxis-prelaunch-20260713-web-1-connection-state-rollback-20260804`，可用于本机回退；不得删除，直至新版插件复采单路线通过。
- 这不是生产部署、发布、DNS 或流量切换。API 仍为 `AI_DIAGNOSIS_ENABLED=false`，无 DeepSeek 密钥，诊断 Worker 未运行。

## 2026-08-07 本机配对协议修复（非部署）

- 运行中的 API/Web 仍为旧协议 `3` 镜像，无法与当前协议 `4` 解包插件完成配对。现已重建并仅替换本机 API/Web 容器为 `pxxis-v035-local-api:20260807-protocol4-pairing-repair` 和 `pxxis-v035-local-web:20260807-protocol4-pairing-repair`，端口仍只绑定 `127.0.0.1:4300/3300`。
- `/ready`、`/version`、Web 首页和当前任务页已实测 HTTP 200，API `/version` 返回采集协议 `4`。旧协议 3 API/Web 容器已停止并保留为 `*-protocol3-rollback-20260807`。
- PostgreSQL 容器与卷未重建，未执行 migration、`db push` 或业务数据写入；`AI_DIAGNOSIS_ENABLED=false`、`LIVE_SCREEN_INTERNAL_API_ENABLED=false`，未注入 DeepSeek 密钥且未启动 Worker。本机人工验收仍需用户手动重载插件并重新配对。

## 2026-08-07 本机自动连接修复（非部署）

- 本机 API/Web 已切换为 `pxxis-v035-local-api:20260807-protocol5-auto-connect` 和 `pxxis-v035-local-web:20260807-protocol5-auto-connect`，端口继续仅绑定 `127.0.0.1:4300/3300`。API `/ready`、`/version` 和当前任务页均已实测 HTTP 200。
- Web Bridge 协议升级至 `5`；采集写入协议保持 `4`。当前本地解包插件为 `0.2.4`，构建指纹 `f8f1e42ff28f`，需要用户在 Chrome 扩展管理页手动重新加载。
- PostgreSQL 容器和数据卷未重建；未执行 migration、`db push`、业务数据写入、真实平台操作、AI/Worker 启动或内部 API 开关启用。旧协议 4 API/Web 容器已停止保留为 `pxxis-prelaunch-20260713-api-1-protocol4-rollback-20260807-151126` 和 `pxxis-prelaunch-20260713-web-1-protocol4-rollback-20260807-151126`，仅用于本机回退。
- Web 已按“先桥接恢复、后服务端状态”顺序重新构建并替换，旧 Web 实例保留为 `pxxis-prelaunch-20260713-web-1-protocol5-preordered-refresh-rollback-20260807-010000`。Chrome 尚未重载新版插件，当前现场仍是旧构建 `fe4f32506ca1 / 协议 4`。

## 2026-08-07 本地插件超时保护制品（未部署）

- 本地 unpacked Extension 已从当前源码重建为指纹 `7861690c4cc4`，Bridge 协议 `5`、采集协议 `4`。该制品增加任务页恢复请求的有界超时，不改变 API/Web 镜像或数据库。
- 本轮没有替换正在运行的 API/Web/PostgreSQL 容器，没有部署、发布、DNS 或流量切换。Chrome 仍需用户在扩展管理页手动重新加载该目录，才能进行真实验收。

## 2026-08-08 本机 Bridge 协议 6 切换（非部署）

- 本机 API/Web 已从协议 5 容器切换到 `pxxis-v035-local-api:20260808-protocol6-postmessage` 与 `pxxis-v035-local-web:20260808-protocol6-postmessage`，端口仍仅绑定 `127.0.0.1:4300/3300`。API `/ready`、`/version` 与 Web HTTP 200 已实测通过。
- Bridge 协议为 `6`，采集协议保持 `4`；本地解包插件构建指纹 `3012e6dbc930`。旧 API/Web 容器停止并保留为 `pxxis-prelaunch-20260713-*-1-protocol5-rollback-20260808`，仅供本机回退。
- PostgreSQL 容器、数据卷、迁移、业务数据、AI/Worker 与 `LIVE_SCREEN_INTERNAL_API_ENABLED=false` 均未改动。本次仅为本机验收环境切换，不是生产部署、发布、DNS 或流量切换。

## 2026-08-09 本机直播 API 优先灰度（非生产部署）

- 用户已明确要求本机采集改为 API 优先，因此仅在当前本地开发环境启用 `LIVE_SCREEN_INTERNAL_API_ENABLED=true`；`.env.example` 和 Compose 默认值继续为 false，生产或其他环境不会随本次自动开启。`AI_DIAGNOSIS_ENABLED=false`、Worker 未启动。
- API/Web 已从当前源码分别构建并替换到 Compose 项目 `pxxis-prelaunch-20260713`，继续复用原 PostgreSQL 容器和数据卷。API 为 `a0cef5b788b6` / 采集协议 4，API/Web/PostgreSQL healthy，`/ready`、`/version` 和任务大屏均为 HTTP 200，端口仍只绑定 `127.0.0.1:4300/3300`。
- Windows Docker Compose 批量 BuildKit 再次触发会话头 gRPC 错误；最终通过逐镜像 `docker build` 和带既有本机参数的 `docker compose up --no-build` 完成。运行日志已复核，API/Web 正常启动；迁移容器只执行 `prisma migrate deploy` 检查并报告 14 个 migration、无待应用项。
- 本次未新增或执行 migration、`db push`、数据修复、历史快照改写或数据卷清理。任务 `cmslcimbi000loz077k91p0vq` 的旧缺值快照保留原样，必须通过新版插件主动复采生成新快照。
- 本地 unpacked 已重建为指纹 `27f61909cf44`。Chrome 仍需用户手动重新加载该目录；在此之前真实浏览器继续运行旧构建，本次没有由 Codex 代替用户触发平台内部 API。

## 2026-08-28 本机本地推契约 v2 API 切换（非生产部署）

- 经用户明确授权，仅将本机 `127.0.0.1:4300` API 从 `pxxis-prelaunch-20260713-api:local-plugin-v0.2.5` 切换为 `pxxis-prelaunch-20260713-api:local-promotion-contract-v2-20260828`。
- 新镜像先在临时 4301 容器验证数据库 ready 和共享契约 `2026-08-28.2 / 1.2.1`，再切换正式端口。正式容器 Docker health、API `/ready`、`/version` 均通过；3300 Web 继续返回 HTTP 200。
- 旧 API 容器停止保留为 `pxxis-prelaunch-20260713-api-1-before-contract-v2-20260828`，可用于本机回退。PostgreSQL、数据卷、Schema、Web 容器、生产环境、DNS 与外部流量均未修改。

## 2026-08-29 本机校准大屏内联诊断 Web 切换（非生产部署）

- Web 已由 `pxxis-prelaunch-20260713-web:dashboard-pulse-cadence-30s-20260828` 切换为 `pxxis-prelaunch-20260713-web:diagnosis-inline-v2-20260829`，端口仍仅绑定 `127.0.0.1:3300`，并继续指向本机 `127.0.0.1:4300` API。
- 先以临时 3301 候选容器完成 HTTP 200 与启动日志检查，再完成 3300 替换；当前正式容器运行中、首页 HTTP 200。候选容器已删除，上一版 Web 停止保留为 `pxxis-prelaunch-20260713-web-1-rollback-inline-diagnosis-v1-20260829`，可用于本机回退。
- 未更改 API、PostgreSQL、数据卷、Schema、迁移、生产 DNS、外部流量、平台状态或插件源代码。本次只更新本机 Web 的诊断结果呈现和向导步骤。

## 2026-08-31 本机 Docker 历史容器清理（非部署）

- 已删除 10 个本项目已退出、无数据卷或宿主机挂载的较早 Web/API/Worker 回退容器；保留当前运行中的 Web、API、Worker、PostgreSQL，以及紧邻当前版本的一整套回退容器。
- 清理后 Web `127.0.0.1:3300`、API `127.0.0.1:4300/ready`、`/version` 均返回 HTTP 200；Web/API/PostgreSQL healthy，Worker running。
- 未删除镜像、Docker 数据卷、数据库或业务数据，未重建服务、执行 migration、修改配置、发布、部署或切换外部流量。

## 2026-09-02 本机 Docker 历史容器清理（非部署）

- 按用户要求删除 21 个已退出、无数据卷或宿主机挂载的本项目 Web/API/Worker 历史回退和候选容器；当前本项目已退出容器数为 0。
- 运行中的 Web、API、Worker 与 PostgreSQL 未重建或切换。Web `127.0.0.1:3300`、API `127.0.0.1:4300/ready`、`/version` 实测均返回 HTTP 200。
- 镜像、数据卷、数据库、业务数据、网络、其他项目容器、配置、迁移、生产部署和外部流量均未改动。

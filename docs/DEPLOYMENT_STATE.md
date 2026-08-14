# Deployment State

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

# 抖音生活服务全域诊断系统 V0.1

本项目是面向抖音生活服务、本地生活服务商代播/代运营场景的本地 Web 诊断 MVP。当前 V0.1 的核心原则是：先识别直播主体，再进入对应诊断算法；当前主攻服务商板块，官方自播、职人、达人、矩阵、平台活动、品牌区域矩阵保留算法框架。

系统只做采集、诊断、动作建议、人工审批和人工执行留痕。第一版不会自动点击、自动改预算、自动暂停任务、自动创建计划、自动提交平台表单，也不会绕过验证码或规避平台风控。

## Monorepo 结构

```text
apps/
  web/        Next.js 工作台、任务详情、决策中心、动作审批页
  api/        Express API，负责认证、采集快照、标准化指标、决策闭环
  extension/  Chrome MV3 采集插件，只采集可见页面数据和允许的 JSON 响应
packages/
  shared/           共享类型、主体枚举、动作库、zod schema、免责声明
  decision-engine/  V0.1 规则引擎与审批护栏
  llm/              mock LLM/provider 框架，保留后续接入位置
prisma/
  schema.prisma     PostgreSQL schema
```

## 数据库

当前主库为：

- `douyin_subject_diagnosis`

旧库：

- `ai_ad_diagnosis` 只保留历史用途，不再作为当前 V0.1 主线使用。

Docker Compose 默认启动 Postgres/Redis。由于当前目录包含中文，Windows 上建议显式指定 compose project name：

```bash
docker compose -p douyin-local-life up -d postgres redis
```

## 启动方式

```bash
corepack pnpm install
copy .env.example .env
corepack pnpm prisma:generate
corepack pnpm exec prisma validate
corepack pnpm exec prisma db push --skip-generate
corepack pnpm dev
```

默认地址：

- Web: `http://127.0.0.1:3000`
- API: `http://localhost:4000`

## V0.1 能力

- 注册、登录、工作区和项目管理。
- 主体识别优先字段：`subjectType`、`operatorType`、`cooperationType`、`controlLevel`、`subjectConfidence`。
- 服务商字段：服务商名称、服务类型、服务费。
- Chrome 插件本地采集快照。
- 上传 `DataSnapshot` 并生成 `NormalizedMetric`。
- 运行 `DecisionRun`，生成 `ActionProposal`。
- Web 决策中心查看动作建议、按状态筛选。
- 动作建议详情页支持审批通过、拒绝、设为观察。
- 已审批建议可标记“人工已执行”。
- `ApprovalRecord`、`ExecutionLog`、`AuditLog` 全链路留痕。

## V0.1 禁止能力

- 不自动点击平台按钮。
- 不自动输入平台表单。
- 不自动修改预算。
- 不自动暂停投放。
- 不自动创建投放计划。
- 不自动提交平台操作。
- 不绕过验证码。
- 不规避平台风控。
- 不把 ActionProposal 执行到平台页面。
- 不申请 Chrome `cookies` 权限。
- 不采集平台 cookie、平台 authorization、平台 token、password。

## Chrome 插件

构建：

```bash
corepack pnpm --filter @douyin-local-life/extension build
```

手动加载：

1. 打开 Chrome。
2. 进入 `chrome://extensions/`。
3. 打开开发者模式。
4. 点击“加载已解压的扩展程序”。
5. 选择 `apps/extension/dist`。
6. 确认 manifest 无报错。

插件边界：

- 只采集当前页面可见文本、表格、指标关键词。
- 只采集同源或白名单域名的 JSON 响应。
- 网络记录最多保留最近 50 条。
- 敏感字段递归脱敏。
- SaaS API token 只用于访问本系统 API，并保存到 `chrome.storage.session`。
- Extension popup 文案后续单独同步；当前安全边界以 manifest、源码守卫、脱敏测试和 Web 插件承接页为准。

## API smoke 流程

自动 smoke 覆盖在 `apps/api/src/decision-flow.test.ts`：

1. 注册用户。
2. 登录用户。
3. 创建 workspace。
4. 创建服务商主体项目。
5. 创建采集任务。
6. 上传直播大屏快照。
7. 生成标准化指标。
8. 获取任务 metrics。
9. 运行 decision-run。
10. 生成 action proposals。
11. 获取项目动作建议列表。
12. 获取动作建议详情。
13. approve 一个建议。
14. observe 一个建议。
15. reject 一个建议。
16. mark-manual-executed 一个已审批建议。
17. 检查 ApprovalRecord、ExecutionLog、AuditLog。
18. 检查 API 返回结构为 `success/data/error`。

运行：

```bash
corepack pnpm --filter @douyin-local-life/api test
```

## Web 验收流程

- `/` 主站首页可访问，说明产品定位、插件采集边界和 Web 工作台闭环。
- `/login` 注册/登录。
- `/dashboard` 查看项目入口和免责声明。
- `/extension` 插件承接页可访问，说明插件只采集可见数据和允许 JSON 响应，不自动点击、修改预算、暂停任务、创建计划或提交平台操作。
- `/privacy` 隐私政策可无需登录访问，说明采集范围、敏感字段脱敏、数据用途和平台操作边界。
- `/terms` 服务条款可无需登录访问，说明服务定位、数据授权、服务限制和免责声明。
- `/projects/new` 创建服务商主体项目。
- `/projects/[id]` 查看项目详情、主体类型、当前算法、任务列表。
- `/tasks/[id]` 查看快照、指标、决策运行、动作建议，并可运行决策。
- `/decision-center` 查看动作建议列表并按状态筛选。
- `/action-proposals/[id]` 查看动作详情，待审批状态显示 approve/reject/observe。
- `APPROVED` 状态显示 mark-manual-executed。
- `REJECTED`、`OBSERVING`、`MANUAL_EXECUTED` 状态不显示无效按钮。

所有 AI 诊断和动作建议页面必须显示：

```text
AI 诊断结果仅供投流决策参考，请结合业务目标、预算和平台规则人工确认。第一版系统不会自动执行任何投放操作。
```

## 验证命令

```bash
corepack pnpm prisma:generate
corepack pnpm exec prisma validate
corepack pnpm exec prisma db push --skip-generate
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## V0.2 建议

- 补待校准队列页面，把主体字段、ROI、库存、活动核验做人工校准入口。
- 增加截图/OCR 导入，但低置信字段必须进入待校准。
- 活动库热更新和后台核验状态维护。
- 服务商 SOP、排班、脚本、错价/承诺风险结构化采集。
- 增加 Playwright/浏览器 E2E 测试，覆盖 Web 交互流。
- 继续收窄 Chrome 插件域名白名单到真实后台域名。

# 抖音生活服务主体识别诊断系统

本项目是面向抖音生活服务、巨量本地推、本地生活服务商场景的诊断 MVP。

当前方向已经收束为：**先识别直播主体，再进入不同算法**。第一阶段主攻服务商代播/代运营，官方自播、职人、达人、达人矩阵、平台活动、品牌区域矩阵只保留算法框架。

诊断结果只作为投流辅助，不自动提交投放修改；主体、ROI、活动、库存等关键字段缺失时必须提示“数据缺失/待校准”，不得编造结论。

## 当前代码结构

```text
apps/
  web/        # Next.js 前端工作台
  api/        # Express API
  extension/  # Chrome MV3 采集助手
packages/
  shared/     # 主体枚举、接口 schema、动作库、通用类型
  llm/        # mock 诊断规则与后续 LLM Provider 抽象
prisma/
  schema.prisma
docker-compose.yml
pnpm-workspace.yaml
```

旧的根目录 Next 应用、旧采集原型、旧 worker 已从源码入口移除，避免继续污染当前方向。

## 核心规则

- 每次诊断先确认 `subjectType`、`operatorType`、`cooperationType`、`controlLevel` 和置信度。
- 主体不清时输出“主体待校准”，只允许保守动作。
- 服务商不是流量身份，而是执行主体，重点看商家号数据、服务商执行质量、服务费后真实 ROI。
- 缺少核销 ROI、毛利 ROI、活动核验、库存/预约等关键字段时，输出“数据缺失/待校准”。
- 风险优先于 ROI：错价、虚假承诺、客诉、退款、差评、履约、库存异常时禁止加预算。

## 启动

```bash
corepack pnpm install
docker compose up -d
copy .env.example .env
corepack pnpm prisma:generate
corepack pnpm db:push
corepack pnpm dev
```

默认地址：

- Web: `http://127.0.0.1:3000`
- API: `http://localhost:4000`

## Chrome 采集助手

```bash
corepack pnpm extension:build
```

在 Chrome 中打开 `chrome://extensions`，启用开发者模式，加载 `apps/extension/dist`。

插件边界：

- 只采集用户当前已登录且有权限查看的页面。
- 只采集可见 DOM 文本、表格、同源/白名单 JSON 响应。
- 不保存密码，不采集 cookie/token/authorization header。
- JWT Token 只保存到 `chrome.storage.session`。
- 采集失败或页面未知时上传 `UNKNOWN` 和缺失字段，由诊断端提示待校准。

## API

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /workspaces`
- `POST /workspaces`
- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `POST /collection-tasks`
- `GET /collection-tasks/:id`
- `PATCH /collection-tasks/:id/status`
- `POST /collection-tasks/:id/snapshots`
- `GET /collection-tasks/:id/snapshots`
- `POST /collection-tasks/:id/analyze`
- `GET /collection-tasks/:id/analysis`
- `GET /collection-tasks/:id/recommendation`
- `GET /projects/:id/audit-logs`

## 验证

```bash
corepack pnpm prisma:generate
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

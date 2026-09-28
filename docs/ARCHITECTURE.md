# Architecture

> 由 `tools/build-code-index.mjs` 确定性生成，和 `CODE_INDEX.md`、`CODE_OWNERSHIP.md` 共用同一份源码扫描结果。

## 分层

```text
apps/web                 展示与用户交互
apps/extension           浏览器采集与 Bridge
apps/api                 认证、证据、复核、决策编排、Worker
packages/shared          跨端类型与共享契约
packages/llm             LLM Provider 与结构化输出
packages/decision-engine 规则引擎与审批护栏
packages/diagnosis-skills 领域 Skill 注册与评测案例
prisma                   PostgreSQL Schema 与 migration
```

## 调用方向

- `apps/*` 可以依赖 `packages/*`。
- `packages/*` 不得依赖任何 `apps/*`。
- `apps/web` 不得直接依赖 `apps/api` 或 `apps/extension`。
- API 是服务端可信边界；浏览器和前端输入只进入 API 后在服务端验证。

## 模块数量

- 服务端 - 认证与积分：13
- 服务端 - 采集与证据：35
- 服务端 - 复核校准：10
- 服务端 - 决策编排：84
- 服务端 - AI Worker：26
- 服务端 - 项目历史：9
- Web - 展示：61
- Extension - 插件采集：55
- 工程 - 数据与基础设施：33

## 禁止边界

- 插件不执行平台点击、改预算、暂停、创建计划、提交表单、绕过验证码或模拟人工操作。
- AI 只负责解释、总结、建议、复盘；安全、预算、审批和权限由服务端确定性代码控制。
- 测试文件不得被生产模块引用。
- 生成索引、归档和发布产物不得进入代码依赖方向。

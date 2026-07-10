# AI 智能投流诊断与决策闭环系统

> 本文件定义 Codex 在本仓库中的**长期工作规范**，属于永久规则。
>
> **当前开发任务、优先级和阶段目标统一放在 `docs/CURRENT_TASK.md`。**
> 如长期规则与当前任务冲突，应停止执行并记录原因；如仅与旧文档冲突，应以当前任务和最新架构决策为准。

---

# 项目定位

项目名称：

**AI 智能投流诊断与决策闭环系统**

当前阶段：

> 诊断 → AI 建议 → 人工审批 → 人工执行 → 执行结果记录 → AI 复盘 → 策略沉淀

第一阶段聚焦：

* 巨量本地推
* 本地生活
* 服务商

最终目标：

构建一个可持续学习、持续优化的 AI 投流辅助决策平台，在确保安全可控的前提下，形成数据驱动的策略闭环。

---

# 技术栈

* pnpm Workspace
* TypeScript
* Next.js
* Express API
* PostgreSQL
* Prisma
* Chrome Extension MV3

---

# 当前目录结构

* `apps/web`
* `apps/api`
* `apps/extension`
* `packages/shared`
* `packages/llm`
* `packages/decision-engine`
* `prisma`
* `docs`

---

# 永久安全红线（禁止突破）

Codex 不得实现以下能力：

* 自动点击平台页面
* 自动修改预算
* 自动暂停计划
* 自动创建广告计划
* 自动提交平台表单
* 自动绕过验证码
* 自动模拟人工操作

禁止采集以下敏感信息：

* password
* cookie
* token
* authorization
* secret
* refreshToken
* accessToken

执行规范：

* `mark-manual-executed` 仅记录用户手动执行结果
* `ActionOutcome` 仅记录执行后的复盘数据
* AI 可以提出建议，但最终执行必须由人工确认

---

# 开发原则

所有开发必须遵循以下原则：

## 1. 安全优先

安全高于功能。

涉及权限、认证、状态机、数据边界、敏感信息时，优先修复安全问题。

---

## 2. 数据真实性

不得伪造数据。

不得虚构采集结果。

不得生成不存在的执行记录。

---

## 3. 最小采集原则

插件仅采集完成诊断所需的数据。

所有新增采集字段必须说明用途。

禁止扩大采集范围。

---

## 4. 服务端可信

所有关键判断必须由服务端完成。

浏览器插件仅负责采集。

前端仅负责展示。

---

## 5. AI 仅辅助

LLM 负责：

* 解释
* 总结
* 建议
* 复盘

不得依赖 LLM 输出决定安全规则。

涉及预算、状态、审批、权限等必须由确定性代码控制。

---

## 6. 向后兼容

除当前任务明确要求外：

* 不删除已有接口
* 不删除已有字段
* 不破坏现有功能
* 优先保持兼容

---

# 允许修改范围

除永久安全红线外，Codex 可根据当前任务修改：

* apps/web
* apps/api
* apps/extension
* packages/shared
* packages/llm
* packages/decision-engine
* prisma
* docs

是否修改由 `docs/CURRENT_TASK.md` 决定。

---

# 开工前必须阅读

依次阅读：

1. `docs/CODEX_HANDOFF.md`
2. `docs/PROJECT_STATE.md`
3. `docs/SAFETY_BOUNDARY.md`
4. `docs/CURRENT_TASK.md`

阅读完成后再开始修改。

---

# 完成任务后必须更新

根据修改内容同步更新：

* `docs/CODEX_HANDOFF.md`
* `docs/PROJECT_STATE.md`
* `docs/CURRENT_TASK.md`

如涉及：

* 架构调整 → 更新 `docs/DECISION_LOG.md`
* 部署变化 → 更新 `docs/DEPLOYMENT_STATE.md`

---

# 修改后的验证要求

根据修改范围执行验证：

基础验证：

* `corepack pnpm typecheck`
* `corepack pnpm test`
* `corepack pnpm build`

涉及 Prisma：

* `corepack pnpm exec prisma validate`
* `corepack pnpm prisma:generate`
* 根据需要执行 Migration 或 `db push`

如因环境限制无法运行验证，必须记录：

* 未执行命令
* 原因
* 潜在影响
* 建议的人工验证步骤

---

# 任务执行要求

* 严格按照 `docs/CURRENT_TASK.md` 的优先级执行。
* 优先处理 P0、P1 安全问题，再处理功能优化。
* 每完成一个阶段，先完成验证，再进入下一阶段。
* 修改内容保持最小影响范围，避免无关重构。
* 重大架构调整必须记录到 `docs/DECISION_LOG.md`。

---

# 文档职责划分

| 文档                    | 职责              |
| --------------------- | --------------- |
| `AGENTS.md`           | 长期工作规范（永久规则）    |
| `CURRENT_TASK.md`     | 当前开发任务、阶段目标、优先级 |
| `PROJECT_STATE.md`    | 当前项目状态          |
| `CODEX_HANDOFF.md`    | 开发交接记录          |
| `DECISION_LOG.md`     | 架构决策记录          |
| `DEPLOYMENT_STATE.md` | 部署状态记录          |
| `SAFETY_BOUNDARY.md`  | 安全边界说明          |

---

**原则：永久规则放 `AGENTS.md`，阶段任务放 `CURRENT_TASK.md`。避免将一次性的限制写入 `AGENTS.md`，以免影响后续开发。**

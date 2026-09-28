# AI Skill 诊断运行手册

> 当前状态以 [NOW.md](./NOW.md) 为准。当前记录为 `2026-09-19` 本机 API/Worker/Web 已切换至服务端诊断结果补全 v32，运行模块为 Prompt v28 / Orchestration v37 / SkillSet v11。真实 AI 分析质量和人工审批、平台手动执行、Outcome 闭环仍需用户显式验收；下方较早版本的模块版本和运行说明属于历史阶段。

## 主链路

正式 AI 诊断只支持代直播增长项目，输入必须来自当前采集批次中已确认、未过期且已人工复核的结构化证据：

```text
复核证据 -> 服务端固定 Skill 计划 -> 审计与领域 Skills -> 模型裁决/综合
         -> 服务端规则裁决 -> 人工审批/执行 -> Outcome/评价
```

Worker 根据当前正式证据层、已放行路线、Skill 适用路线和注册表顺序生成计划：`audit_data_readiness` 始终第一，领域 Skill 串行且最多一次，`retrievalEnabled=false`。编排器会校验收到的计划与服务端重算结果一致；正式模型请求不携带 Skill `tools` 或 `tool_choice`。每个领域仍可在内部调用模型分析，证据不足时直接返回结构化拒绝而不调用模型；领域结果完成后，模型仅生成短核心裁决与无 thinking 的 JSON 综合器结果。隐藏推理只在当前请求链中使用，不写数据库、日志或前端。历史的 8 轮、12 次工具调用上限仍保留为兼容元数据，但第一阶段正式路径不再依赖模型工具调用次数。

历史阶段 Prompt v16 的业务输出遵循以下约束，后续版本仍保持同一业务语义和安全边界：

- 以“流量进入 → 直播承接 → 商品点击与成交 → 投放产出”组织结论，结合本地生活的商品、内容/直播、广告和阶段经营框架；不展示模型思维过程。
- 业务文案不出现内部指标键、Skill ID、路线枚举或 evidence ID；这些信息只在折叠的审计详情中展示。
- 没有任务目标、同口径历史或明确外部基准时，不得声称行业平均、健康水平或通常阈值；参考 PPT、培训和案例中的具体数字不能直接迁移。
- 不同统计范围、路线或时间窗的指标不得拼算转化率或 ROI。证据不足时返回拒绝/判断缺口，优先建议补证和单变量验证。
- 同一类历史趋势缺口只保留一条，不按观看、点击或成交指标重复枚举，也不要求“同直播类型”；最终缺口最多 3 条。
- 业务语言和合法证据 ID 都进入一次结构化修复；仍不合规时运行 `FAILED`，不创建 `ActionProposal`。

## 配置与进程

- `AI_DIAGNOSIS_ENABLED=false`：默认关闭。当前仅在本机验收运行态由用户显式开启；不得传播到其他环境，也不得把开关开启视为真实验收通过。
- `DEEPSEEK_API_KEY`：仅配置在服务端 API/Worker 环境，不写入前端、数据库或文档。
- `DEEPSEEK_MODEL=deepseek-v4-flash`（当前默认模型；可由服务端环境变量显式覆盖）
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `AI_DIAGNOSIS_TIMEOUT_MS=120000`
- API 进程只负责门禁、入队和查询；Worker 使用 `corepack pnpm --filter @douyin-local-life/api worker` 启动。

Docker Compose 中 `diagnosis-worker` 与 API 共用数据库。功能开关关闭时 Worker 不领取任务；当明确设置 `AI_DIAGNOSIS_ENABLED=true` 但服务端没有 `DEEPSEEK_API_KEY` 时，创建接口返回 `503 / DEEPSEEK_API_KEY_MISSING`，Worker 不领取租约且独立 Worker 进程会以配置错误停止。开启前必须先执行 v035 migration。

历史阶段 2026-08-30 的本机验收运行态已切换到 `deepseek-v4-flash`，并以无生成 `GET /models` 确认模型可用；这不构成真实诊断或质量验收。历史 `deepseek-v4-pro` 的评测记录继续只作为历史基线。

真实启用前还必须完成：当前路线的时效内可信采集与人工复核、一次可审计的本机 DecisionRun 验收，以及人工动作的同口径观察方案。不得仅因合成评测通过而开启。

## 评测命令

- `corepack pnpm diagnosis:eval:fake`：CI 使用脚本化 Provider 跑 24 个合成案例，验证固定调度、结构、证据引用和安全边界。
- `corepack pnpm diagnosis:eval:live`：真实调用 DeepSeek 跑 24 个合成案例。
- `corepack pnpm diagnosis:eval:eligible`：真实调用 DeepSeek，并追加重跑数据库中已人工纳入的案例；当前代码中的 Skill 版本即候选版本。

调试单例或小批次可直接运行 `corepack pnpm --filter @douyin-local-life/api exec tsx src/diagnosis-eval-cli.ts --live --limit=1`，也可使用 `--ids=id1,id2` 和 `--concurrency=1..4`。正式质量门禁使用案例串行的默认并发 1；评测并发只影响离线测试，不改变生产 Worker 默认并发 1。

发布门槛：结构通过率 100%、核心问题命中率不低于 80%、虚构证据为 0、安全违规为 0。评测报告不自动修改 Prompt、规则、Skill 或权重；默认版本只能在人工批准后更新。

2026-07-31 已使用真实 `deepseek-v4-pro` 对 Prompt v13、SkillSet v2、Orchestration v19 完成串行 24 例评测：结构 24/24、核心命中 24/24、虚构证据 0、安全违规 0。报告见 `docs/evaluations/2026-07-31-deepseek-v4-pro-ai-diagnosis.md`。历史第一阶段源码曾为 Prompt v16 / SkillSet v5 / `server-determined-skill-plan-v21`，已通过同一 24 例脚本化评测，并统一直播与本地推双路线实时证据判定。领域、核心裁决和最终综合都会收到合法 ID 清单，非法引用或违规业务语言在一次结构修复后仍不合法才失败；脚本化结果不替代真实任务人工验收。

## 失败与重试

- Provider、超时、限流、5xx 或结构校验失败都会使当前 `DecisionRun` 进入 `FAILED`；已通过回归测试确认这些失败不创建 `ActionProposal`。
- 模型引用清单外的 evidence ID 时，会把合法 ID 清单作为一次结构化修复约束；不得按相似字符串自行猜测。修复后仍非法则 `FAILED`，页面展示失败 Skill 的具体安全原因。
- 失败运行不可变，不创建 `ActionProposal`，也不使用规则模板冒充 AI 成功。
- 用户重试会使用新的幂等键创建新运行；同一任务只能存在一个 `PENDING/RUNNING` AI 运行。
- Worker 启动前重新检查任务归属、证据指纹、路线时效和复核状态；变化时以 `DECISION_EVIDENCE_CHANGED` 失败。

## 数据与安全

- Skill 执行只保存脱敏后的结构化输入、输出、版本、顺序、耗时和 Token 用量。
- 案例检索代码继续保留兼容，但第一阶段正式诊断不检索、不传递案例摘要，也不执行 `retrieve_similar_cases`；恢复前仍必须限制当前工作区和脱敏摘要。
- AI 候选动作必须引用合法证据 ID，且通过确定性规则的数据质量、证据、风险、冷却、去重、频控、有效期和审批资格检查后，才会创建待审批动作。
- 系统不自动点击、改预算、暂停、建计划、提交表单或绕过验证码；所有平台操作继续由用户人工完成。

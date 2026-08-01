# AI Skill 诊断运行手册

## 主链路

正式 AI 诊断只支持代直播增长项目，输入必须来自当前采集批次中已确认、未过期且已人工复核的结构化证据：

```text
复核证据 -> DeepSeek 编排 -> 版本化业务 Skills -> 综合诊断
         -> 服务端规则裁决 -> 人工审批/执行 -> Outcome/评价 -> 案例库
```

`audit_data_readiness` 由编排器确定性地首先执行并记录。DeepSeek Tool Calls 选择领域 Skills，领域 Skill 可并行执行，但一次诊断最多 8 个编排轮次、12 次工具调用、并发 3，总时限默认 120 秒。领域结果完成后先用 thinking 生成短核心裁决，再用无 thinking 的 JSON 综合器展开完整结果；模型隐藏推理只在当前请求链中使用，不写数据库、日志或前端。

## 配置与进程

- `AI_DIAGNOSIS_ENABLED=false`：默认关闭。迁移、真实评测和真实任务验收完成前不得开启。
- `DEEPSEEK_API_KEY`：仅配置在诊断 Worker 服务端环境。
- `DEEPSEEK_MODEL=deepseek-v4-pro`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `AI_DIAGNOSIS_TIMEOUT_MS=120000`
- API 进程只负责门禁、入队和查询；Worker 使用 `corepack pnpm --filter @douyin-local-life/api worker` 启动。

Docker Compose 中 `diagnosis-worker` 与 API 共用数据库。功能开关关闭时 Worker 不领取任务；开启前必须先执行 v035 migration。

## 评测命令

- `corepack pnpm diagnosis:eval:fake`：CI 使用脚本化 Provider 跑 24 个合成案例，验证工具编排、结构、证据引用和安全边界。
- `corepack pnpm diagnosis:eval:live`：真实调用 DeepSeek 跑 24 个合成案例。
- `corepack pnpm diagnosis:eval:eligible`：真实调用 DeepSeek，并追加重跑数据库中已人工纳入的案例；当前代码中的 Skill 版本即候选版本。

调试单例或小批次可直接运行 `corepack pnpm --filter @douyin-local-life/api exec tsx src/diagnosis-eval-cli.ts --live --limit=1`，也可使用 `--ids=id1,id2` 和 `--concurrency=1..4`。正式质量门禁使用案例串行的默认并发 1；评测并发只影响离线测试，不改变生产 Worker 默认并发 1。

发布门槛：结构通过率 100%、核心问题命中率不低于 80%、虚构证据为 0、安全违规为 0。评测报告不自动修改 Prompt、规则、Skill 或权重；默认版本只能在人工批准后更新。

2026-07-31 已使用真实 `deepseek-v4-pro` 对 Prompt v13、SkillSet v2、Orchestration v19 完成串行 24 例评测：结构 24/24、核心命中 24/24、虚构证据 0、安全违规 0。报告见 `docs/evaluations/2026-07-31-deepseek-v4-pro-ai-diagnosis.md`。该结果只完成合成评测门禁，不替代真实五路线任务人工验收。

## 失败与重试

- Provider、超时、限流、5xx、工具参数或结构校验失败都会使当前 `DecisionRun` 进入 `FAILED`。
- 失败运行不可变，不创建 `ActionProposal`，也不使用规则模板冒充 AI 成功。
- 用户重试会使用新的幂等键创建新运行；同一任务只能存在一个 `PENDING/RUNNING` AI 运行。
- Worker 启动前重新检查任务归属、证据指纹、路线时效和复核状态；变化时以 `DECISION_EVIDENCE_CHANGED` 失败。

## 数据与安全

- Skill 执行只保存脱敏后的结构化输入、输出、版本、顺序、耗时和 Token 用量。
- 案例检索严格限定当前工作区，只向模型提供结论摘要、问题标签、动作类型和结果，不提供案例原始表格、页面正文或身份信息。
- AI 候选动作必须引用合法证据 ID，且通过确定性规则的数据质量、证据、风险、冷却、去重、频控、有效期和审批资格检查后，才会创建待审批动作。
- 系统不自动点击、改预算、暂停、建计划、提交表单或绕过验证码；所有平台操作继续由用户人工完成。

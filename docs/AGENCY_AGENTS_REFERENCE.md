# Agency Agents 决策参考库

## 使用目的

本项目只吸收第三方角色提示词中的诊断方法、证据检查和人工验证流程，不把第三方经验直接当作平台规则，也不让其生成正式动作。

运行时边界：

- `packages/llm` 可以返回解释性 `decisionReference`。
- `decisionReference.mode` 固定为 `ADVISORY_ONLY`，每条 insight 的置信标识固定为 `REFERENCE_ONLY`。
- 正式动作、预算、状态、审批和执行仍只由 `packages/decision-engine` 与服务端确定性代码控制。
- 任何平台调整都必须人工审批、人工执行；系统不自动点击、改预算、暂停、建计划或提交表单。

## 固定来源

- 上游仓库：<https://github.com/msitarzewski/agency-agents>
- 固定 revision：`459dce837db3bdfdc4763d3fefd1fd854e73c8f1`
- 审阅日期：2026-07-19
- 许可：MIT
- 上游许可原文：<https://github.com/msitarzewski/agency-agents/blob/459dce837db3bdfdc4763d3fefd1fd854e73c8f1/LICENSE>

| 来源 | 本项目保留 | 本项目排除 |
| --- | --- | --- |
| [Paid Media Auditor](https://github.com/msitarzewski/agency-agents/blob/459dce837db3bdfdc4763d3fefd1fd854e73c8f1/paid-media/paid-media-auditor.md) | 账户结构、测量、预算、素材的分层审计方法 | 海外平台专属配置、未经证据验证的效果承诺 |
| [Tracking & Measurement Specialist](https://github.com/msitarzewski/agency-agents/blob/459dce837db3bdfdc4763d3fefd1fd854e73c8f1/paid-media/paid-media-tracking-specialist.md) | 转化定义、时间窗、指标来源和口径核对 | 第三方平台 API、埋点工具和跨平台归因配置 |
| [Douyin Strategist](https://github.com/msitarzewski/agency-agents/blob/459dce837db3bdfdc4763d3fefd1fd854e73c8f1/marketing/marketing-douyin-strategist.md) | 内容、流量、直播承接、商品成交的复盘维度 | 未公开算法优先级、固定完播率/GPM/ROI 阈值、必然增长承诺 |
| [Livestream Commerce Coach](https://github.com/msitarzewski/agency-agents/blob/459dce837db3bdfdc4763d3fefd1fd854e73c8f1/marketing/marketing-livestream-commerce-coach.md) | 漏斗、商品顺序、讲解、权益和履约的一次一变量验证 | 自动扩量/降量/暂停、固定出价公式、通用阈值 |
| [Reality Checker](https://github.com/msitarzewski/agency-agents/blob/459dce837db3bdfdc4763d3fefd1fd854e73c8f1/testing/testing-reality-checker.md) | 证据优先、完整流程验证、明确不通过条件 | 固定技术栈命令、主观评分和无证据认证 |

## 安全整理规则

每条参考统一包含：

1. 当前任务中的真实证据。
2. 仍需补齐或复核的证据。
3. 只能由人工完成的验证步骤。
4. 同一口径的观察指标。
5. 停止与回退条件。
6. 明确的自动化禁止边界。
7. 固定来源 revision、许可和审阅日期。

以下内容禁止进入安全提示词和正式决策：

- 未公开算法的确定性排序或“掌握算法”表述。
- 脱离账号、行业、时间窗和样本量的固定阈值。
- 自动暂停、自动扩量、自动降量、自动出价或自动提交。
- 没有当前任务证据的商品排名、投流单元结论或效果承诺。
- 把第三方经验表述为抖音生活服务官方规则。

## 当前实现

- `packages/llm/src/reference-playbooks.ts` 保存经安全整理的来源和参考 playbook。
- `buildDecisionReferenceBundle()` 根据当前 `AnalyzeInput` 选择适用参考，只读取标准化指标和场景信息，不扩大采集范围。
- `buildDecisionReferenceInstructions()` 为未来真实 LLM Provider 生成安全提示词；当前 mock Provider 直接返回结构化参考，不依赖模型自由发挥。
- `/collection-tasks/:id/explain` 将 `decisionReference` 存入 `AiAnalysisTask.responsePayload`，并继续写明 `finalActionsSource: "decision-engine"`。
- Prompt 版本为 `explanation-only-agency-reference-v0.2.0`，用于区分历史解释结果。

## 双栏展示接口

### 生成专家参考

- 用途：基于当前任务最新采集证据生成一条新的专家参考记录。
- 请求：`POST /collection-tasks/:id/explain`
- 路径参数：`id` 为当前用户有权访问的采集任务 ID。
- 请求体：空对象 `{}`。

请求示例：

```http
POST /collection-tasks/task_123/explain
Content-Type: application/json

{}
```

成功返回 `201`，`data` 主要字段：

- `id`、`status`、`provider`、`model`、`promptVersion`
- `responsePayload.summary`
- `responsePayload.decisionReference`
- `responsePayload.finalActionsSource`，固定为 `decision-engine`

### 读取最近一次专家参考

- 用途：任务页刷新后恢复最近一次专家参考展示。
- 请求：`GET /collection-tasks/:id/analysis/latest`
- 路径参数：`id` 为当前用户有权访问的采集任务 ID。
- 请求体：无。
- 数据最小化：响应不包含保存的 `requestPayload`，不会把页面原始分析输入重新下发到浏览器。

请求示例：

```http
GET /collection-tasks/task_123/analysis/latest
```

成功返回 `200`：

```json
{
  "success": true,
  "data": {
    "id": "analysis_123",
    "status": "SUCCEEDED",
    "provider": "mock",
    "model": "mock-explanation-only-agency-reference-v0.2.0",
    "promptVersion": "explanation-only-agency-reference-v0.2.0",
    "responsePayload": {
      "summary": "本轮参考结论",
      "decisionReference": {
        "mode": "ADVISORY_ONLY",
        "insights": []
      },
      "finalActionsSource": "decision-engine"
    },
    "errorMessage": null,
    "createdAt": "2026-07-19T08:00:00.000Z",
    "updatedAt": "2026-07-19T08:00:00.000Z"
  },
  "error": null
}
```

没有历史记录时 `data` 为 `null`。常见错误：

- `401 UNAUTHORIZED`：未登录或会话失效。
- `404 TASK_NOT_FOUND`：任务不存在，或当前用户无权访问该任务。
- `409 SNAPSHOT_REQUIRED`：任务还没有可用于分析的采集快照。
- `429 RATE_LIMITED`：生成专家参考过于频繁；读取最近记录不受该限制。
- `500 AI_ANALYSIS_FAILED`：专家参考生成失败；不会创建或修改正式动作。

## MIT 许可声明

Copyright (c) 2025 AgentLand Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

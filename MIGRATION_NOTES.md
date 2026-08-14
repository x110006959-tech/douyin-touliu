# V0.1 迁移说明

## 方向迁移

项目已从旧的泛化投流诊断方向，收敛为“主体识别优先的抖音生活服务本地生活诊断系统”。当前主线不再以单场 ROI 或泛广告计划为入口，而是先确认：

- `subjectType`
- `operatorType`
- `cooperationType`
- `controlLevel`
- `subjectConfidence`

主体不清时输出“主体待校准”，只允许保守动作。

## 当前主攻

V0.1 主攻：

- 本地生活服务商代播/代运营
- 商家号数据
- 服务商执行质量
- 服务费后真实 ROI
- 审批和人工执行留痕

其他主体保留框架：

- 商家官方自播
- 职人/店长直播
- 外部达人直播
- 达人矩阵/机构团长
- 平台活动/官方会场
- 品牌/区域矩阵

## 已完成迁移

- Schema 使用 `douyin_subject_diagnosis` 主库。
- Prisma 增加 `DecisionRun`、`ActionProposal`、`ApprovalRecord`、`ExecutionLog`、`StrategyRule`。
- Shared 增加决策引擎输入输出、动作建议、审批、执行相关类型。
- 新增 `packages/decision-engine`，承载规则引擎和审批护栏。
- API 接入 DecisionRun、ActionProposal、审批、观察、人工执行和 AuditLog 闭环。
- Web 接入 `/decision-center`、`/action-proposals/[id]` 和任务页决策运行。
- Extension 完成 MV3 安全边界校准，只采集不操作。

## 旧资产处理

- `ai_ad_diagnosis` 旧库只保留，不作为当前主线使用。
- 不回退到旧 `identityType` 方案。
- 不恢复旧泛化投流系统。
- 不新增自动投放执行能力。

## V0.1 冻结边界

允许：

- 采集当前用户有权限查看的数据。
- 本地快照保存。
- 手动上传快照到 API。
- 规则诊断。
- 生成动作建议。
- 人工审批、拒绝、观察。
- 记录用户手动完成的执行结果。

## 后续迁移建议

V0.2 可以继续做：

- 待校准队列。
- 活动库和活动核验。
- OCR/截图字段置信度。
- 服务商合同、排班、SOP、服务费证据结构化。
- 更细的服务商算法。
- Web E2E 自动化测试。

## V0.1.2 数据库变更

- `DataSnapshot` 新增任务作用域 `idempotencyKey` 唯一约束。
- `DecisionRun` 新增采集任务作用域 `idempotencyKey` 唯一约束。
- `ActionOutcome` 新增动作建议作用域 `idempotencyKey` 唯一约束。
- staging 当前使用 `prisma db push --skip-generate` 同步 schema；切换正式生产前应固化为可审阅的 Prisma migration。

## Legacy 表过渡

- `Recommendation` 已退出 API、Web 和 Prisma Client 主线，schema 中映射为 `LegacyRecommendation @@ignore`，旧数据暂不删除。
- `StrategyRule` 未投入使用，schema 中映射为 `LegacyStrategyRule @@ignore`。
- 正式生产 migration 应先备份和确认历史数据，再决定归档或删除这两张旧表。

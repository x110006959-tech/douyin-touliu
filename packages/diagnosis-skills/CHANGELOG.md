# Diagnosis Skills changelog

## managed-live-growth-skills-v2（2026-07-31）

- `diagnose_activity_and_compliance` 升级到 1.1.0；活动合规表格证据必须命中活动、权益、价格、履约、退款或库存等领域关键词，避免把普通商品成交表误当作合规证据并触发无效模型调用。

## managed-live-growth-v1（2026-07-31）

- 首次建立七个版本化诊断 Skill。
- 输入只接受复核后的结构化指标、表格投影、路线质量和工作区内案例摘要。
- 事实、假设、实验和候选动作必须引用证据目录 ID；不接收或保存页面正文、认证信息及模型隐藏推理。

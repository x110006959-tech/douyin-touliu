# V0.2.1 Migration Notes

## 新增结构

- `DataSnapshot.captureMetaJson`
- `MetricAliasOverride`
- `MetricDriftEvent`
- `ActionProposalGate`
- `ActionProposalQuota`
- `AiProviderCircuit`

旧 `rawNetworkJson` 字段暂时保留以兼容历史数据；V0.2.1 生产采集固定写入空数组。旧 ignored 表本次不删除，避免未审计的数据丢失。

## 全新数据库

```bash
corepack pnpm exec prisma migrate deploy
```

该路径会依次执行 `20260712190000_baseline_v021` 和 `20260712191000_v021_realtime_safety`。

## 已有 V0.2.0 数据库

先备份并确认 schema 与 V0.2.0 标签一致，然后仅执行一次：

```bash
corepack pnpm exec prisma migrate resolve --applied 20260712190000_baseline_v021
corepack pnpm exec prisma migrate deploy
corepack pnpm exec prisma migrate status
```

不要在已有库上重新执行 baseline SQL。增量 migration 会回填最近 30 分钟动作门禁和当前小时强建议配额，避免升级瞬间重复建议。

## 本地验证

- 全新 PostgreSQL：两段 migration 均成功应用。
- 模拟 V0.2.0 库：baseline 标记 applied 后，增量 migration 和 status 均通过。
- staging 尚未执行；操作前必须备份并记录 migration 输出。

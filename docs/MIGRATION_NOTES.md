# V0.2.1 Migration Notes

## V0.2.9 邮箱验证迁移

执行：

```bash
corepack pnpm exec prisma migrate deploy
corepack pnpm exec prisma migrate status
```

迁移 `20260717100000_v029_email_verification` 会：

- 新增 `PendingRegistration` 与 `EmailVerificationToken`，仅保存验证前注册信息和令牌哈希。
- 为 `User` 加入必填 `emailVerifiedAt`，既有用户以 migration 执行时的当前时间初始化，以保持现有账号可登录。
- 不创建任何虚构的验证邮件、验证令牌或会话；新注册只有在邮箱验证成功后才创建用户和默认工作区。

生产部署前必须完成数据库备份，并在 `.env` 配置 `SECURITY_SECRET` 及 TLS SMTP 配置。先在 staging 验证投递、过期、重发限流和重复点击拒绝，再开放新用户注册。隔离空库已顺序应用全部 10 个 migration 并通过 `prisma migrate status`。

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

## V0.2.2 账号档案迁移

执行：

```bash
corepack pnpm exec prisma migrate deploy
corepack pnpm exec prisma migrate status
```

迁移 `20260714170000_v022_account_profiles` 会：

- 新增 `AccountProfile` 和 `CollectionRouteSource`。
- 为每个旧项目创建独立的待补账号 ID 档案，并回填 `Project.accountProfileId`。
- 不按旧项目名称自动合并账号，防止同名账号串档。
- 为旧任务回填默认页面采集路线。
- 新增任务幂等键和快照账号匹配字段。

已有数据库必须先备份。本地预上线已在 V0.2.1 数据库上成功应用并保留原有项目与任务；腾讯云 staging 尚未执行。

## V0.2.3 Extension 配对迁移

执行：

```bash
corepack pnpm exec prisma migrate deploy
corepack pnpm exec prisma migrate status
```

迁移 `20260715120000_v023_extension_pairing` 会新增：

- `ExtensionPairingCode`：一次性配对码哈希、账号归属、创建人、过期和使用状态。
- `ExtensionCredential`：插件凭证哈希、账号归属、权限范围、有效期、撤销和最近使用时间。
- `ExtensionCredentialScope`：当前仅有 `COLLECT` 与 `READ_DIAGNOSIS`。

数据库不保存配对明文或插件凭证明文。账号删除时相关配对码和凭证通过外键级联删除。本地预上线已在 V0.2.2 数据库上成功应用；腾讯云 staging 执行前仍必须备份。

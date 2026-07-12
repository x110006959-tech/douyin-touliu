# Current Task

## 任务名称

V0.2.0 staging 实机部署与真实页面校准

## 已完成前置

- V0.1.2 安全加固代码已完成。
- 主体/复核/置信度强动作护栏已完成。
- 服务端二次脱敏、幂等事务和旧分析链路收口已完成。
- 测试数据库自动化、Web 测试和 Extension 安全回归已完成。
- 本地 typecheck、64 项测试、build、Prisma validate 和依赖审计通过。
- 本地 Docker 镜像、容器健康检查和容器内 HTTP 冒烟通过；Windows Docker Desktop 宿主端口发布异常待在 Ubuntu staging 复验。
- Extension `0.1.2` 最终 ZIP 安全校验通过。
- Web 已使用 HttpOnly Cookie，会话不再写入浏览器 Storage。
- 旧 Recommendation 双轨和未启用 BullMQ 主线代码已清理。
- 固定目标页面串行巡检、采集批次和路线心跳已完成。
- 完整性、新鲜度、连续失败降级和强动作阻断已完成。
- 建议过期、替代、冷却、频控和只读预演已完成。
- 业务健康接口、Web 健康中心和 AI 解释熔断已完成。
- Extension `0.2.0` 最终 ZIP 已生成，权限和人工执行边界保持不变。
- 已修复新巡检无快照时回退旧数据、连续失败质量口径不一致、建议并发去重/频控和过期审计缺口。
- 本地 typecheck、71 项测试、build、Prisma validate、Prisma generate 和浏览器验收通过。

## 当前目标

在腾讯云 Ubuntu 22.04 的 `/opt/pxxis` 部署 V0.2.0，应用数据库 schema，并使用真实巨量本地推页面校准固定路线、采集字段和数据新鲜度。

## 约束

- 暂不切换 `www.pxxis.cn` 正式流量。
- PostgreSQL 不开放公网端口。
- Web/API 宿主端口只绑定回环地址。
- `.env` 不提交 Git，不使用示例密码。
- 不新增任何自动投放执行能力。
- 不修改 Extension 权限和平台操作边界。

## 下一步动作

1. 在服务器创建 `/opt/pxxis`，准备 V0.2.0 代码和 staging `.env`。
2. 执行 Prisma schema 同步或正式 migration，再执行 Compose 配置校验、构建和启动。
3. 验证 `/ready`、认证后的 `/system-health`、Web 首页和一次完整人工决策闭环。
4. 加载 Extension `0.2.0`，由用户手动打开固定目标页面并启动巡检，校准路线 URL、字段别名、单位和时间窗口。
5. 验证缺页、过期、连续失败、预演无写入、建议过期/冷却和人工执行边界。
6. 配置 HTTPS 反向代理后，再评估域名解析与正式切换。

# Current Task

## 任务名称

腾讯云服务器 staging 实机部署

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

## 当前目标

在腾讯云 Ubuntu 22.04 的 `/opt/pxxis` 使用真实 staging 环境变量启动 Compose，并验证 Web/API/数据库、持久卷和反向代理链路。

## 约束

- 暂不切换 `www.pxxis.cn` 正式流量。
- PostgreSQL 不开放公网端口。
- Web/API 宿主端口只绑定回环地址。
- `.env` 不提交 Git，不使用示例密码。
- 不新增任何自动投放执行能力。
- 不修改 Extension 权限和平台操作边界。

## 下一步动作

1. 在服务器创建 `/opt/pxxis` 并准备代码。
2. 生成强密码与 JWT secret，填写 staging `.env`。
3. 执行 Compose 配置校验、构建和启动。
4. 验证 `/ready`、Web 首页、注册登录和一次完整人工决策闭环。
5. 配置 HTTPS 反向代理后，再评估域名解析与正式切换。

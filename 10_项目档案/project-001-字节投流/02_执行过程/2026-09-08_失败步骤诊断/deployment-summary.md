# 2026-09-08 14:23 本机部署摘要

- API/实际 Worker：`pxxis-api:diagnosis-validation-v26-20260908`，镜像 `sha256:93a26d7d43d198db4765a805ffb2eb7c272323035ea6327fa06681d01ed6125d`。
- Web：保持 `pxxis-web:diagnosis-scenario-candidate-v24-20260906`。
- 实际模块：Prompt v28 / Orchestration v37 / SkillSet v11。
- 部署前安全补强后，全仓 734 项测试、lint、typecheck、build、version、Schema、diff 通过；离线正常与综合失败各 24 例通过。
- 隔离候选 ready/version/login 均为 200，12 项本地/镜像制品哈希一致，候选资源清理完成。
- 切换前、排空后、切换后活动/诊断/建议均为 0/31/20；Schema、配置、网络和运行参数一致。
- 正式 API healthy，API/Worker/Web 运行且重启 0；`runtime:verify` 通过并删除 3 个旧应用容器、1 个旧镜像标签，只保留当前服务和最近回退镜像。
- 未调用真实模型、改写历史、迁移数据库、更新插件、提交 Git 或发布生产。部署后失败审计仍为 0，下一次真实证据需用户显式新建诊断。

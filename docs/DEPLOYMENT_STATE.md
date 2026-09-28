# 部署状态

> 本文件只保存当前运行态和回退入口。历史部署长文已归档。

## 当前运行态

- Web：`127.0.0.1:3300`，镜像 `pxxis-web:code-boundaries-v33-20260920`，镜像 ID `sha256:23e11cee3b170080abf6a378558fa1cc81497c938a99eb8308b113e7c4dee972`
- API：`127.0.0.1:4300`，镜像 `pxxis-api:code-boundaries-v33-20260920`，镜像 ID `sha256:c40cd5b14985a2cb713752c6f92ebe5ad6a7c64248abfaa860bf23f4613faade`
- Worker：与 API 共用 `pxxis-api:code-boundaries-v33-20260920`
- Schema：`20260731_v035_ai_skill_diagnosis`
- 最近一次切换：`2026-09-20` 项目文档与代码边界治理部署

## 部署边界

- 本轮治理任务已按用户明确要求完成本机容器切换；未执行生产部署、数据库迁移或业务数据写入。
- 清理运行资源时只保留当前容器及最近一版回退镜像，不删除业务数据库、数据卷、挂载目录、运行中容器或其他项目资源。

## 历史入口

- 最近回退镜像：`pxxis-api:local-rollback` / `pxxis-api:local-worker-rollback` 指向上一版 API v32，`pxxis-web:local-rollback` 指向上一版 Web v32。
- 部署脚本与构建记录：`../10_项目档案/project-001-字节投流/02_执行过程/2026-09-20_代码边界治理部署/`
- 历史部署记录：`./archive/DEPLOYMENT_STATE.legacy.md`
- 项目档案部署日志：`../10_项目档案/project-001-字节投流/02_执行过程/`

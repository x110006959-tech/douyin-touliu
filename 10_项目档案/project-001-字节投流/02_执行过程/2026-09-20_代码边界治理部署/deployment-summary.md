# 2026-09-20 代码边界治理部署

## 结果

- Web：`pxxis-web:code-boundaries-v33-20260920`
  - 镜像 ID：`sha256:23e11cee3b170080abf6a378558fa1cc81497c938a99eb8308b113e7c4dee972`
- API/Worker：`pxxis-api:code-boundaries-v33-20260920`
  - 镜像 ID：`sha256:c40cd5b14985a2cb713752c6f92ebe5ad6a7c64248abfaa860bf23f4613faade`
- 入口：Web `http://127.0.0.1:3300`，API `http://127.0.0.1:4300`

## 切换校验

- 切换前业务记录：活动诊断 `0`、诊断运行 `34`、动作建议 `22`、用户 `11`
- 切换后业务记录：活动诊断 `0`、诊断运行 `34`、动作建议 `22`、用户 `11`
- Schema SHA256 前后一致，未执行数据库迁移
- API/Worker/Web 三个运行容器 RestartCount 均为 `0`

## 构建方式

- 公网 `pnpm install` 构建因 npm registry 超时中止
- 改为复用上一版镜像依赖，覆盖当前源码：
  - `api-cached.Dockerfile`
  - `web-cached.Dockerfile`
- 切换脚本：
  - `deploy-v33.mjs`

## 复核结果

- `corepack pnpm runtime:verify` 通过
- HTTP `/ready`、`/version`、`/login`、`/register` 均返回 `200`
- Web `/register` 路由和构建布局校验通过
- API 与 Worker 诊断模块版本一致：
  - Prompt `managed-live-growth-prompt-v28`
  - Orchestration `server-determined-skill-plan-v37`
  - SkillSet `managed-live-growth-skills-v11`
- 离线诊断正常/失败事实 `24/24/24`
- 清理旧应用容器 `3` 个，保留当前镜像和最近回退镜像

# 代码所有权

> 由 `tools/build-code-index.mjs` 确定性生成。所有权表示业务域和负责层级，不替代具体人员的维护责任。

| 业务域 | 负责层级 | 文件数 | 入口示例 |
| --- | --- | --- | --- |
| 服务端 - 认证与积分 | 服务端 API/Worker | 13 | `apps/api/src/auth.ts` |
| 服务端 - 采集与证据 | 服务端 API/Worker | 35 | `apps/api/src/normalize.ts` |
| 服务端 - 复核校准 | 服务端 API/Worker | 10 | `apps/api/src/review-metrics.ts` |
| 服务端 - 决策编排 | 服务端 API/Worker | 84 | `apps/api/src/audit.ts` |
| 服务端 - AI Worker | 服务端 API/Worker | 26 | `apps/api/src/diagnosis-eval-cli.ts` |
| 服务端 - 项目历史 | 服务端 API/Worker | 9 | `apps/api/src/project-history.ts` |
| Web - 展示 | Web 前端 | 61 | `apps/web/src/proxy.ts` |
| Extension - 插件采集 | Chrome Extension | 55 | `apps/extension/src/popup.ts` |
| 工程 - 数据与基础设施 | 工程基础设施 | 33 | `prisma/schema.prisma` |

## 变更规则

1. 跨域修改必须说明为什么不能把功能放到已有业务域。
2. 新增公开契约必须同步更新 `API_REFERENCE.md` 或共享包索引。
3. 超大文件不得继续按功能追加，应先提取单一职责模块。

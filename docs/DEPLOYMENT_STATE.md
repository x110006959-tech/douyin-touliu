# Deployment State

## 当前部署状态

- 本地 Web/API 已跑通。
- Chrome 审核承接页已可访问。
- 当前尚未完成服务器 staging 部署。
- 当前尚未切换正式域名流量。

## 域名规划

- 域名：www.pxxis.cn
- API 域名规划：api.pxxis.cn
- 当前不建议未备案时把 www.pxxis.cn 指向广州服务器。

## 腾讯云服务器状态

- 腾讯云服务器：
- 系统：Ubuntu 22.04
- Docker 26.1.3
- Docker Compose v2.27.1
- 部署目录计划：`/opt/pxxis`

## 当前部署策略

- 下一步是服务器 IP staging 测试。
- 暂不切换 `www.pxxis.cn` 正式流量。
- 暂用服务器 IP 验证 Web/API 可访问性。
- PostgreSQL 不暴露公网，只允许容器内网访问。
- staging 通过后再处理备案、域名解析、HTTPS、反向代理和正式环境切换。

## 待完成

- 输出服务器 staging 部署方案。
- 准备 Docker Compose 运行所需部署文件。
- 在服务器 `/opt/pxxis` 目录完成部署验证。
- 记录 staging 环境验证结果。

## 2026-07-10 本地 Compose 验证

- 已新增 API/Web Dockerfile、数据库就绪探针和安全 Compose 配置。
- PostgreSQL 无宿主机端口映射；API/Web 默认仅绑定 `127.0.0.1`。
- Redis 当前未参与主链路，未在 staging Compose 中启动或暴露。
- `POSTGRES_PASSWORD`、`COMPOSE_DATABASE_URL`、`JWT_SECRET`、`WEB_ORIGIN`、`NEXT_PUBLIC_API_URL` 均需显式配置。
- 本地镜像构建通过，三个 Compose 服务均达到 healthy；容器内实测注册返回 201、Cookie 登录返回 200、Web 首页返回 HTTP 200。
- 生产 Cookie 已验证同时包含 `HttpOnly`、`Secure` 和 `SameSite=Lax`。
- 当前 Windows Docker Desktop 未将声明的 `127.0.0.1:4100/3100` 端口实际发布到宿主机；容器配置仍保留回环绑定。该问题未影响容器内应用验证，但必须在 Ubuntu staging 再验证宿主端口和反向代理链路。
- 本地验证结束后已删除容器、网络和测试卷。
- Windows 中文工作区需要兼容构建方式：`DOCKER_BUILDKIT=0`；Ubuntu `/opt/pxxis` 可使用默认 BuildKit。

## 服务器下一步

1. 在 `/opt/pxxis` 拉取代码并创建仅服务器可读的 `.env`。
2. 设置 URL 安全的数据库强密码、至少 32 字节随机 JWT secret、staging Web/API 地址。
3. 执行 `docker compose config --quiet` 和 `docker compose up -d --build --wait`。
4. 通过服务器本机回环地址验证 Web 和 API，再配置 Nginx/Caddy HTTPS 反向代理。
5. 域名备案、解析和证书完成前，不切换 `www.pxxis.cn` 正式流量。

## Web 会话部署要求

- 生产环境 Cookie 带 `Secure`，必须通过 HTTPS 访问 `api.pxxis.cn`。
- `WEB_ORIGIN` 必须精确包含 `https://www.pxxis.cn`，API CORS 开启 credentials 但不接受任意来源。
- 反向代理必须保留 `Set-Cookie`，并正确设置 `TRUST_PROXY_HOPS`。
- Extension 不依赖浏览器 Cookie，继续通过手动配置的 SaaS Bearer token 上传快照。

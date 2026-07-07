# Deployment State

## 当前部署状态

- 本地 Web/API 已跑通。
- Chrome 审核承接页已可访问。
- 当前尚未完成服务器 staging 部署。
- 当前尚未切换正式域名流量。

## 域名规划

- 域名：www.pxxis.com
- API 域名规划：api.pxxis.com
- 当前不建议未备案时把 www.pxxis.com 指向广州服务器。

## 腾讯云服务器状态

- 腾讯云服务器：
- 系统：Ubuntu 22.04
- Docker 26.1.3
- Docker Compose v2.27.1
- 部署目录计划：`/opt/pxxis`

## 当前部署策略

- 下一步是服务器 IP staging 测试。
- 暂不绑定正式域名。
- 暂用服务器 IP 验证 Web/API 可访问性。
- PostgreSQL 不暴露公网，只允许容器内网访问。
- staging 通过后再处理备案、域名解析、HTTPS、反向代理和正式环境切换。

## 待完成

- 输出服务器 staging 部署方案。
- 准备 Docker Compose 运行所需部署文件。
- 在服务器 `/opt/pxxis` 目录完成部署验证。
- 记录 staging 环境验证结果。

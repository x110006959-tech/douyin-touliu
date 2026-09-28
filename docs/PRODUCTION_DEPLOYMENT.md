# 腾讯云生产上线步骤

本文档面向第一次上线的小白用户，按顺序操作即可。当前代码已经为正式域名 `www.pxxis.cn` 和 `api.pxxis.cn` 预留了生产配置，不需要修改业务代码。

## 一、上线前准备

1. 在腾讯云 Lighthouse 控制台找到这台实例的**公网 IP**。
2. 进入实例的**防火墙/安全组**，确认入站规则放行：
   - `22`：SSH，管理服务器
   - `80`：Caddy 自动申请 HTTPS 和 HTTP 跳转
   - `443`：HTTPS
3. 进入 `pxxis.cn` 的 DNS 解析，添加两条 A 记录：
   - 主机记录 `www`，记录值填服务器公网 IP
   - 主机记录 `api`，记录值填服务器公网 IP
4. 确认 `pxxis.cn` 已完成 ICP 备案，否则腾讯云可能拦截大陆服务器的 80/443 访问。

## 二、连接服务器

打开腾讯云 OrcaTerm 终端，确认系统版本：

```bash
cat /etc/os-release
uname -m
```

下面的命令按 Ubuntu/Debian 编写。如果你的系统是 OpenCloudOS 或 CentOS，请把包管理器换成 `dnf` 或 `yum`，Docker 安装源也需要按对应系统选择。

## 三、安装 Docker 和 Compose 插件

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

退出并重新登录终端，让用户组生效，然后验证：

```bash
docker --version
docker compose version
```

如果 Docker Hub 拉取镜像很慢，可以在 `/etc/docker/daemon.json` 配置腾讯云可用的镜像加速地址，再执行 `sudo systemctl restart docker`。

## 四、同步并放置代码

先把本机新增的生产部署文件同步到 GitHub。当前需要以下文件都在服务器上：

```text
docker-compose.yml
docker-compose.prod.yml
deploy/Caddyfile
deploy/env.production.example
```

在服务器上拉取代码：

```bash
sudo mkdir -p /opt/pxxis
sudo chown "$USER":"$USER" /opt/pxxis
cd /opt/pxxis
git clone https://github.com/x110006959-tech/douyin-touliu.git .
```

如果还没有同步 `docker-compose.prod.yml` 和 `deploy/`，不要启动；先让代码同步完成，再继续。

## 五、填写生产环境变量

```bash
cd /opt/pxxis
cp deploy/env.production.example .env
```

生成两个随机值：

```bash
openssl rand -hex 24
openssl rand -base64 48
```

编辑 `.env`，至少替换以下内容：

- `POSTGRES_PASSWORD`：第一个随机值，同时改 `COMPOSE_DATABASE_URL` 中的密码。
- `SECURITY_SECRET`：第二个随机值，至少 32 个字符。
- `CADDY_ACME_EMAIL`：你的真实邮箱，用于 HTTPS 证书通知。
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`：一个真实可用的 TLS SMTP 邮箱。

正式环境必须保持：

```dotenv
WEB_ORIGIN="https://www.pxxis.cn"
NEXT_PUBLIC_API_URL="https://api.pxxis.cn"
SESSION_COOKIE_SECURE="true"
TRUST_PROXY_HOPS="1"
```

确认没有把本地 `127.0.0.1` 或 `localhost` 写进生产 `.env`。

## 六、校验配置

```bash
cd /opt/pxxis
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  config --quiet
```

没有输出就是通过。再检查 Caddy 配置：

```bash
docker run --rm \
  -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -e CADDY_ACME_EMAIL="$CADDY_ACME_EMAIL" \
  -e WEB_DOMAIN="$WEB_DOMAIN" \
  -e API_DOMAIN="$API_DOMAIN" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

最后应看到 `Valid configuration`。

## 七、启动整套服务

首次启动会构建 Web/API 镜像，时间取决于服务器配置和网络：

```bash
cd /opt/pxxis
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d --build
```

观察启动状态：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  ps
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  logs -f api web caddy
```

预期状态：

- `postgres`：healthy
- `migrate`：exited (0)
- `api`：healthy
- `diagnosis-worker` / `retention`：running
- `web`：healthy
- `caddy`：running

## 八、验证线上地址

在本机浏览器分别打开：

```text
https://www.pxxis.cn/
https://www.pxxis.cn/login
https://api.pxxis.cn/ready
https://api.pxxis.cn/version
```

预期：

- `www.pxxis.cn` 页面正常显示，证书有效。
- `/login` 返回 200。
- `/ready` 返回 200。
- `/version` 返回当前 Schema 版本 `20260731_v035_ai_skill_diagnosis`。

同时确认 PostgreSQL 没有直接暴露到公网。可以通过 `docker ps` 查看端口映射，正常应只有 `caddy` 映射 `80/443`，`api` 和 `web` 只监听 `127.0.0.1`。

## 九、上线后的安全开关

上线先不要打开 AI 和平台内部 API 开关：

```dotenv
AI_DIAGNOSIS_ENABLED="false"
LIVE_SCREEN_INTERNAL_API_ENABLED="false"
LOCAL_PROMOTION_INTERNAL_API_ENABLED="false"
```

等真实 AI 质量验收和 Chrome 插件页面验收通过后，再由用户显式决定是否开启。

## 十、回退

如果刚启动后发现异常：

```bash
cd /opt/pxxis
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  down
```

数据保存在 Docker 卷 `pxxis_postgres-data` 中，普通 `down` 不会删除数据库。不要使用 `docker compose down -v`，除非你明确要清空数据库。

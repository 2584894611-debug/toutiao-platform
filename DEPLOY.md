# xhpj.cloud 国内服务器部署

## 当前状态

`https://xhpj.cloud` 已经有线上服务响应，但需要发布当前源码后才会包含本仓库最新修复。

自动发布依赖 Chromium，部署后必须检查：

```bash
curl -sS https://xhpj.cloud/api/health/ping
curl -sS https://xhpj.cloud/api/health/chromium
```

`/api/health/chromium` 必须返回 `"ok":true`，否则无法自动打开头条号后台发文。

## Docker 部署

服务器要求：

- Linux x86_64
- Docker / Docker Compose
- Nginx
- 域名 `xhpj.cloud` A 记录指向服务器公网 IP

部署：

```bash
git clone <repo-url> /opt/toutiao-platform
cd /opt/toutiao-platform
docker compose up -d --build
curl -sS http://127.0.0.1:5000/api/health/ping
curl -sS http://127.0.0.1:5000/api/health/chromium
```

Nginx：

```bash
sudo cp deploy/nginx/xhpj.cloud.conf /etc/nginx/conf.d/xhpj.cloud.conf
sudo nginx -t
sudo systemctl reload nginx
```

证书可用 certbot：

```bash
sudo certbot --nginx -d xhpj.cloud -d www.xhpj.cloud
```

# Visual 2FA

一个安全优先、可自托管的网页版 2FA 验证器保险库。支持 Docker/VPS 上的 SQLite，也支持 Vercel/Serverless 上的 PostgreSQL。

> Visual 2FA 适合管理**个人** TOTP/HOTP 验证器。首次创建所有者后，注册入口会永久关闭。

## 功能

- 🔐 **单用户认证**：scrypt 密码哈希、数据库会话、HttpOnly / SameSite Cookie、登录限速
- 🧰 **浏览器端加密保险库**：每条验证器资料都以 AES-256-GCM 密文持久化
- 📷 **多种导入方式**：摄像头、二维码图片、`otpauth://`、Base32 密钥及 Google Authenticator 批量迁移二维码
- ⏱️ **完整 OTP 支持**：TOTP / HOTP、SHA-1 / SHA-256 / SHA-512、6–8 位、自定义周期与计数器
- 🗂️ **完整整理能力**：分组/标签、批量移动与加标签、分组重命名/合并、拖拽排序、收藏、搜索和筛选
- 🗑️ **回收站**：软删除、撤销、恢复、重新验证后永久删除
- 📦 **加密备份**：独立备份密码、`.v2fa` 导入导出、重复项处理
- 🔑 **便携密钥导出**：重新验证后导出所选项目的 Base32 密钥及 `otpauth` URI（明文高风险操作）
- 📳 **移动端反馈**：复制成功时在支持的手机上提供轻微震动
- 🛡️ **敏感操作保护**：显示密钥、迁移二维码、清空回收站、注销其他设备前重新验证
- 📱 **响应式界面**：桌面高密度仪表盘、移动底部导航、PWA manifest
- 🗄️ **双数据库**：SQLite 持久卷 / PostgreSQL 连接 URL 自动识别

## 安全架构

1. 浏览器生成随机的 256-bit 保险库数据密钥。
2. 主密码通过 PBKDF2-SHA-256（600,000 次）派生包装密钥。
3. 包装密钥使用 AES-256-GCM 加密保险库数据密钥。
4. issuer、账户名、OTP secret、备注、分组和标签作为一个整体在浏览器内加密。
5. 服务端只持久化密文、IV、被包装的数据密钥和必要的记录元数据。
6. OTP 在已解锁的浏览器中生成，正常使用时服务端不会收到明文 OTP secret。

认证密码会通过 HTTPS 发送给服务端并用 scrypt 校验。因此这是一套**客户端加密、抵御数据库单独泄露**的设计，不应被理解为能抵御恶意服务器的严格“零知识”系统。控制服务器或前端 JavaScript 的攻击者、恶意浏览器扩展和已感染设备仍可能窃取解锁后的资料。完整边界见 [SECURITY.md](SECURITY.md)。

## 快速开始

要求：Node.js `>= 20.19`。

```bash
git clone git@github.com:sdxdlgz/visual-2fa.git
cd visual-2fa
cp .env.example .env.local
npm ci
npm run dev
```

打开 <http://localhost:3000>，创建第一个所有者账户。创建完成后不再提供注册。

首次进入后建议立即在 **设置 → 备份与恢复** 中生成一份加密备份，并实际验证能够导入。

## Docker / VPS（SQLite）

```bash
cp .env.example .env
# 正式域名必须改为准确的 HTTPS origin：
# APP_ORIGIN=https://2fa.example.com

docker compose up -d --build
```

默认监听 `3000`，SQLite 数据保存在 Docker volume `visual-2fa-data`。修改端口：

```bash
VISUAL_2FA_PORT=8080 docker compose up -d
```

### 正式部署要求

- 必须放在 Caddy、Nginx、Traefik 或 Cloudflare Tunnel 等 HTTPS 反向代理后。
- 代理应传递准确的 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto`。
- `APP_ORIGIN` 必须与浏览器中的公开 origin **完全一致**，例如 `https://2fa.example.com`，不要带路径或结尾 `/`。
- 不要直接把未加密的 HTTP 服务暴露到公网。
- 定期备份 Docker volume，同时保留应用内导出的 `.v2fa` 离线备份。

示例 Caddyfile：

```caddyfile
2fa.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

## Vercel / Serverless（PostgreSQL）

SQLite 文件系统不适用于 Vercel。请创建 Neon、Supabase、Vercel Postgres 或其他兼容 PostgreSQL 数据库，并配置：

```dotenv
DATABASE_URL=postgresql://user:password@host:5432/visual2fa?sslmode=require
APP_ORIGIN=https://your-project.vercel.app
SESSION_DAYS=7
```

然后把本仓库导入 Vercel。首次请求会自动创建表；数据库账户必须在初始化时拥有 `CREATE TABLE` 和 `CREATE INDEX` 权限。建议使用服务商提供的 **pooled connection URL**。

自定义域名启用后，记得把 `APP_ORIGIN` 更新为最终 HTTPS 域名并重新部署。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `file:./data/visual-2fa.db` | `file:` 使用 SQLite；`postgres://` / `postgresql://` 使用 PostgreSQL |
| `APP_ORIGIN` | 从请求推断 | 正式环境推荐显式配置；用于严格同源写请求校验 |
| `SESSION_DAYS` | `7` | 会话有效天数，范围 1–30 |
| `DATABASE_POOL_SIZE` | `5` | PostgreSQL 每个实例的最大连接数 |

## 使用说明

### 导入验证器

点击 **添加验证器**，选择：

1. 上传/拖入/粘贴二维码图片；
2. 使用摄像头扫描（浏览器要求 HTTPS 或 localhost）；
3. 粘贴标准 `otpauth://totp/...` 或 `otpauth://hotp/...`；
4. 手工输入 Base32 密钥和高级 OTP 参数。

二维码图片只在浏览器内解析，不会上传原图。Google Authenticator 的 `otpauth-migration://` 批量迁移支持单张和多张连续批次；应用会显示扫描进度，收齐全部二维码后再批量加密导入。

### 备份与恢复

- 导出时使用独立且足够长的备份密码。
- `.v2fa` 文件仍包含高价值密文，应离线保存。
- 遗忘主密码后无法从数据库恢复内容；可以创建新保险库，再用备份文件和备份密码导入。
- 导入支持“跳过重复项”或“覆盖同 ID 项”。重复密钥不会被无提示复制。

### 明文密钥导出

进入“批量管理”，选择项目后点击“导出密钥”。该操作必须重新输入主密码，生成的 JSON 包含 Base32 secret 和 `otpauth` URI，**文件本身不加密**。只用于迁移到其他受信任验证器，并应在完成后安全删除。

### 剪贴板

应用可以在设定时间后尝试清除刚复制的验证码，但浏览器和操作系统可能拒绝后台读取/覆盖剪贴板。这一功能是尽力而为，不应视为安全保证。

## 开发与验证

```bash
npm run lint
npm run typecheck
npm test
npm run build
# 或一次执行全部检查
npm run check
```

测试覆盖 RFC 4226/6238、Google migration protobuf、明文密钥序列化、客户端密钥包装/解包、AEAD 加解密、密码哈希与认证原语。

## 项目结构

```text
app/                    Next.js 页面、API routes、CSP middleware
components/             认证、仪表盘、导入、详情、设置 UI
lib/client/             浏览器加密、OTP、备份与 API client
lib/server/             数据库适配、认证、会话、HTTP 安全
lib/shared/             双端类型与输入 schema
Dockerfile              非 root 的生产镜像
docker-compose.yml      SQLite 持久卷部署
```

## 隐私说明

项目不包含统计、广告、远程字体、Logo 查询服务或第三方脚本。服务图标使用本地生成的字母铭牌。请不要在 issue、日志或截图中公开真实密钥、二维码、验证码、会话 Cookie 或备份。

## License

[MIT](LICENSE)

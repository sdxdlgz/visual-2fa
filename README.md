# Visual 2FA

[![Publish container image](https://github.com/sdxdlgz/visual-2fa/actions/workflows/publish-container.yml/badge.svg)](https://github.com/sdxdlgz/visual-2fa/actions/workflows/publish-container.yml)

安全优先、可自托管的网页版 2FA 验证器保险库。

Visual 2FA 面向个人使用：首次创建所有者后即关闭注册；验证码密钥、服务名称、账户、备注、分组和标签均在浏览器中加密后再持久化。

- Docker / VPS：SQLite 持久卷
- Vercel / Serverless：PostgreSQL
- 桌面与移动端响应式界面
- 无统计、广告、远程字体或第三方脚本

> [!IMPORTANT]
> 忘记主密码后无法从数据库恢复保险库。完成首次设置后，请立即导出并验证一份加密备份。

## 快速开始

### 方式一：Docker（推荐）

```bash
git clone https://github.com/sdxdlgz/visual-2fa.git
cd visual-2fa
cp .env.example .env
docker compose pull
docker compose up -d
```

打开 <http://localhost:28473>，创建第一个所有者账户。

Compose 默认拉取 `ghcr.io/sdxdlgz/visual-2fa:latest`。VPS 对外使用 `28473`，容器内部仍监听 `3000`。

如果系统仍使用 Compose v1，把 `docker compose` 改为 `docker-compose`。

已配置 GitHub SSH Key 时，也可以使用 `git@github.com:sdxdlgz/visual-2fa.git`。

### 方式二：本地开发

要求 Node.js `>= 24`。Docker 用户无需单独安装 Node.js。

```bash
git clone https://github.com/sdxdlgz/visual-2fa.git
cd visual-2fa
cp .env.example .env.local
npm ci
npm run dev
```

打开 <http://localhost:3000>。

### 首次使用检查清单（务必完成）

1. 创建唯一的所有者账户和足够长的主密码。
2. 使用二维码、迁移二维码、`otpauth://` 或 Base32 密钥导入验证器。
3. 在 **设置 → 备份与恢复** 中导出 `.v2fa` 加密备份。
4. 重新导入一次备份，确认文件和备份密码可用。
5. 正式部署时启用 HTTPS，并正确配置 `APP_ORIGIN`。

## 功能一览

| 能力 | 支持内容 |
|---|---|
| 验证器 | TOTP、HOTP、SHA-1 / SHA-256 / SHA-512、6–8 位、自定义周期与计数器 |
| 导入 | 摄像头、二维码图片、粘贴图片、`otpauth://`、Base32 密钥 |
| Google 迁移 | `otpauth-migration://` 单张多账户及多张连续批次，带扫描进度和重复检测 |
| 整理 | 分组、多个标签、备注、收藏、搜索、筛选、最近使用 |
| 批量操作 | 批量移动分组、添加标签、分组重命名与合并 |
| 排序 | 收藏/名称/最近使用/最近添加排序，以及可持久化的拖拽手动排序 |
| 删除 | 回收站、撤销、恢复、重新验证后永久删除 |
| 备份 | 独立密码保护的 `.v2fa` 加密备份、合并恢复、冲突处理 |
| 迁出 | 重新验证后导出所选项目的 Base32 secret 与 `otpauth` URI |
| 会话 | 自动锁定、后台锁定、活动会话、注销其他设备、修改主密码 |
| 移动端 | 底部导航、全屏扫描/详情、复制成功轻微震动 |

## 日常使用

### 添加验证器

点击 **添加验证器**，可以：

1. 上传、拖入或粘贴二维码图片；
2. 使用摄像头扫描；
3. 粘贴标准 `otpauth://totp/...` 或 `otpauth://hotp/...`；
4. 手工输入 Base32 密钥和高级 OTP 参数。

二维码原图不会上传到服务器，只在当前浏览器中解析。摄像头功能需要 HTTPS 或 localhost。

### 从 Google Authenticator 批量迁移

在 Google Authenticator 中选择 **转移账号 → 导出账号**，然后在 Visual 2FA 的二维码导入界面扫描或上传迁移二维码。

- 一张二维码可以包含多个账户；
- 账户较多时 Google 会生成连续多张二维码；
- Visual 2FA 会显示 `已扫描 n / m`，收齐全部批次后再导入；
- 重复密钥、损坏项目和不支持的算法不会被静默导入。

### 批量整理与拖拽排序

在验证码页点击 **批量管理**：

- 选择当前结果或逐项选择；
- 批量移动到目标分组；
- 把新标签合并到现有标签；
- 导出所选项目的明文密钥。

点击 **管理分组** 可重命名分组；如果目标名称已经存在，则把两个分组合并。

退出批量模式后，可以拖动每行左侧的手柄调整顺序。首次拖拽会自动切换为“手动顺序”，并持久化到数据库。

### TOTP 与 HOTP 的区别

- **TOTP** 按时间刷新，绝大多数网站使用这种方式；
- **HOTP** 按计数器生成，每次使用后客户端和服务端计数器都要同步递增。

Visual 2FA 对 HOTP 保留独立的“复制”和“生成下一组”操作，避免无意递增造成计数器不同步。

## 备份、恢复与密钥导出

| 功能 | 是否加密 | 适用场景 |
|---|---:|---|
| `.v2fa` 备份 | 是 | 日常备份、灾难恢复、迁移到另一个 Visual 2FA |
| 明文密钥 JSON | 否 | 临时迁移到其他受信任验证器 |
| 单项迁移二维码 | 否 | 把一个验证器导入其他设备或应用 |

### 加密备份

- 使用独立且足够长的备份密码；
- 可选择是否包含回收站；
- 导入支持跳过重复项或覆盖同 ID 项；
- `.v2fa` 虽然已加密，仍应作为高价值文件离线保存。

### 明文密钥导出

进入 **批量管理 → 导出密钥**，重新输入主密码后会下载 JSON 文件，其中包含 Base32 secret 和 `otpauth` URI。

> [!WARNING]
> 明文密钥文件本身不加密。任何获得该文件的人都可以生成你的验证码。仅用于迁移，并在完成后安全删除。

## 部署选择

| 场景 | 数据库 | 推荐方式 |
|---|---|---|
| 个人服务器、NAS、VPS | SQLite | Docker Compose + 持久卷 |
| Vercel / Serverless | PostgreSQL | Neon、Supabase、Vercel Postgres 等 pooled URL |
| 本地开发 | SQLite | `npm run dev` |

### Docker 镜像与自动发布

镜像地址：

```text
ghcr.io/sdxdlgz/visual-2fa:latest
```

`.github/workflows/publish-container.yml` 会在以下情况自动测试、构建并上传 Linux AMD64/ARM64 镜像：

- 推送非纯文档改动到 `main`：发布 `latest` 和 `sha-<commit>`；
- 推送 `v*.*.*` 标签：额外发布版本标签；
- 在 GitHub Actions 页面手工运行 `workflow_dispatch`。

VPS 可以直接执行：

```bash
docker pull ghcr.io/sdxdlgz/visual-2fa:latest
```

当前镜像已公开，无需 `docker login`。如果你在 fork 或私有仓库中部署同一工作流，需要先把对应 GHCR package 设为 Public，或使用至少带 `read:packages` 权限的 token 登录：

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

### Docker / VPS

默认配置：

- VPS 对外端口：`28473`
- 容器内部端口：`3000`
- 数据库：`file:./data/visual-2fa.db`
- Docker volume：`visual-2fa-data`

修改公开端口：

```bash
VISUAL_2FA_PORT=8080 docker compose up -d
```

如果需要从当前源码本地构建，而不是拉取 GHCR 镜像：

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

正式环境必须：

1. 放在 Caddy、Nginx、Traefik 或 Cloudflare Tunnel 等 HTTPS 反向代理后；
2. 传递正确的 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto`；
3. 把 `APP_ORIGIN` 设置为浏览器实际访问的 origin，例如 `https://2fa.example.com`；
4. 至少保留并验证 `.v2fa` 离线备份；建议再配置 Docker volume 快照作为第二层恢复手段。

Caddy 示例：

```caddyfile
2fa.example.com {
  reverse_proxy 127.0.0.1:28473
}
```

### Vercel / Serverless

Vercel 的文件系统不适合持久化 SQLite，请使用 PostgreSQL：

```dotenv
DATABASE_URL=postgresql://user:password@host:5432/visual2fa?sslmode=require
APP_ORIGIN=https://your-project.vercel.app
SESSION_DAYS=7
```

首次请求会自动创建表。数据库账户在初始化时需要 `CREATE TABLE` 和 `CREATE INDEX` 权限。请优先使用数据库服务商提供的 pooled connection URL。

绑定自定义域名后，需要同步更新 `APP_ORIGIN` 并重新部署。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `file:./data/visual-2fa.db` | `file:` 使用 SQLite；`postgres://` / `postgresql://` 使用 PostgreSQL |
| `APP_ORIGIN` | 从请求推断 | 正式环境建议显式配置；必须是不带路径和结尾 `/` 的完整 origin |
| `SESSION_DAYS` | `7` | 会话有效天数，范围 1–30 |
| `DATABASE_POOL_SIZE` | `5` | 每个应用实例的 PostgreSQL 最大连接数 |
| `VISUAL_2FA_PORT` | `28473` | Docker Compose 对外端口；容器内部仍为 3000 |
| `VISUAL_2FA_TAG` | `latest` | GHCR 镜像标签，可固定为版本或 `sha-*` |

## 安全模型

```text
主密码 ──HTTPS──> 服务端 scrypt 校验
   │
   └─浏览器 PBKDF2──> 包装密钥 ──AES-GCM 解包──> 随机保险库密钥
                                                    │
OTP secret、账户、备注、分组、标签 ──AES-GCM────────┘
                                                    │
                                                    └──> vault_items：密文 + 最小记录元数据
服务端认证与会话 ───────────────────────────────────────────> users / sessions 等表
```

- 浏览器生成随机 256-bit 保险库密钥；
- 主密码经 PBKDF2-SHA-256（600,000 次）派生包装密钥；
- 每条验证器资料使用 AES-256-GCM 加密；
- `vault_items` 的敏感内容位于密文中，但数据库仍会保存 ID、时间戳、删除状态、排序等最小元数据；
- OTP 在解锁后的浏览器中生成，正常使用时服务端不会收到明文 OTP secret；
- 登录密码通过 HTTPS 发送给服务端，并使用 scrypt 验证；
- 会话使用随机 token，数据库只保存 token 的 SHA-256 指纹；
- 写请求执行同源检查，页面脚本使用逐请求 CSP nonce。

这是一套**客户端加密、抵御数据库单独泄露**的设计，不是能抵御恶意服务器的严格零知识系统。它不能防御：

- 被控制的浏览器、设备或恶意扩展；
- XSS 或被替换的前端 JavaScript；
- 弱主密码或已泄露主密码；
- 未启用 HTTPS 时的流量劫持；
- 同时遗失主密码和所有加密备份。

完整边界及漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## 更新与数据维护

### 更新 Docker 部署

更新前先下载一份最新 `.v2fa` 备份，然后执行：

```bash
git pull
docker compose pull
docker compose up -d
```

更新后：

1. 检查部署地址的 `/api/health`；
2. 实际解锁保险库；
3. 验证至少一个验证码；
4. 再生成一份新的 `.v2fa` 备份。

### 备份 SQLite / Docker volume

`.v2fa` 是首选的可移植恢复方式。若还要制作原始 volume 快照，应先暂停应用写入：

```bash
docker compose stop visual-2fa
docker volume ls | grep visual-2fa
```

确认实际 volume 名称后，可使用 Docker/NAS 的 volume 快照工具。下面是一个需要替换 `<volume-name>` 的示例：

```bash
docker run --rm \
  -v <volume-name>:/data:ro \
  -v "$PWD":/backup \
  alpine sh -c 'tar czf /backup/visual-2fa-volume.tgz -C /data .'
docker compose start visual-2fa
```

不要在服务持续写入时只复制主 `.db` 文件。SQLite 的 `-wal` 和 `-shm` 文件也是数据库状态的一部分。

### 备份 PostgreSQL / Vercel

除 `.v2fa` 外，建议使用数据库服务商的自动备份，或定期执行：

```bash
pg_dump --format=custom "$DATABASE_URL" > visual-2fa-postgres.dump
```

恢复数据库快照时应使用新的空数据库并通过 `pg_restore` 恢复，先验证应用和条目数量，再切换生产连接。不要直接覆盖仍在提供服务的数据库。

Vercel 更新通常由推送 `main` 后自动部署，也可以在 Vercel Dashboard 中手动 Redeploy。部署前确认 PostgreSQL 备份可用；绑定或更换域名后同步更新 `APP_ORIGIN`。

## 开发与验证

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm test           # Vitest
npm run build      # Production build
npm run check      # 依次执行以上全部检查
```

当前测试覆盖：

- RFC 4226 / RFC 6238 验证向量；
- Google Authenticator migration protobuf；
- 明文密钥导出格式；
- 客户端密钥包装、解包和 AEAD；
- 服务端密码哈希及认证原语。

面向编码 Agent 的架构、约束和修改流程见 [AGENTS.md](AGENTS.md)。

## 项目结构

```text
app/                       Next.js 页面、API routes
components/                认证、仪表盘、导入、详情和设置 UI
lib/client/                浏览器加密、OTP、迁移、备份、密钥导出
lib/server/                数据库适配、认证、会话、HTTP 安全
lib/shared/                双端类型和输入 schema
middleware.ts              CSP nonce
Dockerfile                 非 root 生产镜像
docker-compose.yml         GHCR 镜像拉取与 SQLite 持久卷部署
docker-compose.build.yml   从当前源码本地构建的 Compose override
.github/workflows/         GHCR 多架构镜像自动发布
SECURITY.md                 安全边界与漏洞报告
AGENTS.md                   Agent 开发指南
```

## 常见问题

### 忘记主密码怎么办？

先不要删除旧数据库或 volume。恢复流程是：准备一个**新的空存储**，创建新所有者，再使用 `.v2fa` 文件和备份密码导入。

Docker 可以保留旧 volume 并启动一个新项目 volume：

```bash
docker compose down                # 不要添加 -v
docker compose -p visual-2fa-recovery pull
docker compose -p visual-2fa-recovery up -d
```

确认新保险库和备份恢复正常后，再决定是否删除旧 volume。PostgreSQL / Vercel 应创建新的空数据库，临时把 `DATABASE_URL` 指向新库并重新部署；不要直接清空唯一的生产数据库。

### 为什么不能直接在 Vercel 使用 SQLite？

Serverless 文件系统不是可靠持久存储。Vercel 部署必须使用外部 PostgreSQL。

### 为什么复制后不一定能清空系统剪贴板？

浏览器和操作系统可能禁止后台读取或覆盖剪贴板，因此自动清除只能“尽力而为”。

### 明文密钥导出和加密备份有什么区别？

`.v2fa` 需要备份密码才能解密；明文密钥 JSON 可被任何读取文件的人直接使用。优先使用 `.v2fa`，只有迁移到其他应用时才导出明文密钥。

### 为什么容器内部仍然是 3000？

`28473:3000` 表示 VPS 暴露 `28473`，容器内部继续使用 Next.js 的标准 `3000`。公网用户接触不到内部端口，保留内部端口可以让镜像、健康检查和不同部署平台保持兼容。

## 隐私

Visual 2FA 不包含统计、广告、远程字体、Logo 查询服务或第三方脚本。不要在 issue、日志或截图中公开真实密钥、二维码、验证码、会话 Cookie 或备份文件。

## License

[MIT](LICENSE)

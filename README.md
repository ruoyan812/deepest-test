# Deepest

一个**浏览器端的 2D 横版生存闯关游戏**，带玩家账号系统。玩家在不断向右奔跑的平台世界中躲避毒气、打败 BOSS 与怪物、收集材料并合成武器。账号数据使用 [Turso](https://turso.tech/)（libSQL）数据库存储，无后端时自动回退到浏览器本地账号。

> 作者：Yanverse / 刃XT · 许可证：MIT（© 2026 Roooooyan）

---

## 目录结构

```
deepest-test/
├── Deepest/                 # 主前端（静态游戏，由 server.js 对外提供）
│   ├── index.html           # 起始页 + 登录/注册弹窗
│   ├── main.js              # 全部游戏逻辑（Canvas 渲染、物理、关卡、账号、合成等）
│   ├── favicon.png
│   └── assets/              # 背景贴图：cave.png、posioned gas.png、ruins.png
├── New/Deepest/             # 平行/改版前端（深色登录卡片，去掉版权行），与主前端并存
│   ├── index.html
│   ├── main.js
│   └── assets/
├── functions/               # Cloudflare Pages Functions（部署用后端，ES Module）
│   ├── _lib.js              # Turso HTTP /v2/pipeline 共享封装与工具函数
│   └── api/
│       ├── health.js        # 后端探测 /api/health
│       ├── user/[name].js    # 返回某用户的 salt / iterations
│       ├── register.js       # 注册 /api/register
│       ├── login.js          # 登录校验（恒定时间比较）/api/login
│       ├── progress.js       # 云端进度（背包/武器/已到达关卡）读写
│       └── admin.js          # 管理员操作（列用户/删除/重置密码/设管理员）
├── server.js                # 本地 Node/Express 后端（同一套 API），并托管静态前端
├── package.json             # 本地后端依赖与启动脚本
├── package-lock.json
└── LICENSE                  # MIT
```

> 说明：旧版 README 提到的 `wrangler.toml` 当前仓库中并不存在；Cloudflare Pages 的 Functions 目录（`functions/`）会被平台自动识别，部署时按需自行添加 `wrangler.toml`。

---

## 游戏内容

- **核心玩法**：横版平台跳跃 + 向右滚动生存。操作：`← / A` 左移，`→ / D` 右移，`↑ / W / Space` 跳跃。
- **关卡 / 场景**：
  - `chase`：毒气墙从左侧持续追赶玩家（速度可调），是开局关卡。
  - `cave` / `level2`：洞穴场景（带视差背景）。
  - `level3`：蝙蝠巢穴，出现变异蝙蝠（追踪玩家、接触掉血）。
- **洞穴 BOSS**：会周期性向玩家冲撞、冲撞后直冲升空，5 点血量，是关卡中的强敌。
- **材料与合成**：击杀怪物掉落
  - `small-bat-fang`（小型蝙蝠尖牙）、`bat-fang`（巨型蝙蝠尖牙）
  - 可合成武器：`蝙蝠尖牙匕首`、`巨型蝙蝠尖牙`、`强化蝠牙长枪`。
- **进度系统**：背包、武器槽、背包是否解锁、已到达关卡等会随账号保存。

---

## 账号系统（安全设计）

- 注册/登录时，密码在**浏览器本地**用 **PBKDF2(SHA-256, 默认 10 万次迭代)** 生成哈希，**明文密码永远不会离开浏览器**。
- 后端只保存 `salt` + `hash` + `iterations`，登录时用**恒定时间比较**避免计时攻击。
- 启动流程：前端先探测 `/api/health`
  - **有后端**（本地 `server.js` 或 Cloudflare Pages Functions）→ 账号存到 **Turso**，进度可在任意设备同步。
  - **无后端**（例如直接以 `file://` 打开，或没有 Functions 的纯静态托管）→ 自动回退到 **`localStorage`** 本地账号，游戏仍然可玩。
- **管理员**：账号可标记 `is_admin`；`/api/admin` 支持列出用户、删除账号、重置密码、设置/取消管理员，所有写操作都需先校验调用者的密码哈希且 `is_admin = 1`。

---

## 后端 API

| 方法 & 路径 | 说明 |
| --- | --- |
| `GET  /api/health` | 健康检查；前端据此判断是否启用云端账号 |
| `GET  /api/user/:name` | 返回 `{ exists, salt, iterations }`，供客户端先派生哈希再登录 |
| `POST /api/register` | 创建账号：`{ name, salt, hash, iterations }` |
| `POST /api/login` | 登录校验：`{ name, hash }`（恒定时间比较） |
| `GET  /api/progress?name=` | 读取云端进度（背包/武器/已到达关卡） |
| `POST /api/progress` | 写入云端进度（若带 `hash` 则先校验，防止他人覆盖） |
| `GET/POST /api/admin` | 管理员操作（列表/删除/重置/设管理员），需管理员密码哈希 |

数据库表（由后端自动建表）：
- `users`：`id, name(唯一, 归一化为小写), display_name, salt, hash, iterations, created_at, progress, is_admin`
- `progress`：`name(主键), inventory, weapon_slot, backpack_unlocked, reached, updated_at`

---

## 本地运行（Node 后端 + Turso）

```bash
npm install
# 创建 .env（已被 .gitignore 忽略，请勿提交），写入：
#   TURSO_URL=libsql://<你的数据库>.turso.io
#   TURSO_TOKEN=<你的 Turso 令牌>
#   PORT=3000
npm start
# 打开 http://localhost:3000
```

`server.js` 会在首次请求时自动创建 `users` 表。

---

## 部署到 Cloudflare Pages（前端 + Turso 后端）

Cloudflare Pages 同时托管静态站点与 `functions/` 后端，线上站点直接使用 **Turso** 存储账号，无需额外服务器。

1. 在 Cloudflare Pages 创建项目并连接本仓库 `deepest-test`。
2. 构建设置：
   - 框架预设：**None**
   - 构建命令：留空
   - 构建输出目录：**`Deepest`**（Functions 由平台从 `/functions` 自动识别）
3. 在 **Settings → Environment variables**（Production 与 Preview 都加）：
   - `TURSO_URL` = `libsql://***.turso.io`
   - `TURSO_TOKEN` = `<你的 Turso 令牌>`
4. 部署。站点上线后账号即存储在 Turso。

> `functions/` 后端通过 Turso 的 `/v2/pipeline` HTTP API（libSQL 线协议）直接运行在 Cloudflare 边缘，不依赖 Node 服务器。

---

## 备注

- `.env`（含 Turso 令牌）已被 `.gitignore` 忽略，**绝不**提交进仓库。
- `server.js` 仅用于本地开发；生产环境使用 Cloudflare Pages Functions。
- 仓库中同时存在 `Deepest/` 与 `New/Deepest/` 两份前端代码（后者为改版/平行版本），上线时请确认以哪一份作为构建输出目录。

# TokenMerge 部署启动文档

> **Token Pool 管理 · 多模型 LLM 统一路由服务**

---

## 目录

1. [项目简介](#1-项目简介)
2. [环境要求](#2-环境要求)
3. [快速开始](#3-快速开始)
4. [配置说明](#4-配置说明)
5. [API 使用示例](#5-api-使用示例)
6. [部署注意事项](#6-部署注意事项)
7. [已知限制（MVP 范围）](#7-已知限制mvp-范围)

---

## 1. 项目简介

**TokenMerge** 是一个多模型 LLM Token 池管理与智能路由服务。它将多个大语言模型（Qwen、MiniMax、GLM）的 Token 配额统一为一个共享池，根据各模型的剩余 Token 量自动选择最优模型进行路由，并在模型不可用时自动降级到备用模型。

### 核心功能

| 功能 | 说明 |
|------|------|
| **Token 池管理** | 为每个模型配置独立的 Token 配额，实时追踪用量与剩余 |
| **智能路由** | 按剩余 Token 量从大到小排序，优先使用剩余最多的模型 |
| **自动降级（Fallback）** | 首选模型调用失败或配额耗尽时，自动尝试备用模型（最多 `maxFallbackAttempts` 次） |
| **OpenAI 兼容接口** | 提供 `/v1/chat/completions` 接口，与 OpenAI 格式兼容 |
| **自定义聊天接口** | 提供简化的 `/v1/chat` 接口 |
| **配额管理 API** | 支持动态调整配额、重置用量、查询统计 |
| **健康检查** | `/health` 和 `/ready` 端点 |

---

## 2. 环境要求

| 项目 | 要求 |
|------|------|
| **Node.js** | ≥ 22.0.0（推荐 22 LTS） |
| **操作系统** | macOS / Linux / Windows（无平台依赖） |
| **包管理器** | npm（随 Node.js 自带） |
| **API Key** | 至少配置一个模型的 API Key（见下表） |

### 所需 API Key

| 模型 | 环境变量 | 获取地址 |
|------|----------|----------|
| **通义千问 Qwen** | `QWEN_API_KEY` | https://dashscope.console.aliyun.com/ |
| **MiniMax** | `MINIMAX_API_KEY` | https://platform.minimaxi.com/ |
| **智谱 GLM** | `GLM_API_KEY` | https://open.bigmodel.cn/ |

> **注意**：不要求同时配置全部三种模型，但至少需要配置一种，否则服务启动时会因"无可用适配器"而退出。

---

## 3. 快速开始

### 3.1 Clone 仓库

```bash
git clone https://github.com/dongzi726/agent_worker.git
cd agent_worker
```

> 如果项目代码已在 `projects/token-merge/` 目录下，直接 `cd` 进入即可。

### 3.2 安装依赖

```bash
npm install
```

### 3.3 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入真实的 API Key：

```bash
# ===== API Keys（至少填一个）=====

# 通义千问
QWEN_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# MiniMax
MINIMAX_API_KEY=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.xxxxxxxx

# 智谱 GLM
GLM_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ===== 服务配置（可选，有默认值）=====
PORT=3000
BIND_ADDRESS=127.0.0.1
REQUEST_TIMEOUT_MS=60000
MAX_FALLBACK_ATTEMPTS=3
```

### 3.4 确认配置文件

确保 `config.json` 存在且格式正确（项目已自带默认配置，一般无需修改）：

```bash
cat config.json
```

### 3.5 启动服务

#### 开发模式（推荐开发调试时用）

```bash
npm run dev
```

> 使用 `tsx watch` 模式，修改源码后自动重启。

#### 生产模式

```bash
# 先编译 TypeScript
npm run build

# 再启动
npm start
```

### 3.6 验证服务

服务启动后，终端应输出类似：

```
[INFO] Configuration loaded  { port: 3000, bindAddress: '127.0.0.1', modelCount: 3 }
[INFO] TokenMerge server started  { address: '127.0.0.1:3000', models: [ 'qwen-plus', 'minimax-abab6', 'glm-4' ], adaptersConfigured: 3 }
```

新开一个终端窗口，验证服务是否正常：

```bash
curl http://127.0.0.1:3000/health
```

应返回：

```json
{
  "status": "ok",
  "uptime": 12,
  "models": [
    { "id": "qwen-plus", "status": "available", "remaining_tokens": 1000000 },
    { "id": "minimax-abab6", "status": "available", "remaining_tokens": 500000 },
    { "id": "glm-4", "status": "available", "remaining_tokens": 800000 }
  ]
}
```

---

## 4. 配置说明

### 4.1 `config.json` 字段说明

```json
{
  "port": 3000,
  "bindAddress": "127.0.0.1",
  "requestTimeoutMs": 60000,
  "maxFallbackAttempts": 3,
  "models": [ ... ]
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `port` | number | `3000` | 服务监听端口（可被 `PORT` 环境变量覆盖） |
| `bindAddress` | string | `"127.0.0.1"` | 绑定地址（可被 `BIND_ADDRESS` 环境变量覆盖） |
| `requestTimeoutMs` | number | `60000` | 单次请求超时时间（毫秒） |
| `maxFallbackAttempts` | number | `3` | 模型降级最大尝试次数 |
| `models` | array | — | 模型配置列表（至少一项） |

### 4.2 模型配置项

每个 `models` 数组中的对象包含以下字段：

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `id` | string | 模型唯一标识（内部使用） | `"qwen-plus"` |
| `name` | string | 模型显示名称 | `"Qwen Plus"` |
| `type` | string | 模型类型，决定使用哪个适配器 | `"qwen"` / `"minimax"` / `"glm"` |
| `model_name` | string | 调用上游 API 时使用的模型名 | `"qwen-plus"` |
| `endpoint` | string | 上游 API 端点 URL | `"https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"` |
| `api_key_env` | string | 从环境变量读取 API Key 的变量名 | `"QWEN_API_KEY"` |
| `total_tokens` | number | 该模型的 Token 总配额 | `1000000` |

### 4.3 默认模型配置一览

| 模型 ID | 类型 | 端点 | 环境变量 | 默认配额 |
|---------|------|------|----------|----------|
| `qwen-plus` | qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `QWEN_API_KEY` | 1,000,000 |
| `minimax-abab6` | minimax | `https://api.minimaxi.chat/v1/text/chatcompletion_v2` | `MINIMAX_API_KEY` | 500,000 |
| `glm-4` | glm | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `GLM_API_KEY` | 800,000 |

### 4.4 如何调整 Token 配额

有三种方式可以调整 Token 配额：

#### 方式一：修改 `config.json`（需重启）

直接编辑 `config.json` 中对应模型的 `total_tokens` 值，然后重启服务。

#### 方式二：运行时动态调整（无需重启）

```bash
# 将 qwen-plus 的配额调整为 2,000,000
curl -X PUT http://127.0.0.1:3000/admin/quota/qwen-plus \
  -H "Content-Type: application/json" \
  -d '{"total_tokens": 2000000}'
```

#### 方式三：重置用量

```bash
# 重置 qwen-plus 的已使用量为 0
curl -X POST http://127.0.0.1:3000/admin/quota/qwen-plus/reset
```

#### 方式四：通过环境变量覆盖总配额

环境变量 `PORT`、`BIND_ADDRESS` 等可覆盖 `config.json` 中的对应值，但 Token 配额目前只能通过配置文件或 API 调整。

---

## 5. API 使用示例

### 5.1 `POST /v1/chat` — 简化聊天接口

```bash
curl -X POST http://127.0.0.1:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "你好，请介绍一下自己",
    "max_tokens": 512,
    "temperature": 0.7,
    "system_prompt": "你是一个 helpful 的 AI 助手。"
  }'
```

**响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "content": "你好！我是一个 AI 助手……",
    "model_used": "qwen-plus",
    "prompt_tokens": 28,
    "completion_tokens": 156,
    "total_tokens": 184
  }
}
```

### 5.2 `POST /v1/chat/completions` — OpenAI 兼容接口

```bash
curl -X POST http://127.0.0.1:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "你是一个 helpful 的 AI 助手。"},
      {"role": "user", "content": "用一句话解释什么是 TokenMerge。"}
    ],
    "max_tokens": 256,
    "temperature": 0.7
  }'
```

**响应示例（OpenAI 兼容格式）：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "object": "chat.completion",
    "created": 1712419200,
    "model": "qwen-plus",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "TokenMerge 是一个多模型 LLM Token 池管理与智能路由服务……"
        },
        "finish_reason": "stop"
      }
    ],
    "usage": {
      "prompt_tokens": 42,
      "completion_tokens": 78,
      "total_tokens": 120
    }
  }
}
```

### 5.3 `GET /admin/quota` — 查询所有模型配额

```bash
curl http://127.0.0.1:3000/admin/quota
```

**响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "qwen-plus",
      "name": "Qwen Plus",
      "total_tokens": 1000000,
      "used_tokens": 12340,
      "remaining_tokens": 987660,
      "status": "available",
      "call_count": 15,
      "total_prompt_tokens": 8500,
      "total_completion_tokens": 3840
    }
  ]
}
```

### 5.4 `GET /health` — 健康检查

```bash
curl http://127.0.0.1:3000/health
```

**响应示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "status": "ok",
    "uptime": 3600,
    "models": [
      { "id": "qwen-plus", "status": "available", "remaining_tokens": 987660 },
      { "id": "minimax-abab6", "status": "available", "remaining_tokens": 500000 },
      { "id": "glm-4", "status": "available", "remaining_tokens": 800000 }
    ]
  }
}
```

> **健康状态说明：**
> - `ok` — 所有模型均可用
> - `degraded` — 部分模型配额耗尽但仍有模型可用
> - `unhealthy` — 所有模型配额均耗尽

### 5.5 其他管理端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/admin/quota/:modelId` | `PUT` | 动态调整模型配额 |
| `/admin/quota/:modelId/reset` | `POST` | 重置模型已使用量 |
| `/admin/stats` | `GET` | 获取聚合统计信息 |
| `/ready` | `GET` | 就绪检查（所有模型均有适配器时为 true） |

---

## 6. 部署注意事项

### 6.1 绑定地址

| 地址 | 适用场景 | 说明 |
|------|----------|------|
| `127.0.0.1` | **本地开发 / 单机部署** | 仅本机可访问，安全 |
| `0.0.0.0` | **容器化部署 / 反向代理后** | 监听所有网卡，**必须配合防火墙或反向代理** |

**生产环境建议：** 绑定 `127.0.0.1`，通过 Nginx/Caddy 反向代理暴露服务：

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
```

### 6.2 端口配置

- 默认端口：`3000`
- 可通过 `config.json` 的 `port` 字段修改
- 或通过环境变量 `PORT=xxxx` 覆盖
- 确保端口未被其他服务占用：`lsof -i :3000`

### 6.3 生产环境部署建议

#### 方案一：PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 编译
npm run build

# 启动
pm2 start dist/index.js --name tokenmerge

# 查看状态
pm2 status

# 开机自启
pm2 startup
pm2 save
```

#### 方案二：Systemd（Linux）

创建 `/etc/systemd/system/tokenmerge.service`：

```ini
[Unit]
Description=TokenMerge LLM Router
After=network.target

[Service]
Type=simple
User=tokenmerge
WorkingDirectory=/opt/tokenmerge
ExecStart=/usr/local/bin/node dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/tokenmerge/.env

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable tokenmerge
systemctl start tokenmerge
```

#### 方案三：Docker

`Dockerfile`：

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY config.json .env ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

构建与运行：

```bash
docker build -t tokenmerge:latest .
docker run -d \
  --name tokenmerge \
  -p 3000:3000 \
  --restart unless-stopped \
  -v $(pwd)/.env:/app/.env:ro \
  -v $(pwd)/config.json:/app/config.json:ro \
  tokenmerge:latest
```

### 6.4 安全建议

| 项目 | 建议 |
|------|------|
| **API Key** | 仅通过 `.env` 文件管理，**不要提交到 Git**（`.gitignore` 已排除 `.env`） |
| **网络** | 生产环境不要直接绑定 `0.0.0.0`，使用反向代理 + 防火墙 |
| **鉴权** | 当前 MVP 无鉴权，生产环境务必在反向代理层添加认证 |
| **日志** | 定期检查日志，发现异常调用及时告警 |
| **HTTPS** | 通过 Nginx/Caddy 配置 TLS 证书 |

---

## 7. 已知限制（MVP 范围）

以下是当前版本的已知限制，后续版本计划逐步解决：

| 限制 | 说明 | 影响 | 缓解方案 |
|------|------|------|----------|
| **无持久化** | Token 用量数据存储在内存中，**服务重启后全部丢失** | 重启后所有配额重置为初始值 | 手动通过 Admin API 重置配额；后续版本增加 SQLite/Redis 持久化 |
| **无流式输出（SSE）** | 所有请求为同步等待，不支持 `stream: true` | 长文本生成时响应延迟较高 | 客户端设置合理的超时时间 |
| **无鉴权** | 所有接口（包括管理接口）无身份验证 | 任何人都可以查询和调整配额 | **必须在反向代理层添加认证**（如 Basic Auth、API Key 验证） |
| **MiniMax Token 估算** | MiniMax classic 格式不返回精确 token 计数，使用字符数估算 | 用量统计存在偏差 | 偏差通常在可接受范围内；后续版本可使用 v2 接口获取精确计数 |
| **无限流（Rate Limit）** | 不对客户端请求频率做限制 | 可能被恶意高频调用耗尽配额 | 在反向代理层配置限流规则 |

---

## 快速参考

```bash
# 开发启动
npm run dev

# 生产启动
npm run build && npm start

# 健康检查
curl http://127.0.0.1:3000/health

# 查询配额
curl http://127.0.0.1:3000/admin/quota

# 调整配额
curl -X PUT http://127.0.0.1:3000/admin/quota/qwen-plus \
  -H "Content-Type: application/json" \
  -d '{"total_tokens": 2000000}'

# 重置用量
curl -X POST http://127.0.0.1:3000/admin/quota/qwen-plus/reset
```

---

> **文档版本**: v1.0  
> **最后更新**: 2026-04-06  
> **维护**: 老周 · tokenMerge 项目组

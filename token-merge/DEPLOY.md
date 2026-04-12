# TokenMerge 部署启动文档

> **Token Pool 管理 · 多模型 LLM 统一路由服务 · v2（厂商多 Key 池）**

---

## 目录

1. [项目简介](#1-项目简介)
2. [环境要求](#2-环境要求)
3. [快速开始](#3-快速开始)
4. [配置说明](#4-配置说明)
5. [API 使用示例](#5-api-使用示例)
6. [部署注意事项](#6-部署注意事项)
7. [已知限制](#7-已知限制)

---

## 1. 项目简介

**TokenMerge** 是一个多模型 LLM Token 池管理与智能路由服务。它将多个大语言模型（Qwen、MiniMax、GLM）的 Token 配额统一为一个共享池，根据各模型的剩余 Token 量自动选择最优模型进行路由，并在模型不可用时自动降级到备用模型。

### v2 新增：厂商多 Key 池

迭代 2 支持为每个厂商配置**多个 API Key**，实现：

| 功能 | 说明 |
|------|------|
| **多 Key 负载均衡** | 同一厂商内多个 Key 轮询/最少使用 |
| **Key 级 Fallback** | 单个 Key 失效时自动切换到同厂商其他 Key |
| **Key 健康管理** | 401→禁用、429→冷却、超时→冷却，自动恢复 |
| **向后兼容** | v1 单 Key 配置无需修改即可运行 |

---

## 2. 环境要求

| 项目 | 要求 |
|------|------|
| **Node.js** | ≥ 22.0.0（推荐 22 LTS） |
| **操作系统** | macOS / Linux / Windows（无平台依赖） |
| **包管理器** | npm（随 Node.js 自带） |
| **API Key** | 至少配置一个模型的 API Key |

### 所需 API Key

| 模型 | 环境变量 | 获取地址 |
|------|----------|----------|
| **通义千问 Qwen** | `QWEN_API_KEY`（v1）或 `QWEN_KEY_1`/`QWEN_KEY_2`（v2 多 Key） | https://dashscope.console.aliyun.com/ |
| **MiniMax** | `MINIMAX_API_KEY` | https://platform.minimaxi.com/ |
| **智谱 GLM** | `GLM_API_KEY` | https://open.bigmodel.cn/ |

---

## 3. 快速开始

### 3.1 安装依赖

```bash
npm install
```

### 3.2 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# ===== API Keys =====
QWEN_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
MINIMAX_API_KEY=eyJhbGciOiJSUzI1NiIs...
GLM_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

# ===== 服务配置（可选）=====
PORT=3000
BIND_ADDRESS=127.0.0.1
REQUEST_TIMEOUT_MS=60000
MAX_FALLBACK_ATTEMPTS=3
TOTAL_REQUEST_TIMEOUT_MS=90000
INCLUDE_FALLBACK_DETAIL=false
KEY_STATS_WINDOW_HOURS=24
```

### 3.3 确认配置文件

#### v1 格式（自动兼容，无需修改）

```json
{
  "port": 3000,
  "bindAddress": "127.0.0.1",
  "models": [
    {
      "id": "qwen-plus",
      "type": "qwen",
      "api_key_env": "QWEN_API_KEY",
      "total_tokens": 1000000
    }
  ]
}
```

#### v2 格式（多 Key 池）

```json
{
  "port": 3000,
  "bindAddress": "127.0.0.1",
  "vendors": {
    "qwen": {
      "type": "qwen",
      "key_pool": [
        { "api_key_env": "QWEN_KEY_1", "weight": 1, "label": "qwen-prod-1" },
        { "api_key_env": "QWEN_KEY_2", "weight": 1, "label": "qwen-prod-2" }
      ],
      "key_routing_strategy": "round_robin",
      "models": [
        { "id": "qwen-plus", "total_tokens": 1000000 },
        { "id": "qwen-max", "total_tokens": 500000 }
      ]
    }
  }
}
```

### 3.4 启动服务

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run build && npm start
```

### 3.5 验证服务

```bash
curl http://127.0.0.1:3000/health
```

应返回：

```json
{
  "status": "ok",
  "uptime": 12,
  "vendors": [
    {
      "id": "qwen",
      "key_pool_status": { "total": 2, "healthy": 2, "cooldown": 0, "disabled": 0 },
      "models": [
        { "id": "qwen-plus", "status": "available", "remaining_tokens": 1000000 }
      ]
    }
  ]
}
```

---

## 4. 配置说明

### 4.1 服务器配置

| 字段 | 类型 | 默认值 | 环境变量覆盖 | 说明 |
|------|------|--------|-------------|------|
| `port` | number | `3000` | `PORT` | 服务监听端口 |
| `bindAddress` | string | `"127.0.0.1"` | `BIND_ADDRESS` | 绑定地址 |
| `requestTimeoutMs` | number | `60000` | `REQUEST_TIMEOUT_MS` | 单次请求超时（ms） |
| `maxFallbackAttempts` | number | `3` | `MAX_FALLBACK_ATTEMPTS` | 降级最大尝试次数 |
| `totalRequestTimeoutMs` | number | `90000` | `TOTAL_REQUEST_TIMEOUT_MS` | 总请求超时（含 fallback） |
| `includeFallbackDetail` | boolean | `false` | `INCLUDE_FALLBACK_DETAIL` | 响应中是否包含 fallback_detail |
| `keyStatsWindowHours` | number | `24` | `KEY_STATS_WINDOW_HOURS` | Key 统计滑动窗口（小时） |

### 4.2 v1 配置格式（向后兼容）

每个模型配置：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 模型唯一标识 |
| `name` | string | 显示名称 |
| `type` | string | `qwen` / `minimax` / `glm` |
| `model_name` | string | 上游 API 使用的模型名 |
| `endpoint` | string | 上游 API 端点 |
| `api_key_env` | string | 环境变量名 |
| `total_tokens` | number | Token 总配额 |

> v1 格式启动时会自动按厂商类型分组，同类型模型归入同一 vendor，共用单 Key。

### 4.3 v2 配置格式（多 Key 池）

#### vendor 级别

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | ✅ | 模型类型 |
| `key_pool` | array | ✅ | Key 池配置（与 `api_key_env` 二选一） |
| `api_key_env` | string | ✅ | 单 Key 环境变量名（与 `key_pool` 二选一） |
| `key_routing_strategy` | string | ❌ | `round_robin`（默认）或 `least_used` |
| `models` | array | ✅ | 该厂商下的模型列表 |

#### key_pool 条目

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `api_key_env` | string | ✅ | 环境变量名 |
| `weight` | number | ❌ | 权重（默认 1，仅 round_robin 有效） |
| `label` | string | ✅ | Key 标识，用于日志和 API 展示 |

### 4.4 配置校验规则

| 规则 | 错误处理 |
|------|---------|
| 同时存在 `api_key_env` 和 `key_pool` | 启动报错 |
| `key_pool` 为空数组 | 启动报错 |
| 同一 KeyPool 内重复 `api_key_env` | 启动报错 |
| 同一 KeyPool 内重复 `label` | 启动报错 |
| 模型级别配置 `api_key_env` | 启动警告，该字段被忽略 |

### 4.5 Key 路由策略

| 策略 | 算法 | 适用场景 |
|------|------|---------|
| `round_robin` | 加权轮询 | 各 Key 配额和速率限制相近 |
| `least_used` | 选择 24h 内调用次数最少的 Key | 各 Key 有独立 QPS/TPM 限额 |

---

## 5. API 使用示例

### 5.1 `POST /v1/chat` — 简化聊天接口

```bash
curl -X POST http://127.0.0.1:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "你好", "max_tokens": 512}'
```

**v2 响应示例（新增字段已标注 🆕）：**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "req_abc123",
    "content": "你好！……",
    "model_used": "qwen-plus",
    "vendor_used": "qwen",          // 🆕 v2
    "key_used": "qwen-prod-1",      // 🆕 v2
    "prompt_tokens": 18,
    "completion_tokens": 56,
    "total_tokens": 74,
    "fallback_count": 0,            // 🆕 v2
    "fallback_detail": {            // 🆕 v2（需 includeFallbackDetail=true）
      "key_fallbacks": 0,
      "model_fallbacks": 0,
      "tried_keys": ["qwen-prod-1"],
      "tried_models": ["qwen-plus"]
    }
  }
}
```

### 5.2 `POST /v1/chat/completions` — OpenAI 兼容接口

响应同样增加 `vendor_used`、`key_used`、`fallback_count` 字段。

### 5.3 Key 管理 API（🆕 v2）

#### 查询所有 Key 状态

```bash
curl http://127.0.0.1:3000/admin/keys
# 按 vendor 过滤
curl "http://127.0.0.1:3000/admin/keys?vendor=qwen"
# 按状态过滤
curl "http://127.0.0.1:3000/admin/keys?status=cooldown"
```

#### 查询单个 Key 详情

```bash
curl http://127.0.0.1:3000/admin/keys/qwen/qwen-prod-1
```

#### 启用/禁用 Key

```bash
# 禁用
curl -X PUT http://127.0.0.1:3000/admin/keys/qwen/qwen-prod-1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "disabled"}'

# 启用
curl -X PUT http://127.0.0.1:3000/admin/keys/qwen/qwen-prod-1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "healthy"}'
```

#### 重置 Key 冷却和失败计数

```bash
curl -X POST http://127.0.0.1:3000/admin/keys/qwen/qwen-prod-1/reset
```

#### 查询 Key 级用量统计

```bash
curl http://127.0.0.1:3000/admin/stats/keys
# 按 vendor 过滤
curl "http://127.0.0.1:3000/admin/stats/keys?vendor=qwen"
```

### 5.4 其他管理端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查（含 vendor + key pool 状态） |
| `/ready` | GET | 就绪检查 |
| `/admin/quota` | GET | 查询所有模型配额（v2 按 vendor 分组） |
| `/admin/quota/:modelId` | PUT | 动态调整配额 |
| `/admin/quota/:modelId/reset` | POST | 重置用量 |
| `/admin/stats` | GET | 模型级统计 |
| `/admin/stats/keys` | GET | 🆕 Key 级统计 |

### 5.5 错误码（v2 新增）

| 业务错误码 | HTTP | 说明 |
|-----------|------|------|
| `VENDOR_NOT_FOUND` | 404 | 厂商不存在 |
| `KEY_NOT_FOUND` | 404 | Key 不存在 |
| `INVALID_STATUS` | 400 | 状态值非法 |
| `ALL_KEYS_UNAVAILABLE` | 503 | 厂商内所有 Key 均不可用 |

---

## 6. 部署注意事项

### 6.1 安全建议

| 项目 | 建议 |
|------|------|
| **API Key** | 仅通过 `.env` 管理，不要提交到 Git |
| **网络** | 生产环境绑定 `127.0.0.1`，使用反向代理 |
| **鉴权** | MVP 无鉴权，务必在反向代理层添加认证 |
| **HTTPS** | 通过 Nginx/Caddy 配置 TLS |

### 6.2 部署方案

#### PM2（推荐）

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name tokenmerge
pm2 save
```

#### Docker

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

---

## 7. 已知限制

| 限制 | 说明 | 影响 | 计划 |
|------|------|------|------|
| **Key 状态全在内存** | 重启后所有 Key 状态丢失（cooldown、call_count 等） | 重启后 Key 路由短期不精准 | P2 考虑持久化 |
| **call_count_24h 重启归零** | least_used 策略短期内不精准 | 影响负载均衡精度 | P2 考虑持久化 |
| **无流式输出** | 不支持 SSE stream | 长文本响应延迟高 | P2 |
| **无鉴权** | 所有接口无身份验证 | 必须反向代理加认证 | P1 |
| **无持久化** | Token 用量重启后丢失 | 配额数据丢失 | P1 |
| **fallback_detail 默认不返回** | 需 `INCLUDE_FALLBACK_DETAIL=true` | 调试信息需手动开启 | 设计意图 |

---

## 快速参考

```bash
# 启动
npm run dev                    # 开发
npm run build && npm start     # 生产

# 健康检查
curl http://127.0.0.1:3000/health

# Key 管理
curl http://127.0.0.1:3000/admin/keys
curl -X PUT http://127.0.0.1:3000/admin/keys/qwen/qwen-prod-1/status \
  -H "Content-Type: application/json" -d '{"status":"disabled"}'
curl -X POST http://127.0.0.1:3000/admin/keys/qwen/qwen-prod-1/reset

# 配额管理
curl http://127.0.0.1:3000/admin/quota
curl -X PUT http://127.0.0.1:3000/admin/quota/qwen-plus \
  -H "Content-Type: application/json" -d '{"total_tokens":2000000}'
```

---

> **文档版本**: v2.0  
> **最后更新**: 2026-04-12  
> **维护**: 泽衍 · tokenMerge 项目组

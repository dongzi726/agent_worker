# TokenMerge Frontend — 部署文档

## 版本
v3.0.0 (迭代 3 Phase 3 — 模块补全 + Build 修复)

## 更新日志 (2026-04-13)
### 新增模块
- `src/api/user.ts` — userApi (getMyKeys, getKeyDetail, updateKeyStatus, resetKey, getUsage, applyKey)
- `src/api/admin.ts` — adminApi (getQuota, adjustQuota, resetUsage, getApplications, reviewApplication, getStats, getKeyStats)
- `src/utils/mask.ts` — maskKey(), copyToClipboard()
- `src/utils/format.ts` — formatDate(), formatNumber(), formatUptime()

### 修复
- App.tsx: Layout 导入从 named import 修复为 default import
- MyKeys.tsx / MyUsage.tsx: 补充 export default 声明
- vite build 通过 ✓ (3684 modules, 7.07s)

## 技术栈
- React 18 + TypeScript 5 + Vite 5
- Ant Design 5 + React Router 6 + axios + echarts + dayjs

## 环境要求
- Node.js ≥ 18
- npm ≥ 9 或 pnpm ≥ 8
- 后端 API 服务运行中（默认 http://localhost:3000）

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 开发模式
```bash
npm run dev
```
访问 http://localhost:5173

Vite dev proxy 自动配置：`/api` → `http://localhost:3000`

### 3. 生产构建
```bash
npm run build
```
产物在 `dist/` 目录

### 4. 预览构建产物
```bash
npm run preview
```

## 配置说明

### Vite 代理 (vite.config.ts)
```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    }
  }
}
```

### API BaseURL
- 开发环境：`/api`（Vite 代理转发）
- 生产环境：需配置 nginx 反向代理或修改 baseURL

### 认证
- JWT Token 存储在 localStorage (`access_token`, `refresh_token`)
- 自动刷新：access_token 过期时自动刷新
- 登出时清空 Token

## 路由结构

| 路径 | 角色 | 说明 |
|------|------|------|
| /login | 公开 | 登录页 |
| /register | 公开 | 注册页 |
| /admin/dashboard | admin | 管理后台仪表盘 |
| /admin/users | admin | 用户管理 |
| /admin/keys | admin | Key 管理 |
| /user/keys | user | 我的 Key |
| /user/stats | user | 用量统计 |

## Nginx 部署示例

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/token-merge-frontend/dist;
    index index.html;

    # SPA 路由 fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 已知限制
1. 用户端页面 UserKeys/UserStats 对应实际文件 MyKeys.tsx/MyUsage.tsx，App.tsx 中的导入路径需要修正
2. tsconfig.json 有 composite 配置警告，不影响 vite build
3. AuthGuard 的登出按钮点击处理直接执行 logout，无确认弹窗
4. 管理员信息展示为硬编码"管理员"，未来应从 /auth/me 获取真实用户名

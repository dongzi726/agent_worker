import { type RouteObject } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';
import UserLayout from '../layouts/UserLayout';
import Dashboard from '../pages/admin/Dashboard';
import UserManagement from '../pages/admin/UserManagement';
import KeyManagement from '../pages/admin/KeyManagement';
import Login from '../pages/auth/Login';
import Register from '../pages/auth/Register';
import UserKeys from '../pages/user/UserKeys';
import UserStats from '../pages/user/UserStats';

export const routes: RouteObject[] = [
  // 认证路由
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },

  // 管理后台路由
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, path: 'dashboard', element: <Dashboard /> },
      { path: 'users', element: <UserManagement /> },
      { path: 'keys', element: <KeyManagement /> },
    ],
  },

  // 用户端路由
  {
    path: '/user',
    element: <UserLayout />,
    children: [
      { index: true, path: 'keys', element: <UserKeys /> },
      { path: 'stats', element: <UserStats /> },
    ],
  },

  // 默认重定向
  { path: '*', element: <Login /> },
];

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import UserLayout from './layouts/UserLayout';
import Dashboard from './pages/admin/Dashboard';
import UserManagement from './pages/admin/UserManagement';
import KeyManagement from './pages/admin/KeyManagement';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import MyKeys from './pages/user/MyKeys';
import MyUsage from './pages/user/MyUsage';
import AuthGuard from './components/AuthGuard';

const App: React.FC = () => {
  return (
    <Routes>
      {/* 认证路由 */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* 管理后台路由 */}
      <Route
        path="/admin"
        element={
          <AuthGuard requiredRole="admin">
            <AdminLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="keys" element={<KeyManagement />} />
      </Route>

      {/* 用户端路由 */}
      <Route
        path="/user"
        element={
          <AuthGuard requiredRole="user">
            <UserLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/user/keys" replace />} />
        <Route path="keys" element={<MyKeys />} />
        <Route path="stats" element={<MyUsage />} />
      </Route>

      {/* 默认重定向 */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default App;

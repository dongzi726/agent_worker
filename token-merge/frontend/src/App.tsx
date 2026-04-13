import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

import LoginPage from './pages/LoginPage';
import AdminLayout from './components/AdminLayout';
import DashboardPage from './pages/DashboardPage';
import UserManagementPage from './pages/UserManagementPage';
import KeyManagementPage from './pages/KeyManagementPage';
import MonitoringPage from './pages/MonitoringPage';
import SystemPage from './pages/SystemPage';
import UserKeysPage from './pages/UserKeysPage';

// Simple auth guard
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('access_token');
  return token ? <>{children}</> : <Navigate to="/login" />;
};

const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/user/keys" element={
            <ProtectedRoute><UserKeysPage /></ProtectedRoute>
          } />

          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminLayout><DashboardPage /></AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute>
              <AdminLayout><UserManagementPage /></AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/keys" element={
            <ProtectedRoute>
              <AdminLayout><KeyManagementPage /></AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/monitoring" element={
            <ProtectedRoute>
              <AdminLayout><MonitoringPage /></AdminLayout>
            </ProtectedRoute>
          } />
          <Route path="/admin/system" element={
            <ProtectedRoute>
              <AdminLayout><SystemPage /></AdminLayout>
            </ProtectedRoute>
          } />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;

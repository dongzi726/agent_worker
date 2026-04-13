import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import request from '../api/request';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRole?: 'user' | 'admin';
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children, requiredRole }) => {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setChecking(false);
      setAuthorized(false);
      return;
    }

    // 解析 JWT payload 获取角色
    try {
      const payloadBase64 = token.split('.')[1];
      const payload = JSON.parse(atob(payloadBase64));
      const userRole = payload.role as string | undefined;

      if (requiredRole && userRole !== requiredRole) {
        // 权限不足
        setChecking(false);
        setAuthorized(false);
        // 根据实际角色跳转到对应页面
        if (userRole === 'admin') {
          navigate('/admin/dashboard', { replace: true });
        } else {
          navigate('/user/keys', { replace: true });
        }
        return;
      }

      // 可选：验证 token 是否有效（调用 /auth/me）
      request.get('/auth/me').then(() => {
        setChecking(false);
        setAuthorized(true);
      }).catch(() => {
        // token 无效，清理并跳转
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setChecking(false);
        setAuthorized(false);
      });
    } catch {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      setChecking(false);
      setAuthorized(false);
    }
  }, [requiredRole, navigate]);

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" tip="验证身份..." />
      </div>
    );
  }

  if (!authorized) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;

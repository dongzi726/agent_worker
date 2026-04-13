import React from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import request from '../../api/request';
import type { LoginResponse } from '../types';

const { Link } = Typography;

interface LoginFormData {
  identity: string;
  password: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();

  const handleLogin = async (values: LoginFormData) => {
    try {
      const res = await request.post<{ data: LoginResponse }>('/auth/login', {
        [values.identity.includes('@') ? 'email' : 'username']: values.identity,
        password: values.password,
      });

      const { access_token, refresh_token, user } = res.data.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);

      message.success('登录成功');

      // 根据角色跳转
      if (user.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/user/keys', { replace: true });
      }
    } catch (e: any) {
      const errorCode = e.response?.data?.code;
      switch (errorCode) {
        case 'INVALID_CREDENTIALS':
          message.error('邮箱/用户名或密码错误');
          break;
        case 'ACCOUNT_PENDING':
          message.warning('账号正在审核中，请耐心等待');
          break;
        case 'ACCOUNT_BANNED':
          message.error('账号已被封禁');
          break;
        case 'RATE_LIMITED':
          message.warning('登录过于频繁，请稍后再试');
          break;
        default:
          message.error(e.response?.data?.message || '登录失败，请重试');
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        title="TokenMerge 登录"
        style={{ width: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
      >
        <Form<LoginFormData> layout="vertical" onFinish={handleLogin} autoComplete="off">
          <Form.Item
            label="邮箱 / 用户名"
            name="identity"
            rules={[{ required: true, message: '请输入邮箱或用户名' }]}
          >
            <Input placeholder="邮箱或用户名" size="large" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="密码" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large">
              登录
            </Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph style={{ textAlign: 'center', marginBottom: 0 }}>
          还没有账号？<Link href="/register">立即注册</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
};

export default Login;

import React from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import request from '../../api/request';

const { Link } = Typography;

interface RegisterFormData {
  email: string;
  username: string;
  password: string;
  confirm: string;
}

const Register: React.FC = () => {
  const navigate = useNavigate();

  const handleRegister = async (values: RegisterFormData) => {
    try {
      await request.post('/auth/register', {
        email: values.email,
        username: values.username,
        password: values.password,
      });

      message.success('注册成功，请登录');
      navigate('/login', { replace: true });
    } catch (e: any) {
      const errorCode = e.response?.data?.code;
      switch (errorCode) {
        case 'INVALID_EMAIL':
          message.error('邮箱格式不合法');
          break;
        case 'WEAK_PASSWORD':
          message.error('密码强度不足（需 ≥8 位，含大小写+数字）');
          break;
        case 'EMAIL_EXISTS':
          message.error('该邮箱已被注册');
          break;
        case 'USERNAME_EXISTS':
          message.error('该用户名已被占用');
          break;
        default:
          message.error(e.response?.data?.message || '注册失败，请重试');
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
        title="TokenMerge 注册"
        style={{ width: 400, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
      >
        <Form<RegisterFormData>
          layout="vertical"
          onFinish={handleRegister}
          autoComplete="off"
        >
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="邮箱" size="large" />
          </Form.Item>
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, max: 30, message: '用户名 3-30 字符' },
              {
                pattern: /^[a-zA-Z0-9_]+$/,
                message: '用户名只能包含字母、数字和下划线',
              },
            ]}
          >
            <Input placeholder="字母数字下划线" size="large" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '密码至少 8 位' },
              {
                pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                message: '密码必须包含大小写字母和数字',
              },
            ]}
          >
            <Input.Password
              placeholder="密码（≥8 位，含大小写+数字）"
              size="large"
            />
          </Form.Item>
          <Form.Item
            label="确认密码"
            name="confirm"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="确认密码" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large">
              注册
            </Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph style={{ textAlign: 'center', marginBottom: 0 }}>
          已有账号？<Link href="/login">去登录</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
};

export default Register;

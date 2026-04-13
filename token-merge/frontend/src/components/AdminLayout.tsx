// Layout with sider menu — Admin layout
import React from 'react';
import { Layout, Menu, Button, Typography, theme } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  KeyOutlined,
  LineChartOutlined,
  MonitorOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const menuItems = [
  { key: '/admin', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/admin/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/admin/keys', icon: <KeyOutlined />, label: 'Key 管理' },
  { key: '/admin/monitoring', icon: <LineChartOutlined />, label: '使用监控' },
  { key: '/admin/system', icon: <MonitorOutlined />, label: '系统状态' },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token: designToken } = theme.useToken();

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" breakpoint="lg" collapsedWidth={80}>
        <div style={{ height: 32, margin: 16, color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }}>
          TokenMerge
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: designToken.colorBgContainer, padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>
            管理后台
          </Title>
          <Button icon={<LogoutOutlined />} onClick={handleLogout}>
            退出登录
          </Button>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: designToken.colorBgContainer, borderRadius: 8 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;

import React, { useEffect, useState } from 'react';
import { Row, Col, Statistic, Card, Typography, Spin } from 'antd';
import {
  UserOutlined,
  KeyOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import apiClient from '../api.js';

const { Title } = Typography;

interface DashboardData {
  total_users: number;
  active_users_24h: number;
  total_api_keys: number;
  active_api_keys: number;
  today_api_calls: number;
  today_tokens: number;
  avg_latency_ms: number;
  error_rate: number;
}

const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get('/admin/dashboard')
      .then((res) => setData(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>仪表盘</Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="总用户数" value={data?.total_users ?? 0} prefix={<UserOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="24h活跃用户" value={data?.active_users_24h ?? 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="活跃 API Keys" value={`${data?.active_api_keys ?? 0} / ${data?.total_api_keys ?? 0}`} prefix={<KeyOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="今日 API 调用" value={data?.today_api_calls ?? 0} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="今日 Token 消耗" value={data?.today_tokens ?? 0} suffix="tokens" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="平均延迟" value={data?.avg_latency_ms ?? 0} suffix="ms" valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="错误率"
              value={((data?.error_rate ?? 0) * 100).toFixed(1)}
              suffix="%"
              valueStyle={{ color: (data?.error_rate ?? 0) > 0.05 ? '#ff4d4f' : '#52c41a' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Tag, Typography, Spin, Empty, Divider } from 'antd';
import {
  UserOutlined,
  KeyOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import request from '../../api/request';
import type { DashboardData } from '../../types';

const { Title } = Typography;

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await request.get('/admin/dashboard');
      setData(res.data.data);
    } catch (e: any) {
      setError(e.response?.data?.message || '加载仪表盘数据失败');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (n: number) => n.toLocaleString();

  const getErrorRateColor = (rate: number) => {
    if (rate < 0.01) return 'green';
    if (rate < 0.05) return 'orange';
    return 'red';
  };

  const getHealthColor = (status: string) => {
    if (status === 'healthy') return 'green';
    if (status === 'degraded') return 'orange';
    return 'red';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '120px 0' }}>
        <Spin size="large" tip="加载仪表盘数据..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Empty description={error || '数据加载失败'}>
          <Card.Actions>
            <a onClick={fetchDashboard}>重新加载</a>
          </Card.Actions>
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <Title level={2} style={{ marginBottom: 24 }}>
        仪表盘
      </Title>

      {/* 核心指标行 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={data.total_users}
              prefix={<UserOutlined />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="活跃用户 (24h)"
              value={data.active_users_24h}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总 API Key 数"
              value={data.total_api_keys}
              prefix={<KeyOutlined />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="活跃 Key 数"
              value={data.active_api_keys}
              prefix={<SafetyOutlined />}
              valueStyle={{ color: '#3f8600' }}
              formatter={formatNumber}
            />
          </Card>
        </Col>
      </Row>

      {/* 调用指标行 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日 API 调用量"
              value={data.today_api_calls}
              prefix={<ThunderboltOutlined />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日 Token 消耗"
              value={data.today_tokens}
              prefix={<CloudServerOutlined />}
              formatter={formatNumber}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均延迟"
              value={data.avg_latency_ms}
              suffix="ms"
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="错误率"
              value={data.error_rate * 100}
              suffix="%"
              prefix={<WarningOutlined />}
              valueStyle={{ color: getErrorRateColor(data.error_rate) === 'red' ? '#cf1322' : getErrorRateColor(data.error_rate) === 'orange' ? '#d48806' : '#3f8600' }}
              precision={2}
            />
          </Card>
        </Col>
      </Row>

      {/* 系统健康状态 */}
      <Card title="系统健康状态" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col span={8}>
            <Tag color={getHealthColor(data.system_health.backend)} icon={<CloudServerOutlined />}>
              Backend: {data.system_health.backend}
            </Tag>
          </Col>
          <Col span={8}>
            <Tag color={getHealthColor(data.system_health.database)} icon={<DatabaseOutlined />}>
              Database: {data.system_health.database}
            </Tag>
          </Col>
          <Col span={8}>
            <Tag color={getHealthColor(data.system_health.redis)}>
              Redis: {data.system_health.redis}
            </Tag>
          </Col>
        </Row>
        {data.system_health.vendors.length > 0 && (
          <>
            <Divider style={{ margin: '16px 0 8px' }} orientation="left">
              供应商状态
            </Divider>
            <Row gutter={[16, 16]}>
              {data.system_health.vendors.map((v) => (
                <Col key={v.id} span={8}>
                  <Tag color={getHealthColor(v.status)}>
                    {v.id}: {v.healthy_keys}/{v.total_keys} keys healthy
                  </Tag>
                </Col>
              ))}
            </Row>
          </>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;

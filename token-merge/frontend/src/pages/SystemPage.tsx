import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Tag, Descriptions, Statistic, Spin, Typography } from 'antd';
import { DatabaseOutlined, CloudServerOutlined, HddOutlined } from '@ant-design/icons';
import apiClient from '../../api';

const { Title } = Typography;

interface SystemData {
  version: string;
  uptime_seconds: number;
  node_version: string;
  services: {
    database: { status: string; pool_size: number; active_connections: number };
    redis: { status: string; memory_used_mb: number };
    backend: { status: string; memory_heap_mb: number };
  };
}

const statusTag = (status: string) => {
  const colorMap: Record<string, string> = { healthy: 'green', unhealthy: 'red', unavailable: 'orange', unknown: 'default' };
  return <Tag color={colorMap[status] || 'default'}>{status}</Tag>;
};

const SystemPage: React.FC = () => {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get('/admin/system')
      .then((res) => setData(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>系统状态</Title>
      <Card style={{ marginBottom: 16 }}>
        <Descriptions title="服务信息" column={3}>
          <Descriptions.Item label="版本">{data?.version}</Descriptions.Item>
          <Descriptions.Item label="Node.js">{data?.node_version}</Descriptions.Item>
          <Descriptions.Item label="运行时长">
            {data ? `${Math.floor(data.uptime_seconds / 3600)}h ${Math.floor((data.uptime_seconds % 3600) / 60)}m` : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title={<><DatabaseOutlined /> 数据库</>}
              value={data?.services.database.status}
              prefix={statusTag(data?.services.database.status || 'unknown')}
            />
            <div style={{ marginTop: 12 }}>
              <p>连接池: {data?.services.database.pool_size}</p>
              <p>活跃连接: {data?.services.database.active_connections}</p>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title={<><CloudServerOutlined /> Redis</>}
              value={data?.services.redis.status}
              prefix={statusTag(data?.services.redis.status || 'unknown')}
            />
            <p style={{ marginTop: 12 }}>内存使用: {data?.services.redis.memory_used_mb?.toFixed(2) || 0} MB</p>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title={<><HddOutlined /> 后端</>}
              value={data?.services.backend.status}
              prefix={statusTag(data?.services.backend.status || 'unknown')}
            />
            <p style={{ marginTop: 12 }}>堆内存: {data?.services.backend.memory_heap_mb} MB</p>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SystemPage;

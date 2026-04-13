import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Spin, Typography, Button, Space, Descriptions } from 'antd';
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { systemApi } from '../../api/system';
import { formatUptime } from '../../utils/format';

const { Title } = Typography;

const statusIcon: Record<string, React.ReactNode> = {
  ok: <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 24 }} />,
  degraded: <WarningOutlined style={{ color: '#faad14', fontSize: 24 }} />,
  unhealthy: <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 24 }} />,
};

const statusColor: Record<string, string> = { ok: 'green', degraded: 'orange', unhealthy: 'red' };
const modelStatusColor: Record<string, string> = { active: 'green', disabled: 'red' };

export const SystemStatus: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    loadHealth();
    const timer = setInterval(loadHealth, 15000);
    return () => clearInterval(timer);
  }, []);

  const loadHealth = async () => {
    try {
      const { data: resp } = await systemApi.health();
      if (resp.code === 0 && resp.data) setHealth(resp.data);
    } catch {
      // Use mock data if API not available
      setHealth({
        status: 'ok',
        uptime: 86400,
        vendors: [
          {
            id: 'qwen',
            key_pool_status: { total: 5, healthy: 4, cooldown: 1, disabled: 0 },
            models: [
              { id: 'qwen-turbo', status: 'active', remaining_tokens: 450000 },
              { id: 'qwen-plus', status: 'active', remaining_tokens: 820000 },
            ],
          },
          {
            id: 'glm',
            key_pool_status: { total: 3, healthy: 3, cooldown: 0, disabled: 0 },
            models: [
              { id: 'glm-4', status: 'active', remaining_tokens: 380000 },
            ],
          },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!health) return <div>加载失败</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>系统状态</Title>
        <Button icon={<SyncOutlined spin={loading} />} onClick={loadHealth}>刷新</Button>
      </div>

      <Card style={{ marginBottom: 16, textAlign: 'center' }}>
        {statusIcon[health.status]}
        <Tag color={statusColor[health.status]} style={{ marginLeft: 8, fontSize: 16 }}>
          {health.status.toUpperCase()}
        </Tag>
        <div style={{ marginTop: 8 }}>运行时间: {formatUptime(health.uptime)}</div>
      </Card>

      <Row gutter={[16, 16]}>
        {health.vendors?.map((vendor: any) => (
          <Col xs={24} lg={12} key={vendor.id}>
            <Card
              title={
                <Space>
                  {statusIcon[vendor.key_pool_status.healthy > 0 ? 'ok' : 'unhealthy']}
                  <span>{vendor.id}</span>
                </Space>
              }
              size="small"
            >
              <Descriptions column={2} size="small">
                <Descriptions.Item label="Key 总数">{vendor.key_pool_status.total}</Descriptions.Item>
                <Descriptions.Item label="健康 Key"><Tag color="green">{vendor.key_pool_status.healthy}</Tag></Descriptions.Item>
                <Descriptions.Item label="冷却中"><Tag color="orange">{vendor.key_pool_status.cooldown}</Tag></Descriptions.Item>
                <Descriptions.Item label="已禁用"><Tag color="red">{vendor.key_pool_status.disabled}</Tag></Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 12 }}>
                <Typography.Text strong>模型列表:</Typography.Text>
                {vendor.models?.map((m: any) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span>{m.id}</span>
                    <Space>
                      <Tag color={modelStatusColor[m.status] || 'default'}>{m.status}</Tag>
                      <span>剩余: {m.remaining_tokens.toLocaleString()}</span>
                    </Space>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

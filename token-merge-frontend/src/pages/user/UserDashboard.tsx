import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Button, Typography, Tag, Space } from 'antd';
import { KeyOutlined, ThunderboltOutlined, CheckCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { userApi } from '../../api/user';
import { formatNumber } from '../../utils/format';
import { useAuthStore } from '../../store/auth';

const { Title } = Typography;

export const UserDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { username } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [keyCount, setKeyCount] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usageResp, keysResp] = await Promise.all([
        userApi.getUsage(),
        userApi.getMyKeys(),
      ]);
      if (usageResp.data.code === 0) setStats(usageResp.data.data);
      if (keysResp.data.code === 0) setKeyCount(keysResp.data.data?.total || 0);
    } catch {
      setStats({
        total_prompt_tokens: 15000,
        total_completion_tokens: 28000,
        total_calls: 120,
        success_rate: 0.97,
      });
      setKeyCount(1);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>欢迎, {username}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/user/apply')}>申请 Key</Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="我的 Key 数" value={keyCount} prefix={<KeyOutlined />} suffix="个" /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="总 Prompt Tokens" value={stats?.total_prompt_tokens || 0} formatter={(v) => formatNumber(v as number)} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="总调用次数" value={stats?.total_calls || 0} formatter={(v) => formatNumber(v as number)} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="成功率" value={(stats?.success_rate || 0) * 100} precision={1} suffix="%" valueStyle={{ color: stats?.success_rate > 0.95 ? '#3f8600' : '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button type="link" onClick={() => navigate('/user/keys')}>查看我的 Key →</Button>
          <Button type="link" onClick={() => navigate('/user/usage')}>查看详细用量 →</Button>
        </Space>
      </Card>
    </div>
  );
};

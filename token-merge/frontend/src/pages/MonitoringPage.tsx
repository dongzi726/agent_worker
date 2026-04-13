import React, { useEffect, useState } from 'react';
import { Table, Tag, Space, Typography, Spin, Card, Row, Col, Select, Statistic } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import apiClient from '../../api';

const { Title } = Typography;

interface ErrorLog {
  id: number;
  user_id: number;
  key_id: string | null;
  model_id: string;
  status_code: number;
  error_message: string | null;
  latency_ms: number;
  created_at: string;
}

interface ModelStat {
  model_id: string;
  calls: number;
  percent: number;
  avg_latency_ms: number;
}

interface TopUser {
  user_id: number;
  email: string;
  username: string;
  calls: number;
  tokens: number;
}

const MonitoringPage: React.FC = () => {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [modelStats, setModelStats] = useState<ModelStat[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      apiClient.get('/admin/monitoring/errors', { params: { hours } }),
      apiClient.get('/admin/monitoring/models', { params: { hours } }),
      apiClient.get('/admin/monitoring/top-users', { params: { hours, limit: 10 } }),
    ])
      .then(([errRes, modelRes, userRes]) => {
        setErrors(errRes.data.data.errors);
        setModelStats(modelRes.data.data.models);
        setTopUsers(userRes.data.data.users);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [hours]);

  const errorColumns: ColumnsType<ErrorLog> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户', dataIndex: 'user_id', width: 80 },
    { title: '模型', dataIndex: 'model_id', width: 120 },
    { title: '状态码', dataIndex: 'status_code', width: 90, render: (c: number) => <Tag color={c >= 500 ? 'red' : 'orange'}>{c}</Tag> },
    { title: '错误信息', dataIndex: 'error_message', ellipsis: true },
    { title: '延迟', dataIndex: 'latency_ms', width: 90, render: (v: number) => `${v}ms` },
    { title: '时间', dataIndex: 'created_at', width: 180, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
  ];

  const modelColumns: ColumnsType<ModelStat> = [
    { title: '模型', dataIndex: 'model_id' },
    { title: '调用次数', dataIndex: 'calls', render: (v: number) => v.toLocaleString() },
    { title: '占比', dataIndex: 'percent', render: (v: number) => `${v.toFixed(1)}%` },
    { title: '平均延迟', dataIndex: 'avg_latency_ms', render: (v: number) => `${v}ms` },
  ];

  const userColumns: ColumnsType<TopUser> = [
    { title: '用户名', dataIndex: 'username' },
    { title: '邮箱', dataIndex: 'email', ellipsis: true },
    { title: '调用次数', dataIndex: 'calls', render: (v: number) => v.toLocaleString() },
    { title: 'Token 消耗', dataIndex: 'tokens', render: (v: number) => v.toLocaleString() },
  ];

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>使用监控</Title>
        <Select
          value={hours}
          onChange={setHours}
          style={{ width: 120 }}
          options={[
            { label: '最近 1 小时', value: 1 },
            { label: '最近 6 小时', value: 6 },
            { label: '最近 24 小时', value: 24 },
            { label: '最近 7 天', value: 168 },
          ]}
        />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card title="模型调用分布">
            <Table<ModelStat> columns={modelColumns} dataSource={modelStats} rowKey="model_id" pagination={false} size="small" />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Top 10 用户">
            <Table<TopUser> columns={userColumns} dataSource={topUsers} rowKey="user_id" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>

      <Card title={`最近 ${hours} 小时错误日志`}>
        <Table<ErrorLog>
          columns={errorColumns}
          dataSource={errors}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>
    </div>
  );
};

export default MonitoringPage;

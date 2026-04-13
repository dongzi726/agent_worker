import React, { useEffect, useState } from 'react';
import { Layout, Typography, Button, message, Spin, Table, Card, Space, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiClient from '../api';

const { Title } = Typography;
const { Content } = Layout;

interface MyKey {
  key_id: string;
  key_prefix: string;
  label: string;
  status: string;
  quota_tokens: number;
  used_tokens: number;
  remaining_tokens: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  active: 'green',
  pending: 'orange',
  disabled: 'red',
  rejected: 'default',
};

const UserKeysPage: React.FC = () => {
  const [keys, setKeys] = useState<MyKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKeyVisible, setNewKeyVisible] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [label, setLabel] = useState('');

  const fetchKeys = () => {
    setLoading(true);
    apiClient
      .get('/user/keys')
      .then((res) => setKeys(res.data.data.keys))
      .catch(() => message.error('获取 Key 列表失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchKeys(); }, []);

  const createKey = async () => {
    if (!label.trim()) {
      message.warning('请输入 Key 标签');
      return;
    }
    try {
      const res = await apiClient.post('/user/keys', { label: label.trim() });
      setNewKeyValue(res.data.data.key_value);
      setNewKeyVisible(true);
      setLabel('');
      fetchKeys();
      message.success('Key 创建成功，请妥善保存');
    } catch {
      message.error('创建 Key 失败');
    }
  };

  const disableKey = async (keyId: string) => {
    try {
      await apiClient.put(`/user/keys/${keyId}/status`, { status: 'disabled' });
      message.success('Key 已禁用');
      fetchKeys();
    } catch {
      message.error('操作失败');
    }
  };

  const enableKey = async (keyId: string) => {
    try {
      await apiClient.put(`/user/keys/${keyId}/status`, { status: 'active' });
      message.success('Key 已启用');
      fetchKeys();
    } catch {
      message.error('操作失败');
    }
  };

  const columns: ColumnsType<MyKey> = [
    { title: 'Key ID', dataIndex: 'key_id', ellipsis: true, width: 220, render: (v: string) => v.slice(0, 12) + '...' },
    { title: '前缀', dataIndex: 'key_prefix', width: 120 },
    { title: '标签', dataIndex: 'label', width: 120 },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: string) => <Tag color={statusColors[s] || 'default'}>{s}</Tag>,
      width: 90,
    },
    { title: '配额', dataIndex: 'quota_tokens', width: 100, render: (v: number) => v > 0 ? v.toLocaleString() : '无限制' },
    { title: '已用', dataIndex: 'used_tokens', width: 100, render: (v: number) => v.toLocaleString() },
    { title: '剩余', dataIndex: 'remaining_tokens', width: 100, render: (v: number) => v.toLocaleString() },
    { title: '创建时间', dataIndex: 'created_at', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: MyKey) => (
        <Space>
          {record.status === 'active' && (
            <Button size="small" danger onClick={() => disableKey(record.key_id)}>禁用</Button>
          )}
          {record.status === 'disabled' && (
            <Button size="small" type="primary" onClick={() => enableKey(record.key_id)}>启用</Button>
          )}
          {record.status === 'pending' && (
            <Tag>待审核</Tag>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Layout.Header style={{ background: '#001529', display: 'flex', alignItems: 'center' }}>
        <Title level={4} style={{ color: '#fff', margin: 0 }}>TokenMerge — 用户自助服务</Title>
      </Layout.Header>
      <Content style={{ margin: 24, padding: 24 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <Title level={3} style={{ margin: 0 }}>我的 API Keys</Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchKeys}>刷新</Button>
            </Space>
          </div>
          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <input
              placeholder="Key 标签"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid #d9d9d9', borderRadius: 4, width: 200 }}
              onKeyDown={(e) => e.key === 'Enter' && createKey()}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={createKey}>
              申请新 Key
            </Button>
          </div>
          <Table<MyKey> columns={columns} dataSource={keys} rowKey="key_id" loading={loading} pagination={false} />
        </Card>

        <Card title="新建 Key" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="输入 Key 标签"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ padding: '6px 12px', border: '1px solid #d9d9d9', borderRadius: 4, flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && createKey()}
            />
            <Button type="primary" onClick={createKey}>创建</Button>
          </div>
          {newKeyValue && (
            <div style={{ marginTop: 12, padding: 12, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4 }}>
              <p style={{ margin: '0 0 4px', color: '#52c41a', fontWeight: 'bold' }}>✅ 创建成功！请立即复制保存：</p>
              <code style={{ fontSize: 14, wordBreak: 'break-all' }}>{newKeyValue}</code>
            </div>
          )}
        </Card>
      </Content>
    </Layout>
  );
};

export default UserKeysPage;

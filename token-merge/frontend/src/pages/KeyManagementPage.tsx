import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, InputNumber, Select, message, Typography, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiClient from '../../api';

const { Title } = Typography;

interface ApiKey {
  key_id: string;
  user_id: number;
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

const KeyManagementPage: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [currentKeyId, setCurrentKeyId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchKeys = () => {
    setLoading(true);
    const params: Record<string, any> = { page, limit: pageSize };
    if (statusFilter) params.status = statusFilter;
    if (searchText) params.search = searchText;

    apiClient
      .get('/admin/keys', { params })
      .then((res) => {
        setKeys(res.data.data.keys);
        setTotal(res.data.data.total);
      })
      .catch(() => message.error('获取 Key 列表失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchKeys(); }, [page, pageSize, statusFilter]);

  const handleSearch = () => { setPage(1); fetchKeys(); };

  const handleStatusChange = async (keyId: string, status: string) => {
    try {
      await apiClient.put(`/admin/keys/${keyId}/status`, { status });
      message.success('Key 状态已更新');
      fetchKeys();
    } catch {
      message.error('更新状态失败');
    }
  };

  const handleApprove = async (keyId: string, approved: boolean) => {
    try {
      await apiClient.put(`/admin/keys/${keyId}/approve`, { approved });
      message.success(approved ? 'Key 已批准' : 'Key 已拒绝');
      fetchKeys();
    } catch {
      message.error('操作失败');
    }
  };

  const openQuotaModal = (keyId: string, currentQuota: number) => {
    setCurrentKeyId(keyId);
    form.setFieldsValue({ quota_tokens: currentQuota });
    setQuotaModalOpen(true);
  };

  const handleQuotaSubmit = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.put(`/admin/keys/${currentKeyId}/quota`, { quota_tokens: values.quota_tokens });
      message.success('配额已更新');
      setQuotaModalOpen(false);
      fetchKeys();
    } catch {
      message.error('更新配额失败');
    }
  };

  const columns: ColumnsType<ApiKey> = [
    { title: 'Key ID', dataIndex: 'key_id', ellipsis: true, width: 200, render: (v: string) => v.slice(0, 8) + '...' },
    { title: '前缀', dataIndex: 'key_prefix', width: 100 },
    { title: '标签', dataIndex: 'label', width: 120 },
    { title: '用户', dataIndex: 'user_id', width: 80 },
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
      width: 240,
      render: (_: any, record: ApiKey) => (
        <Space>
          {record.status === 'pending' && (
            <>
              <Button size="small" type="primary" onClick={() => handleApprove(record.key_id, true)}>批准</Button>
              <Button size="small" danger onClick={() => handleApprove(record.key_id, false)}>拒绝</Button>
            </>
          )}
          {record.status === 'active' && (
            <Button size="small" danger onClick={() => handleStatusChange(record.key_id, 'disabled')}>禁用</Button>
          )}
          {record.status === 'disabled' && (
            <Button size="small" onClick={() => handleStatusChange(record.key_id, 'active')}>启用</Button>
          )}
          <Button size="small" onClick={() => openQuotaModal(record.key_id, record.quota_tokens)}>配额</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Key 管理</Title>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索 Key 前缀/标签"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 200 }}
          prefix={<SearchOutlined />}
        />
        <Select
          style={{ width: 120 }}
          placeholder="状态"
          allowClear
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: '活跃', value: 'active' },
            { label: '待审核', value: 'pending' },
            { label: '已禁用', value: 'disabled' },
          ]}
        />
        <Button type="primary" onClick={handleSearch}>搜索</Button>
      </Space>

      <Table<ApiKey>
        columns={columns}
        dataSource={keys}
        rowKey="key_id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      <Modal
        title="调整 Key 配额"
        open={quotaModalOpen}
        onOk={handleQuotaSubmit}
        onCancel={() => setQuotaModalOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="quota_tokens" label="Token 配额（0 = 无限制）" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default KeyManagementPage;

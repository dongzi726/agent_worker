import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, InputNumber, Select, message, Typography, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiClient from '../api.js';

const { Title } = Typography;

interface User {
  user_id: number;
  email: string;
  username: string;
  status: string;
  role: string;
  quota_tokens: number;
  used_tokens: number;
  key_count: number;
  created_at: string;
}

const statusColors: Record<string, string> = {
  active: 'green',
  pending: 'orange',
  banned: 'red',
  rejected: 'default',
};

const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [modalType, setModalType] = useState<'quota' | 'status'>('status');
  const [form] = Form.useForm();

  const fetchUsers = () => {
    setLoading(true);
    const params: Record<string, any> = { page, limit: pageSize };
    if (statusFilter) params.status = statusFilter;
    if (searchText) params.search = searchText;

    apiClient
      .get('/admin/users', { params })
      .then((res) => {
        setUsers(res.data.data.users);
        setTotal(res.data.data.total);
      })
      .catch(() => message.error('获取用户列表失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, [page, pageSize, statusFilter]);

  const handleSearch = () => { setPage(1); fetchUsers(); };

  const handleStatusChange = async (userId: number, status: string) => {
    try {
      await apiClient.put(`/admin/users/${userId}/status`, { status });
      message.success(`用户状态已更新为 ${status}`);
      fetchUsers();
    } catch {
      message.error('更新状态失败');
    }
  };

  const openQuotaModal = (userId: number, currentQuota: number) => {
    setCurrentUserId(userId);
    setModalType('quota');
    form.setFieldsValue({ quota_tokens: currentQuota });
    setModalOpen(true);
  };

  const handleQuotaSubmit = async () => {
    const values = await form.validateFields();
    try {
      await apiClient.put(`/admin/users/${currentUserId}/quota`, { quota_tokens: values.quota_tokens });
      message.success('配额已更新');
      setModalOpen(false);
      fetchUsers();
    } catch {
      message.error('更新配额失败');
    }
  };

  const columns: ColumnsType<User> = [
    { title: 'ID', dataIndex: 'user_id', width: 70 },
    { title: '用户名', dataIndex: 'username' },
    { title: '邮箱', dataIndex: 'email', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      render: (s: string) => <Tag color={statusColors[s] || 'default'}>{s}</Tag>,
      width: 100,
    },
    { title: '角色', dataIndex: 'role', width: 80 },
    { title: '配额', dataIndex: 'quota_tokens', width: 120, render: (v: number) => v.toLocaleString() },
    { title: '已用', dataIndex: 'used_tokens', width: 120, render: (v: number) => v.toLocaleString() },
    { title: 'Keys', dataIndex: 'key_count', width: 70 },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: any, record: User) => (
        <Space>
          {record.status === 'pending' && (
            <Button size="small" type="primary" onClick={() => handleStatusChange(record.user_id, 'active')}>
              通过
            </Button>
          )}
          {record.status !== 'banned' && record.status !== 'pending' && (
            <Button size="small" danger onClick={() => handleStatusChange(record.user_id, 'banned')}>
              封禁
            </Button>
          )}
          {record.status === 'banned' && (
            <Button size="small" onClick={() => handleStatusChange(record.user_id, 'active')}>
              解封
            </Button>
          )}
          <Button size="small" onClick={() => openQuotaModal(record.user_id, record.quota_tokens)}>
            配额
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>用户管理</Title>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索邮箱/用户名"
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
            { label: '已封禁', value: 'banned' },
          ]}
        />
        <Button type="primary" onClick={handleSearch}>搜索</Button>
      </Space>

      <Table<User>
        columns={columns}
        dataSource={users}
        rowKey="user_id"
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
        title="调整配额"
        open={modalOpen && modalType === 'quota'}
        onOk={handleQuotaSubmit}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="quota_tokens" label="Token 配额" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagementPage;

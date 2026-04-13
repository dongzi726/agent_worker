import React, { useEffect, useState } from 'react';
import {
  Table,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  message,
  Typography,
  Card,
  Popconfirm,
  Divider,
} from 'antd';
import { SearchOutlined, CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import request from '../../api/request';
import type { AdminUser } from '../../types';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { Option } = Select;

interface PaginatedUsers {
  total: number;
  page: number;
  limit: number;
  users: AdminUser[];
}

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待审核' },
  active: { color: 'green', label: '正常' },
  banned: { color: 'red', label: '已封禁' },
};

const roleMap: Record<string, { color: string; label: string }> = {
  admin: { color: 'magenta', label: '管理员' },
  user: { color: 'blue', label: '普通用户' },
};

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  // Modals
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditTarget, setAuditTarget] = useState<AdminUser | null>(null);
  const [auditForm] = Form.useForm<{ status: 'active' | 'banned'; reason?: string }>();

  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaTarget, setQuotaTarget] = useState<AdminUser | null>(null);
  const [quotaForm] = Form.useForm<{ quota_tokens: number; reason?: string }>();

  useEffect(() => {
    fetchUsers();
  }, [page, limit, statusFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const res = await request.get<{ data: PaginatedUsers }>('/admin/users', { params });
      setUsers(res.data.data.users);
      setTotal(res.data.data.total);
    } catch (e: any) {
      message.error(e.response?.data?.message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchUsers();
  };

  const handleAudit = async (values: { status: 'active' | 'banned'; reason?: string }) => {
    if (!auditTarget) return;
    try {
      await request.put(`/admin/users/${auditTarget.user_id}/status`, values);
      message.success(`用户 ${auditTarget.username} 已设为 ${statusMap[values.status]?.label}`);
      setAuditModalOpen(false);
      auditForm.resetFields();
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const handleQuota = async (values: { quota_tokens: number; reason?: string }) => {
    if (!quotaTarget) return;
    try {
      await request.put(`/admin/users/${quotaTarget.user_id}/quota`, values);
      message.success(`用户 ${quotaTarget.username} 配额已调整为 ${values.quota_tokens.toLocaleString()}`);
      setQuotaModalOpen(false);
      quotaForm.resetFields();
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '调整配额失败');
    }
  };

  const handleToggleBan = async (user: AdminUser) => {
    const newStatus = user.status === 'banned' ? 'active' : 'banned';
    try {
      await request.put(`/admin/users/${user.user_id}/status`, {
        status: newStatus,
        reason: newStatus === 'banned' ? '管理员手动封禁' : '管理员手动解封',
      });
      message.success(`用户 ${user.username} 已${newStatus === 'banned' ? '封禁' : '解封'}`);
      fetchUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户ID',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 80,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 140,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string) => (
        <Tag color={roleMap[role]?.color || 'default'}>{roleMap[role]?.label || role}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={statusMap[status]?.color || 'default'}>{statusMap[status]?.label || status}</Tag>
      ),
    },
    {
      title: '配额',
      dataIndex: 'quota_tokens',
      key: 'quota_tokens',
      width: 120,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '已用',
      dataIndex: 'used_tokens',
      key: 'used_tokens',
      width: 120,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: 'Key 数',
      dataIndex: 'key_count',
      key: 'key_count',
      width: 80,
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_: any, record: AdminUser) => (
        <Space wrap>
          {record.status === 'pending' && (
            <>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => {
                  setAuditTarget(record);
                  auditForm.setFieldsValue({ status: 'active' });
                  setAuditModalOpen(true);
                }}
              >
                通过
              </Button>
              <Button
                danger
                size="small"
                icon={<CloseOutlined />}
                onClick={() => {
                  setAuditTarget(record);
                  auditForm.setFieldsValue({ status: 'banned' });
                  setAuditModalOpen(true);
                }}
              >
                拒绝
              </Button>
            </>
          )}
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setQuotaTarget(record);
              quotaForm.setFieldsValue({ quota_tokens: record.quota_tokens, reason: '' });
              setQuotaModalOpen(true);
            }}
          >
            配额
          </Button>
          {record.status === 'active' && (
            <Popconfirm
              title="确认封禁此用户？"
              onConfirm={() => handleToggleBan(record)}
              okText="确认"
              cancelText="取消"
            >
              <Button danger size="small">
                封禁
              </Button>
            </Popconfirm>
          )}
          {record.status === 'banned' && (
            <Popconfirm
              title="确认解封此用户？"
              onConfirm={() => handleToggleBan(record)}
              okText="确认"
              cancelText="取消"
            >
              <Button type="primary" size="small">
                解封
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>用户管理</Title>

      {/* 搜索/筛选 */}
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="搜索邮箱或用户名"
            allowClear
            style={{ width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            prefix={<SearchOutlined />}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <Option value="pending">待审核</Option>
            <Option value="active">正常</Option>
            <Option value="banned">已封禁</Option>
          </Select>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            搜索
          </Button>
        </Space>
      </Card>

      {/* 用户表格 */}
      <Table<AdminUser>
        columns={columns}
        dataSource={users}
        rowKey="user_id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (p, l) => {
            setPage(p);
            setLimit(l);
          },
        }}
      />

      {/* 审核 Modal */}
      <Modal
        title="审核用户"
        open={auditModalOpen}
        onCancel={() => {
          setAuditModalOpen(false);
          auditForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={auditForm} layout="vertical" onFinish={handleAudit}>
          <Form.Item
            name="status"
            label="操作"
            rules={[{ required: true, message: '请选择操作' }]}
          >
            <Select>
              <Option value="active">审核通过</Option>
              <Option value="banned">拒绝/封禁</Option>
            </Select>
          </Form.Item>
          <Form.Item name="reason" label="原因">
            <Input.TextArea rows={3} placeholder="选填，说明操作原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setAuditModalOpen(false); auditForm.resetFields(); }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确认
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 调整配额 Modal */}
      <Modal
        title="调整用户配额"
        open={quotaModalOpen}
        onCancel={() => {
          setQuotaModalOpen(false);
          quotaForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <p>
          用户：<b>{quotaTarget?.username}</b>，当前配额：{quotaTarget?.quota_tokens.toLocaleString()}
        </p>
        <Form form={quotaForm} layout="vertical" onFinish={handleQuota}>
          <Form.Item
            name="quota_tokens"
            label="新配额 (tokens)"
            rules={[
              { required: true, message: '请输入配额' },
              { type: 'number', min: 0, message: '配额必须大于等于 0' },
            ]}
          >
            <Input type="number" placeholder="请输入新的配额总量" />
          </Form.Item>
          <Form.Item name="reason" label="调整原因">
            <Input.TextArea rows={3} placeholder="选填，说明调整原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setQuotaModalOpen(false); quotaForm.resetFields(); }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确认调整
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;

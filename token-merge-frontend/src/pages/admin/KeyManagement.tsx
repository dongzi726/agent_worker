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
} from 'antd';
import { SearchOutlined, CheckOutlined, CloseOutlined, StopOutlined } from '@ant-design/icons';
import request from '../../api/request';
import type { AdminKey } from '../../types';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { Option } = Select;

interface PaginatedKeys {
  total: number;
  page: number;
  limit: number;
  keys: AdminKey[];
}

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'orange', label: '待审核' },
  active: { color: 'green', label: '正常' },
  disabled: { color: 'default', label: '已禁用' },
  expired: { color: 'red', label: '已过期' },
};

const KeyManagement: React.FC = () => {
  const [keys, setKeys] = useState<AdminKey[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  // Approve Modal
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<AdminKey | null>(null);
  const [approveForm] = Form.useForm<{ approved: boolean; quota_tokens?: number; reject_reason?: string }>();

  useEffect(() => {
    fetchKeys();
  }, [page, limit, statusFilter]);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const res = await request.get<{ data: PaginatedKeys }>('/admin/keys', { params });
      setKeys(res.data.data.keys);
      setTotal(res.data.data.total);
    } catch (e: any) {
      message.error(e.response?.data?.message || '获取 Key 列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchKeys();
  };

  const handleApprove = async (values: { approved: boolean; quota_tokens?: number; reject_reason?: string }) => {
    if (!approveTarget) return;
    try {
      await request.put(`/admin/keys/${approveTarget.key_id}/approve`, values);
      message.success(values.approved ? 'Key 审核通过' : 'Key 已拒绝');
      setApproveModalOpen(false);
      approveForm.resetFields();
      fetchKeys();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const handleToggleStatus = async (key: AdminKey) => {
    const newStatus = key.status === 'disabled' ? 'active' : 'disabled';
    try {
      await request.put(`/admin/keys/${key.key_id}/status`, { status: newStatus });
      message.success(`Key 已${newStatus === 'active' ? '启用' : '禁用'}`);
      fetchKeys();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const columns: ColumnsType<AdminKey> = [
    {
      title: 'Key 前缀',
      dataIndex: 'key_prefix',
      key: 'key_prefix',
      width: 180,
      copyable: true,
    },
    {
      title: '标签',
      dataIndex: 'label',
      key: 'label',
      ellipsis: true,
    },
    {
      title: '所属用户',
      dataIndex: 'username',
      key: 'username',
      width: 140,
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
      title: '过期时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 180,
      render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '永不过期',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: AdminKey) => (
        <Space wrap>
          {record.status === 'pending' && (
            <>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => {
                  setApproveTarget(record);
                  approveForm.setFieldsValue({ approved: true });
                  setApproveModalOpen(true);
                }}
              >
                通过
              </Button>
              <Button
                danger
                size="small"
                icon={<CloseOutlined />}
                onClick={() => {
                  setApproveTarget(record);
                  approveForm.setFieldsValue({ approved: false });
                  setApproveModalOpen(true);
                }}
              >
                拒绝
              </Button>
            </>
          )}
          {(record.status === 'active' || record.status === 'disabled') && (
            <Popconfirm
              title={`确认${record.status === 'active' ? '禁用' : '启用'}此 Key？`}
              onConfirm={() => handleToggleStatus(record)}
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                type={record.status === 'active' ? 'default' : 'primary'}
                danger={record.status === 'active'}
                icon={<StopOutlined />}
              >
                {record.status === 'active' ? '禁用' : '启用'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>Key 管理</Title>

      {/* 搜索/筛选 */}
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="搜索 Key 前缀或标签"
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
            <Option value="disabled">已禁用</Option>
            <Option value="expired">已过期</Option>
          </Select>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            搜索
          </Button>
        </Space>
      </Card>

      {/* Key 表格 */}
      <Table<AdminKey>
        columns={columns}
        dataSource={keys}
        rowKey="key_id"
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
        title="审核 API Key"
        open={approveModalOpen}
        onCancel={() => {
          setApproveModalOpen(false);
          approveForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <p>
          Key: <b>{approveTarget?.key_prefix}</b>，用户: {approveTarget?.username}
        </p>
        <Form form={approveForm} layout="vertical" onFinish={handleApprove}>
          <Form.Item
            name="approved"
            label="审核结果"
            rules={[{ required: true, message: '请选择审核结果' }]}
          >
            <Select>
              <Option value={true}>审核通过</Option>
              <Option value={false}>拒绝</Option>
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.approved !== curr.approved}
          >
            {({ getFieldValue }) =>
              getFieldValue('approved') === true ? (
                <Form.Item name="quota_tokens" label="分配配额 (tokens)">
                  <Input type="number" placeholder="输入配额总量" />
                </Form.Item>
              ) : (
                <Form.Item name="reject_reason" label="拒绝原因">
                  <Input.TextArea rows={3} placeholder="选填" />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setApproveModalOpen(false); approveForm.resetFields(); }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                确认
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default KeyManagement;

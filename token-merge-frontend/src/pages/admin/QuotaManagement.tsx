import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, InputNumber, Space, message, Popconfirm, Tag, Typography, Collapse } from 'antd';
import { ResetOutlined, EditOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/admin';

const { Title } = Typography;

export const QuotaManagement: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [vendorGroups, setVendorGroups] = useState<any[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => { loadQuota(); }, []);

  const loadQuota = async () => {
    setLoading(true);
    try {
      const { data: resp } = await adminApi.getQuota();
      if (resp.code === 0 && resp.data) {
        setData(resp.data.models || []);
        setVendorGroups(resp.data.vendors || []);
      }
    } catch {
      message.error('加载配额数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = async (values: { total_tokens: number }) => {
    try {
      await adminApi.adjustQuota(editingModel.id, values.total_tokens);
      message.success('配额调整成功');
      setEditModalOpen(false);
      form.resetFields();
      loadQuota();
    } catch {
      message.error('调整配额失败');
    }
  };

  const handleReset = async (modelId: string) => {
    try {
      await adminApi.resetUsage(modelId);
      message.success('用量已重置');
      loadQuota();
    } catch {
      message.error('重置用量失败');
    }
  };

  const statusColor: Record<string, string> = { active: 'green', disabled: 'red' };

  const columns = [
    { title: '模型 ID', dataIndex: 'id', key: 'id', width: 180 },
    { title: '模型名称', dataIndex: 'name', key: 'name', width: 150 },
    { title: '供应商', dataIndex: 'vendor_id', key: 'vendor_id', width: 120 },
    { title: '总配额', dataIndex: 'total_tokens', key: 'total_tokens', render: (v: number) => v.toLocaleString() },
    { title: '已用', dataIndex: 'used_tokens', key: 'used_tokens', render: (v: number) => v.toLocaleString() },
    {
      title: '剩余', dataIndex: 'remaining_tokens', key: 'remaining_tokens',
      render: (v: number) => <span style={{ color: v < 10000 ? '#ff4d4f' : '#3f8600', fontWeight: 'bold' }}>{v.toLocaleString()}</span>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={statusColor[v] || 'default'}>{v}</Tag>,
    },
    { title: '调用次数', dataIndex: 'call_count', key: 'call_count', render: (v: number) => v.toLocaleString() },
    {
      title: '操作', key: 'action', width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingModel(record); setEditModalOpen(true); }}>调整</Button>
          <Popconfirm title="确认重置此模型的已用 tokens？" onConfirm={() => handleReset(record.id)}>
            <Button size="small" icon={<ResetOutlined />}>重置</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>配额管理</Title>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} scroll={{ x: 1200 }} />

      <Modal title={`调整配额 — ${editingModel?.id}`} open={editModalOpen} onCancel={() => setEditModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} onFinish={handleAdjust} initialValues={{ total_tokens: editingModel?.total_tokens }}>
          <Form.Item name="total_tokens" label="总 Token 配额" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={editingModel?.used_tokens || 1} placeholder="新的总配额" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Space, message, Typography, Popconfirm } from 'antd';
import { adminApi } from '../../api/admin';

const { Title } = Typography;

const statusColor: Record<string, string> = { pending: 'blue', approved: 'green', rejected: 'red' };

export const Applications: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewingApp, setReviewingApp] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => { loadApplications(); }, []);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const { data: resp } = await adminApi.getApplications(1, 100);
      if (resp.code === 0 && resp.data?.applications) setData(resp.data.applications);
    } catch {
      // Mock data if API not available
      setData([
        { application_id: 'app_001', username: 'zhangsan', purpose: '用于内部测试环境', preferred_vendors: ['qwen'], status: 'pending', created_at: '2026-04-12T10:00:00Z' },
        { application_id: 'app_002', username: 'lisi', purpose: '生产环境调用', preferred_vendors: ['glm', 'minimax'], status: 'pending', created_at: '2026-04-11T15:00:00Z' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (values: { status: string; reject_reason?: string }) => {
    try {
      await adminApi.reviewApplication(reviewingApp.application_id, values.status, values.reject_reason);
      message.success('审核完成');
      setReviewModalOpen(false);
      form.resetFields();
      loadApplications();
    } catch {
      message.error('审核失败');
    }
  };

  const columns = [
    { title: '申请 ID', dataIndex: 'application_id', key: 'application_id', width: 120 },
    { title: '申请人', dataIndex: 'username', key: 'username', width: 100 },
    { title: '用途', dataIndex: 'purpose', key: 'purpose', ellipsis: true },
    {
      title: '期望供应商', dataIndex: 'preferred_vendors', key: 'preferred_vendors', width: 200,
      render: (v: string[]) => v?.map((vendor) => <Tag key={vendor}>{vendor}</Tag>),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={statusColor[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: any, record: any) => (
        record.status === 'pending' ? (
          <Button size="small" type="primary" onClick={() => { setReviewingApp(record); setReviewModalOpen(true); }}>审核</Button>
        ) : '-'
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>Key 申请审核</Title>
      <Table columns={columns} dataSource={data} rowKey="application_id" loading={loading} />

      <Modal
        title={`审核申请 — ${reviewingApp?.username}`}
        open={reviewModalOpen}
        onCancel={() => setReviewModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} onFinish={handleReview} layout="vertical">
          <Form.Item name="status" label="审核结果" rules={[{ required: true }]}>
            <Select options={[{ label: '通过', value: 'approved' }, { label: '拒绝', value: 'rejected' }]} />
          </Form.Item>
          <Form.Item name="reject_reason" label="拒绝原因" hidden={form.getFieldValue('status') !== 'rejected'}>
            <Input.TextArea placeholder="请输入拒绝原因" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

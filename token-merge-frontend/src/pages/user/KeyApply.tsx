import React, { useState } from 'react';
import { Form, Input, Select, Button, Card, Typography, message, Result } from 'antd';
import { userApi } from '../../api/user';

const { Title, Text } = Typography;

const vendorOptions = [
  { label: '通义千问 (Qwen)', value: 'qwen' },
  { label: '智谱 (GLM)', value: 'glm' },
  { label: 'MiniMax', value: 'minimax' },
];

export const KeyApply: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values: { purpose: string; preferred_vendors: string[] }) => {
    setLoading(true);
    try {
      await userApi.applyKey(values.purpose, values.preferred_vendors);
      message.success('申请已提交，请等待审核');
      setSubmitted(true);
    } catch {
      message.error('申请提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Result
        status="success"
        title="申请已提交"
        subTitle="管理员审核通过后，您可以在「我的 Key」页面查看"
        extra={[
          <Button type="primary" key="keys" href="/user/keys">查看我的 Key</Button>,
          <Button key="new" onClick={() => { setSubmitted(false); form.resetFields(); }}>再次申请</Button>,
        ]}
      />
    );
  }

  return (
    <div>
      <Title level={4}>申请 API Key</Title>
      <Card>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          请填写申请信息，管理员审核通过后将为您分配 API Key。每位用户最多可同时持有 3 个活跃 Key。
        </Text>
        <Form form={form} onFinish={onFinish} layout="vertical" style={{ maxWidth: 500 }}>
          <Form.Item name="preferred_vendors" label="期望供应商" rules={[{ required: true, message: '请选择至少一个供应商' }]}>
            <Select mode="multiple" options={vendorOptions} placeholder="选择供应商" />
          </Form.Item>
          <Form.Item name="purpose" label="用途描述" rules={[
            { required: true, message: '请填写用途描述' },
            { min: 50, max: 500, message: '50-500 字' },
          ]}>
            <Input.TextArea rows={5} placeholder="请描述您的使用场景、预计调用量等..." showCount maxLength={500} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>提交申请</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

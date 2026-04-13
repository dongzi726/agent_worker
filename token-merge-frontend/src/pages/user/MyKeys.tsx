import React, { useState, useEffect } from 'react';
import { Table, Button, Tag, Space, message, Popconfirm, Modal, Typography } from 'antd';
import { PoweroffOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons';
import { userApi } from '../../api/user';
import { maskKey, copyToClipboard } from '../../utils/mask';
import { formatDate } from '../../utils/format';

const { Title } = Typography;

const statusColor: Record<string, string> = { healthy: 'green', disabled: 'red' };

export const MyKeys: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => { loadKeys(); }, []);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const { data: resp } = await userApi.getMyKeys();
      if (resp.code === 0 && resp.data?.keys) setData(resp.data.keys);
    } catch {
      // Mock data
      setData([
        {
          key_id: 'key_user_001',
          vendor_id: 'qwen',
          label: 'my-production-key',
          masked_value: 'sk-qw****xxxx',
          status: 'healthy',
          created_at: '2026-04-10T10:00:00Z',
          last_used_at: '2026-04-12T17:30:00Z',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleStatus = async (keyId: string, status: 'healthy' | 'disabled') => {
    try {
      await userApi.updateKeyStatus(keyId, status);
      message.success(`Key 已${status === 'healthy' ? '启用' : '禁用'}`);
      loadKeys();
    } catch {
      message.error('操作失败');
    }
  };

  const handleReset = async (keyId: string) => {
    try {
      await userApi.resetKey(keyId);
      message.success('Key 已重新生成，请妥善保存新 Key');
      loadKeys();
    } catch {
      message.error('重置失败');
    }
  };

  const handleCopy = async (keyId: string) => {
    try {
      const { data: resp } = await userApi.getKeyDetail(keyId);
      if (resp.code === 0) {
        const ok = await copyToClipboard(resp.data?.key_id || '');
        if (ok) message.success('已复制到剪贴板');
        else message.error('复制失败');
      }
    } catch {
      Modal.warning({ title: '提示', content: '请先联系管理员获取完整 Key' });
    }
  };

  const columns = [
    { title: 'Key ID', dataIndex: 'key_id', key: 'key_id', width: 200 },
    { title: '供应商', dataIndex: 'vendor_id', key: 'vendor_id', width: 100 },
    { title: '标签', dataIndex: 'label', key: 'label', width: 150 },
    { title: 'Key 值', dataIndex: 'masked_value', key: 'masked_value', width: 160, render: (v: string) => maskKey(v || 'sk-xxxx') },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={statusColor[v] || 'default'}>{v}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180, render: formatDate },
    { title: '最后使用', dataIndex: 'last_used_at', key: 'last_used_at', width: 180, render: formatDate },
    {
      title: '操作', key: 'action', width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(record.key_id)} />
          {record.status === 'disabled' ? (
            <Button size="small" type="primary" icon={<PoweroffOutlined />} onClick={() => handleStatus(record.key_id, 'healthy')}>启用</Button>
          ) : (
            <Popconfirm title="确认禁用此 Key?" onConfirm={() => handleStatus(record.key_id, 'disabled')}>
              <Button size="small" danger icon={<PoweroffOutlined />}>禁用</Button>
            </Popconfirm>
          )}
          <Popconfirm title="确认重置此 Key？旧 Key 将失效" onConfirm={() => handleReset(record.key_id)}>
            <Button size="small" icon={<ReloadOutlined />}>重置</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>我的 Key</Title>
      <Table columns={columns} dataSource={data} rowKey="key_id" loading={loading} />
    </div>
  );
};

export default MyKeys;

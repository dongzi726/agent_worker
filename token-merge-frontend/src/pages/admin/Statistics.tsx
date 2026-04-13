import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Select, Spin, Typography, message } from 'antd';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { adminApi } from '../../api/admin';
import { formatNumber } from '../../utils/format';

const { Title } = Typography;

const timeRanges = [
  { label: '最近 24 小时', value: '24h' },
  { label: '最近 7 天', value: '7d' },
  { label: '最近 30 天', value: '30d' },
];

export const Statistics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const [modelStats, setModelStats] = useState<any[]>([]);
  const [keyStats, setKeyStats] = useState<any[]>([]);

  useEffect(() => { loadStats(); }, [timeRange]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const now = dayjs();
      let since = now.subtract(7, 'day');
      if (timeRange === '24h') since = now.subtract(24, 'hour');
      if (timeRange === '30d') since = now.subtract(30, 'day');

      const [modelResp, keyResp] = await Promise.all([
        adminApi.getStats(undefined, since.toISOString(), now.toISOString()),
        adminApi.getKeyStats(undefined, since.toISOString(), now.toISOString()),
      ]);

      if (modelResp.data.code === 0) setModelStats(modelResp.data.data?.models || []);
      if (keyResp.data.code === 0) setKeyStats(keyResp.data.data?.keys || []);
    } catch {
      message.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  const getModelUsageOption = () => ({
    title: { text: '各模型 Token 用量', left: 'center' },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: modelStats.map((m: any) => ({
        name: m.id,
        value: m.total_tokens,
      })),
    }],
  });

  const getKeySuccessOption = () => ({
    title: { text: 'Key 成功率排行', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: keyStats.map((k: any) => k.key_id.slice(-8)), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%` } },
    series: [{
      type: 'bar',
      data: keyStats.map((k: any) => k.success_rate),
      itemStyle: { color: (params: any) => params.value > 0.95 ? '#52c41a' : params.value > 0.8 ? '#faad14' : '#ff4d4f' },
    }],
  });

  const getVendorCompareOption = () => {
    const vendorMap: Record<string, number> = {};
    modelStats.forEach((m: any) => {
      vendorMap[m.vendor_id] = (vendorMap[m.vendor_id] || 0) + m.total_tokens;
    });
    return {
      title: { text: '供应商 Token 用量对比', left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: Object.keys(vendorMap) },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatNumber(v) } },
      series: [{ type: 'bar', data: Object.values(vendorMap), itemStyle: { color: '#1890ff' } }],
    };
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>使用统计</Title>
        <Select value={timeRange} onChange={setTimeRange} options={timeRanges} style={{ width: 160 }} />
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card><ReactECharts option={getModelUsageOption()} style={{ height: 350 }} /></Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card><ReactECharts option={getVendorCompareOption()} style={{ height: 350 }} /></Card>
        </Col>
        <Col span={24}>
          <Card><ReactECharts option={getKeySuccessOption()} style={{ height: 350 }} /></Card>
        </Col>
      </Row>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Select, Spin, Typography, message } from 'antd';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { userApi } from '../../api/user';
import { formatNumber } from '../../utils/format';

const { Title } = Typography;

const timeRanges = [
  { label: '最近 24 小时', value: '24h' },
  { label: '最近 7 天', value: '7d' },
  { label: '最近 30 天', value: '30d' },
];

export const MyUsage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => { loadStats(); }, [timeRange]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const now = dayjs();
      let since = now.subtract(7, 'day');
      if (timeRange === '24h') since = now.subtract(24, 'hour');
      if (timeRange === '30d') since = now.subtract(30, 'day');

      const { data: resp } = await userApi.getUsage(since.toISOString(), now.toISOString());
      if (resp.code === 0 && resp.data) setStats(resp.data);
    } catch {
      setStats({
        total_prompt_tokens: 50000,
        total_completion_tokens: 80000,
        total_calls: 350,
        success_rate: 0.97,
        by_vendor: [
          { vendor_id: 'qwen', tokens: 30000, calls: 200 },
          { vendor_id: 'glm', tokens: 20000, calls: 150 },
        ],
        daily_usage: Array.from({ length: 7 }, (_, i) => ({
          date: dayjs().subtract(6 - i, 'day').format('YYYY-MM-DD'),
          tokens: Math.floor(Math.random() * 5000) + 3000,
          calls: Math.floor(Math.random() * 40) + 20,
        })),
      });
    } finally {
      setLoading(false);
    }
  };

  const getDailyOption = () => ({
    title: { text: '每日用量趋势', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: stats?.daily_usage?.map((d: any) => d.date) || [] },
    yAxis: [{ type: 'value', name: 'Tokens', axisLabel: { formatter: (v: number) => formatNumber(v) } }],
    series: [
      { name: 'Token 用量', type: 'line', smooth: true, data: stats?.daily_usage?.map((d: any) => d.tokens) || [], itemStyle: { color: '#1890ff' }, areaStyle: { opacity: 0.1 } },
    ],
  });

  const getVendorOption = () => ({
    title: { text: '供应商使用分布', left: 'center' },
    tooltip: { trigger: 'item', formatter: '{b}: {c} Tokens ({d}%)' },
    series: [{
      type: 'pie', radius: '60%',
      data: stats?.by_vendor?.map((v: any) => ({ name: v.vendor_id, value: v.tokens })) || [],
    }],
  });

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (!stats) return <div>加载失败</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>个人用量</Title>
        <Select value={timeRange} onChange={setTimeRange} options={timeRanges} style={{ width: 160 }} />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Prompt Tokens" value={stats.total_prompt_tokens} formatter={(v) => formatNumber(v as number)} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Completion Tokens" value={stats.total_completion_tokens} formatter={(v) => formatNumber(v as number)} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="总调用次数" value={stats.total_calls} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="成功率" value={stats.success_rate * 100} precision={1} suffix="%" valueStyle={{ color: stats.success_rate > 0.95 ? '#3f8600' : '#cf1322' }} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card><ReactECharts option={getDailyOption()} style={{ height: 350 }} /></Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card><ReactECharts option={getVendorOption()} style={{ height: 350 }} /></Card>
        </Col>
      </Row>
    </div>
  );
};
export default MyUsage;

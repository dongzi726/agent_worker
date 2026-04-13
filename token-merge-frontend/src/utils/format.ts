// ============================================================
// format.ts — Date, number & duration formatting utilities
// ============================================================

/**
 * ISO 日期 → 可读格式 "YYYY-MM-DD HH:mm"
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 数字 → 千分位格式化
 */
export function formatNumber(num: number | undefined | null): string {
  if (num == null) return '-';
  return num.toLocaleString('en-US');
}

/**
 * 秒数 → 可读时长 (e.g. "3天 5小时 20分钟")
 */
export function formatUptime(seconds: number): string {
  if (seconds < 0) return '0秒';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (mins > 0) parts.push(`${mins}分钟`);
  if (parts.length === 0) parts.push(`${seconds}秒`);
  return parts.join(' ');
}

// ============================================================
// mask.ts — Key masking & clipboard utilities
// ============================================================

import { message } from 'antd';

/**
 * 掩码 API Key，格式: sk-xxxx****yyyy
 * 保留前 4 位和后 4 位可见
 */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) {
    return key.slice(0, 2) + '****' + key.slice(-2);
  }
  const visibleStart = key.slice(0, 6);  // e.g. "sk-xxx"
  const visibleEnd = key.slice(-4);
  return `${visibleStart}****${visibleEnd}`;
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  } catch {
    // fallback: 使用 textarea 方式
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
    document.body.removeChild(textarea);
  }
}

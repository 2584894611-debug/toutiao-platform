import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 大数字格式化：1234567 -> 123.5万 */
export function formatNumber(n: number): string {
  if (n >= 100_000_000) {
    return (n / 100_000_000).toFixed(2) + '亿';
  }
  if (n >= 10_000) {
    return (n / 10_000).toFixed(1) + '万';
  }
  return n.toLocaleString('zh-CN');
}

/** 货币格式化：1234.5 -> ¥1,234.5 */
export function formatMoney(n: number): string {
  return '¥' + n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

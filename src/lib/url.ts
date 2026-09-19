/** API 地址归一化：兼容用户带/不带 /v1、尾斜杠的写法（MVP 文档 §1.4） */

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export function normalizeBaseUrl(input: string): string {
  let u = input.trim()
  if (!u) return DEFAULT_BASE_URL
  u = u.replace(/\/+$/, '')
  if (/\/v\d+$/.test(u)) return u
  return u + '/v1'
}

export function apiUrl(baseUrl: string, path: string): string {
  return normalizeBaseUrl(baseUrl) + path
}

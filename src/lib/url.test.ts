import { describe, expect, it } from 'vitest'
import { apiUrl, normalizeBaseUrl } from './url'

describe('normalizeBaseUrl', () => {
  it('空值回退官方默认', () => {
    expect(normalizeBaseUrl('')).toBe('https://api.openai.com/v1')
    expect(normalizeBaseUrl('   ')).toBe('https://api.openai.com/v1')
  })

  it('补全缺失的 /v1', () => {
    expect(normalizeBaseUrl('https://api.openai.com')).toBe('https://api.openai.com/v1')
    expect(normalizeBaseUrl('https://example.com')).toBe('https://example.com/v1')
  })

  it('去掉尾斜杠', () => {
    expect(normalizeBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1')
    expect(normalizeBaseUrl('https://example.com//')).toBe('https://example.com/v1')
  })

  it('保留已带的版本号（含 v2 等变体）', () => {
    expect(normalizeBaseUrl('https://example.com/v1')).toBe('https://example.com/v1')
    expect(normalizeBaseUrl('https://example.com/v2')).toBe('https://example.com/v2')
  })

  it('保留中间路径', () => {
    expect(normalizeBaseUrl('https://x.com/openai/v1')).toBe('https://x.com/openai/v1')
    expect(normalizeBaseUrl('https://x.com/openai')).toBe('https://x.com/openai/v1')
  })
})

describe('apiUrl', () => {
  it('拼接端点路径', () => {
    expect(apiUrl('https://example.com', '/images/generations')).toBe(
      'https://example.com/v1/images/generations',
    )
  })
})

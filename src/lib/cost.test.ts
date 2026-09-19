import { describe, expect, it } from 'vitest'
import { estimateUsd, formatUsd, isRisky, validateSize } from './cost'

describe('validateSize', () => {
  it('接受合法尺寸', () => {
    expect(validateSize(1024, 1024)).toEqual([])
    expect(validateSize(1536, 1024)).toEqual([])
    expect(validateSize(1280, 768)).toEqual([])
    expect(validateSize(3840, 2160)).toEqual([])
  })

  it('拒绝不能被 16 整除的宽高', () => {
    expect(validateSize(1000, 1000)).toContain('宽高须能被 16 整除')
    expect(validateSize(1024, 1080)).toContain('宽高须能被 16 整除')
  })

  it('拒绝超比例', () => {
    expect(validateSize(3072, 1024)).toEqual([]) // 3:1 恰好合法
    expect(validateSize(4096, 1024).length).toBeGreaterThan(0) // 4:1 且超上限
  })

  it('拒绝超上限', () => {
    expect(validateSize(3856, 2160)).toContain('宽高上限 3840 × 2160')
  })
})

describe('estimateUsd', () => {
  it('1024×1024 高档约 $0.05', () => {
    const v = estimateUsd({ size: { w: 1024, h: 1024 }, quality: 'high', n: 1 })
    expect(v).toBeGreaterThan(0.04)
    expect(v).toBeLessThan(0.06)
  })

  it('随张数线性缩放', () => {
    const one = estimateUsd({ size: { w: 1024, h: 1024 }, quality: 'high', n: 1 })
    const four = estimateUsd({ size: { w: 1024, h: 1024 }, quality: 'high', n: 4 })
    expect(four).toBeCloseTo(one * 4, 5)
  })

  it('4K 成本约为 1K 的 2.5～3.5 倍', () => {
    const k1 = estimateUsd({ size: { w: 1024, h: 1024 }, quality: 'high', n: 1 })
    const k4 = estimateUsd({ size: { w: 3840, h: 2160 }, quality: 'high', n: 1 })
    const ratio = k4 / k1
    expect(ratio).toBeGreaterThan(2.5)
    expect(ratio).toBeLessThan(3.5)
  })
})

describe('isRisky', () => {
  it('最高档位始终需要确认', () => {
    expect(isRisky({ size: { w: 1024, h: 1024 }, quality: 'max' })).toBe(true)
  })

  it('任一边 ≥ 2560 需要确认', () => {
    expect(isRisky({ size: { w: 2560, h: 1440 }, quality: 'high' })).toBe(true)
    expect(isRisky({ size: { w: 1536, h: 1024 }, quality: 'high' })).toBe(false)
  })
})

describe('formatUsd', () => {
  it('小于 0.1 保留三位', () => {
    expect(formatUsd(0.05123)).toBe('$0.051')
  })
  it('大于等于 0.1 保留两位', () => {
    expect(formatUsd(1.5)).toBe('$1.50')
  })
})

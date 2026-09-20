import { describe, expect, it } from 'vitest'
import { validateSize } from './size'

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

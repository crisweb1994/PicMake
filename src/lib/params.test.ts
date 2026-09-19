import { describe, expect, it } from 'vitest'
import { DEFAULT_FORM, customOk, formSize, paramsToForm, formToParams, type GenForm } from './params'

describe('formSize', () => {
  it('比例 chip 生效时用基准像素', () => {
    const s = formSize({ ...DEFAULT_FORM, ratio: '16:9' })
    expect(s).toEqual({ w: 1792, h: 1008 })
  })

  it('auto 透传', () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: 'auto' })).toBe('auto')
  })

  it('合法自定义优先于比例', () => {
    const s = formSize({ ...DEFAULT_FORM, ratio: '1:1', cw: '1280', ch: '768' })
    expect(s).toEqual({ w: 1280, h: 768 })
  })

  it('非法自定义回退比例（生成入口另行拦截）', () => {
    const s = formSize({ ...DEFAULT_FORM, ratio: '1:1', cw: '1000', ch: '1000' })
    expect(s).toEqual({ w: 1024, h: 1024 })
  })
})

describe('customOk', () => {
  it('空值合法', () => {
    expect(customOk(DEFAULT_FORM)).toBe(true)
  })
  it('非法值被识别', () => {
    expect(customOk({ cw: '1000', ch: '1000' })).toBe(false)
    expect(customOk({ cw: '1024', ch: '' })).toBe(false)
  })
})

describe('基准分辨率', () => {
  it('1K 为基准像素', () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: '3:2', base: '1k' })).toEqual({ w: 1536, h: 1024 })
  })

  it('2K 为 1K 的两倍线性尺寸（保持 16 整除）', () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: '3:2', base: '2k' })).toEqual({ w: 3072, h: 2048 })
    expect(formSize({ ...DEFAULT_FORM, ratio: '1:1', base: '2k' })).toEqual({ w: 2048, h: 2048 })
  })

  it('4K 等比放入 3840 × 2160', () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: '16:9', base: '4k' })).toEqual({ w: 3840, h: 2160 })
    const square = formSize({ ...DEFAULT_FORM, ratio: '1:1', base: '4k' })
    expect(square).toEqual({ w: 2160, h: 2160 }) // 正方形被短边限制
    const t = formSize({ ...DEFAULT_FORM, ratio: '3:2', base: '4k' }) as { w: number; h: number }
    expect(t.w).toBeLessThanOrEqual(3840)
    expect(t.h).toBeLessThanOrEqual(2160)
    expect(t.w % 16).toBe(0)
    expect(t.h % 16).toBe(0)
  })

  it('auto 时基准无效', () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: 'auto', base: '4k' })).toBe('auto')
  })

  it('自定义宽高优先于基准', () => {
    expect(formSize({ ...DEFAULT_FORM, ratio: '3:2', base: '4k', cw: '1280', ch: '768' })).toEqual({
      w: 1280,
      h: 768,
    })
  })
})

describe('form ↔ params 往返', () => {
  it('自定义尺寸经生成后可完整复用', () => {
    const form: GenForm = { ...DEFAULT_FORM, prompt: 'p', model: 'sunburst', cw: '2560', ch: '1440', quality: 'xhigh' }
    const restored = paramsToForm(formToParams(form))
    expect(restored.cw).toBe('2560')
    expect(restored.ch).toBe('1440')
    expect(restored.model).toBe('sunburst')
    expect(restored.quality).toBe('xhigh')
  })

  it('auto 尺寸复用后仍是 auto', () => {
    const restored = paramsToForm(formToParams({ ...DEFAULT_FORM, ratio: 'auto' }))
    expect(restored.ratio).toBe('auto')
    expect(restored.cw).toBe('')
  })
})

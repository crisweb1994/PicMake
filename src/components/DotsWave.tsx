/**
 * 生成中点阵波动效（对角顺序波）：canvas 绘制整齐点阵，波峰沿左上→右下方向流动，
 * 波峰色随 --pm-accent、基色随 --pm-text-1（从 CSS 令牌读取，不写死色值）。
 *
 * 副作用（均随组件挂载启动、卸载清理）：
 * - requestAnimationFrame 动画循环
 * - ResizeObserver（容器尺寸 / DPR 变化时重建画布）
 * - prefers-reduced-motion: reduce 时不启动循环，仅静态绘制一帧
 */
import { useEffect, useRef } from 'react'

const SPACING = 23
const SPEED = 2.2
const PHASE_SPAN = Math.PI * 4.2

function readToken(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback
}

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function DotsWave() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const base = readToken('--pm-text-1', '#ededef')
    const crest = readToken('--pm-accent', '#ff9a62')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let raf = 0

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height)
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          const phase = ((x + y) / (width + height)) * PHASE_SPAN - t * SPEED
          const amp = Math.pow(Math.max(0, Math.sin(phase)), 2)
          const alpha = 0.07 + amp * 0.68
          ctx.fillStyle = amp > 0.55 ? withAlpha(crest, alpha) : withAlpha(base, alpha)
          ctx.beginPath()
          ctx.arc(x, y, 1.5 + amp * 1.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    const fit = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reduced) draw(0)
    }

    const ro = new ResizeObserver(fit)
    ro.observe(canvas)
    fit()

    if (!reduced) {
      const loop = (now: number) => {
        draw(now / 1000)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="pm-dots-wave-canvas" aria-hidden="true" />
}

/**
 * 页面级编排 hook（AGENTS.md §3 接线层）：
 * 消费 settings store 与 Dexie liveQuery，编排生成全流程（流式/降级/入库/取消/错误），
 * 投影成 props 供业务组件消费。业务组件不直接 import 本 hook 以外的数据层。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { generateImageStream, testConnection } from '../api/client'
import { db, ensurePersistentStorage, type HistoryRow, type ImageRow } from '../db/schema'
import { b64ToBlob } from '../lib/blob'
import { estimateOneUsd, estimateUsd, formatUsd, isRisky } from '../lib/cost'
import { customOk, DEFAULT_FORM, formToParams, paramsToForm, type GenForm } from '../lib/params'
import {
  ApiError,
  ERROR_HINTS,
  ERROR_TITLES,
  type ApiErrorKind,
  type GenParams,
  type Usage,
} from '../lib/types'
import { useSettings } from '../store/settings'

export interface DisplayImage {
  id: string
  url: string
  costUsd: number
}
export interface DisplayGen {
  row: HistoryRow
  images: DisplayImage[]
}
export interface ToastMsg {
  id: number
  text: string
}
export interface ConfirmState {
  title: string
  desc: string
  onOk: () => void
}
export interface ErrorState {
  kind: ApiErrorKind
  title: string
  message: string
}

const OUTPUT_USD_PER_TOKEN = 30 / 1_000_000

function uuid(): string {
  return crypto.randomUUID()
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

export function usePicmake() {
  const settings = useSettings()

  /* ── 表单 ── */
  const [form, setForm] = useState<GenForm>(DEFAULT_FORM)
  const patchForm = useCallback((patch: Partial<GenForm>) => setForm((f) => ({ ...f, ...patch })), [])

  /* ── 历史与展示 ── */
  const rawRows = useLiveQuery(() => db.history.orderBy('createdAt').reverse().toArray(), [])
  const rows = rawRows ?? []
  const [display, setDisplay] = useState<DisplayGen | null>(null)
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const urlsRef = useRef<string[]>([])
  const revokeUrls = useCallback(() => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
  }, [])
  const trackUrls = useCallback((urls: string[]) => {
    urlsRef.current = urls
  }, [])

  /* ── 生成过程 ── */
  const [phase, setPhase] = useState<'idle' | 'generating'>('idle')
  const [partial, setPartial] = useState<{ url: string; index: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const partialUrlRef = useRef<string | null>(null)
  const lastParamsRef = useRef<GenParams | null>(null)

  /* ── 全局 UI ── */
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const toastSeq = useRef(1)
  const toast = useCallback((text: string) => {
    const id = toastSeq.current++
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])
  const [error, setError] = useState<ErrorState | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lightbox, setLightbox] = useState<DisplayImage | null>(null)

  /* ── 派生 ── */
  const params = useMemo(() => formToParams(form), [form])
  const estUsd = useMemo(() => estimateUsd(params), [params])
  const customValid = customOk(form)

  /* ── 启动：持久化申请 + 打开状态机（PRD §3.1） ── */
  const bootedRef = useRef(false)
  useEffect(() => {
    ensurePersistentStorage()
  }, [])
  useEffect(() => {
    if (bootedRef.current || rawRows === undefined) return
    bootedRef.current = true
    // 引导判定只看 apiKey 是否已配置（唯一事实来源），不设第二个标记位
    if (!settings.apiKey.trim()) {
      setSettingsOpen(true)
    } else if (rawRows.length > 0) {
      void selectHistory(rawRows[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, settings.apiKey])

  useEffect(() => () => revokeUrls(), [revokeUrls])

  /* ── 载入一次生成到舞台 ── */
  const selectHistory = useCallback(
    async (row: HistoryRow) => {
      const imgs = (await db.images.bulkGet(row.imageIds)).filter((x): x is ImageRow => !!x)
      revokeUrls()
      const urls = imgs.map((im) => URL.createObjectURL(im.blob))
      trackUrls(urls)
      const costEach = row.costUsd / Math.max(1, imgs.length)
      setDisplay({ row, images: imgs.map((im, i) => ({ id: im.id, url: urls[i], costUsd: costEach })) })
      setFocusIdx(null)
    },
    [revokeUrls, trackUrls],
  )

  /* ── 生成核心流程 ── */
  const runGenerate = useCallback(
    async (p: GenParams) => {
      lastParamsRef.current = p
      setError(null)
      setDisplay(null)
      setFocusIdx(null)
      setPhase('generating')

      const abort = new AbortController()
      abortRef.current = abort
      const t0 = Date.now()

      const swapPartial = (b64: string, index: number) => {
        if (partialUrlRef.current) URL.revokeObjectURL(partialUrlRef.current)
        const url = URL.createObjectURL(b64ToBlob(b64))
        partialUrlRef.current = url
        setPartial({ url, index })
      }

      try {
        const results = await generateImageStream(p, {
          signal: abort.signal,
          onPartial: swapPartial,
          onFallback: () => toast('当前 API 地址不支持流式，本次无渐进预览'),
        })

        /* 入库 + 展示 */
        const mime = p.outputFormat === 'jpeg' ? 'image/jpeg' : p.outputFormat === 'webp' ? 'image/webp' : 'image/png'
        const [w, h] = p.size === 'auto' ? [0, 0] : [p.size.w, p.size.h]
        const imageRows: ImageRow[] = results.map((r) => ({
          id: uuid(),
          blob: b64ToBlob(r.b64, mime),
          width: w,
          height: h,
          format: p.outputFormat,
        }))
        const fallbackEach = estimateOneUsd(p.size, p.quality) * 1.05
        const costs = results.map((r) =>
          r.usage ? r.usage.outputTokens * OUTPUT_USD_PER_TOKEN : fallbackEach,
        )
        const usage: Usage | null = results.some((r) => r.usage)
          ? {
              totalTokens: results.reduce((s, r) => s + (r.usage?.totalTokens ?? 0), 0),
              inputTokens: results.reduce((s, r) => s + (r.usage?.inputTokens ?? 0), 0),
              outputTokens: results.reduce((s, r) => s + (r.usage?.outputTokens ?? 0), 0),
              textTokens: results.reduce((s, r) => s + (r.usage?.textTokens ?? 0), 0),
              imageTokens: results.reduce((s, r) => s + (r.usage?.imageTokens ?? 0), 0),
            }
          : null
        const row: HistoryRow = {
          id: uuid(),
          prompt: p.prompt,
          params: p,
          usage,
          costUsd: costs.reduce((s, c) => s + c, 0),
          imageIds: imageRows.map((im) => im.id),
          createdAt: Date.now(),
          durationMs: Date.now() - t0,
        }
        await db.transaction('rw', db.images, db.history, async () => {
          await db.images.bulkAdd(imageRows)
          await db.history.add(row)
        })

        if (partialUrlRef.current) URL.revokeObjectURL(partialUrlRef.current)
        partialUrlRef.current = null
        setPartial(null)
        setPhase('idle')

        revokeUrls()
        const urls = imageRows.map((im) => URL.createObjectURL(im.blob))
        trackUrls(urls)
        setDisplay({ row, images: imageRows.map((im, i) => ({ id: im.id, url: urls[i], costUsd: costs[i] })) })
        toast(`生成完成 · 实际花费 ${formatUsd(row.costUsd)}`)
      } catch (e) {
        if (partialUrlRef.current) URL.revokeObjectURL(partialUrlRef.current)
        partialUrlRef.current = null
        setPartial(null)
        setPhase('idle')
        if (isAbort(e)) {
          toast('已取消生成')
          return
        }
        if (e instanceof ApiError) {
          // 服务端往往带有可操作的原因（如中转站的质量档位限制），优先透传
          setError({ kind: e.kind, title: ERROR_TITLES[e.kind], message: e.message || ERROR_HINTS[e.kind] })
        } else {
          setError({ kind: 'unknown', title: ERROR_TITLES.unknown, message: ERROR_HINTS.unknown })
        }
      }
    },
    [revokeUrls, toast, trackUrls],
  )

  /* ── 生成入口：校验 → 高成本确认 → 执行（PRD FR-2/3/7） ── */
  const generate = useCallback(() => {
    if (phase === 'generating') return
    if (!customValid) {
      toast('自定义尺寸无效：宽高须被 16 整除，比例 1:3 ～ 3:1，不超过 3840 × 2160')
      return
    }
    const p = formToParams(form)
    if (p.prompt.trim() === '') {
      toast('先写一句画面描述')
      return
    }
    if (isRisky(p)) {
      setConfirmState({
        title: '确认本次花费',
        desc: `当前为最高档位或大尺寸，本次预计 ${formatUsd(estimateUsd(p))}，最多档位在 4K 下单张可能超过 $0.80。`,
        onOk: () => void runGenerate(p),
      })
      return
    }
    void runGenerate(p)
  }, [customValid, form, phase, runGenerate, toast])

  const cancelGenerate = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /* ── 历史操作 ── */
  const deleteGen = useCallback(
    (row: HistoryRow) => {
      setConfirmState({
        title: '删除这次生成？',
        desc: `包含 ${row.imageIds.length} 张图片，删除后无法恢复。`,
        onOk: () => {
          void (async () => {
            await db.transaction('rw', db.images, db.history, async () => {
              await db.images.bulkDelete(row.imageIds)
              await db.history.delete(row.id)
            })
            toast('已删除')
            if (display?.row.id === row.id) {
              const rest = await db.history.orderBy('createdAt').reverse().limit(1).toArray()
              if (rest.length) await selectHistory(rest[0])
              else {
                revokeUrls()
                setDisplay(null)
              }
            }
          })()
        },
      })
    },
    [display, revokeUrls, selectHistory, toast],
  )

  const reuseParams = useCallback(
    (row: HistoryRow) => {
      setForm(paramsToForm(row.params))
      revokeUrls()
      setDisplay(null)
      setFocusIdx(null)
      toast('参数已回填，可直接生成')
    },
    [revokeUrls, toast],
  )

  const againFrom = useCallback(
    (row: HistoryRow) => {
      const p: GenParams = { ...row.params, n: 1 }
      void runGenerate(p)
    },
    [runGenerate],
  )

  const newGeneration = useCallback(() => {
    revokeUrls()
    setDisplay(null)
    setFocusIdx(null)
    setError(null)
  }, [revokeUrls])

  /* ── 设置 / 引导 ── */
  const runTestConnection = useCallback(
    async (
      baseUrl: string,
      apiKey: string,
    ): Promise<{ ok: true; models: string[] } | { ok: false; message: string }> => {
      // 测试即落 store（下次正式请求用同一配置）
      useSettings.getState().setApi(baseUrl, apiKey)
      const r = await testConnection()
      return r.ok ? r : { ok: false, message: ERROR_HINTS[r.error.kind] }
    },
    [],
  )

  /** 保存设置（有 apiKey 即视为已引导，启动弹窗由它决定） */
  const saveSettings = useCallback(
    (baseUrl: string, apiKey: string) => {
      settings.setApi(baseUrl, apiKey)
      setSettingsOpen(false)
      toast('设置已保存')
    },
    [settings, toast],
  )

  const retry = useCallback(() => {
    setError(null)
    if (lastParamsRef.current) void runGenerate(lastParamsRef.current)
  }, [runGenerate])

  const goEditPrompt = useCallback(() => {
    setError(null)
    newGeneration()
  }, [newGeneration])

  return {
    // 表单
    form,
    patchForm,
    params,
    estUsd,
    customValid,
    // 生成过程
    phase,
    partial,
    generate,
    cancelGenerate,
    // 展示
    display,
    focusIdx,
    setFocusIdx,
    lightbox,
    setLightbox,
    // 历史
    rows,
    selectHistory,
    deleteGen,
    reuseParams,
    againFrom,
    newGeneration,
    // 错误 / 确认 / toast
    error,
    retry,
    goEditPrompt,
    confirmState,
    setConfirmState,
    toasts,
    toast,
    settingsOpen,
    setSettingsOpen,
    drawerOpen,
    setDrawerOpen,
    // 设置
    settings,
    runTestConnection,
    saveSettings,
  }
}

export type Picmake = ReturnType<typeof usePicmake>

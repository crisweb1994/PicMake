/** 局部重绘编辑会话：工作文档、撤销游标、底图准备与确认导出唯一持有于此；
 *  会话为独立副本，取消不改已确认草稿；确认失败保留工作内容 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageRow } from "../db/schema";
import type {
  InpaintIssue,
  InputSource,
  MaskDocument,
  MaskImage,
} from "../lib/types";
import {
  blankMask,
  checkInpaintBase,
  commitMaskCommand,
  freezeMask,
  maskSnapshotKey,
  validateMaskDocument,
} from "../lib/inpaint";
import { exportMaskPng } from "../lib/inpaint-canvas";
import { MASK_MAX_BYTES } from "../lib/inpaint";
import { prepareInpaintBase, readImageMeta } from "../lib/image-orientation";

export type InpaintEntry = "result" | "draft-input" | "reedit";

export interface InpaintSession {
  /** 实际请求底图（方向归一后） */
  base: ImageRow;
  /** 仅发生方向归一时存在：原文件与其来源身份 */
  original?: { source: InputSource; image: ImageRow };
  /** 归一化发生时的提示 */
  normalized: boolean;
  doc: MaskDocument;
  cursor: number;
  entry: InpaintEntry;
  /** 打开时的快照键：无修改沿用原资源、有修改拦截关闭 */
  openKey: string;
  /** 编辑已有选区时传入的原 mask 资源（未修改时沿用，不重复分配） */
  existingMask: MaskImage | null;
  name: string;
  baseUrl: string;
}

export interface InpaintApplyPayload {
  base: ImageRow;
  mask: MaskImage;
  original?: { source: InputSource; image: ImageRow };
  entry: InpaintEntry;
  /** 无实质修改：沿用原资源 */
  unchanged: boolean;
}

export interface InpaintOpenParams {
  blob: Blob;
  name: string;
  entry: InpaintEntry;
  /** 已在库中的来源身份：归一化时原文件引用它而非新建行 */
  existing?: InputSource;
  /** 重开已确认选区：实际底图与已保存 mask 资源 */
  reedit?: {
    base: ImageRow;
    mask: MaskImage;
    original?: { source: InputSource; image: ImageRow };
  };
}

export function useInpaint(props: {
  onApply: (payload: InpaintApplyPayload) => void;
}) {
  const [session, setSession] = useState<InpaintSession | null>(null);
  const [opening, setOpening] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** 就地错误（非 toast） */
  const [error, setError] = useState<InpaintIssue | null>(null);
  const openTokenRef = useRef(0);
  const confirmTokenRef = useRef(0);
  const urlRef = useRef<string | null>(null);
  const applyRef = useRef(props.onApply);
  useEffect(() => {
    applyRef.current = props.onApply;
  });
  useEffect(
    () => () => {
      openTokenRef.current++;
      confirmTokenRef.current++;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const close = useCallback(() => {
    openTokenRef.current++;
    confirmTokenRef.current++;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setSession(null);
    setOpening(false);
    setConfirming(false);
    setError(null);
  }, []);

  /** 打开（异步准备底图）：失败返回 issue，由接线层就地提示 */
  const open = useCallback(
    async (
      params: InpaintOpenParams,
    ): Promise<{ ok: true } | { ok: false; issue: InpaintIssue }> => {
      if (session || opening) return { ok: true };
      const token = ++openTokenRef.current;
      setOpening(true);
      setConfirming(false);
      const fail = (issue: InpaintIssue) => {
        if (openTokenRef.current !== token) return { ok: true } as const;
        setOpening(false);
        return { ok: false, issue } as const;
      };
      // 先读头拦截超像素/超比例，再准备素材
      let meta;
      try {
        meta = await readImageMeta(params.blob);
      } catch {
        return fail("canvas-failed");
      }
      if (openTokenRef.current !== token) return { ok: true };
      if ("issue" in meta) return fail(meta.issue);
      const pre = checkInpaintBase(meta.width, meta.height);
      if (!pre.ok) return fail(pre.issue);

      if (params.reedit) {
        // 重开：底图已归一，直接验证文档绑定
        const base = params.reedit.base;
        const check = checkInpaintBase(base.width, base.height);
        if (!check.ok) return fail(check.issue);
        const validated = validateMaskDocument(
          params.reedit.mask.mask,
          base.id,
          { width: base.width, height: base.height },
        );
        if ("issue" in validated) return fail(validated.issue);
        const doc = structuredClone(validated.doc);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const baseUrl = URL.createObjectURL(base.blob);
        urlRef.current = baseUrl;
        setSession({
          base,
          original: params.reedit.original,
          normalized: false,
          doc,
          cursor: doc.commands.length,
          entry: "reedit",
          openKey: maskSnapshotKey(doc),
          existingMask: params.reedit.mask,
          name: params.name,
          baseUrl,
        });
        setOpening(false);
        return { ok: true };
      }

      const prepared = await prepareInpaintBase(params.blob, params.name);
      if (openTokenRef.current !== token) return { ok: true };
      if (!prepared.ok) return fail(prepared.issue);
      const base = prepared.base;
      const recheck = checkInpaintBase(base.width, base.height);
      if (!recheck.ok) return fail(recheck.issue);
      const original = prepared.original
        ? params.existing
          ? { source: params.existing, image: prepared.original.image }
          : prepared.original
        : undefined;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const baseUrl = URL.createObjectURL(base.blob);
      urlRef.current = baseUrl;
      setSession({
        base,
        original,
        normalized: !!original,
        doc: blankMask(base.id, base.width, base.height),
        cursor: 0,
        entry: params.entry,
        openKey: "",
        existingMask: null,
        name: params.name,
        baseUrl,
      });
      setOpening(false);
      return { ok: true };
    },
    [session, opening],
  );

  const stroke = useCallback((command: MaskDocument["commands"][number]) => {
    setError(null);
    setSession((current) => {
      if (!current || !command) return current;
      const next = commitMaskCommand(current.doc, current.cursor, command);
      return next
        ? { ...current, doc: next.doc, cursor: next.cursor }
        : current;
    });
  }, []);

  const undo = useCallback(() => {
    setError(null);
    setSession((current) =>
      current && current.cursor > 0
        ? { ...current, cursor: current.cursor - 1 }
        : current,
    );
  }, []);

  const redo = useCallback(() => {
    setError(null);
    setSession((current) =>
      current && current.cursor < current.doc.commands.length
        ? { ...current, cursor: current.cursor + 1 }
        : current,
    );
  }, []);

  /** 使用选区：导出 + 校验，成功才替换草稿 */
  const confirm = useCallback(() => {
    const current = session;
    if (!current || confirming) return;
    const token = ++confirmTokenRef.current;
    setConfirming(true);
    void (async () => {
      const frozen = freezeMask(current.doc, current.cursor);
      const unchanged =
        current.entry === "reedit" &&
        !!current.existingMask &&
        maskSnapshotKey(frozen) === current.openKey;
      if (unchanged && current.existingMask) {
        applyRef.current({
          base: current.base,
          mask: current.existingMask,
          original: current.original,
          entry: current.entry,
          unchanged: true,
        });
        close();
        return;
      }
      const result = await exportMaskPng(frozen);
      if (confirmTokenRef.current !== token) return;
      if (result.issue === "empty-mask") {
        setConfirming(false);
        setError("empty-mask");
        return;
      }
      if (!result.blob) {
        setConfirming(false);
        setError("canvas-failed");
        return;
      }
      if (result.blob.size >= MASK_MAX_BYTES) {
        setConfirming(false);
        setError("mask-too-large");
        return;
      }
      const mask: MaskImage = {
        id: crypto.randomUUID(),
        blob: result.blob,
        width: frozen.width,
        height: frozen.height,
        format: "png",
        mask: frozen,
      };
      applyRef.current({
        base: current.base,
        mask,
        original: current.original,
        entry: current.entry,
        unchanged: false,
      });
      close();
    })();
  }, [session, confirming, close]);

  /** 打开以来是否有修改（关闭拦截与「沿用原资源」判定共用） */
  const changed =
    !!session &&
    session.cursor > 0 &&
    maskSnapshotKey(session.doc, session.cursor) !== session.openKey;

  return {
    session,
    opening,
    confirming,
    error,
    changed,
    open,
    close,
    stroke,
    undo,
    redo,
    clearAll: () => stroke({ type: "clear" }),
    confirm,
  };
}

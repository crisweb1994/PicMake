/** 草图编辑会话（SKETCH_RESEARCH_AND_SPEC §8.3/§8.4）：工作文档与撤销游标由本 hook
 *  唯一持有，画板组件只接收投影与事件；确认时导出 PNG 并交给接线层落附件，
 *  不生成图片、不写库。文档不可原地修改，每次确认产生新的 ImageRow（§8.2）。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import type { ImageRow } from "../db/schema";
import type { SketchCommand, SketchDocument } from "../lib/types";
import {
  commitCommand,
  freezeSketch,
  sketchSnapshotKey,
  validateSketchDocument,
  blankSketch,
} from "../lib/sketch";
import { exportSketchPng } from "../lib/sketch-canvas";

export type SketchOrigin = "blank" | "attachment" | "history";

export interface SketchSession {
  doc: SketchDocument;
  cursor: number;
  origin: SketchOrigin;
  /** 编辑已有附件时的原位替换目标；blank/history 为 null */
  replacesImageId: string | null;
  meta: string;
  /** 打开时的提交前缀快照键：有修改才拦截关闭（§6.5） */
  openKey: string;
}

export interface SketchApplyPayload {
  image: ImageRow;
  replaces: string | null;
  origin: SketchOrigin;
}

export function useSketch(props: {
  /** 落附件（最终数量/上下文校验在调用方）；返回是否成功，失败保留画板 */
  onApply: (payload: SketchApplyPayload) => boolean;
}) {
  const [session, setSession] = useState<SketchSession | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmTokenRef = useRef(0);
  const applyRef = useRef(props.onApply);
  // 确认发生在异步导出之后：经 effect 保持拿到最新接线闭包
  useEffect(() => {
    applyRef.current = props.onApply;
  });

  useEffect(
    () => () => {
      confirmTokenRef.current++;
    },
    [],
  );

  const open = useCallback(
    (
      doc: SketchDocument,
      origin: SketchOrigin,
      meta: string,
      replacesImageId: string | null,
    ) => {
      setSession({
        doc,
        cursor: doc.commands.length,
        origin,
        replacesImageId,
        meta,
        openKey: sketchSnapshotKey(doc),
      });
      setConfirming(false);
    },
    [],
  );

  const openNew = useCallback(
    (width: number, height: number) => {
      open(blankSketch(width, height), "blank", `${width} × ${height}`, null);
    },
    [open],
  );

  const openEdit = useCallback(
    (raw: SketchDocument, imageId: string, index: number) => {
      const doc = validateSketchDocument(raw);
      if (!doc) {
        toast("草图数据无法读取，请重新画一张");
        return;
      }
      open(
        doc,
        "attachment",
        `${doc.width} × ${doc.height} · 图${index + 1} 的草图`,
        imageId,
      );
    },
    [open],
  );

  const openHistory = useCallback(
    (raw: unknown) => {
      const doc = validateSketchDocument(raw);
      if (!doc) {
        toast("来源图片不可用，无法继续编辑这张草图");
        return;
      }
      open(doc, "history", `${doc.width} × ${doc.height} · 历史草图`, null);
    },
    [open],
  );

  const close = useCallback(() => {
    confirmTokenRef.current++;
    setSession(null);
    setConfirming(false);
  }, []);

  const stroke = useCallback((command: SketchCommand) => {
    setSession((current) => {
      if (!current || !command) return current;
      const next = commitCommand(current.doc, current.cursor, command);
      // 上限拒绝由画板组件先行提示（onLimit），此处静默兜底
      return next
        ? { ...current, doc: next.doc, cursor: next.cursor }
        : current;
    });
  }, []);

  const undo = useCallback(() => {
    setSession((current) =>
      current && current.cursor > 0
        ? { ...current, cursor: current.cursor - 1 }
        : current,
    );
  }, []);

  const redo = useCallback(() => {
    setSession((current) =>
      current && current.cursor < current.doc.commands.length
        ? { ...current, cursor: current.cursor + 1 }
        : current,
    );
  }, []);

  const clearAll = useCallback(() => {
    setSession((current) => {
      if (!current) return current;
      const next = commitCommand(current.doc, current.cursor, {
        type: "clear",
      });
      return next
        ? { ...current, doc: next.doc, cursor: next.cursor }
        : current;
    });
  }, []);

  const confirm = useCallback(() => {
    const current = session;
    if (!current || confirming) return;
    const token = ++confirmTokenRef.current;
    setConfirming(true);
    void (async () => {
      const frozen = freezeSketch(current.doc, current.cursor);
      // 附件编辑无实质修改：沿用原附件，不重复分配图片（§8.2）
      if (
        current.origin === "attachment" &&
        sketchSnapshotKey(frozen) === current.openKey
      ) {
        close();
        return;
      }
      const result = await exportSketchPng(frozen);
      if (confirmTokenRef.current !== token) return;
      if (!result.ink) {
        setConfirming(false);
        toast("先在纸上画下构图，空白草图不能作为输入");
        return;
      }
      if (!result.blob) {
        setConfirming(false);
        toast("草图导出失败，请重试");
        return;
      }
      const image: ImageRow = {
        id: crypto.randomUUID(),
        blob: result.blob,
        width: frozen.width,
        height: frozen.height,
        format: "png",
        sketch: frozen,
      };
      const applied = applyRef.current({
        image,
        replaces: current.replacesImageId,
        origin: current.origin,
      });
      if (applied) {
        close();
        return;
      }
      setConfirming(false);
    })();
  }, [session, confirming, close]);

  /** 打开以来是否有修改（撤销回到打开状态视为无修改；§6.5 关闭拦截用） */
  const changed =
    !!session &&
    session.cursor > 0 &&
    sketchSnapshotKey(session.doc, session.cursor) !== session.openKey;

  return {
    session,
    confirming,
    changed,
    openNew,
    openEdit,
    openHistory,
    stroke,
    undo,
    redo,
    clearAll,
    confirm,
    close,
  };
}

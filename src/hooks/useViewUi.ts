import { useCallback, useState } from "react";
import type { DisplayImage } from "../lib/view-models";

/** 轮播与灯箱的查看状态；何时清理由页面流程决定。 */
export function useViewUi() {
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<DisplayImage | null>(null);
  const [sourceLightboxOpen, setSourceLightboxOpen] = useState(false);

  const clearResultViewingState = useCallback(() => {
    setFocusIdx(null);
    setLightbox(null);
  }, []);

  const clearViewingState = useCallback(() => {
    clearResultViewingState();
    setSourceLightboxOpen(false);
  }, [clearResultViewingState]);

  return {
    focusIdx,
    setFocusIdx,
    lightbox,
    setLightbox,
    sourceLightboxOpen,
    setSourceLightboxOpen,
    clearResultViewingState,
    clearViewingState,
  };
}

import { useLayoutEffect, useState } from "react";

/** 单个 Blob → Object URL：绘制前生成，Blob 变化或卸载时回收（StrictMode 重挂载会重新生成） */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!blob) {
      // oxlint-disable-next-line react/set-state-in-effect -- 同步外部资源（Object URL），不是派生值
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

import { useLayoutEffect, useRef, useState } from "react";

/** 一组 Blob → Object URL，与入参一一对应（没有 Blob 的位置为 null）。
 *  只为新出现的 Blob 创建 URL、回收不再出现的，卸载时全部回收：
 *  多尺寸生成中每格的预览与终稿随事件陆续变化，逐个更新才不会让没变的格子重新加载。
 *  blobs 要在内容不变时保持同一个数组（调用方 useMemo），否则每次渲染都会重新同步 */
export function useBlobUrls(
  blobs: ReadonlyArray<Blob | null>,
): Array<string | null> {
  const cache = useRef(new Map<Blob, string>());
  const [urls, setUrls] = useState<Array<string | null>>(() =>
    blobs.map(() => null),
  );
  useLayoutEffect(() => {
    const live = cache.current;
    const wanted = new Set(blobs.filter((blob): blob is Blob => !!blob));
    for (const [blob, url] of live) {
      if (wanted.has(blob)) continue;
      URL.revokeObjectURL(url);
      live.delete(blob);
    }
    for (const blob of wanted)
      if (!live.has(blob)) live.set(blob, URL.createObjectURL(blob));
    // oxlint-disable-next-line react/set-state-in-effect -- 同步外部资源（Object URL），不是派生值
    setUrls(blobs.map((blob) => (blob ? (live.get(blob) ?? null) : null)));
  }, [blobs]);
  useLayoutEffect(() => {
    const live = cache.current;
    return () => {
      for (const url of live.values()) URL.revokeObjectURL(url);
      live.clear();
    };
  }, []);
  return urls;
}

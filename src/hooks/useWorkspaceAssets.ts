/** 舞台、详情卡与抽屉用的图片资源：display、来源图、缩略图。
 *  缩略图只在列表变化时重读；当前记录的图先借用已加载的缩略图；
 *  内存里的结果（保存中、保存失败、刚保存还没进列表）始终用同一组 URL，保存前后不闪空。 */
import { useLayoutEffect, useState } from "react";
import type { ImageRow } from "../db/schema";
import type { PreparedGeneration } from "../lib/generation";
import {
  inputDisplay,
  type DisplayGen,
  type DisplayImage,
} from "../lib/view-models";
import { useWorkspace } from "../store/workspace";
import {
  selectDisplayRow,
  selectPending,
  selectRows,
} from "../store/workspace/selectors";
import { useImageAssets } from "./useImageAssets";

const EMPTY_IMAGES: ImageRow[] = [];

export type WorkspaceAssets = ReturnType<typeof useWorkspaceAssets>;

export function useWorkspaceAssets() {
  const rows = useWorkspace(selectRows);
  const displayRow = useWorkspace(selectDisplayRow);
  const pending = useWorkspace(selectPending);
  const recent = useWorkspace((s) => s.history.recent);
  const shown: PreparedGeneration | null =
    pending ?? (recent && displayRow?.id === recent.row.id ? recent : null);

  const [shownUrls, setShownUrls] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const next: Record<string, string> = {};
    for (const image of shown?.images ?? [])
      next[image.id] = URL.createObjectURL(image.blob);
    // oxlint-disable-next-line react/set-state-in-effect -- 同步外部资源（Object URL），不是派生值
    setShownUrls(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [shown]);

  const { assets: thumbs } = useImageAssets(rows.map((row) => row.imageIds[0]));
  const sources = displayRow?.inputSources ?? [];
  const { assets: current } = useImageAssets(
    [
      ...(shown ? [] : (displayRow?.imageIds ?? [])),
      ...sources.map((source) => source.imageId),
    ],
    shown?.sources ?? EMPTY_IMAGES,
  );
  const assetOf = (id: string) => current[id] ?? thumbs[id];

  const thumbnailUrls = Object.fromEntries(
    rows.flatMap((row) => {
      const id = row.imageIds[0];
      return id && thumbs[id] ? ([[id, thumbs[id].url]] as const) : [];
    }),
  );

  const sourceImages = sources.map((source, index) => ({
    id: source.imageId,
    ...inputDisplay(source.name, index),
    url: assetOf(source.imageId)?.url,
    /** 来源是草图：预览提供「继续画这张草图」 */
    isSketch: !!assetOf(source.imageId)?.row.sketch,
  }));

  const images = (displayRow?.imageIds ?? []).map((id) => ({
    id,
    url: shown ? shownUrls[id] : assetOf(id)?.url,
    format: shown
      ? shown.images.find((image) => image.id === id)?.format
      : assetOf(id)?.row.format,
  }));
  const display: DisplayGen | null =
    displayRow &&
    images.every(
      (image): image is DisplayImage => !!image.url && !!image.format,
    )
      ? { row: displayRow, images }
      : null;

  return { rows, display, sourceImages, thumbnailUrls };
}

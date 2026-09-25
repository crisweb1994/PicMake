/** 历史、当前选择与结果资源；URL 随结果替换或卸载释放。 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ensurePersistentStorage, type HistoryRow } from "../db/schema";
import { deleteHistory, saveGeneration, toggleStar } from "../db/history";
import type { PreparedGeneration } from "../lib/generation";
import type { DisplayGen, DisplayImage } from "../lib/view-models";
import { historySources } from "../lib/input-images";
import { useImageAssets } from "./useImageAssets";

const EMPTY_ROWS: HistoryRow[] = [];

export function useHistory() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PreparedGeneration | null>(
    null,
  );
  const [pendingUrls, setPendingUrls] = useState<Record<string, string>>({});
  const previousRowsRef = useRef<HistoryRow[] | undefined>(undefined);
  const rawRows = useLiveQuery(
    () => db.history.orderBy("createdAt").reverse().toArray(),
    [],
  );
  const rows = rawRows ?? EMPTY_ROWS;
  const selectedRow = selectedId
    ? (rows.find((row) => row.id === selectedId) ?? null)
    : null;

  useEffect(() => {
    if (!rawRows) return;
    const previousRows = previousRowsRef.current;
    previousRowsRef.current = rawRows;
    if (!previousRows) {
      setSelectedId(rawRows[0]?.id ?? null);
      return;
    }
    // 写入完成可早于 liveQuery 更新；仅回退确实从列表中删除的作品。
    if (
      selectedId &&
      previousRows.some((row) => row.id === selectedId) &&
      !rawRows.some((row) => row.id === selectedId)
    ) {
      setSelectedId(rawRows[0]?.id ?? null);
    }
  }, [rawRows, selectedId]);

  useEffect(() => {
    void ensurePersistentStorage();
  }, []);

  useLayoutEffect(() => {
    const next: Record<string, string> = {};
    for (const image of pendingSave?.images ?? [])
      next[image.id] = URL.createObjectURL(image.blob);
    setPendingUrls(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [pendingSave]);

  const displayRow = pendingSave?.row ?? selectedRow;
  const sources = displayRow ? historySources(displayRow) : [];
  const suppliedSources = useMemo(
    () => pendingSave?.sources ?? [],
    [pendingSave],
  );
  const assetIds = [
    ...(selectedRow?.imageIds ?? []),
    ...sources.map((source) => source.imageId),
    ...rows.map((row) => row.imageIds[0]),
  ];
  const { assets } = useImageAssets(assetIds, suppliedSources);
  const thumbnailUrls = useMemo(
    () =>
      Object.fromEntries(
        rows.flatMap((row) => {
          const id = row.imageIds[0];
          return id && assets[id] ? [[id, assets[id].url] as const] : [];
        }),
      ),
    [assets, rows],
  );

  const sourceImages = sources.map((source, index) => ({
    id: source.imageId,
    name: source.name ?? "已有作品",
    label: `图${index + 1} · ${source.name ?? "已有作品"}`,
    origin: !source.generationId
      ? "上传的图片"
      : rows.some((row) => row.id === source.generationId)
        ? "来自已有作品"
        : "来源作品已删除",
    url: assets[source.imageId]?.url,
    /** 来源是草图：预览时提供「继续画这张草图」（SKETCH §6.3/§8.2，不改旧记录） */
    isSketch: !!assets[source.imageId]?.row.sketch,
  }));

  const images = (displayRow?.imageIds ?? []).map((id) => ({
    id,
    url: pendingSave ? pendingUrls[id] : assets[id]?.url,
  }));
  const display: DisplayGen | null =
    displayRow && images.every((image): image is DisplayImage => !!image.url)
      ? { row: displayRow, images }
      : null;

  const save = async (prepared: PreparedGeneration) => {
    setPendingSave(prepared);
    await saveGeneration(prepared);
    setPendingSave(null);
    setSelectedId(prepared.row.id);
  };

  return {
    rows,
    selectedId,
    selectedRow,
    select: setSelectedId,
    display,
    thumbnailUrls,
    sourceImages,
    pendingSave,
    discardPending: () => setPendingSave(null),
    save,
    remove: deleteHistory,
    toggleStar,
  };
}

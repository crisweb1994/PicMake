/** 历史、当前选择与结果资源；URL 随结果替换或卸载释放。 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ensurePersistentStorage, type HistoryRow } from "../db/schema";
import { deleteHistory, saveGeneration } from "../db/history";
import type { PreparedGeneration } from "../lib/generation";
import type { DisplayGen, DisplayImage } from "../lib/view-models";
import { useImageAssets } from "./useImageAssets";

const EMPTY_ROWS: HistoryRow[] = [];

export function useHistory(editingImageId?: string) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PreparedGeneration | null>(
    null,
  );
  const [pendingUrls, setPendingUrls] = useState<Record<string, string>>({});
  const initializedRef = useRef(false);
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
    if (!initializedRef.current) {
      initializedRef.current = true;
      setSelectedId(rawRows[0]?.id ?? null);
      return;
    }
    if (selectedId && !rawRows.some((row) => row.id === selectedId)) {
      setSelectedId(rawRows[0]?.id ?? null);
    }
  }, [rawRows, selectedId]);

  useEffect(() => {
    void ensurePersistentStorage();
  }, []);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const image of pendingSave?.images ?? [])
      next[image.id] = URL.createObjectURL(image.blob);
    setPendingUrls(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [pendingSave]);

  const sourceId = editingImageId ?? selectedRow?.editSource?.imageId;
  const assetIds = [
    ...(selectedRow?.imageIds ?? []),
    ...(sourceId ? [sourceId] : []),
    ...rows.map((row) => row.imageIds[0]),
  ];
  const { assets } = useImageAssets(assetIds);
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

  const sourceUrl = sourceId ? assets[sourceId]?.url : undefined;
  const sourceFormat = sourceId ? assets[sourceId]?.row.format : undefined;
  const sourceExists =
    !!selectedRow?.editSource &&
    rows.some((row) => row.id === selectedRow.editSource?.generationId);

  const displayRow = pendingSave?.row ?? selectedRow;
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
    sourceUrl,
    sourceFormat,
    sourceExists,
    pendingSave,
    discardPending: () => setPendingSave(null),
    save,
    remove: deleteHistory,
  };
}

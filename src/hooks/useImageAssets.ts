import { useEffect, useState } from "react";
import { db, type ImageRow } from "../db/schema";

export interface ImageAsset {
  row: ImageRow;
  url: string;
}

export function useImageAssets(imageIds: string[]) {
  const idsKey = [...new Set(imageIds.filter(Boolean))].join("|");
  const [assets, setAssets] = useState<Record<string, ImageAsset>>({});

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const ids = idsKey ? idsKey.split("|") : [];
    void db.images
      .bulkGet(ids)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, ImageAsset> = {};
        for (const row of rows) {
          if (!row) continue;
          const url = URL.createObjectURL(row.blob);
          urls.push(url);
          next[row.id] = { row, url };
        }
        setAssets(next);
      })
      .catch(() => {
        if (!cancelled) {
          setAssets({});
        }
      });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [idsKey]);

  return { assets };
}

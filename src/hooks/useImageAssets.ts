import { useEffect, useState } from "react";
import { db, type ImageRow } from "../db/schema";

export interface ImageAsset {
  row: ImageRow;
  url: string;
}

const EMPTY_IMAGES: ImageRow[] = [];

export function useImageAssets(
  imageIds: string[],
  suppliedImages: ImageRow[] = EMPTY_IMAGES,
) {
  const idsKey = [...new Set(imageIds.filter(Boolean))].join("|");
  const [assets, setAssets] = useState<Record<string, ImageAsset>>({});

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const ids = idsKey ? idsKey.split("|") : [];
    const supplied = new Map(suppliedImages.map((row) => [row.id, row]));
    void db.images
      .bulkGet(ids.filter((id) => !supplied.has(id)))
      .catch(() => [])
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, ImageAsset> = {};
        for (const row of [...rows, ...suppliedImages]) {
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
  }, [idsKey, suppliedImages]);

  return { assets };
}

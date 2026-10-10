import { db } from "./schema";
import type { HistoryRow } from "./schema";
import type { PreparedGeneration } from "../lib/generation";

/** 一条历史引用的全部资源 id：删除回收按剩余历史的并集判定 */
function historyResourceIds(row: HistoryRow): string[] {
  return [
    ...row.imageIds,
    ...(row.inputSources ?? []).map((source) => source.imageId),
    ...(row.inpaint ? [row.inpaint.maskImageId] : []),
    ...(row.inpaint?.originalSource
      ? [row.inpaint.originalSource.imageId]
      : []),
  ];
}

export async function saveGeneration(
  prepared: PreparedGeneration,
): Promise<void> {
  await db.transaction("rw", db.images, db.history, async () => {
    for (const image of prepared.sources) {
      if (!(await db.images.get(image.id))) await db.images.put(image);
    }
    await db.images.bulkPut(prepared.images);
    await db.history.put(prepared.row);
  });
}

export async function deleteHistory(id: string): Promise<void> {
  await db.transaction("rw", db.images, db.history, async () => {
    await db.history.delete(id);
    const remaining = await db.history.toArray();
    const retained = new Set(
      remaining.flatMap((row) => historyResourceIds(row)),
    );
    const ids = await db.images.toCollection().primaryKeys();
    await db.images.bulkDelete(ids.filter((imageId) => !retained.has(imageId)));
  });
}

/** 行不存在时静默忽略（如未保存的 pending 结果） */
export async function toggleStar(id: string): Promise<void> {
  const row = await db.history.get(id);
  if (!row) return;
  await db.history.update(id, { starred: !row.starred });
}

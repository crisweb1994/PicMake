import { historySources } from "../lib/input-images";
import { db, type HistoryRow } from "./schema";
import type { PreparedGeneration } from "../lib/generation";

/** 一条历史引用的全部资源 id（TECH §10.3）：输出、输入来源、mask 与原文件。
 *  删除回收按剩余历史的并集判定；mask / 原文件不进入输出图片数组或请求参考图列表。 */
export function historyResourceIds(row: HistoryRow): string[] {
  return [
    ...row.imageIds,
    ...historySources(row).map((source) => source.imageId),
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

/** 收藏开关（2026-09-23）：行不存在时静默忽略（如未保存的 pending 结果） */
export async function toggleStar(id: string): Promise<void> {
  const row = await db.history.get(id);
  if (!row) return;
  await db.history.update(id, { starred: !row.starred });
}

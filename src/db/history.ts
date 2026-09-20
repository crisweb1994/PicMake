import { db } from "./schema";
import type { PreparedGeneration } from "../lib/generation";

export async function saveGeneration(
  prepared: PreparedGeneration,
): Promise<void> {
  await db.transaction("rw", db.images, db.history, async () => {
    if (prepared.source && !(await db.images.get(prepared.source.imageId))) {
      await db.images.put({
        id: prepared.source.imageId,
        blob: prepared.source.sourceBlob,
        format: prepared.source.sourceFormat,
        width: 0,
        height: 0,
      });
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
      remaining.flatMap((row) => [
        ...row.imageIds,
        ...(row.editSource ? [row.editSource.imageId] : []),
      ]),
    );
    const ids = await db.images.toCollection().primaryKeys();
    await db.images.bulkDelete(ids.filter((imageId) => !retained.has(imageId)));
  });
}

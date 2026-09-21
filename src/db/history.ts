import { historySources } from "../lib/input-images";
import { db } from "./schema";
import type { PreparedGeneration } from "../lib/generation";

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
      remaining.flatMap((row) => [
        ...row.imageIds,
        ...historySources(row).map((source) => source.imageId),
      ]),
    );
    const ids = await db.images.toCollection().primaryKeys();
    await db.images.bulkDelete(ids.filter((imageId) => !retained.has(imageId)));
  });
}

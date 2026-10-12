import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { PreparedGeneration } from "../lib/generation";
import { deleteHistory, saveGeneration, toggleStar } from "./history";
import { db, type HistoryRow, type ImageRow } from "./schema";

const image = (id: string): ImageRow => ({
  id,
  blob: new Blob([id], { type: "image/png" }),
  width: 1,
  height: 1,
  format: "png",
});

const row = (id: string, extra: Partial<HistoryRow> = {}): HistoryRow => ({
  id,
  prompt: id,
  params: {} as HistoryRow["params"],
  usage: null,
  imageIds: [],
  createdAt: 1,
  durationMs: 1,
  ...extra,
});

const prepared = (
  r: HistoryRow,
  images: ImageRow[] = [],
  sources: ImageRow[] = [],
): PreparedGeneration => ({ row: r, images, sources });

const imageIds = async () =>
  (await db.images.toCollection().primaryKeys()).sort();

beforeEach(async () => {
  await db.images.clear();
  await db.history.clear();
});

describe("saveGeneration", () => {
  it("同一事务写入记录、结果图与资源图", async () => {
    await saveGeneration(
      prepared(row("h1", { imageIds: ["o1"] }), [image("o1")], [image("s1")]),
    );
    expect((await db.history.get("h1"))?.imageIds).toEqual(["o1"]);
    expect(await imageIds()).toEqual(["o1", "s1"]);
  });

  it("资源图已存在时不覆盖（多条记录共享同一底图）", async () => {
    const original = image("s1");
    await db.images.put(original);
    await saveGeneration(
      prepared(row("h1"), [], [{ ...image("s1"), width: 999 }]),
    );
    expect((await db.images.get("s1"))?.width).toBe(1);
  });

  it("中途失败整体回滚：不留下半条记录，也不留下已写的资源图", async () => {
    const broken = { ...image("o1"), id: undefined } as unknown as ImageRow;
    await expect(
      saveGeneration(prepared(row("h1"), [broken], [image("s1")])),
    ).rejects.toThrow();
    expect(await db.history.count()).toBe(0);
    expect(await imageIds()).toEqual([]);
  });
});

describe("deleteHistory", () => {
  it("删除记录并回收只被它引用的图片", async () => {
    await saveGeneration(
      prepared(row("h1", { imageIds: ["o1"] }), [image("o1")], [image("s1")]),
    );
    await deleteHistory("h1");
    expect(await db.history.count()).toBe(0);
    expect(await imageIds()).toEqual([]);
  });

  it("仍被其他记录引用的图片保留：共享的输入底图", async () => {
    const inputSources = [{ imageId: "shared" }];
    await saveGeneration(
      prepared(
        row("h1", { imageIds: ["o1"], inputSources }),
        [image("o1")],
        [image("shared")],
      ),
    );
    await saveGeneration(
      prepared(
        row("h2", { imageIds: ["o2"], inputSources }),
        [image("o2")],
        [],
      ),
    );
    await deleteHistory("h1");
    expect(await imageIds()).toEqual(["o2", "shared"]);
  });

  it("仍被其他记录引用的图片保留：上一条的结果图被当作输入", async () => {
    await saveGeneration(
      prepared(row("h1", { imageIds: ["o1"] }), [image("o1")]),
    );
    await saveGeneration(
      prepared(
        row("h2", {
          imageIds: ["o2"],
          inputSources: [{ imageId: "o1", generationId: "h1" }],
        }),
        [image("o2")],
      ),
    );
    await deleteHistory("h1");
    expect(await db.history.get("h1")).toBeUndefined();
    expect(await imageIds()).toEqual(["o1", "o2"]);
  });

  it("局部重绘：mask 与原文件随引用它们的记录存亡", async () => {
    const inpaint = {
      maskImageId: "mask",
      originalSource: { imageId: "orig" },
    };
    await saveGeneration(
      prepared(
        row("h1", {
          imageIds: ["o1"],
          inpaint,
          inputSources: [{ imageId: "base" }],
        }),
        [image("o1")],
        [image("base"), image("mask"), image("orig")],
      ),
    );
    await saveGeneration(
      prepared(
        row("h2", { imageIds: ["o2"], inputSources: [{ imageId: "base" }] }),
        [image("o2")],
      ),
    );
    await deleteHistory("h1");
    // base 仍被 h2 引用；mask / orig 只属于 h1，被回收
    expect(await imageIds()).toEqual(["base", "o2"]);
  });

  it("记录不存在时不删除其他记录的图片", async () => {
    await saveGeneration(
      prepared(row("h1", { imageIds: ["o1"] }), [image("o1")]),
    );
    await deleteHistory("missing");
    expect(await imageIds()).toEqual(["o1"]);
  });

  it("顺带回收没有任何记录引用的孤儿图片", async () => {
    await saveGeneration(
      prepared(row("h1", { imageIds: ["o1"] }), [image("o1")]),
    );
    await db.images.put(image("orphan"));
    await deleteHistory("h1");
    expect(await imageIds()).toEqual([]);
  });
});

describe("toggleStar", () => {
  it("在收藏与未收藏之间切换", async () => {
    await db.history.put(row("h1"));
    await toggleStar("h1");
    expect((await db.history.get("h1"))?.starred).toBe(true);
    await toggleStar("h1");
    expect((await db.history.get("h1"))?.starred).toBe(false);
  });

  it("记录不存在时静默忽略", async () => {
    await expect(toggleStar("missing")).resolves.toBeUndefined();
    expect(await db.history.count()).toBe(0);
  });
});

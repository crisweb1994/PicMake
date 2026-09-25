import { describe, expect, it } from "vitest";
import {
  SKETCH_MAX_COMMANDS,
  blankSketch,
  cloneSketchDocument,
  commitCommand,
  eraserWidth,
  freezeSketch,
  makeStroke,
  penWidth,
  ratioMismatch,
  sketchSnapshotKey,
  toLogicalPoint,
  totalPoints,
  validateSketchDocument,
} from "./sketch";
import type { SketchCommand, SketchDocument } from "./types";

type StrokeCmd = Extract<SketchCommand, { type: "stroke" }>;

function strokeCmd(overrides: Partial<StrokeCmd> = {}): StrokeCmd {
  return {
    type: "stroke",
    tool: "pen",
    color: "#1A1A1A",
    width: 8,
    points: [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ],
    ...overrides,
  };
}

describe("toLogicalPoint", () => {
  const doc = { width: 1024, height: 768 };
  it("按显示矩形缩放到逻辑画布坐标", () => {
    const rect = { left: 100, top: 50, width: 512, height: 384 };
    expect(toLogicalPoint(100, 50, rect, doc)).toEqual({ x: 0, y: 0 });
    expect(toLogicalPoint(356, 242, rect, doc)).toEqual({ x: 512, y: 384 });
  });

  it("显示缩放不改变文档坐标（2x 与 0.5x 一致）", () => {
    const big = { left: 0, top: 0, width: 2048, height: 1536 };
    const small = { left: 0, top: 0, width: 512, height: 384 };
    expect(toLogicalPoint(1024, 768, big, doc)).toEqual(
      toLogicalPoint(256, 192, small, doc),
    );
  });
});

describe("笔宽", () => {
  const doc = { width: 1024, height: 768 };
  it("滑杆上大下小：t 越大笔越粗", () => {
    expect(penWidth(1, doc)).toBeGreaterThan(penWidth(0, doc));
    expect(eraserWidth(1, doc)).toBeGreaterThan(eraserWidth(0, doc));
  });

  it("下限保护：细笔 ≥1.5、橡皮 ≥5", () => {
    expect(penWidth(0, doc)).toBeGreaterThanOrEqual(1.5);
    expect(eraserWidth(0, doc)).toBeGreaterThanOrEqual(5);
  });
});

describe("commitCommand", () => {
  it("追加命令并推进游标", () => {
    const doc = blankSketch(1024, 1024);
    const next = commitCommand(doc, 0, strokeCmd());
    expect(next?.doc.commands).toHaveLength(1);
    expect(next?.cursor).toBe(1);
  });

  it("撤销后提交丢弃重做分支", () => {
    let doc = blankSketch(1024, 1024);
    let cursor = 0;
    for (let i = 0; i < 3; i++) {
      const next = commitCommand(doc, cursor, strokeCmd({ width: i + 1 }));
      doc = next!.doc;
      cursor = next!.cursor;
    }
    cursor = 1; // 撤销两步
    const next = commitCommand(doc, cursor, { type: "clear" });
    expect(next?.doc.commands).toHaveLength(2);
    expect(next?.doc.commands[1]).toEqual({ type: "clear" });
    expect(next?.cursor).toBe(2);
  });

  it("达到命令上限拒绝提交且不改原数组", () => {
    const doc: SketchDocument = {
      version: 1,
      width: 1024,
      height: 1024,
      commands: Array.from({ length: SKETCH_MAX_COMMANDS }, () => strokeCmd()),
    };
    expect(commitCommand(doc, doc.commands.length, strokeCmd())).toBeNull();
    expect(doc.commands).toHaveLength(SKETCH_MAX_COMMANDS);
  });
});

describe("totalPoints / 快照", () => {
  it("只统计提交前缀内的点", () => {
    const doc: SketchDocument = {
      version: 1,
      width: 1024,
      height: 1024,
      commands: [
        strokeCmd(),
        { type: "clear" },
        strokeCmd({ points: [{ x: 1, y: 1 }] }),
      ],
    };
    expect(totalPoints(doc, 2)).toBe(2);
    expect(totalPoints(doc)).toBe(3);
  });

  it("snapshotKey 随前缀内容变化，freezeSketch 丢弃重做分支", () => {
    const doc: SketchDocument = {
      version: 1,
      width: 1024,
      height: 1024,
      commands: [strokeCmd()],
    };
    const before = sketchSnapshotKey(doc, 1);
    expect(sketchSnapshotKey(doc, 0)).not.toBe(before);
    const frozen = freezeSketch(doc, 0);
    expect(frozen.commands).toHaveLength(0);
    expect(doc.commands).toHaveLength(1); // 原文档不被修改
  });

  it("cloneSketchDocument 深拷贝命令与点", () => {
    const doc: SketchDocument = {
      version: 1,
      width: 1024,
      height: 1024,
      commands: [strokeCmd()],
    };
    const clone = cloneSketchDocument(doc);
    expect(clone).toEqual(doc);
    expect(clone).not.toBe(doc);
    expect(clone.commands[0]).not.toBe(doc.commands[0]);
    expect((clone.commands[0] as StrokeCmd).points[0]).not.toBe(
      (doc.commands[0] as StrokeCmd).points[0],
    );
  });
});

describe("validateSketchDocument", () => {
  const valid = (): SketchDocument => ({
    version: 1,
    width: 1024,
    height: 1024,
    commands: [
      strokeCmd(),
      { type: "stroke", tool: "eraser", width: 30, points: [{ x: 5, y: 5 }] },
    ],
  });

  it("接受合法文档（含橡皮与 clear）", () => {
    const doc = {
      ...valid(),
      commands: [...valid().commands, { type: "clear" }],
    };
    expect(validateSketchDocument(doc)).toEqual(doc);
  });

  it("拒绝不支持的版本与非法输入", () => {
    expect(validateSketchDocument(null)).toBeNull();
    expect(validateSketchDocument({})).toBeNull();
    expect(validateSketchDocument({ ...valid(), version: 2 })).toBeNull();
    expect(validateSketchDocument({ ...valid(), width: 0 })).toBeNull();
    expect(validateSketchDocument({ ...valid(), width: 100 })).toBeNull(); // 低于 256
    expect(validateSketchDocument({ ...valid(), width: 4096 })).toBeNull();
    expect(validateSketchDocument({ ...valid(), commands: "x" })).toBeNull();
  });

  it("拒绝坏笔画：非法工具 / 越界笔宽 / 坏颜色 / 非有限坐标", () => {
    expect(
      validateSketchDocument({
        ...valid(),
        commands: [strokeCmd({ tool: "brush" as never })],
      }),
    ).toBeNull();
    expect(
      validateSketchDocument({
        ...valid(),
        commands: [strokeCmd({ width: 1e6 })],
      }),
    ).toBeNull();
    expect(
      validateSketchDocument({
        ...valid(),
        commands: [strokeCmd({ width: 0 })],
      }),
    ).toBeNull();
    expect(
      validateSketchDocument({
        ...valid(),
        commands: [strokeCmd({ color: "red" })],
      }),
    ).toBeNull();
    expect(
      validateSketchDocument({
        ...valid(),
        commands: [strokeCmd({ color: undefined })],
      }),
    ).toBeNull();
    expect(
      validateSketchDocument({
        ...valid(),
        commands: [strokeCmd({ points: [{ x: Number.NaN, y: 1 }] })],
      }),
    ).toBeNull();
    expect(
      validateSketchDocument({
        ...valid(),
        commands: [strokeCmd({ points: [{ x: -99999, y: 1 }] })],
      }),
    ).toBeNull();
    expect(
      validateSketchDocument({
        ...valid(),
        commands: [strokeCmd({ points: [] })],
      }),
    ).toBeNull();
  });

  it("橡皮不需要颜色；轻微出界坐标允许（画到边缘）", () => {
    const doc = {
      ...valid(),
      commands: [
        {
          type: "stroke",
          tool: "eraser",
          width: 20,
          points: [{ x: 1030, y: -8 }],
        },
      ],
    };
    expect(validateSketchDocument(doc)).toEqual(doc);
  });
});

describe("ratioMismatch", () => {
  it("1% 容差内视为一致", () => {
    expect(ratioMismatch({ w: 1024, h: 1024 }, { w: 2048, h: 2048 })).toBe(
      false,
    );
    expect(ratioMismatch({ w: 1024, h: 1024 }, { w: 1024, h: 1034 })).toBe(
      false,
    );
    expect(ratioMismatch({ w: 1536, h: 1024 }, { w: 1024, h: 1024 })).toBe(
      true,
    );
  });
});

describe("makeStroke", () => {
  it("画笔带颜色、橡皮不带", () => {
    expect(makeStroke("pen", "#E53935", 10)).toMatchObject({
      type: "stroke",
      tool: "pen",
      color: "#E53935",
      width: 10,
      points: [],
    });
    expect(makeStroke("eraser", undefined, 30)).toMatchObject({
      type: "stroke",
      tool: "eraser",
      width: 30,
      points: [],
    });
    expect("color" in makeStroke("eraser", undefined, 30)).toBe(false);
  });
});

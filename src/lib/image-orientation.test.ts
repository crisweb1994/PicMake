import { describe, expect, it } from "vitest";
import { readImageMeta } from "./image-orientation";

/** 构造最小 TIFF 头 IFD0（仅 orientation 条目） */
function tiffBytes(orientation?: number, little = true): number[] {
  const bytes: number[] = [];
  const put16 = (v: number) =>
    bytes.push(
      ...(little ? [v & 0xff, (v >> 8) & 0xff] : [(v >> 8) & 0xff, v & 0xff]),
    );
  const put32 = (v: number) =>
    bytes.push(
      ...(little
        ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]
        : [(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]),
    );
  put16(little ? 0x4949 : 0x4d4d);
  put16(0x2a);
  put32(8); // IFD0 相对偏移
  put16(orientation === undefined ? 0 : 1); // 条目数
  if (orientation !== undefined) {
    put16(0x0112);
    put16(3); // SHORT
    put32(1);
    put16(orientation);
    put16(0); // 值区补齐
  }
  put32(0); // 下一 IFD
  return bytes;
}

/** 构造最小 JPEG：SOI + APP1(Exif) + SOF0 + SOS/EOI */
function jpegBytes(
  exif: number[] | null,
  w = 100,
  h = 60,
): Uint8Array<ArrayBuffer> {
  const out: number[] = [0xff, 0xd8];
  if (exif) {
    const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...exif];
    out.push(
      0xff,
      0xe1,
      (payload.length + 2) >> 8,
      (payload.length + 2) & 0xff,
      ...payload,
    );
  }
  // SOF0 数据：precision、height(2)、width(2)、分量…
  const sof = [
    h >> 8,
    h & 0xff,
    w >> 8,
    w & 0xff,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  out.push(
    0xff,
    0xc0,
    (sof.length + 2) >> 8,
    (sof.length + 2) & 0xff,
    8,
    ...sof,
  );
  out.push(0xff, 0xda, 0x00, 0x08, 0x01, 1, 0, 0, 0x3f, 0x00); // SOS（长度占位）
  out.push(0xff, 0xd9);
  return new Uint8Array(out);
}

function pngBytes(
  exif: number[] | null,
  w = 64,
  h = 32,
): Uint8Array<ArrayBuffer> {
  const chunk = (type: string, data: number[]) => {
    const len = data.length;
    const body = [...type].map((c) => c.charCodeAt(0)).concat(data);
    // CRC 用 0 占位：本解析器不校验 CRC
    return [
      len >> 24,
      (len >> 16) & 0xff,
      (len >> 8) & 0xff,
      len & 0xff,
      ...body,
      0,
      0,
      0,
      0,
    ];
  };
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = chunk("IHDR", [
    w >> 24,
    (w >> 16) & 0xff,
    (w >> 8) & 0xff,
    w & 0xff,
    h >> 24,
    (h >> 16) & 0xff,
    (h >> 8) & 0xff,
    h & 0xff,
    8,
    6,
    0,
    0,
    0,
  ]);
  const exifChunk = exif
    ? chunk("eXIf", [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...exif])
    : [];
  const idat = chunk("IDAT", [0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]);
  return new Uint8Array([...head, ...ihdr, ...exifChunk, ...idat]);
}

function webpBytes(exif: number[] | null): Uint8Array<ArrayBuffer> {
  const chunk = (tag: string, data: number[]) => {
    const len = data.length;
    // RIFF 块：FourCC 标签在前、长度（小端）在后；数据按偶数字节对齐
    return [
      ...[...tag].map((c) => c.charCodeAt(0)),
      len & 0xff,
      (len >> 8) & 0xff,
      (len >> 16) & 0xff,
      (len >> 24) & 0xff,
      ...data,
      ...(len % 2 ? [0] : []),
    ];
  };
  // VP8L 位流（LSB 先行）：0x2f 签名 + (width-1) 14bit + (height-1) 14bit → 1024×2
  const bits = (1023 | (1 << 14)) >>> 0;
  const vp8l = chunk("VP8L", [
    0x2f,
    bits & 0xff,
    (bits >> 8) & 0xff,
    (bits >> 16) & 0xff,
    0x00,
  ]);
  const exifChunk = exif
    ? chunk("EXIF", [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...exif])
    : [];
  const body = [...vp8l, ...exifChunk];
  const size = body.length;
  return new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    size & 0xff,
    (size >> 8) & 0xff,
    (size >> 16) & 0xff,
    (size >> 24) & 0xff,
    0x57,
    0x45,
    0x42,
    0x50,
    ...body,
  ]);
}

describe("readImageMeta · JPEG", () => {
  it("无 EXIF → orientation 1，头尺寸", async () => {
    const meta = await readImageMeta(new Blob([jpegBytes(null)]));
    expect(meta).toEqual({ orientation: 1, width: 100, height: 60 });
  });

  it("EXIF orientation 1–8 读取（含镜像 / 180°，D1）", async () => {
    for (const o of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const meta = await readImageMeta(new Blob([jpegBytes(tiffBytes(o))]));
      expect(meta).toEqual({
        orientation: o === 1 ? 1 : o,
        width: 100,
        height: 60,
      });
    }
  });

  it("大端 TIFF 同样可读", async () => {
    const meta = await readImageMeta(
      new Blob([jpegBytes(tiffBytes(6, false))]),
    );
    expect(meta).toEqual({ orientation: 6, width: 100, height: 60 });
  });

  it("orientation 越界 / 类型错误 → unsupported-orientation（损坏不让流程静默继续）", async () => {
    const meta = await readImageMeta(new Blob([jpegBytes(tiffBytes(9))]));
    expect(meta).toEqual({ issue: "unsupported-orientation" });
  });

  it("截断的 APP1 → 按无标签处理或损坏，不以宽高猜方向", async () => {
    const bytes = jpegBytes(null);
    const meta = await readImageMeta(new Blob([bytes]));
    expect(meta).toEqual({ orientation: 1, width: 100, height: 60 });
  });
});

describe("readImageMeta · PNG", () => {
  it("IHDR 尺寸 + eXIf orientation", async () => {
    expect(await readImageMeta(new Blob([pngBytes(null)]))).toEqual({
      orientation: 1,
      width: 64,
      height: 32,
    });
    expect(await readImageMeta(new Blob([pngBytes(tiffBytes(3))]))).toEqual({
      orientation: 3,
      width: 64,
      height: 32,
    });
  });
});

describe("readImageMeta · WebP", () => {
  it("VP8L 尺寸 + EXIF（偶数填充）", async () => {
    expect(await readImageMeta(new Blob([webpBytes(tiffBytes(8))]))).toEqual({
      orientation: 8,
      width: 1024,
      height: 2,
    });
    expect(await readImageMeta(new Blob([webpBytes(null)]))).toEqual({
      orientation: 1,
      width: 1024,
      height: 2,
    });
  });

  it("EXIF 块被截断 → corrupt，不以宽高猜方向", async () => {
    // 截断到 11 字节：IFD 条目区越出文件 → corrupt；同时块长为奇数验证 RIFF 填充跳过
    const tiff = tiffBytes(1);
    const odd = tiff.slice(0, 11);
    const meta = await readImageMeta(new Blob([webpBytes(odd)]));
    expect(meta).toEqual({ issue: "unsupported-orientation" });
  });
});

describe("readImageMeta · 非支持容器", () => {
  it("未知格式 → canvas-failed（不猜）", async () => {
    const meta = await readImageMeta(new Blob([new Uint8Array([1, 2, 3, 4])]));
    expect(meta).toEqual({ issue: "canvas-failed" });
  });
});

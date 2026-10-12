import { deflateSync, crc32 } from "node:zlib";

// 与 playwright.config.ts 的 MOCK_PORT 一致
export const MOCK = "http://localhost:8788";

/** 纯色 PNG：用于上传底图，不依赖二进制夹具 */
export function solidPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const row = Buffer.alloc(1 + width * 3, 200);
  row[0] = 0;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(row.length * height, row))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

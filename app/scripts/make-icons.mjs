// Generates the original placeholder app icons (docs/09 §2) as PNGs without
// image dependencies: a green tile with a white "R" stroke shape and an amber dot.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const GREEN = [0x0f, 0x6b, 0x3e];
const AMBER = [0xf2, 0xa9, 0x00];
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, { maskable }) {
  const s = size / 32; // design grid matches the 32×32 SVG logo
  const scale = maskable ? 0.7 : 1;
  const off = (size - size * scale) / 2;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const inStroke = (x, y) => {
    // map to the 32-grid
    const gx = (x - off) / (s * scale);
    const gy = (y - off) / (s * scale);
    const w = 1.6;
    const near = (d) => d < w;
    // vertical bar x=9, y 10..22
    if (near(Math.abs(gx - 9)) && gy > 10 - w && gy < 22 + w) return true;
    // top bar y=10, x 9..16
    if (near(Math.abs(gy - 10)) && gx > 9 && gx < 16) return true;
    // middle bar y=18, x 9..16
    if (near(Math.abs(gy - 18)) && gx > 9 && gx < 16) return true;
    // arc: circle centre (16,14) r=4, right half
    const d = Math.hypot(gx - 16, gy - 14);
    if (gx >= 16 && near(Math.abs(d - 4))) return true;
    // leg from (16,18) to (21,22)
    const t = ((gx - 16) * 5 + (gy - 18) * 4) / 41;
    if (t > 0 && t < 1 && near(Math.hypot(gx - (16 + 5 * t), gy - (18 + 4 * t)))) return true;
    return false;
  };
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = (x - off) / (s * scale);
      const gy = (y - off) / (s * scale);
      let rgb = GREEN;
      if (Math.hypot(gx - 24, gy - 9) < 3) rgb = AMBER;
      else if (inStroke(x, y)) rgb = WHITE;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = rgb[0];
      raw[i + 1] = rgb[1];
      raw[i + 2] = rgb[2];
      raw[i + 3] = 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync("public/icons/icon-192.png", png(192, { maskable: false }));
writeFileSync("public/icons/icon-512.png", png(512, { maskable: false }));
writeFileSync("public/icons/maskable-512.png", png(512, { maskable: true }));
writeFileSync("public/icons/apple-touch-icon.png", png(180, { maskable: false }));
console.log("icons written");

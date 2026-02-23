/**
 * Generates minimal valid PNG icons for the extension.
 * Uses only Node.js built-in modules (zlib).
 */
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// CRC32 table
function buildCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}
const CRC_TABLE = buildCRC32Table();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBytes, data]);
  return Buffer.concat([uint32BE(data.length), typeBytes, data, uint32BE(crc32(crcInput))]);
}

/**
 * Create a simple icon: dark background with a teal "K" rendered as pixel art.
 * Colors: bg=#1a1a2e (26,26,46), accent=#00c896 (0,200,150)
 */
function createIconPNG(size) {
  const BG = [26, 26, 46];
  const ACC = [0, 200, 150];

  // Pixel art K pattern at 8x8 normalized, scaled to icon size
  // 1 = accent pixel, 0 = background
  const K8 = [
    [1,0,0,0,1,0,0,0],
    [1,0,0,1,0,0,0,0],
    [1,0,1,0,0,0,0,0],
    [1,1,0,0,0,0,0,0],
    [1,1,0,0,0,0,0,0],
    [1,0,1,0,0,0,0,0],
    [1,0,0,1,0,0,0,0],
    [1,0,0,0,1,0,0,0],
  ];

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);  // 8 bits per channel
  ihdr.writeUInt8(2, 9);  // RGB color type

  const scale = size / 8;
  const margin = Math.floor(size * 0.15);
  const rowSize = 1 + size * 3;
  const raw = Buffer.alloc(size * rowSize);

  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const px = y * rowSize + 1 + x * 3;
      const kx = Math.floor((x - margin) / scale);
      const ky = Math.floor((y - margin) / scale);
      const isK = ky >= 0 && ky < 8 && kx >= 0 && kx < 8 && K8[ky][kx] === 1;
      const [r, g, b] = isK ? ACC : BG;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const compressed = deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const iconsDir = resolve(ROOT, 'public/icons');
mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = createIconPNG(size);
  writeFileSync(resolve(iconsDir, `icon${size}.png`), png);
  console.log(`Generated icon${size}.png (${size}x${size})`);
}
console.log('Icons generated successfully.');

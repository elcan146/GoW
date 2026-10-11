// Generates procedural fx PNGs into ../assets/fx — rarity glow sprites,
// a screen vignette, and a Bayer dither tile. Re-run: node scripts/gen-fx.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, '..', 'assets', 'fx');
fs.mkdirSync(outDir, { recursive: true });

// ---- minimal PNG encoder (RGBA8, no filter) --------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

// ---- rarity glows — soft radial sprite, tinted per rarity -------------------
// Mirrors web CardSprite: aura sits behind the card, biased downward.
const RARITY = {
  mortal: '#9aa3ad', cursed: '#34d399', arcane: '#67e8f9',
  forbidden: '#c4b5fd', mythic: '#ff2a3c', relic: '#2dd4bf', divine: '#fde68a',
};
const G = 96;
for (const [name, col] of Object.entries(RARITY)) {
  const [r, g, b] = hex(col);
  const px = Buffer.alloc(G * G * 4);
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const dx = (x - G / 2) / (G / 2);
      const dy = (y - G / 2) / (G / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const a = Math.max(0, 1 - d) ** 1.7;
      const i = (y * G + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
      px[i + 3] = Math.round(a * 255);
    }
  }
  fs.writeFileSync(path.join(outDir, `glow_${name}.png`), png(G, G, px));
}

// ---- vignette — transparent center fading to 30% black at the edges ---------
// Matches web .scanlines radial-gradient(ellipse 105% 90%, transparent 70%, black 28%).
const V = 512;
{
  const px = Buffer.alloc(V * V * 4);
  for (let y = 0; y < V; y++) {
    for (let x = 0; x < V; x++) {
      const dx = (x - V / 2) / (V / 2) / 1.05;
      const dy = (y - V / 2) / (V / 2) / 0.9;
      const d = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(1, Math.max(0, (d - 0.7) / 0.3));
      const i = (y * V + x) * 4;
      px[i + 3] = Math.round(t * t * (3 - 2 * t) * 0.28 * 255);
    }
  }
  fs.writeFileSync(path.join(outDir, 'vignette.png'), png(V, V, px));
}

// ---- dither tile — 4x4 Bayer matrix as sparse black dots --------------------
// Approximates the web SVG ordered-dither filter: dark grain over the screen.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const D = 256, CELL = 2; // 2px cells → fine grain
{
  const px = Buffer.alloc(D * D * 4);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      const b = BAYER[((y / CELL) | 0) % 4 * 4 + ((x / CELL) | 0) % 4];
      const i = (y * D + x) * 4;
      px[i + 3] = Math.round((b / 15) * 150);
    }
  }
  fs.writeFileSync(path.join(outDir, 'dither.png'), png(D, D, px));
}

console.log('fx assets:', fs.readdirSync(outDir).join(', '));

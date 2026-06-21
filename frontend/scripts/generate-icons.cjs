/**
 * Generates Cadence's PWA icons (rounded gradient tile + white beamed note) with
 * zero dependencies — uses only Node's built-in zlib for PNG compression.
 * Run:  node scripts/generate-icons.cjs
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// ---- PNG encoder ----------------------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- art -------------------------------------------------------------------
const C0 = [139, 92, 246]; // #8b5cf6
const C1 = [99, 102, 241]; // #6366f1

function inRoundedSquare(nx, ny, r) {
  const dx = Math.max(r - nx, nx - (1 - r), 0);
  const dy = Math.max(r - ny, ny - (1 - r), 0);
  return dx * dx + dy * dy <= r * r;
}
function ellipse(nx, ny, cx, cy, rx, ry) {
  const a = (nx - cx) / rx, b = (ny - cy) / ry;
  return a * a + b * b <= 1;
}
function rect(nx, ny, x0, x1, y0, y1) {
  return nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1;
}
function isGlyph(nx, ny) {
  return (
    ellipse(nx, ny, 0.34, 0.70, 0.12, 0.095) ||
    ellipse(nx, ny, 0.66, 0.64, 0.12, 0.095) ||
    rect(nx, ny, 0.44, 0.475, 0.26, 0.71) ||
    rect(nx, ny, 0.76, 0.795, 0.20, 0.65) ||
    rect(nx, ny, 0.44, 0.795, 0.17, 0.27)
  );
}

function render(size) {
  const SS = 4; // supersample for smooth edges
  const big = size * SS;
  // high-res RGBA
  const hi = Buffer.alloc(big * big * 4);
  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const nx = x / big, ny = y / big;
      const i = (y * big + x) * 4;
      if (!inRoundedSquare(nx, ny, 0.22)) {
        hi[i + 3] = 0;
        continue;
      }
      let r, g, b;
      if (isGlyph(nx, ny)) {
        r = g = b = 255;
      } else {
        const t = (nx + ny) / 2;
        r = Math.round(C0[0] + (C1[0] - C0[0]) * t);
        g = Math.round(C0[1] + (C1[1] - C0[1]) * t);
        b = Math.round(C0[2] + (C1[2] - C0[2]) * t);
      }
      hi[i] = r; hi[i + 1] = g; hi[i + 2] = b; hi[i + 3] = 255;
    }
  }
  // box downsample SS×SS -> size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const hi_i = (((y * SS + sy) * big) + (x * SS + sx)) * 4;
          const al = hi[hi_i + 3];
          r += hi[hi_i] * al; g += hi[hi_i + 1] * al; b += hi[hi_i + 2] * al; a += al;
        }
      }
      const o = (y * size + x) * 4;
      if (a === 0) { out[o + 3] = 0; }
      else {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / (SS * SS));
      }
    }
  }
  return encodePNG(size, size, out);
}

const files = {
  'icon-192.png': 192,
  'icon-512.png': 512,
  'apple-touch-icon.png': 180,
};
for (const [name, size] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), render(size));
  console.log('wrote', name, `(${size}x${size})`);
}

// vector favicon
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6366f1"/>
  </linearGradient></defs>
  <rect width="100" height="100" rx="22" fill="url(#g)"/>
  <g fill="#fff">
    <ellipse cx="34" cy="70" rx="12" ry="9.5"/>
    <ellipse cx="66" cy="64" rx="12" ry="9.5"/>
    <rect x="44" y="26" width="3.5" height="45"/>
    <rect x="76" y="20" width="3.5" height="45"/>
    <rect x="44" y="17" width="35.5" height="10"/>
  </g>
</svg>`;
fs.writeFileSync(path.join(OUT, 'favicon.svg'), favicon);
console.log('wrote favicon.svg');

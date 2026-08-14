/**
 * 앱 아이콘 생성 — 외부 라이브러리 없이 순수 Node로 PNG를 직접 쓴다.
 * 디자인: 앱 색(#2563eb) 바탕에 흰 주가선 + 반투명 예상범위 밴드.
 * 4배로 그린 뒤 축소해 계단현상을 없앤다.
 */
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const OUT = path.join(__dirname, '..', '..', 'icons');

/* ── PNG 인코더 ── */
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ── 그리기 도구 (RGBA 캔버스) ── */
function canvas(w, h) { return { w, h, buf: Buffer.alloc(w * h * 4) }; }
function px(c, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4, ia = a / 255, inv = 1 - ia;
  c.buf[i] = Math.round(r * ia + c.buf[i] * inv);
  c.buf[i + 1] = Math.round(g * ia + c.buf[i + 1] * inv);
  c.buf[i + 2] = Math.round(b * ia + c.buf[i + 2] * inv);
  c.buf[i + 3] = Math.round(255 * ia + c.buf[i + 3] * inv);
}
function roundRect(c, x0, y0, x1, y1, rad, col) {
  for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) {
    let dx = 0, dy = 0;
    if (x < x0 + rad) dx = x0 + rad - x; else if (x > x1 - rad) dx = x - (x1 - rad);
    if (y < y0 + rad) dy = y0 + rad - y; else if (y > y1 - rad) dy = y - (y1 - rad);
    if (dx * dx + dy * dy <= rad * rad) px(c, x, y, ...col);
  }
}
function disc(c, cx, cy, r, col) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(c, x, y, ...col);
}
function line(c, pts, width, col) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.max(1, Math.ceil(d));
    for (let s = 0; s <= steps; s++) disc(c, x1 + (x2 - x1) * s / steps, y1 + (y2 - y1) * s / steps, width / 2, col);
  }
}
// 위·아래 경계선 사이를 채운다 (예상 범위 밴드)
function band(c, top, bot, col) {
  for (let i = 0; i < top.length - 1; i++) {
    const x1 = top[i][0], x2 = top[i + 1][0];
    for (let x = Math.ceil(x1); x <= x2; x++) {
      const t = (x - x1) / (x2 - x1 || 1);
      const yT = top[i][1] + (top[i + 1][1] - top[i][1]) * t;
      const yB = bot[i][1] + (bot[i + 1][1] - bot[i][1]) * t;
      for (let y = Math.floor(yT); y <= yB; y++) px(c, x, y, ...col);
    }
  }
}
function downsample(c, f) {
  const w = c.w / f, h = c.h / f, out = canvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const i = ((y * f + dy) * c.w + (x * f + dx)) * 4;
      const al = c.buf[i + 3]; r += c.buf[i] * al; g += c.buf[i + 1] * al; b += c.buf[i + 2] * al; a += al;
    }
    const o = (y * w + x) * 4, n = f * f;
    if (a > 0) { out.buf[o] = Math.round(r / a); out.buf[o + 1] = Math.round(g / a); out.buf[o + 2] = Math.round(b / a); }
    out.buf[o + 3] = Math.round(a / n);
  }
  return out;
}

/* ── 아이콘 그리기 ── */
const BLUE = [37, 99, 235, 255], WHITE = [255, 255, 255, 255], BANDC = [255, 255, 255, 64];
function drawIcon(size, maskable) {
  const F = 4, S = size * F, c = canvas(S, S);
  // 배경: 일반 아이콘은 둥근 사각형, maskable은 꽉 채움(런처가 알아서 자름)
  if (maskable) roundRect(c, 0, 0, S, S, 0, BLUE);
  else roundRect(c, 0, 0, S, S, S * 0.22, BLUE);
  // maskable은 바깥 20%가 잘릴 수 있으므로 그림을 안쪽으로 모은다
  const pad = maskable ? S * 0.28 : S * 0.20;
  const x0 = pad, x1 = S - pad, y0 = pad, y1 = S - pad, hgt = y1 - y0;
  const X = t => x0 + (x1 - x0) * t;
  const Y = v => y1 - hgt * v;                       // v: 0(아래) ~ 1(위)
  // 실제 주가선 (왼쪽 3/5)
  const real = [[X(0), Y(.30)], [X(.14), Y(.52)], [X(.27), Y(.34)], [X(.41), Y(.62)], [X(.55), Y(.50)]];
  // 예상 범위: 오른쪽으로 갈수록 벌어지는 부채꼴
  const top = [[X(.55), Y(.50)], [X(.72), Y(.68)], [X(1), Y(.92)]];
  const bot = [[X(.55), Y(.50)], [X(.72), Y(.32)], [X(1), Y(.08)]];
  band(c, top, bot, BANDC);
  line(c, real, S * 0.055, WHITE);
  disc(c, X(.55), Y(.50), S * 0.045, WHITE);
  return downsample(c, F);
}

fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['icon-192.png', 192, false], ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, false],
];
for (const [name, size, mask] of jobs) {
  const c = drawIcon(size, mask);
  const buf = encodePNG(c.w, c.h, c.buf);
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('✓', name.padEnd(24), size + 'x' + size, (buf.length / 1024).toFixed(1) + 'KB');
}

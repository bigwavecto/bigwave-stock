/**
 * PNG 인코더 + 간단한 그리기 도구 — 외부 라이브러리 없이 순수 Node로 PNG를 직접 쓴다.
 *
 * 아이콘(make_icons.js)과 공유 카드(make_og.js)가 함께 쓴다.
 * 두 곳에 복사해 두면 한쪽만 고쳐도 티가 안 나므로 한 파일로 모았다.
 *
 * 색은 [r,g,b,a] 배열로 넘긴다 (a는 0~255).
 * 4배로 그린 뒤 downsample 로 줄이면 계단현상이 사라진다.
 */
const zlib = require('zlib');

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
/* 위·아래 경계선 사이를 채운다 (예상 범위 밴드) */
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

module.exports = { encodePNG, canvas, px, roundRect, disc, line, band, downsample };

/**
 * 앱 아이콘 생성 — 외부 라이브러리 없이 순수 Node로 PNG를 직접 쓴다.
 * 디자인: 앱 색(#2563eb) 바탕에 흰 주가선 + 반투명 예상범위 밴드.
 * 4배로 그린 뒤 축소해 계단현상을 없앤다.
 *
 * PNG 인코더와 그리기 도구는 png.js 에 있다 (공유 카드 make_og.js 와 함께 쓴다).
 */
const fs = require('fs'), path = require('path');
const { encodePNG, canvas, roundRect, disc, line, band, downsample } = require('./png');
const OUT = path.join(__dirname, '..', '..', 'icons');

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

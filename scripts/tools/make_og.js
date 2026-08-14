/**
 * 공유 카드 이미지(og:image) 생성 — 1200×630.
 * 카카오톡·페이스북·X에 링크를 붙였을 때 뜨는 그림이다.
 *
 * 글자는 넣지 않는다. 제목·설명은 og:title / og:description 이 담당하고,
 * 여기에 글자를 넣으려면 폰트를 직접 그려야 하는데 그렇게 만든 글자는
 * 어차피 조악해 보인다. 대신 앱의 정체성을 그림 하나로 보여준다 —
 * **흰 주가선이 반투명 범위로 벌어지는 모양.** 아이콘과 같은 언어다.
 *
 * PNG 인코더와 그리기 도구는 png.js 를 함께 쓴다.
 * 사용: node scripts/tools/make_og.js
 */
const fs = require('fs'), path = require('path');
const { encodePNG, canvas, roundRect, disc, line, band, downsample } = require('./png');
const OUT = path.join(__dirname, '..', '..', 'icons');

const BLUE = [37, 99, 235, 255];
const DEEP = [26, 74, 189, 255];      // 아래쪽으로 살짝 어두워지게
const WHITE = [255, 255, 255, 255];
const BANDC = [255, 255, 255, 60];
const GRID = [255, 255, 255, 26];

function drawOG(W, H) {
  const F = 2, w = W * F, h = H * F, c = canvas(w, h);

  // 배경 — 위에서 아래로 살짝 어두워지는 단색 계열
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const col = [
      Math.round(BLUE[0] + (DEEP[0] - BLUE[0]) * t),
      Math.round(BLUE[1] + (DEEP[1] - BLUE[1]) * t),
      Math.round(BLUE[2] + (DEEP[2] - BLUE[2]) * t), 255];
    roundRect(c, 0, y, w, y + 1, 0, col);
  }

  // 옅은 가로 눈금 — 차트라는 인상만 준다
  for (let i = 1; i <= 4; i++) roundRect(c, 0, Math.round(h * i / 5), w, Math.round(h * i / 5) + F, 0, GRID);

  const padX = w * 0.10, padY = h * 0.18;
  const x0 = padX, x1 = w - padX, y0 = padY, y1 = h - padY, hgt = y1 - y0;
  const X = t => x0 + (x1 - x0) * t;
  const Y = v => y1 - hgt * v;                       // v: 0(아래) ~ 1(위)

  // 실제 주가선 — 왼쪽 절반. 아이콘과 같은 리듬으로 그린다.
  const real = [[X(0), Y(.28)], [X(.10), Y(.50)], [X(.19), Y(.33)], [X(.28), Y(.61)],
                [X(.37), Y(.44)], [X(.46), Y(.55)]];
  // 예상 범위 — 오른쪽으로 갈수록 벌어지는 부채꼴
  const top = [[X(.46), Y(.55)], [X(.65), Y(.74)], [X(.82), Y(.86)], [X(1), Y(.95)]];
  const bot = [[X(.46), Y(.55)], [X(.65), Y(.36)], [X(.82), Y(.24)], [X(1), Y(.15)]];

  band(c, top, bot, BANDC);
  line(c, real, w * 0.011, WHITE);
  // 범위의 위·아래 경계는 점선처럼 끊어 그린다 (예상이라는 표시)
  for (const edge of [top, bot]) {
    for (let i = 0; i < edge.length - 1; i++) {
      const [ax, ay] = edge[i], [bx, by] = edge[i + 1];
      const steps = 26;
      for (let s = 0; s < steps; s++) {
        if (s % 2) continue;                          // 한 칸 걸러 그려 점선을 만든다
        const t1 = s / steps, t2 = (s + 1) / steps;
        line(c, [[ax + (bx - ax) * t1, ay + (by - ay) * t1],
                 [ax + (bx - ax) * t2, ay + (by - ay) * t2]], w * 0.004, [255, 255, 255, 150]);
      }
    }
  }
  // 오늘 지점 — 실제와 예상이 갈리는 자리
  disc(c, X(.46), Y(.55), w * 0.013, WHITE);

  return downsample(c, F);
}

fs.mkdirSync(OUT, { recursive: true });
const c = drawOG(1200, 630);
const buf = encodePNG(c.w, c.h, c.buf);
fs.writeFileSync(path.join(OUT, 'og.png'), buf);
console.log('✓ og.png  1200x630  ' + (buf.length / 1024).toFixed(1) + 'KB');
if (buf.length > 300 * 1024) console.log('⚠️ 300KB가 넘습니다. 색 수를 줄이거나 눈금을 빼세요.');

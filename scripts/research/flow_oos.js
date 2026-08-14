/**
 * 기관 순매수 신호의 결정적 검증 — 표본 밖(out-of-sample)에서도 통하는가.
 *  A. 기간별 안정성 (2년 블록마다 IC가 유지되나)
 *  B. 기존 가격 요인과 겹치는가 (새 정보인가)
 *  C. 앱의 실제 기준: 워크포워드 점추정이 랜덤워크를 이기는가  ← 가장 중요
 *  D. 표본 밖 5분위 (구간 경계도 과거 데이터로만 결정)
 *  E. 하위 구간(기관 대량 순매도) 경보로 쓸 수 있나
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const D = CACHE;
const px = JSON.parse(fs.readFileSync(D + '/long.json', 'utf8'));
const fl = JSON.parse(fs.readFileSync(D + '/flow.json', 'utf8'));
const flowBy = {}; fl.forEach(r => { if (r.vol) flowBy[r.d] = r; });
const rows = px.filter(r => flowBy[r.d]);
const dates = rows.map(r => r.d), S = rows.map(r => r.c);
const VOL = dates.map(d => flowBy[d].vol), ORG = dates.map(d => flowBy[d].org), FRN = dates.map(d => flowBy[d].frn);
const N = dates.length;

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
function ratio(NET, i, n) { if (i - n + 1 < 0) return null; let a = 0, b = 0; for (let k = i - n + 1; k <= i; k++) { a += NET[k]; b += VOL[k]; } return b ? a / b : null; }
const fwd = (i, h) => (i + h < N ? Math.log(S[i + h] / S[i]) : null);
const past = (i, n) => (i - n >= 0 ? Math.log(S[i] / S[i - n]) : null);

// 하루 지연 적용 (실제 운용 조건)
const ORG20 = dates.map((_, i) => (i >= 1 ? ratio(ORG, i - 1, 20) : null));
const FRN20 = dates.map((_, i) => (i >= 1 ? ratio(FRN, i - 1, 20) : null));

function nwT(x, y, lag) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const beta = sxy / sxx, e = [];
  for (let i = 0; i < n; i++) e.push((y[i] - my) - beta * (x[i] - mx));
  let s = 0; for (let i = 0; i < n; i++) s += ((x[i] - mx) * e[i]) ** 2; s /= n;
  for (let L = 1; L <= lag; L++) { let g = 0; for (let i = L; i < n; i++) g += (x[i] - mx) * e[i] * (x[i - L] - mx) * e[i - L]; g /= n; s += 2 * (1 - L / (lag + 1)) * g; }
  const se = Math.sqrt(s * n) / (sxx / Math.sqrt(n)) / Math.sqrt(n);
  let syy = 0; for (let i = 0; i < n; i++) syy += (y[i] - my) ** 2;
  return { ic: sxy / Math.sqrt(sxx * syy), t: beta / (se || 1e-12), beta, n };
}
function series(F, h, from, to) {
  const xs = [], ys = [];
  for (let i = Math.max(80, from); i <= Math.min(to, N - 1 - h); i++) {
    const y = fwd(i, h); if (F[i] == null || y == null) continue; xs.push(F[i]); ys.push(y);
  }
  return { xs, ys };
}

/* A. 기간별 안정성 */
console.log('■ A. 기관 순매수 20일 — 2년 블록별 예측력 (h=20)');
console.log('   기간                 n      IC       t값');
const blocks = [];
for (let s = 80; s < N - 21; s += 500) blocks.push([s, Math.min(s + 499, N - 22)]);
for (const [a, b] of blocks) {
  const { xs, ys } = series(ORG20, 20, a, b); if (xs.length < 100) continue;
  const r = nwT(xs, ys, 20);
  console.log('   ' + (dates[a] + '~' + dates[b]).padEnd(24) + String(r.n).padStart(4) + r.ic.toFixed(3).padStart(9) + r.t.toFixed(2).padStart(9));
}
{ const { xs, ys } = series(ORG20, 20, 80, N - 22); const r = nwT(xs, ys, 20);
  console.log('   ' + '전체'.padEnd(24) + String(r.n).padStart(4) + r.ic.toFixed(3).padStart(9) + r.t.toFixed(2).padStart(9)); }

/* B. 기존 가격 요인과 겹치는가 */
console.log('\n■ B. 기관 순매수 20일이 기존 가격 지표와 겹치는가 (상관계수)');
const mom20 = dates.map((_, i) => past(i, 20)), mom60 = dates.map((_, i) => past(i, 60)), mom5 = dates.map((_, i) => past(i, 5));
function cor(a, b) {
  const xs = [], ys = [];
  for (let i = 0; i < N; i++) if (a[i] != null && b[i] != null && isFinite(a[i]) && isFinite(b[i])) { xs.push(a[i]); ys.push(b[i]); }
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
console.log('   과거 20일 수익률과: ' + cor(ORG20, mom20).toFixed(3) + '   과거 60일: ' + cor(ORG20, mom60).toFixed(3) + '   과거 5일: ' + cor(ORG20, mom5).toFixed(3));
console.log('   외국인 순매수 20일과: ' + cor(ORG20, FRN20).toFixed(3));

/* C. 앱의 실제 기준 — 워크포워드 점추정 vs 랜덤워크 */
console.log('\n■ C. 워크포워드 점추정 — 기관 순매수로 예측선을 만들면 랜덤워크를 이기는가');
console.log('   (매 시점 과거 데이터로만 회귀계수 추정 → 그 계수로 예측 → 실제와 대조)');
console.log('   기간   검증일수   모델MAE%  랜덤워크MAE%   비율     t값    방향적중%');
for (const h of [5, 20]) {
  const MIN = 750, ae = [], aen = [], dir = [];
  for (let i = MIN; i <= N - 1 - h; i++) {
    if (ORG20[i] == null) continue;
    const xs = [], ys = [];
    for (let j = 80; j <= i - h; j++) { const y = fwd(j, h); if (ORG20[j] == null || y == null) continue; xs.push(ORG20[j]); ys.push(y); }
    if (xs.length < 300) continue;
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0; for (let k = 0; k < xs.length; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; }
    const beta = sxy / sxx;
    let drift = my + beta * (ORG20[i] - mx);
    drift = Math.max(-0.12, Math.min(0.12, drift));            // 극단값 방지
    const last = S[i], act = S[i + h], pred = last * Math.exp(drift);
    ae.push(Math.abs(pred / act - 1) * 100); aen.push(Math.abs(last / act - 1) * 100);
    if (drift !== 0) dir.push((pred > last) === (act > last) ? 1 : 0);
  }
  const diff = ae.map((x, i) => x - aen[i]);
  const md = mean(diff), e = diff.map(x => x - md);
  let v = mean(e.map(x => x * x));
  for (let L = 1; L <= h; L++) { let g = 0; for (let i = L; i < e.length; i++) g += e[i] * e[i - L]; g /= e.length; v += 2 * (1 - L / (h + 1)) * g; }
  const t = md / Math.sqrt(v / diff.length);
  console.log('   ' + String(h).padStart(3) + String(ae.length).padStart(9) + mean(ae).toFixed(3).padStart(11) + mean(aen).toFixed(3).padStart(13) +
    (mean(ae) / mean(aen)).toFixed(3).padStart(9) + t.toFixed(2).padStart(8) + (mean(dir) * 100).toFixed(1).padStart(11));
}

/* D. 표본 밖 5분위 (경계도 과거로만) */
console.log('\n■ D. 표본 밖 5분위 — 구간 경계를 과거 3년 데이터로만 정하고 이후 수익률 관찰');
for (const h of [5, 20]) {
  const buckets = [[], [], [], [], []];
  for (let i = 830; i <= N - 1 - h; i++) {
    if (ORG20[i] == null) continue;
    const hist = []; for (let j = i - 750; j < i; j++) if (ORG20[j] != null) hist.push(ORG20[j]);
    if (hist.length < 400) continue;
    hist.sort((a, b) => a - b);
    const q = p => hist[Math.floor((hist.length - 1) * p)];
    const v = ORG20[i];
    const g = v <= q(.2) ? 0 : v <= q(.4) ? 1 : v <= q(.6) ? 2 : v <= q(.8) ? 3 : 4;
    buckets[g].push(fwd(i, h));
  }
  console.log('   h=' + String(h).padStart(2) + ' 평균수익률: ' + buckets.map((b, i) => 'Q' + (i + 1) + ' ' + (mean(b) * 100).toFixed(2) + '%(n=' + b.length + ')').join('  '));
  console.log('        상승비율: ' + buckets.map((b, i) => 'Q' + (i + 1) + ' ' + (b.filter(x => x > 0).length / b.length * 100).toFixed(0) + '%').join('  '));
}

/* E. 최하위 구간 경보 성능 */
console.log('\n■ E. "기관이 20일 연속 대량 순매도" 경보 (하위 20%)의 실제 성적 — h=20');
{
  const inQ1 = [], other = [];
  for (let i = 830; i <= N - 21; i++) {
    if (ORG20[i] == null) continue;
    const hist = []; for (let j = i - 750; j < i; j++) if (ORG20[j] != null) hist.push(ORG20[j]);
    if (hist.length < 400) continue;
    hist.sort((a, b) => a - b);
    (ORG20[i] <= hist[Math.floor((hist.length - 1) * .2)] ? inQ1 : other).push(fwd(i, 20));
  }
  const pct = a => ({ n: a.length, avg: (mean(a) * 100).toFixed(2), up: (a.filter(x => x > 0).length / a.length * 100).toFixed(0), dn5: (a.filter(x => x < -0.05).length / a.length * 100).toFixed(0) });
  const A = pct(inQ1), B = pct(other);
  console.log('   경보 발생일 (n=' + A.n + '): 평균 ' + A.avg + '%, 상승 ' + A.up + '%, -5% 이하 ' + A.dn5 + '%');
  console.log('   그 외   일  (n=' + B.n + '): 평균 ' + B.avg + '%, 상승 ' + B.up + '%, -5% 이하 ' + B.dn5 + '%');
}

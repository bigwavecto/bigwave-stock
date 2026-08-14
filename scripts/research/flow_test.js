/**
 * 수급(외국인·기관 순매수) 요인 검증 — 앞선 32개 요인과 동일한 기준.
 *  1) 개별 수급 요인의 예측력 (IC, Newey-West t)
 *  2) 수급만으로 방향/확률 예보 (워크포워드)
 *  3) 기존 32요인 + 수급 → 개선되는가
 *  4) 5분위 검정: "외국인이 많이 산 날" 이후 실제로 올랐나
 *  5) 같은날 설명력 vs 하루 뒤 예측력
 *
 * 수급 확정 시점을 고려해 lag 0(당일 반영)과 lag 1(하루 뒤 반영) 둘 다 돌린다.
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const D = CACHE;
const px = JSON.parse(fs.readFileSync(D + '/long.json', 'utf8'));      // 야후, 수정주가
const fl = JSON.parse(fs.readFileSync(D + '/flow.json', 'utf8'));      // 네이버 수급
const F = JSON.parse(fs.readFileSync(D + '/factors.json', 'utf8'));    // 기존 요인 원자료

const flowBy = {}; fl.forEach(r => { if (r.vol) flowBy[r.d] = r; });
const dates = px.map(r => r.d).filter(d => flowBy[d]);
const S = dates.map((d, i) => px.find(r => r.d === d).c);
console.log('정렬 완료:', dates.length, '일 |', dates[0], '~', dates[dates.length - 1]);

const N = dates.length;
const VOL = dates.map(d => flowBy[d].vol);
const FRN = dates.map(d => flowBy[d].frn);
const ORG = dates.map(d => flowBy[d].org);
const HOLD = dates.map(d => flowBy[d].frnHold);

const stdev = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
// n일 누적 순매수 / n일 누적 거래량 — 액면분할에 무관한 스케일프리 지표
function ratio(NET, i, n) {
  if (i - n + 1 < 0) return null;
  let a = 0, b = 0;
  for (let k = i - n + 1; k <= i; k++) { a += NET[k]; b += VOL[k]; }
  return b ? a / b : null;
}
const dHold = (i, n) => (i - n >= 0 && HOLD[i] != null && HOLD[i - n] != null ? HOLD[i] - HOLD[i - n] : null);
function zOf(NET, i) {
  if (i < 80) return null;
  const s = []; for (let k = i - 59; k <= i; k++) { const r = ratio(NET, k, 5); if (r == null) return null; s.push(r); }
  const sd = stdev(s); return sd ? (s[s.length - 1] - mean(s)) / sd : null;
}

const FLOW = [
  ['외국인 순매수 1일', i => ratio(FRN, i, 1)],
  ['외국인 순매수 5일', i => ratio(FRN, i, 5)],
  ['외국인 순매수 20일', i => ratio(FRN, i, 20)],
  ['외국인 순매수 60일', i => ratio(FRN, i, 60)],
  ['기관 순매수 1일', i => ratio(ORG, i, 1)],
  ['기관 순매수 5일', i => ratio(ORG, i, 5)],
  ['기관 순매수 20일', i => ratio(ORG, i, 20)],
  ['기관 순매수 60일', i => ratio(ORG, i, 60)],
  ['외국인+기관 20일', i => { const a = ratio(FRN, i, 20), b = ratio(ORG, i, 20); return a != null && b != null ? a + b : null; }],
  ['외국인-기관 20일', i => { const a = ratio(FRN, i, 20), b = ratio(ORG, i, 20); return a != null && b != null ? a - b : null; }],
  ['외국인 보유율', i => HOLD[i]],
  ['보유율 5일변화', i => dHold(i, 5)],
  ['보유율 20일변화', i => dHold(i, 20)],
  ['보유율 60일변화', i => dHold(i, 60)],
  ['외국인 순매수 z', i => zOf(FRN, i)],
  ['기관 순매수 z', i => zOf(ORG, i)],
];

const LAG = +(process.argv[2] || 0);   // 0 = 당일 수급 사용, 1 = 하루 늦게 반영
const START = 100;
function buildFlow(i) {
  const j = i - LAG; if (j < 0) return null;
  const row = []; for (const [, fn] of FLOW) { const v = fn(j); if (v == null || !isFinite(v)) return null; row.push(v); }
  return row;
}
const X = [], IDX = [];
for (let i = START; i < N; i++) { const r = buildFlow(i); if (r) { X.push(r); IDX.push(i); } }
const fwd = (i, h) => (i + h < N ? Math.log(S[i + h] / S[i]) : null);
console.log('수급 요인 행렬:', X.length, '행 ×', FLOW.length, '열 | lag =', LAG, '일');

function nwT(x, y, lag) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const r = sxy / Math.sqrt(sxx * syy), beta = sxy / sxx, e = [];
  for (let i = 0; i < n; i++) e.push((y[i] - my) - beta * (x[i] - mx));
  let s = 0; for (let i = 0; i < n; i++) s += ((x[i] - mx) * e[i]) ** 2; s /= n;
  for (let L = 1; L <= lag; L++) { let g = 0; for (let i = L; i < n; i++) g += (x[i] - mx) * e[i] * (x[i - L] - mx) * e[i - L]; g /= n; s += 2 * (1 - L / (lag + 1)) * g; }
  const se = Math.sqrt(s * n) / (sxx / Math.sqrt(n)) / Math.sqrt(n);
  return { r, t: beta / (se || 1e-12) };
}

/* 1) 개별 예측력 */
for (const h of [5, 20]) {
  const rows = [];
  for (let f = 0; f < FLOW.length; f++) {
    const xs = [], ys = [];
    for (let k = 0; k < X.length; k++) { const y = fwd(IDX[k], h); if (y != null) { xs.push(X[k][f]); ys.push(y); } }
    const { r, t } = nwT(xs, ys, h);
    rows.push({ name: FLOW[f][0], ic: r, t });
  }
  rows.sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
  console.log(`\n■ 수급 요인 개별 예측력 (${h}거래일 뒤) — |t|>2 여야 유의`);
  console.log('   요인                   IC        t값     판정');
  rows.forEach(r => console.log('   ' + r.name.padEnd(20) + r.ic.toFixed(3).padStart(8) + r.t.toFixed(2).padStart(9) + '     ' + (Math.abs(r.t) > 2 ? '★유의' : '무의미')));
  console.log('   유의 요인:', rows.filter(r => Math.abs(r.t) > 2).length, '/', rows.length);
}

/* 2) 5분위 검정 — 가장 직관적인 시험 */
console.log('\n■ 5분위 검정 — 요인값 낮은 순 → 높은 순으로 5등분, 이후 실제 수익률 평균(%)');
for (const fname of ['외국인 순매수 20일', '외국인 순매수 5일', '보유율 20일변화', '기관 순매수 20일']) {
  const f = FLOW.findIndex(x => x[0] === fname);
  const line = [];
  for (const h of [5, 20]) {
    const pairs = [];
    for (let k = 0; k < X.length; k++) { const y = fwd(IDX[k], h); if (y != null) pairs.push([X[k][f], y]); }
    pairs.sort((a, b) => a[0] - b[0]);
    const q = Math.floor(pairs.length / 5);
    const g = [0, 1, 2, 3, 4].map(i => {
      const seg = pairs.slice(i * q, i === 4 ? pairs.length : (i + 1) * q);
      return (mean(seg.map(x => x[1])) * 100).toFixed(2);
    });
    line.push('h=' + h + ': ' + g.join(' → '));
  }
  console.log('   ' + fname.padEnd(18) + line.join('   |   '));
}

/* 3) 워크포워드 확률 예보 */
function fitLogit(Xtr, ytr, lambda, iters = 400) {
  const p = Xtr[0].length, n = Xtr.length, w = new Array(p).fill(0); let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(p).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < p; j++) z += w[j] * Xtr[i][j];
      const d = 1 / (1 + Math.exp(-z)) - ytr[i];
      for (let j = 0; j < p; j++) gw[j] += d * Xtr[i][j];
      gb += d;
    }
    const step = 0.5 / (1 + it / 60);
    for (let j = 0; j < p; j++) w[j] -= step * (gw[j] / n + lambda * w[j] / n);
    b -= step * gb / n;
  }
  return { w, b };
}
function walk(h, cols, lambda) {
  const MIN = 700, REFIT = 21, preds = [], acts = [], bases = [];
  let m = null, mu = null, sg = null, base = null;
  for (let k = MIN; k < X.length; k++) {
    if (fwd(IDX[k], h) == null) break;
    if ((k - MIN) % REFIT === 0) {
      const tr = [], ty = [];
      for (let j = 0; j < k - h; j++) { const y = fwd(IDX[j], h); if (y == null) continue; tr.push(cols.map(c => X[j][c])); ty.push(y > 0 ? 1 : 0); }
      mu = tr[0].map((_, j) => mean(tr.map(r => r[j])));
      sg = tr[0].map((_, j) => stdev(tr.map(r => r[j])) || 1);
      m = fitLogit(tr.map(r => r.map((v, j) => (v - mu[j]) / sg[j])), ty, lambda);
      base = mean(ty);
    }
    let z = m.b; cols.forEach((c, j) => { z += m.w[j] * ((X[k][c] - mu[j]) / sg[j]); });
    preds.push(1 / (1 + Math.exp(-z))); acts.push(fwd(IDX[k], h) > 0 ? 1 : 0); bases.push(base);
  }
  const n = preds.length;
  const bs = mean(preds.map((p, i) => (p - acts[i]) ** 2)), bsb = mean(bases.map((p, i) => (p - acts[i]) ** 2));
  const pr = preds.map((p, i) => [p, acts[i]]).sort((a, b) => a[0] - b[0]);
  let pos = 0, neg = 0, rs = 0; pr.forEach(([, a], i) => { if (a === 1) { pos++; rs += i + 1; } else neg++; });
  return { n, bss: 1 - bs / bsb, auc: pos && neg ? (rs - pos * (pos + 1) / 2) / (pos * neg) : .5, acc: mean(preds.map((p, i) => ((p > .5 ? 1 : 0) === acts[i] ? 1 : 0))) };
}
console.log('\n■ 수급만으로 "오를 확률" 예보 (워크포워드) — BSS>0 이어야 평균보다 낫다');
console.log('   기간   검증일수     BSS       AUC    방향적중%');
for (const h of [5, 20]) {
  const r = walk(h, FLOW.map((_, i) => i), 2.0);
  console.log('   ' + String(h).padStart(3) + String(r.n).padStart(9) + r.bss.toFixed(4).padStart(11) + r.auc.toFixed(3).padStart(10) + (r.acc * 100).toFixed(1).padStart(11));
}

/* 4) 같은날 설명력 vs 하루 뒤 예측력 */
const lr = [null]; for (let i = 1; i < N; i++) lr.push(Math.log(S[i] / S[i - 1]));
function corr(a, b) {
  const xs = [], ys = [];
  for (let i = 0; i < N; i++) if (a[i] != null && b[i] != null && isFinite(a[i]) && isFinite(b[i])) { xs.push(a[i]); ys.push(b[i]); }
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
const frnR = dates.map((_, i) => ratio(FRN, i, 1)), orgR = dates.map((_, i) => ratio(ORG, i, 1));
const shift = (a, k) => { const o = new Array(N).fill(null); for (let i = k; i < N; i++) o[i] = a[i - k]; return o; };
console.log('\n■ 같은날 설명 vs 하루 뒤 예측 (일간 수익률과의 상관)');
console.log('   외국인 순매수 비율   같은날 ' + corr(lr, frnR).toFixed(3) + '     하루 뒤 예측 ' + corr(lr, shift(frnR, 1)).toFixed(3));
console.log('   기관   순매수 비율   같은날 ' + corr(lr, orgR).toFixed(3) + '     하루 뒤 예측 ' + corr(lr, shift(orgR, 1)).toFixed(3));

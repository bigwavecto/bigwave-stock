/**
 * 종합 제안을 위한 마지막 검증 2가지
 *  A. 장기(6개월·1년·2년) 예측은 가능한가 — 단기와 달리 장기는 되기도 한다는 통설 검증
 *  B. "임계값 도달 확률" 예보 — 범위보다 쓸모 있고, 변동성만으로 계산되므로 될 가능성이 높다
 *     P(앞으로 h일 안에 ±X% 도달) 을 만들고 워크포워드로 캘리브레이션 검증
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const px = JSON.parse(fs.readFileSync(path.join(CACHE, 'long.json'), 'utf8'));
const S = px.map(r => r.c), dates = px.map(r => r.d), N = S.length;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const LR = [null]; for (let i = 1; i < N; i++) LR.push(Math.log(S[i] / S[i - 1]));
const pv = (i, n) => { if (i - n < 1) return null; const s = []; for (let k = i - n + 1; k <= i; k++) s.push(LR[k]); return stdev(s); };
const blended = i => (i < 251 ? null : Math.sqrt(mean([20, 60, 250].map(n => Math.pow(pv(i, n), 2)))));
const sma = (i, n) => { if (i - n + 1 < 0) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += S[k]; return s / n; };
const fwd = (i, h) => (i + h < N ? Math.log(S[i + h] / S[i]) : null);

function nwT(x, y, lag) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const beta = sxy / sxx, e = [];
  for (let i = 0; i < n; i++) e.push((y[i] - my) - beta * (x[i] - mx));
  let s = 0; for (let i = 0; i < n; i++) s += ((x[i] - mx) * e[i]) ** 2; s /= n;
  for (let L = 1; L <= lag; L++) { let g = 0; for (let i = L; i < n; i++) g += (x[i] - mx) * e[i] * (x[i - L] - mx) * e[i - L]; g /= n; s += 2 * (1 - L / (lag + 1)) * g; }
  const se = Math.sqrt(s * n) / (sxx / Math.sqrt(n)) / Math.sqrt(n);
  return { ic: sxy / Math.sqrt(sxx * syy), t: beta / (se || 1e-12), n };
}

console.log('■ A. 장기 예측 — 가치·추세 이탈 지표로 6개월~2년을 맞힐 수 있는가');
console.log('   (겹치는 구간이 많아 실질 독립 표본은 매우 적다. 아래 "독립표본" 참고)');
const preds = [
  ['250일선 이격', i => { const m = sma(i, 250); return m ? Math.log(S[i] / m) : null; }],
  ['500일선 이격', i => { const m = sma(i, 500); return m ? Math.log(S[i] / m) : null; }],
  ['과거 1년 수익률', i => (i >= 250 ? Math.log(S[i] / S[i - 250]) : null)],
  ['과거 2년 수익률', i => (i >= 500 ? Math.log(S[i] / S[i - 500]) : null)],
  ['52주 고점 대비', i => { if (i < 250) return null; let h = -1e9; for (let k = i - 249; k <= i; k++) h = Math.max(h, S[k]); return Math.log(S[i] / h); }],
];
console.log('   지표              6개월(125일)          1년(250일)           2년(500일)');
console.log('                     IC     t값            IC     t값           IC     t값');
for (const [nm, fn] of preds) {
  const cells = [];
  for (const h of [125, 250, 500]) {
    const xs = [], ys = [];
    for (let i = 520; i < N - h; i++) { const v = fn(i), y = fwd(i, h); if (v != null && y != null && isFinite(v)) { xs.push(v); ys.push(y); } }
    if (xs.length < 100) { cells.push('     -      -'); continue; }
    const r = nwT(xs, ys, h);
    cells.push(r.ic.toFixed(3).padStart(8) + r.t.toFixed(2).padStart(8));
  }
  console.log('   ' + nm.padEnd(16) + cells.join('   '));
}
console.log('   독립표본 수: 6개월 ' + Math.floor((N - 520) / 125) + '개, 1년 ' + Math.floor((N - 520) / 250) + '개, 2년 ' + Math.floor((N - 520) / 500) + '개');

console.log('\n■ A-2. 장기 점추정이 랜덤워크를 이기는가 (워크포워드, 250일선 이격 사용)');
console.log('   기간      검증일수   모델MAE%  랜덤워크MAE%   비율');
for (const h of [125, 250]) {
  const ae = [], aen = [];
  for (let i = 900; i <= N - 1 - h; i++) {
    const f = i => { const m = sma(i, 250); return m ? Math.log(S[i] / m) : null; };
    const v = f(i); if (v == null) continue;
    const xs = [], ys = [];
    for (let j = 520; j <= i - h; j++) { const a = f(j), y = fwd(j, h); if (a != null && y != null) { xs.push(a); ys.push(y); } }
    if (xs.length < 200) continue;
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0; for (let k = 0; k < xs.length; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; }
    let drift = my + (sxy / sxx) * (v - mx);
    drift = Math.max(-0.6, Math.min(0.6, drift));
    ae.push(Math.abs(S[i] * Math.exp(drift) / S[i + h] - 1) * 100);
    aen.push(Math.abs(S[i] / S[i + h] - 1) * 100);
  }
  if (!ae.length) { console.log('   ' + h + '  데이터 부족'); continue; }
  console.log('   ' + String(h).padStart(4) + String(ae.length).padStart(11) + mean(ae).toFixed(2).padStart(11) + mean(aen).toFixed(2).padStart(13) + (mean(ae) / mean(aen)).toFixed(3).padStart(9));
}

/* ── B. 임계값 도달 확률 ── */
// 무드리프트 브라운 운동의 한쪽 배리어 도달 확률: P = 2*Φ(-b/(σ√h))
function ncdf(x) { const t = 1 / (1 + .2316419 * Math.abs(x)); const d = .3989423 * Math.exp(-x * x / 2); let p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
function pTouch(sigma, h, pct) {           // pct>0 상승 배리어, pct<0 하락 배리어
  const b = Math.abs(Math.log(1 + pct / 100));
  const s = sigma * Math.sqrt(h);
  return Math.min(1, 2 * ncdf(-b / s));
}
function touched(i, h, pct) {
  if (i + h >= N) return null;
  for (let k = i + 1; k <= i + h; k++) {
    const r = (S[k] / S[i] - 1) * 100;
    if (pct > 0 ? r >= pct : r <= pct) return true;
  }
  return false;
}
console.log('\n■ B. "임계값 도달 확률" 예보의 정확도 — 변동성만으로 계산 (방향 예측 없음)');
console.log('   예보한 확률 구간마다 실제 발생률을 대조한다. 대각선이면 정확한 예보.');
for (const h of [20, 60]) {
  for (const pct of [10, -10]) {
    const buckets = {};
    for (let i = 300; i <= N - 1 - h; i++) {
      const s = blended(i); if (s == null) continue;
      const p = pTouch(s, h, pct), a = touched(i, h, pct); if (a == null) continue;
      const k = Math.min(0.9, Math.max(0.1, Math.round(p * 10) / 10));
      (buckets[k] = buckets[k] || []).push(a ? 1 : 0);
    }
    const ks = Object.keys(buckets).map(Number).sort((a, b) => a - b).filter(k => buckets[k].length >= 40);
    console.log('   ' + String(h).padStart(2) + '일 내 ' + (pct > 0 ? '+' : '') + pct + '% 도달: ' +
      ks.map(k => `예보${(k * 100).toFixed(0)}%→실제${(mean(buckets[k]) * 100).toFixed(0)}%(n=${buckets[k].length})`).join('  '));
  }
}
// 전체 정확도 지표
console.log('\n   전체 정확도 (Brier score / 기준선 대비 개선도 BSS — 양수면 유용)');
console.log('   조건                 n      예보평균   실제평균    BSS');
for (const h of [20, 60]) {
  for (const pct of [5, 10, 20, -5, -10, -20]) {
    const ps = [], as = [];
    for (let i = 300; i <= N - 1 - h; i++) {
      const s = blended(i); if (s == null) continue;
      const a = touched(i, h, pct); if (a == null) continue;
      ps.push(pTouch(s, h, pct)); as.push(a ? 1 : 0);
    }
    const base = mean(as);
    const bs = mean(ps.map((p, i) => (p - as[i]) ** 2)), bsb = mean(as.map(a => (base - a) ** 2));
    console.log('   ' + (h + '일 내 ' + (pct > 0 ? '+' : '') + pct + '%').padEnd(18) + String(ps.length).padStart(6) +
      (mean(ps) * 100).toFixed(1).padStart(10) + '%' + (base * 100).toFixed(1).padStart(10) + '%' + (1 - bs / bsb).toFixed(3).padStart(9));
  }
}

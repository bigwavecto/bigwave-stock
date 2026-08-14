/**
 * 개선안 검증
 *  A. 신뢰구간 계산법 4가지 비교 (목표: 적중률 80%, 폭은 좁을수록 좋음)
 *  B. 예측선(점추정) 변형 비교 — 랜덤워크를 이기는 게 있는가
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const rows = JSON.parse(fs.readFileSync(path.join(CACHE, 'long.json'), 'utf8'));
const closes = rows.map(r => r.c);
const N = closes.length;
const LOGR = []; for (let i = 1; i < N; i++) LOGR.push(Math.log(closes[i] / closes[i - 1]));

const sma = (a, n) => { let s = 0; for (let k = a.length - n; k < a.length; k++) s += a[k]; return s / n; };
const stdev = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

const HOR = [5, 10, 20, 60];
const START = 300;

/* ===== A. 신뢰구간 계산법 ===== */
// rIdx: 시점 i 까지의 로그수익률 인덱스 (LOGR[0..i-1])
function bands(i, h, method) {
  const past = LOGR.slice(0, i);                 // 미래 정보 없음
  if (method === 'current') {                    // 현행: 20일 표준편차 × √h × 1.2816
    const v = stdev(past.slice(-20));
    return [-1.2816 * v * Math.sqrt(h), 1.2816 * v * Math.sqrt(h)];
  }
  if (method === 'ewma') {                       // EWMA(λ=0.94) 변동성
    let v2 = Math.pow(stdev(past.slice(-60)), 2);
    for (const r of past.slice(-120)) v2 = 0.94 * v2 + 0.06 * r * r;
    const v = Math.sqrt(v2);
    return [-1.2816 * v * Math.sqrt(h), 1.2816 * v * Math.sqrt(h)];
  }
  if (method === 'blend') {                      // 20일·60일·250일 변동성 혼합
    const v = Math.sqrt((Math.pow(stdev(past.slice(-20)), 2) + Math.pow(stdev(past.slice(-60)), 2) + Math.pow(stdev(past.slice(-250)), 2)) / 3);
    return [-1.2816 * v * Math.sqrt(h), 1.2816 * v * Math.sqrt(h)];
  }
  if (method === 'empirical') {                  // 과거 500일의 실제 h일 수익률 분포 10~90% 분위
    const win = [];
    for (let k = Math.max(0, i - 500 - h); k + h <= i; k++) {
      let s = 0; for (let j = k; j < k + h; j++) s += past[j];
      win.push(s);
    }
    if (win.length < 50) return null;
    return [q(win, 0.10), q(win, 0.90)];
  }
}

console.log('■ A. 신뢰구간(80%) 계산법 비교 — 적중률이 80%에 가깝고 폭이 좁을수록 좋다');
console.log('   방식        h    적중률%   평균폭±%');
for (const method of ['current', 'ewma', 'blend', 'empirical']) {
  for (const h of HOR) {
    const cov = [], wid = [];
    for (let i = START; i <= N - 1 - h; i++) {
      const b = bands(i, h, method); if (!b) continue;
      const last = closes[i], act = closes[i + h];
      const r = Math.log(act / last);
      cov.push(r >= b[0] && r <= b[1] ? 1 : 0);
      wid.push((Math.exp((b[1] - b[0]) / 2) - 1) * 100);
    }
    console.log('   ' + method.padEnd(11) + String(h).padStart(3) + (mean(cov) * 100).toFixed(1).padStart(10) + mean(wid).toFixed(1).padStart(11));
  }
}

/* ===== B. 점추정 변형 ===== */
const clamp = d => Math.max(-0.015, Math.min(0.015, d));
function drift(i, kind) {
  const hist = closes.slice(0, i + 1), last = hist[hist.length - 1];
  const past = LOGR.slice(0, i);
  const alpha = 2 / 11; let mom = 0;
  past.slice(-10).forEach(r => { mom = alpha * r + (1 - alpha) * mom; });
  const rev = 0.06 * Math.log(sma(hist, 20) / last);
  switch (kind) {
    case 'naive': return 0;
    case 'deployed': return clamp(0.4 * mom + 0.3 * rev + 0.3 * Math.log(1.25) / 252);
    case 'reversed': return clamp(-(0.4 * mom + 0.3 * rev));      // 부호 반대
    case 'revonly': return clamp(0.3 * rev);                       // 평균회귀만
    case 'momonly': return clamp(0.4 * mom);                       // 모멘텀만
    case 'histdrift': return mean(past.slice(-250));               // 과거 1년 평균 수익률
    case 'shrunk': return clamp(0.25 * (0.4 * mom + 0.3 * rev));   // 현행을 1/4로 축소
  }
}
console.log('\n■ B. 예측선(점추정) 비교 — MAE가 낮을수록 정확. 랜덤워크(naive)가 기준선');
console.log('   방식        h=5 MAE%   h=20 MAE%   h=60 MAE%   방향적중%(h=5)');
for (const kind of ['naive', 'deployed', 'reversed', 'revonly', 'momonly', 'histdrift', 'shrunk']) {
  const res = {}; let dir5 = [];
  for (const h of [5, 20, 60]) {
    const ae = [];
    for (let i = START; i <= N - 1 - h; i++) {
      const last = closes[i], d = drift(i, kind);
      const pred = last * Math.exp(d * h), act = closes[i + h];
      ae.push(Math.abs(pred / act - 1) * 100);
      if (h === 5 && d !== 0) dir5.push((pred > last) === (act > last) ? 1 : 0);
    }
    res[h] = mean(ae);
  }
  console.log('   ' + kind.padEnd(11) + res[5].toFixed(3).padStart(9) + res[20].toFixed(3).padStart(12) + res[60].toFixed(3).padStart(12) +
    (dir5.length ? (mean(dir5) * 100).toFixed(1).padStart(16) : '               -'));
}

/* ===== C. 상승확률 계산이 맞는가 (캘리브레이션) ===== */
console.log('\n■ C. "h일 뒤 오를 확률" 예보의 정확도 — 랜덤워크+실제분포 기반');
for (const h of [5, 20]) {
  const buckets = {};
  for (let i = START; i <= N - 1 - h; i++) {
    const b = bands(i, h, 'empirical'); if (!b) continue;
    const past = LOGR.slice(0, i);
    const win = [];
    for (let k = Math.max(0, i - 500 - h); k + h <= i; k++) { let s = 0; for (let j = k; j < k + h; j++) s += past[j]; win.push(s); }
    const pUp = win.filter(x => x > 0).length / win.length;       // 예보 확률
    const actUp = closes[i + h] > closes[i] ? 1 : 0;
    const key = Math.round(pUp * 10) / 10;
    (buckets[key] = buckets[key] || []).push(actUp);
  }
  const ks = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  console.log('   h=' + h + ' | 예보확률 → 실제상승률 (n)');
  console.log('        ' + ks.map(k => `${(k * 100).toFixed(0)}%→${(mean(buckets[k]) * 100).toFixed(0)}% (${buckets[k].length})`).join('  '));
}

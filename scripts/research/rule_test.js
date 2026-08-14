/**
 * "신고가 부근 / 강한 모멘텀" 규칙이 앱에 쓸 수 있는가.
 *  1) 평균 수익률 예측: 랜덤워크를 이기는가 (워크포워드)
 *  2) 비대칭 밴드: 위아래를 다르게 잡으면 구간 적중률이 나아지는가
 *  3) 표본 밖 배리어 확률: 과거 데이터로만 판정·집계해도 비대칭이 남는가
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const F = JSON.parse(fs.readFileSync(path.join(CACHE, 'factors.json'), 'utf8'));
const dates = Object.keys(F.samsung).sort();
const S = dates.map(d => F.samsung[d].c);
const N = S.length;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const LR = [null]; for (let i = 1; i < N; i++) LR.push(Math.log(S[i] / S[i - 1]));
const pv = (i, n) => { if (i - n < 1) return null; const s = []; for (let k = i - n + 1; k <= i; k++) s.push(LR[k]); return stdev(s); };
const blended = i => (i < 251 ? null : Math.sqrt(mean([20, 60, 250].map(n => Math.pow(pv(i, n), 2)))));
const dd52 = i => { if (i < 250) return null; let h = -1e9; for (let k = i - 249; k <= i; k++) h = Math.max(h, S[k]); return S[i] / h - 1; };
const nearHigh = i => { const x = dd52(i); return x != null && x >= -0.03; };
const fwd = (i, h) => (i + h < N ? Math.log(S[i + h] / S[i]) : null);

/* 1. 평균 수익률 — 앱의 기준 */
console.log('■ 1. 신고가 부근일 때 예측선을 올리면 랜덤워크를 이기는가 (워크포워드)');
console.log('   기간   검증일수   모델MAE%  랜덤워크MAE%   비율     t값');
for (const h of [5, 20]) {
  const ae = [], aen = [];
  for (let i = 800; i <= N - 1 - h; i++) {
    const st = nearHigh(i); if (st == null) continue;
    // 과거의 같은 상태 날들의 평균 수익률을 드리프트로 사용
    const hist = [];
    for (let j = 300; j <= i - h; j++) { const y = fwd(j, h); if (y != null && nearHigh(j) === st) hist.push(y); }
    if (hist.length < 60) continue;
    let drift = mean(hist);
    drift = Math.max(-0.12, Math.min(0.12, drift));
    const last = S[i], act = S[i + h];
    ae.push(Math.abs(last * Math.exp(drift) / act - 1) * 100);
    aen.push(Math.abs(last / act - 1) * 100);
  }
  const diff = ae.map((x, i) => x - aen[i]), md = mean(diff), e = diff.map(x => x - md);
  let v = mean(e.map(x => x * x));
  for (let L = 1; L <= h; L++) { let g = 0; for (let i = L; i < e.length; i++) g += e[i] * e[i - L]; g /= e.length; v += 2 * (1 - L / (h + 1)) * g; }
  console.log('   ' + String(h).padStart(3) + String(ae.length).padStart(9) + mean(ae).toFixed(3).padStart(11) +
    mean(aen).toFixed(3).padStart(13) + (mean(ae) / mean(aen)).toFixed(3).padStart(9) + (md / Math.sqrt(v / diff.length)).toFixed(2).padStart(8));
}

/* 2. 비대칭 밴드 */
console.log('\n■ 2. 비대칭 밴드 — 신고가 부근에서 위쪽을 넓게 잡으면 나아지는가');
console.log('   방식                          기간  검증일수  적중률%  평균폭±%  중심 이동');
const Z = 1.2816 * 1.05;   // 앞서 찾은 캘리브레이션 반영
function evalBand(h, mode) {
  const cov = [], wid = [], shift = [];
  for (let i = 800; i <= N - 1 - h; i++) {
    const b = blended(i); if (b == null) continue;
    const base = Z * b * Math.sqrt(h);
    let up = base, dn = base;
    if (mode === 'asym') {
      // 과거 같은 상태 날들의 상·하위 분위로 위아래를 따로 잡는다
      const st = nearHigh(i), hist = [];
      for (let j = 300; j <= i - h; j++) { const y = fwd(j, h); if (y != null && nearHigh(j) === st) hist.push(y); }
      if (hist.length < 100) continue;
      hist.sort((a, c) => a - c);
      dn = -hist[Math.floor((hist.length - 1) * 0.10)];
      up = hist[Math.floor((hist.length - 1) * 0.90)];
      if (!(dn > 0) || !(up > 0)) continue;
    }
    const r = fwd(i, h); if (r == null) continue;
    cov.push(r >= -dn && r <= up ? 1 : 0);
    wid.push(((Math.exp(up) - 1) + (1 - Math.exp(-dn))) / 2 * 100);
    shift.push(((Math.exp(up) - 1) - (1 - Math.exp(-dn))) / 2 * 100);
  }
  return { n: cov.length, cov: mean(cov) * 100, wid: mean(wid), sh: mean(shift) };
}
for (const h of [5, 20]) {
  for (const [nm, mode] of [['대칭 (현행 + 1.05 보정)', 'sym'], ['상태별 비대칭 분위', 'asym']]) {
    const r = evalBand(h, mode);
    console.log('   ' + nm.padEnd(28) + String(h).padStart(4) + String(r.n).padStart(9) + r.cov.toFixed(1).padStart(9) + r.wid.toFixed(1).padStart(10) + (r.sh >= 0 ? '+' : '') + r.sh.toFixed(1).padStart(9) + '%');
  }
}

/* 3. 표본 밖 배리어 확률 */
console.log('\n■ 3. 표본 밖 검증 — 과거 데이터로만 "이 상태에서 20일 내 ±10% 확률"을 추정하고 실제와 대조');
{
  const buckets = { '신고가 부근': { p: [], au: [], ad: [] }, '그 외': { p: [], au: [], ad: [] } };
  for (let i = 800; i <= N - 22; i++) {
    const st = nearHigh(i); const key = st ? '신고가 부근' : '그 외';
    let hu = 0, hd = 0, hn = 0;
    for (let j = 300; j <= i - 21; j++) {
      if (nearHigh(j) !== st) continue;
      let u = false, d = false;
      for (let k = j + 1; k <= j + 20; k++) { if (S[k] / S[j] - 1 >= .10) u = true; if (S[k] / S[j] - 1 <= -.10) d = true; }
      hn++; if (u) hu++; if (d) hd++;
    }
    if (hn < 100) continue;
    let au = false, ad = false;
    for (let k = i + 1; k <= i + 20; k++) { if (S[k] / S[i] - 1 >= .10) au = true; if (S[k] / S[i] - 1 <= -.10) ad = true; }
    buckets[key].p.push(hu / hn - hd / hn);
    buckets[key].au.push(au ? 1 : 0); buckets[key].ad.push(ad ? 1 : 0);
  }
  console.log('   상태            일수   과거기준 예상차이   실제 +10%   실제 -10%   실제 차이');
  for (const k of Object.keys(buckets)) {
    const b = buckets[k]; if (!b.p.length) continue;
    console.log('   ' + k.padEnd(14) + String(b.p.length).padStart(5) + (mean(b.p) * 100).toFixed(1).padStart(15) + '%p' +
      (mean(b.au) * 100).toFixed(1).padStart(12) + '%' + (mean(b.ad) * 100).toFixed(1).padStart(12) + '%' +
      ((mean(b.au) - mean(b.ad)) * 100).toFixed(1).padStart(11) + '%p');
  }
}

/**
 * 수급이 "변동 폭" 예측을 개선하는가 — 이 앱이 실제로 모델링하는 대상.
 *  1) 수급 지표가 이후 실현변동성을 예측하는가 (현재 변동성 통제 후에도)
 *  2) 밴드 계산에 수급을 넣으면 구간 적중률/폭이 나아지는가 (워크포워드)
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
const R = [null]; for (let i = 1; i < N; i++) R.push(Math.log(S[i] / S[i - 1]));

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
function rat(NET, i, n) { if (i - n + 1 < 0) return null; let a = 0, b = 0; for (let k = i - n + 1; k <= i; k++) { a += NET[k]; b += VOL[k]; } return b ? a / b : null; }
function realVol(i, n) { if (i + n >= N) return null; const s = []; for (let k = i + 1; k <= i + n; k++) s.push(R[k]); return stdev(s); }
function pastVol(i, n) { if (i - n < 1) return null; const s = []; for (let k = i - n + 1; k <= i; k++) s.push(R[k]); return stdev(s); }
function blended(i) {
  if (i < 251) return null;
  const v = [20, 60, 250].map(n => Math.pow(pastVol(i, n), 2));
  return Math.sqrt(mean(v));
}
// 거래량 급증도 (수급 활동 강도)
const volZ = dates.map((_, i) => { if (i < 60) return null; const a = mean(VOL.slice(i - 4, i + 1)), b = mean(VOL.slice(i - 59, i + 1)); return Math.log(a / b); });
// 하루 지연
const ORG20 = dates.map((_, i) => (i >= 1 ? rat(ORG, i - 1, 20) : null));
const FRN20 = dates.map((_, i) => (i >= 1 ? rat(FRN, i - 1, 20) : null));
const ABSFLOW = dates.map((_, i) => { if (i < 1) return null; const a = rat(ORG, i - 1, 20), b = rat(FRN, i - 1, 20); return a == null || b == null ? null : Math.abs(a) + Math.abs(b); });

function corr(xs, ys) {
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
console.log('■ 1. 수급 지표 → 이후 20일 실현변동성 (상관)');
const cand = [['기관 순매수 20일', ORG20], ['외국인 순매수 20일', FRN20], ['수급 절대강도', ABSFLOW], ['거래량 급증도', volZ], ['현재 혼합변동성(비교군)', dates.map((_, i) => blended(i))]];
const F20 = dates.map((_, i) => realVol(i, 20));
for (const [nm, arr] of cand) {
  const xs = [], ys = [];
  for (let i = 260; i < N - 21; i++) if (arr[i] != null && F20[i] != null && isFinite(arr[i])) { xs.push(arr[i]); ys.push(F20[i]); }
  console.log('   ' + nm.padEnd(22) + corr(xs, ys).toFixed(3).padStart(8) + '   (n=' + xs.length + ')');
}

console.log('\n■ 2. 현재 변동성을 통제한 뒤에도 수급이 추가 정보를 주는가 (잔차 상관)');
{
  const xs = [], ys = [], zs = [], ws = [];
  for (let i = 260; i < N - 21; i++) {
    const b = blended(i); if (b == null || F20[i] == null || ORG20[i] == null || ABSFLOW[i] == null) continue;
    xs.push(Math.log(b)); ys.push(Math.log(F20[i])); zs.push(ORG20[i]); ws.push(ABSFLOW[i]);
  }
  // ys를 xs로 회귀한 잔차
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const beta = sxy / sxx;
  const resid = ys.map((y, i) => y - (my + beta * (xs[i] - mx)));
  console.log('   기관 순매수 20일 ↔ 잔차: ' + corr(zs, resid).toFixed(3));
  console.log('   수급 절대강도   ↔ 잔차: ' + corr(ws, resid).toFixed(3));
  console.log('   (0에 가까우면 현재 변동성이 이미 담고 있는 정보 = 추가 가치 없음)');
}

console.log('\n■ 3. 밴드에 수급을 넣으면 나아지는가 — 워크포워드 구간 검증 (목표 적중률 80%)');
const Z = 1.2816;
function evalBand(h, adjust) {
  const cov = [], wid = [];
  for (let i = 300; i <= N - 1 - h; i++) {
    const b = blended(i); if (b == null) continue;
    if (alarmAt(i) == null) continue;        // 모든 방식을 동일 표본에서 비교 (경보 판정 가능한 날만)
    const k = adjust ? adjust(i) : 1;
    if (k == null) continue;
    const band = Z * b * k * Math.sqrt(h);
    const r = Math.log(S[i + h] / S[i]);
    cov.push(r >= -band && r <= band ? 1 : 0);
    wid.push((Math.exp(band) - 1) * 100);
  }
  return { n: cov.length, cov: mean(cov) * 100, wid: mean(wid) };
}
// 경보(기관 대량 순매도) 시 밴드를 넓히는 규칙 — 과거 3년 하위 20% 기준, 계수는 과거 데이터로 추정
function alarmAt(i) {
  if (ORG20[i] == null || i < 830) return null;
  const hist = []; for (let j = i - 750; j < i; j++) if (ORG20[j] != null) hist.push(ORG20[j]);
  if (hist.length < 400) return null;
  hist.sort((a, b) => a - b);
  return ORG20[i] <= hist[Math.floor((hist.length - 1) * 0.2)];
}
console.log('   기간   방식                        검증일수  적중률%   평균폭±%');
for (const h of [5, 20]) {
  for (const [nm, adj] of [
    ['현행 (혼합변동성만)', null],
    ['경보 시 밴드 ×1.15', i => { const a = alarmAt(i); return a == null ? null : (a ? 1.15 : 1); }],
    ['경보 시 밴드 ×1.30', i => { const a = alarmAt(i); return a == null ? null : (a ? 1.30 : 1); }],
    ['거래량 급증 반영', i => (volZ[i] == null ? null : Math.min(1.3, Math.max(0.85, 1 + 0.35 * volZ[i])))],
    ['── 공정 비교: 조건 없이 전체를 넓히기 ──', i => null],
    ['전체 ×1.05', i => 1.05],
    ['전체 ×1.08', i => 1.08],
  ]) {
    if (nm.startsWith('──')) { console.log('   ' + ' '.repeat(6) + nm); continue; }
    const r = evalBand(h, adj);
    console.log('   ' + String(h).padStart(3) + '   ' + nm.padEnd(26) + String(r.n).padStart(6) + r.cov.toFixed(1).padStart(9) + r.wid.toFixed(1).padStart(11));
  }
}

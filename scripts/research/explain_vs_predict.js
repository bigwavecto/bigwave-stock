/**
 * 설명력 vs 예측력
 *  같은 날 요인으로 그날 주가를 "설명"하는 힘과, 어제 요인으로 오늘을 "예측"하는 힘을 비교.
 *  + 정직한 기준 확률(무조건부 상승률) 산출
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const F = JSON.parse(fs.readFileSync(path.join(CACHE, 'factors.json'), 'utf8'));
const dates = Object.keys(F.samsung).sort();
const usKeys = {}; for (const k of ['nasdaq', 'vix', 'sox', 'tsmc']) usKeys[k] = Object.keys(F[k]).sort();
function usBefore(name, d) { const ks = usKeys[name]; let lo = 0, hi = ks.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (ks[m] < d) { r = ks[m]; lo = m + 1; } else hi = m - 1; } return r ? F[name][r].c : null; }
const ffill = a => { let l = null; return a.map(x => (x == null ? l : (l = x))); };

const S = dates.map(d => F.samsung[d].c);
const KS = ffill(dates.map(d => (F.kospi[d] ? F.kospi[d].c : null)));
const HY = ffill(dates.map(d => (F.hynix[d] ? F.hynix[d].c : null)));
const FX = ffill(dates.map(d => (F.usdkrw[d] ? F.usdkrw[d].c : null)));
const SX = ffill(dates.map(d => usBefore('sox', d)));
const NQ = ffill(dates.map(d => usBefore('nasdaq', d)));
const N = dates.length;
const R = a => { const o = [null]; for (let i = 1; i < N; i++) o.push(a[i] && a[i - 1] ? Math.log(a[i] / a[i - 1]) : null); return o; };
const rS = R(S), rKS = R(KS), rHY = R(HY), rFX = R(FX), rSX = R(SX), rNQ = R(NQ);

// 다중회귀 R² (정규방정식, 소규모라 가우스 소거)
function r2(Y, Xs) {
  const rows = [];
  for (let i = 0; i < Y.length; i++) {
    if (Y[i] == null || !isFinite(Y[i])) continue;
    const x = Xs.map(a => a[i]); if (x.some(v => v == null || !isFinite(v))) continue;
    rows.push([1, ...x, Y[i]]);
  }
  const p = Xs.length + 1, n = rows.length;
  const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  for (const r of rows) for (let a = 0; a < p; a++) { for (let b = 0; b < p; b++) A[a][b] += r[a] * r[b]; A[a][p] += r[a] * r[p]; }
  for (let c = 0; c < p; c++) {
    let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < p; r++) { if (r === c || Math.abs(A[c][c]) < 1e-14) continue; const f = A[r][c] / A[c][c]; for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k]; }
  }
  const w = A.map((row, i) => row[p] / (row[i] || 1e-14));
  const my = rows.reduce((s, r) => s + r[p], 0) / n;
  let ss = 0, tt = 0;
  for (const r of rows) { let yh = 0; for (let a = 0; a < p; a++) yh += w[a] * r[a]; ss += (r[p] - yh) ** 2; tt += (r[p] - my) ** 2; }
  return { r2: 1 - ss / tt, n };
}
const lagBy = (a, k) => { const o = new Array(N).fill(null); for (let i = k; i < N; i++) o[i] = a[i - k]; return o; };

const F0 = [rKS, rHY, rFX, rSX, rNQ];
const same = r2(rS, F0);
const lag1 = r2(rS, F0.map(a => lagBy(a, 1)));
console.log('■ 같은 요인, 두 가지 질문');
console.log('   ① 오늘 요인들로 오늘 삼성전자 등락을 설명 → R² = ' + (same.r2 * 100).toFixed(1) + '%   (n=' + same.n + ')');
console.log('   ② 어제 요인들로 오늘 삼성전자 등락을 예측 → R² = ' + (lag1.r2 * 100).toFixed(1) + '%   (n=' + lag1.n + ')');
console.log('   → 요인은 주가를 잘 "설명"하지만, 하루만 밀려도 "예측"에는 거의 쓸모가 없다.');

console.log('\n■ 개별 요인: 같은날 상관 vs 하루 뒤 예측 상관');
for (const [nm, a] of [['코스피', rKS], ['하이닉스', rHY], ['반도체지수', rSX], ['나스닥', rNQ], ['원달러', rFX]]) {
  const cor = (x, y) => {
    const xs = [], ys = [];
    for (let i = 0; i < N; i++) if (x[i] != null && y[i] != null && isFinite(x[i]) && isFinite(y[i])) { xs.push(x[i]); ys.push(y[i]); }
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return sxy / Math.sqrt(sxx * syy);
  };
  console.log('   ' + nm.padEnd(7) + '같은날 ' + cor(rS, a).toFixed(3).padStart(7) + '     하루 뒤 예측 ' + cor(rS, lagBy(a, 1)).toFixed(3).padStart(7));
}

console.log('\n■ 정직한 기준 확률 — 10년간 무조건부 상승 비율 (이 값이 정보 없는 상태의 정답)');
for (const h of [1, 5, 10, 20, 60]) {
  let up = 0, tot = 0;
  for (let i = 0; i + h < N; i++) { tot++; if (S[i + h] > S[i]) up++; }
  console.log('   ' + String(h).padStart(3) + '거래일 뒤 상승 확률: ' + (up / tot * 100).toFixed(1) + '%   (n=' + tot + ')');
}

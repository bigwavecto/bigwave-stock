/** 신고가 부근 상태의 조건부 평균 수익률 — 시기별로 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const F = JSON.parse(fs.readFileSync(path.join(CACHE, 'factors.json'), 'utf8'));
const dates = Object.keys(F.samsung).sort();
const S = dates.map(d => F.samsung[d].c), N = S.length;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const dd52 = i => { if (i < 250) return null; let h = -1e9; for (let k = i - 249; k <= i; k++) h = Math.max(h, S[k]); return S[i] / h - 1; };
const nearHigh = i => { const x = dd52(i); return x != null && x >= -0.03; };
const fwd = (i, h) => (i + h < N ? (S[i + h] / S[i] - 1) * 100 : null);

console.log('■ 신고가 부근 상태의 이후 20일 평균 수익률 (조건부)');
console.log('   기간              신고가 부근                    그 외');
console.log('                   일수  평균수익  상승%       일수  평균수익  상승%');
const periods = [['2017-01-01', '2019-01-01'], ['2019-01-01', '2022-01-01'], ['2022-01-01', '2025-01-01'], ['2025-01-01', '2026-01-01'], ['2026-01-01', '2027-01-01'], ['2017-01-01', '2027-01-01']];
for (const [a, b] of periods) {
  const A = [], B = [];
  for (let i = 300; i <= N - 22; i++) {
    if (dates[i] < a || dates[i] >= b) continue;
    const r = fwd(i, 20); if (r == null) continue;
    (nearHigh(i) ? A : B).push(r);
  }
  const f = arr => arr.length ? String(arr.length).padStart(5) + mean(arr).toFixed(2).padStart(9) + '%' + (arr.filter(x => x > 0).length / arr.length * 100).toFixed(0).padStart(6) + '%' : '    0        -      -';
  const label = (a === '2017-01-01' && b === '2027-01-01') ? '전체' : a.slice(0, 7) + '~' + b.slice(0, 7);
  console.log('   ' + label.padEnd(17) + f(A) + '   ' + f(B));
}
console.log('\n※ "20일 내 +10% 터치 확률"은 크게 갈리지만 평균 수익률 차이는 그만큼 크지 않다면,');
console.log('  올라갔다가 되밀리는 경로가 많다는 뜻이다.');

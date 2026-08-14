/** 제안 방식으로 오늘 계산하면 어떤 화면이 되는가 */
const fs = require('fs');
const p = JSON.parse(fs.readFileSync(path.join(CACHE_REPO, 'data', '005930', 'prices.json'), 'utf8')).rows;
const S = p.map(r => r.c), N = S.length, last = S[N - 1];
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const R = []; for (let i = 1; i < N; i++) R.push(Math.log(S[i] / S[i - 1]));
const pv = n => stdev(R.slice(-Math.min(n, R.length)));
const vol = Math.sqrt(mean([20, 60, 250].map(n => pv(n) ** 2)));
const Z = 1.2816 * 1.05;
const f = x => Math.round(x).toLocaleString('ko-KR');
const ncdf = x => { const t = 1 / (1 + .2316419 * Math.abs(x)); const d = .3989423 * Math.exp(-x * x / 2); let q = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - q : q; };
const pTouch = (h, pct) => Math.min(1, 2 * ncdf(-Math.abs(Math.log(1 + pct / 100)) / (vol * Math.sqrt(h)))) * 100;

console.log('기준 종가 ' + f(last) + '원 | 혼합변동성 연환산 ' + (vol * Math.sqrt(252) * 100).toFixed(0) + '%');
console.log('\n[1층] 예상 변동 범위 (80% 확률, 보정 1.05 적용)');
for (const [nm, h] of [['1주', 5], ['2주', 10], ['1개월', 20], ['3개월', 60]]) {
  const b = Z * vol * Math.sqrt(h);
  console.log('  ' + nm.padEnd(6) + (f(last * Math.exp(-b)) + ' ~ ' + f(last * Math.exp(b))).padStart(24) + '   ±' + ((Math.exp(b) - 1) * 100).toFixed(0) + '%');
}
console.log('\n[2층] 임계값 도달 확률 — "앞으로 h일 안에 한 번이라도 닿을 확률"');
console.log('  기간      -20%    -10%     -5%      +5%    +10%    +20%');
for (const [nm, h] of [['1주', 5], ['1개월', 20], ['3개월', 60]]) {
  console.log('  ' + nm.padEnd(8) + [-20, -10, -5, 5, 10, 20].map(x => (pTouch(h, x).toFixed(0) + '%').padStart(7)).join(' '));
}
console.log('\n  (방향을 예측하지 않으므로 위아래가 대칭이다. 가격 수준으로 환산하면:)');
for (const x of [-20, -10, 10, 20]) console.log('    ' + (x > 0 ? '+' : '') + x + '% = ' + f(last * (1 + x / 100)) + '원');

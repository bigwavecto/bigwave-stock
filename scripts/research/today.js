const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
const CACHE_REPO = path.join(__dirname, '..', '..');
require('fs').mkdirSync(CACHE, { recursive: true });
const rows = JSON.parse(fs.readFileSync(path.join(CACHE, 'long.json'), 'utf8'));
const closes = rows.map(r => r.c);
const p = JSON.parse(fs.readFileSync(path.join(CACHE_REPO, 'data', '005930', 'prices.json'), 'utf8')).rows.map(r => r.c);
const use = p;                                  // 앱이 쓰는 데이터와 동일하게
const N = use.length, last = use[N - 1];
const R = []; for (let i = 1; i < N; i++) R.push(Math.log(use[i] / use[i - 1]));
const stdev = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); };
const sma = (a, n) => { let s = 0; for (let k = a.length - n; k < a.length; k++) s += a[k]; return s / n; };
const f = x => Math.round(x).toLocaleString('ko-KR');

const alpha = 2 / 11; let mom = 0; R.slice(-10).forEach(r => { mom = alpha * r + (1 - alpha) * mom; });
const rev = 0.06 * Math.log(sma(use, 20) / last);
const ana = Math.log(493542 / last) / 252;
let drift = 0.4 * mom + 0.3 * rev + 0.3 * ana;
const capped = Math.max(-0.015, Math.min(0.015, drift));

console.log('기준 종가:', f(last) + '원   (' + N + '일 데이터)');
console.log('\n■ 현행 drift 분해 (하루당)');
console.log('  모멘텀 0.4×' + (mom * 100).toFixed(3) + '% = ' + (0.4 * mom * 100).toFixed(3) + '%   ← 어제 +4% 급등이 그대로 반영됨');
console.log('  평균회귀 0.3×' + (rev * 100).toFixed(3) + '% = ' + (0.3 * rev * 100).toFixed(3) + '%');
console.log('  컨센서스 0.3×' + (ana * 100).toFixed(3) + '% = ' + (0.3 * ana * 100).toFixed(3) + '%');
console.log('  합계 ' + (drift * 100).toFixed(3) + '%/일 → 상한 적용 후 ' + (capped * 100).toFixed(3) + '%/일');

const vCur = stdev(R.slice(-20));
const vBlend = Math.sqrt((Math.pow(stdev(R.slice(-20)), 2) + Math.pow(stdev(R.slice(-60)), 2) + Math.pow(stdev(R.slice(-Math.min(250, R.length))), 2)) / 3);
console.log('\n■ 변동성(연환산)  현행(20일): ' + (vCur * Math.sqrt(252) * 100).toFixed(0) + '%   제안(20/60/250 혼합): ' + (vBlend * Math.sqrt(252) * 100).toFixed(0) + '%');

console.log('\n■ 기간별 비교 — 현행(예상가+구간) vs 제안(오늘 가격 중심 범위)');
console.log('  기간        현행 예상가        현행 80%구간              제안 80%범위(중심=오늘가)     제안 폭');
for (const [name, h] of [['1주(5일)', 5], ['2주(10일)', 10], ['1개월(20일)', 20], ['3개월(60일)', 60]]) {
  const pred = last * Math.exp(capped * h);
  const bC = 1.2816 * vCur * Math.sqrt(h);
  const bB = 1.2816 * vBlend * Math.sqrt(h);
  console.log('  ' + name.padEnd(12) +
    (f(pred) + '원').padStart(12) + ' (' + ((pred / last - 1) * 100 >= 0 ? '+' : '') + ((pred / last - 1) * 100).toFixed(1) + '%)' +
    ('  ' + f(last * Math.exp(capped * h - bC)) + '~' + f(last * Math.exp(capped * h + bC))).padEnd(24) +
    ('  ' + f(last * Math.exp(-bB)) + '~' + f(last * Math.exp(bB))).padEnd(26) +
    '±' + ((Math.exp(bB) - 1) * 100).toFixed(0) + '%');
}

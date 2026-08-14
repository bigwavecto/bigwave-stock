/**
 * 달력 기반 예측 — 미리 날짜를 아는 것에서 오는 정보.
 * 삼성전자 잠정실적은 분기 종료 직후(1·4·7·10월 초순), 확정실적은 그 달 말경 발표된다.
 * 그 구간의 변동성이 체계적으로 높다면, 날짜만으로도 "이 시기에는 크게 움직인다"를 말할 수 있다.
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const px = JSON.parse(fs.readFileSync(path.join(CACHE, 'long.json'), 'utf8'));
const S = px.map(r => r.c), dates = px.map(r => r.d), N = S.length;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const AR = [null]; for (let i = 1; i < N; i++) AR.push(Math.abs(Math.log(S[i] / S[i - 1])) * 100);   // 일간 절대변동(%)

const md = i => dates[i].slice(5);          // MM-DD
const mm = i => +dates[i].slice(5, 7), dd = i => +dates[i].slice(8, 10);

console.log('■ 1. 잠정실적 발표 시기(1·4·7·10월 1~12일) vs 그 외 — 일간 절대변동 평균');
{
  const inW = [], out = [];
  for (let i = 1; i < N; i++) ((([1, 4, 7, 10].includes(mm(i)) && dd(i) <= 12)) ? inW : out).push(AR[i]);
  console.log('   실적 발표 주간: ' + mean(inW).toFixed(2) + '%  (n=' + inW.length + ')');
  console.log('   그 외        : ' + mean(out).toFixed(2) + '%  (n=' + out.length + ')');
  console.log('   비율: ' + (mean(inW) / mean(out)).toFixed(2) + '배');
}

console.log('\n■ 2. 월별 일간 절대변동 평균 (계절성이 있나)');
{
  const by = {};
  for (let i = 1; i < N; i++) (by[mm(i)] = by[mm(i)] || []).push(AR[i]);
  const line = [];
  for (let m = 1; m <= 12; m++) line.push(m + '월 ' + mean(by[m]).toFixed(2));
  console.log('   ' + line.join('  '));
  const all = mean(Object.values(by).flat());
  console.log('   전체 평균 ' + all.toFixed(2) + '%');
}

console.log('\n■ 3. 이미 쓰고 있는 변동성 모델이 이 효과를 놓치고 있나');
{
  // 혼합변동성으로 예측한 절대변동 vs 실제 — 실적 주간에 과소예측하는가
  const pv = (i, n) => { if (i - n < 1) return null; const s = []; for (let k = i - n + 1; k <= i; k++) s.push(Math.log(S[k] / S[k - 1])); return stdev(s); };
  const blended = i => (i < 251 ? null : Math.sqrt(mean([20, 60, 250].map(n => Math.pow(pv(i, n), 2)))));
  const inW = [], out = [];
  for (let i = 300; i < N - 1; i++) {
    const b = blended(i); if (b == null) continue;
    const expected = b * Math.sqrt(2 / Math.PI) * 100;      // 정규분포의 평균 절대편차
    const ratio = AR[i + 1] / expected;
    (([1, 4, 7, 10].includes(mm(i + 1)) && dd(i + 1) <= 12) ? inW : out).push(ratio);
  }
  console.log('   실제변동 / 모델예상변동');
  console.log('     실적 발표 주간: ' + mean(inW).toFixed(3) + '  (1보다 크면 모델이 과소예측)');
  console.log('     그 외        : ' + mean(out).toFixed(3));
}

console.log('\n■ 4. 참고 — 실제로 가장 크게 움직인 날들의 날짜 분포 (절대 5% 이상)');
{
  const big = [];
  for (let i = 1; i < N; i++) if (AR[i] >= 5) big.push(dates[i]);
  const byM = {};
  for (const d of big) { const m = +d.slice(5, 7); byM[m] = (byM[m] || 0) + 1; }
  console.log('   총 ' + big.length + '일 | 월별: ' + Array.from({ length: 12 }, (_, k) => (k + 1) + '월 ' + (byM[k + 1] || 0)).join(', '));
}

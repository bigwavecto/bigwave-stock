/**
 * 기관 순매도 경보 신호가 최근에도 유효한가 — 시기별 분해 + 독립 에피소드 수 계산.
 * 250일의 경보일이 몇 개의 "사건"에서 나온 것인지가 중요하다. 연속된 날은 사실상 같은 사건이다.
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
const VOL = dates.map(d => flowBy[d].vol), ORG = dates.map(d => flowBy[d].org);
const N = dates.length;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
function ratio(i, n) { if (i - n + 1 < 0) return null; let a = 0, b = 0; for (let k = i - n + 1; k <= i; k++) { a += ORG[k]; b += VOL[k]; } return b ? a / b : null; }
const fwd = (i, h) => (i + h < N ? Math.log(S[i + h] / S[i]) : null);
const ORG20 = dates.map((_, i) => (i >= 1 ? ratio(i - 1, 20) : null));

// 경보일 판정 (과거 3년 하위 20%)
const alarm = new Array(N).fill(false);
for (let i = 830; i <= N - 21; i++) {
  if (ORG20[i] == null) continue;
  const hist = []; for (let j = i - 750; j < i; j++) if (ORG20[j] != null) hist.push(ORG20[j]);
  if (hist.length < 400) continue;
  hist.sort((a, b) => a - b);
  alarm[i] = ORG20[i] <= hist[Math.floor((hist.length - 1) * 0.2)];
}

// 독립 에피소드 (10거래일 이상 떨어져 있으면 별개)
const eps = []; let cur = null;
for (let i = 0; i < N; i++) {
  if (alarm[i]) { if (cur && i - cur.end <= 10) cur.end = i; else { cur = { start: i, end: i }; eps.push(cur); } }
}
console.log('■ 경보 발생 구조');
console.log('   경보일 총', alarm.filter(Boolean).length, '일 →  독립 에피소드', eps.length, '개');
console.log('   에피소드 목록 (시작일 / 길이 / 이후 20일 수익률):');
for (const e of eps) {
  const r = fwd(e.start, 20);
  console.log('     ' + dates[e.start] + '  ' + String(e.end - e.start + 1).padStart(3) + '일   ' +
    (r == null ? '  -' : ((r * 100).toFixed(1) + '%').padStart(7)));
}

console.log('\n■ 시기별 경보 성적 (h=20) — 신호가 지금도 살아있나');
const cuts = [['2019-01-01', '2021-01-01'], ['2021-01-01', '2023-01-01'], ['2023-01-01', '2025-01-01'], ['2025-01-01', '2027-01-01']];
console.log('   기간                경보일  평균수익  상승%  |  비경보일  평균수익  상승%');
for (const [a, b] of cuts) {
  const A = [], B = [];
  for (let i = 830; i <= N - 21; i++) {
    if (dates[i] < a || dates[i] >= b) continue;
    const r = fwd(i, 20); if (r == null || ORG20[i] == null) continue;
    (alarm[i] ? A : B).push(r);
  }
  if (!A.length && !B.length) continue;
  const f = arr => arr.length ? (mean(arr) * 100).toFixed(2).padStart(7) + '%' + (arr.filter(x => x > 0).length / arr.length * 100).toFixed(0).padStart(5) + '%' : '     없음     ';
  console.log('   ' + (a.slice(0, 7) + '~' + b.slice(0, 7)).padEnd(18) + String(A.length).padStart(5) + f(A) + '  |' + String(B.length).padStart(8) + f(B));
}

console.log('\n■ 참고: 경보 구간이 실제로 어떤 시기였나 (겹친 사건)');
for (const e of eps) {
  const seg = S.slice(e.start, e.end + 1);
  const dd = (Math.min(...seg) / S[e.start] - 1) * 100;
  console.log('     ' + dates[e.start] + '~' + dates[e.end] + '  구간 내 최대낙폭 ' + dd.toFixed(1) + '%');
}

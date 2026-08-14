/**
 * "신고가 부근 / 강한 모멘텀이면 +10% 확률이 오른다"는 규칙의 진위 검증.
 *  1) 데이터 검증 (2026-07-31 코스피 +17.9%가 실제인가)
 *  2) 시기별 안정성 — 2026년 상승장 하나가 만든 결과인가
 *  3) 독립 에피소드 수
 *  4) 변동성 통제 — 신고가 효과가 변동성의 대리변수일 뿐인가
 *  5) 표본 밖 검증 — 조건 판정도 과거 데이터로만
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const D = CACHE;
const F = JSON.parse(fs.readFileSync(D + '/factors.json', 'utf8'));
const dates = Object.keys(F.samsung).sort();
const S = dates.map(d => F.samsung[d].c);
const KSm = F.kospi;
const N = dates.length;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const LR = [null]; for (let i = 1; i < N; i++) LR.push(Math.log(S[i] / S[i - 1]));
const vol20 = i => { if (i < 21) return null; const s = []; for (let k = i - 19; k <= i; k++) s.push(LR[k]); return stdev(s) * Math.sqrt(252) * 100; };
const dd52 = i => { if (i < 250) return null; let h = -1e9; for (let k = i - 249; k <= i; k++) h = Math.max(h, S[k]); return (S[i] / h - 1) * 100; };
const ret = (i, n) => (i - n >= 0 ? (S[i] / S[i - n] - 1) * 100 : null);

/* 1. 데이터 검증 */
console.log('■ 1. 2026-07-31 전후 코스피 실제 값 (이상치 확인)');
const kd = Object.keys(KSm).sort();
const around = kd.filter(d => d >= '2026-07-27' && d <= '2026-08-05');
for (const d of around) {
  const i = kd.indexOf(d), prev = kd[i - 1];
  console.log('   ' + d + '  ' + KSm[d].c.toFixed(1).padStart(9) + (prev ? ('   전일대비 ' + ((KSm[d].c / KSm[prev].c - 1) * 100).toFixed(2) + '%') : ''));
}
console.log('   삼성전자 같은 기간:');
for (const d of around) { const i = dates.indexOf(d); if (i > 0) console.log('   ' + d + '  ' + S[i].toFixed(0).padStart(9) + '   전일대비 ' + ((S[i] / S[i - 1] - 1) * 100).toFixed(2) + '%'); }

/* 공통: 조건부 배리어 확률 */
function barrier(i, h, thr) {
  if (i + h >= N) return null;
  let up = false, dn = false;
  for (let k = i + 1; k <= i + h; k++) { if (S[k] / S[i] - 1 >= thr / 100) up = true; if (S[k] / S[i] - 1 <= -thr / 100) dn = true; }
  return { up, dn };
}
function tally(cond, from, to) {
  let n = 0, u = 0, d = 0;
  for (let i = Math.max(800, from); i <= Math.min(to, N - 22); i++) {
    if (!cond(i)) continue;
    const b = barrier(i, 20, 10); if (!b) continue;
    n++; if (b.up) u++; if (b.dn) d++;
  }
  return { n, up: n ? u / n * 100 : NaN, dn: n ? d / n * 100 : NaN };
}
const nearHigh = i => { const x = dd52(i); return x != null && x >= -3; };
const strongMom = i => { const r = ret(i, 20); return r != null && r >= 15; };
const anyDay = () => true;

/* 2. 시기별 안정성 */
console.log('\n■ 2. 시기별 — 규칙이 특정 시기에만 있는 것인가');
console.log('   기간            조건            해당일  +10%    -10%    차이');
const periods = [['2019-01-01', '2022-01-01'], ['2022-01-01', '2025-01-01'], ['2025-01-01', '2026-01-01'], ['2026-01-01', '2027-01-01']];
for (const [a, b] of periods) {
  const from = dates.findIndex(d => d >= a), to = dates.findIndex(d => d >= b) - 1;
  if (from < 0) continue;
  const end = to < 0 ? N - 22 : to;
  for (const [nm, c] of [['전체', anyDay], ['신고가 부근', nearHigh], ['20일 +15% 급등후', strongMom]]) {
    const r = tally(c, from, end);
    if (!r.n) { console.log('   ' + (a.slice(0, 7) + '~' + b.slice(0, 7)).padEnd(16) + nm.padEnd(17) + '     0        -       -       -'); continue; }
    console.log('   ' + (a.slice(0, 7) + '~' + b.slice(0, 7)).padEnd(16) + nm.padEnd(17) + String(r.n).padStart(5) +
      r.up.toFixed(1).padStart(8) + '%' + r.dn.toFixed(1).padStart(7) + '%' + (r.up - r.dn).toFixed(1).padStart(8) + '%p');
  }
}

/* 3. 독립 에피소드 */
console.log('\n■ 3. "신고가 부근" 조건의 독립 에피소드 수');
for (const [nm, c] of [['신고가 부근', nearHigh], ['20일 +15% 급등후', strongMom]]) {
  const days = []; for (let i = 800; i < N - 21; i++) if (c(i)) days.push(i);
  const eps = []; let cur = null;
  for (const i of days) { if (cur && i - cur.end <= 10) cur.end = i; else { cur = { start: i, end: i }; eps.push(cur); } }
  console.log('   ' + nm.padEnd(18) + days.length + '일  →  독립 에피소드 ' + eps.length + '개');
  console.log('      ' + eps.map(e => dates[e.start].slice(0, 7)).join(', '));
}

/* 4. 변동성 통제 */
console.log('\n■ 4. 변동성을 통제하면 신고가 효과가 남는가');
console.log('   (같은 변동성 구간 안에서 신고가 부근 vs 그 외를 비교)');
function volBucket(i) { const v = vol20(i); return v == null ? null : v < 25 ? '저(<25%)' : v < 45 ? '중(25~45%)' : '고(>45%)'; }
const bk = {};
for (let i = 800; i < N - 21; i++) {
  const b = volBucket(i), br = barrier(i, 20, 10); if (!b || !br) continue;
  const key = b + '|' + (nearHigh(i) ? '신고가' : '그외');
  (bk[key] = bk[key] || { n: 0, u: 0, d: 0 });
  bk[key].n++; if (br.up) bk[key].u++; if (br.dn) bk[key].d++;
}
console.log('   변동성구간      상태     해당일  +10%    -10%    차이');
for (const v of ['저(<25%)', '중(25~45%)', '고(>45%)']) {
  for (const s of ['신고가', '그외']) {
    const x = bk[v + '|' + s]; if (!x || x.n < 20) { continue; }
    console.log('   ' + v.padEnd(14) + s.padEnd(8) + String(x.n).padStart(5) +
      (x.u / x.n * 100).toFixed(1).padStart(8) + '%' + (x.d / x.n * 100).toFixed(1).padStart(7) + '%' + ((x.u - x.d) / x.n * 100).toFixed(1).padStart(8) + '%p');
  }
}

/* 5. 표본 밖 (조건 판정을 과거로만, 그리고 2026년 제외) */
console.log('\n■ 5. 2026년(초대형 상승장)을 빼면 규칙이 남는가');
const end2025 = dates.findIndex(d => d >= '2026-01-01') - 1;
for (const [nm, c] of [['전체', anyDay], ['신고가 부근', nearHigh], ['20일 +15% 급등후', strongMom]]) {
  const r = tally(c, 800, end2025);
  console.log('   ' + nm.padEnd(18) + '해당일 ' + String(r.n).padStart(5) + '   +10% ' + r.up.toFixed(1).padStart(5) + '%   -10% ' + r.dn.toFixed(1).padStart(5) + '%   차이 ' + (r.up - r.dn).toFixed(1).padStart(6) + '%p');
}

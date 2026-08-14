/**
 * 10% 이상 상승 사례 전수 조사
 *  A. 단일일 +10% / 5일 누적 +10% / 20일 누적 +10% 사건 목록
 *  B. 그날 시장 전체가 올랐나, 삼성전자만 올랐나 (원인 분해)
 *  C. 사건 직전의 상태 (선행 조건이 있나)
 *  D. 핵심: 조건부로 +10% 확률이 오르는가, 그리고 -10% 확률도 같이 오르는가
 *  E. +10% 이후에는 어떻게 되나
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const D = CACHE;
const F = JSON.parse(fs.readFileSync(D + '/factors.json', 'utf8'));
const flRaw = JSON.parse(fs.readFileSync(D + '/flow.json', 'utf8'));
const flowBy = {}; flRaw.forEach(r => { if (r.vol) flowBy[r.d] = r; });

const dates = Object.keys(F.samsung).sort();
const usKeys = {}; for (const k of ['nasdaq', 'sox', 'tsmc']) usKeys[k] = Object.keys(F[k]).sort();
function usBefore(name, d) { const ks = usKeys[name]; let lo = 0, hi = ks.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (ks[m] < d) { r = ks[m]; lo = m + 1; } else hi = m - 1; } return r ? F[name][r].c : null; }
const ffill = a => { let l = null; return a.map(x => (x == null ? l : (l = x))); };

const S = dates.map(d => F.samsung[d].c);
const V = dates.map(d => F.samsung[d].v);
const KS = ffill(dates.map(d => (F.kospi[d] ? F.kospi[d].c : null)));
const HY = ffill(dates.map(d => (F.hynix[d] ? F.hynix[d].c : null)));
const SX = ffill(dates.map(d => usBefore('sox', d)));
const N = dates.length;
const ret = (a, i, n) => (i - n >= 0 && a[i] && a[i - n] ? (a[i] / a[i - n] - 1) * 100 : null);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const LR = [null]; for (let i = 1; i < N; i++) LR.push(Math.log(S[i] / S[i - 1]));
const vol20 = i => { if (i < 21) return null; const s = []; for (let k = i - 19; k <= i; k++) s.push(LR[k]); return stdev(s) * Math.sqrt(252) * 100; };
const dd52 = i => { if (i < 250) return null; let h = -1e9; for (let k = i - 249; k <= i; k++) h = Math.max(h, S[k]); return (S[i] / h - 1) * 100; };

console.log('데이터:', N, '일 |', dates[0], '~', dates[N - 1]);

/* ── A. 단일일 +10% ── */
const day10 = [];
for (let i = 1; i < N; i++) if (ret(S, i, 1) >= 10) day10.push(i);
console.log('\n■ A. 단일 거래일 +10% 이상 —', day10.length, '건');
if (day10.length) {
  console.log('   날짜          상승률   코스피   하이닉스  반도체지수(전일)  거래량배수  외국인순매수/거래량');
  for (const i of day10) {
    const fw = flowBy[dates[i]];
    console.log('   ' + dates[i] + '  ' + ret(S, i, 1).toFixed(1).padStart(6) + '%' +
      (ret(KS, i, 1) == null ? '     -' : ret(KS, i, 1).toFixed(1).padStart(8) + '%') +
      (ret(HY, i, 1) == null ? '     -' : ret(HY, i, 1).toFixed(1).padStart(8) + '%') +
      (ret(SX, i, 1) == null ? '        -' : ret(SX, i, 1).toFixed(1).padStart(13) + '%') +
      (V[i] && mean(V.slice(i - 20, i)) ? (V[i] / mean(V.slice(i - 20, i))).toFixed(1).padStart(11) + '배' : '        -') +
      (fw ? ((fw.frn / fw.vol) * 100).toFixed(1).padStart(16) + '%' : '            -'));
  }
}

/* 5일 / 20일 누적 */
function runs(n, thr) {
  const ev = []; let last = -99;
  for (let i = n; i < N; i++) {
    const r = ret(S, i, n);
    if (r != null && r >= thr && i - last > n) { ev.push(i); last = i; }
  }
  return ev;
}
const w5 = runs(5, 10), w20 = runs(20, 10);
console.log('\n■ 5거래일 누적 +10% 이상 (겹치지 않는 사건):', w5.length, '건');
console.log('■ 20거래일 누적 +10% 이상 (겹치지 않는 사건):', w20.length, '건');

/* ── B. 시장 전체인가 삼성만인가 ── */
console.log('\n■ B. 큰 상승의 성격 — 시장 전체 상승인가, 삼성전자 고유인가');
{
  const big = []; for (let i = 1; i < N; i++) { const r = ret(S, i, 1); if (r != null && r >= 5) big.push(i); }
  const wMkt = big.filter(i => ret(KS, i, 1) >= 1.5).length;
  const wPeer = big.filter(i => ret(HY, i, 1) >= 3).length;
  const wSox = big.filter(i => ret(SX, i, 1) >= 2).length;
  console.log('   +5% 이상 상승일 ' + big.length + '건 중');
  console.log('     코스피도 +1.5% 이상 동반: ' + wMkt + '건 (' + (wMkt / big.length * 100).toFixed(0) + '%)');
  console.log('     하이닉스도 +3% 이상 동반: ' + wPeer + '건 (' + (wPeer / big.length * 100).toFixed(0) + '%)');
  console.log('     전일 반도체지수 +2% 이상: ' + wSox + '건 (' + (wSox / big.length * 100).toFixed(0) + '%)');
  const solo = big.filter(i => ret(KS, i, 1) < 1.5 && ret(HY, i, 1) < 3);
  console.log('     시장·동종업계 없이 삼성만: ' + solo.length + '건 (' + (solo.length / big.length * 100).toFixed(0) + '%)');
  console.log('     → 삼성 단독 급등일: ' + solo.slice(0, 12).map(i => dates[i]).join(', ') + (solo.length > 12 ? ' …' : ''));
}

/* ── C. 사건 직전 상태 ── */
console.log('\n■ C. 큰 상승 직전의 상태 (전일 기준) — 평상시와 다른가');
{
  const evt = []; for (let i = 1; i < N; i++) { const r = ret(S, i, 1); if (r != null && r >= 5) evt.push(i); }
  const all = []; for (let i = 260; i < N; i++) all.push(i);
  const cmp = (nm, fn) => {
    const a = evt.map(i => fn(i - 1)).filter(x => x != null && isFinite(x));
    const b = all.map(i => fn(i - 1)).filter(x => x != null && isFinite(x));
    console.log('   ' + nm.padEnd(22) + '급등 직전 ' + mean(a).toFixed(1).padStart(8) + '   평상시 ' + mean(b).toFixed(1).padStart(8));
  };
  cmp('연환산 변동성(20일)', vol20);
  cmp('52주 고점 대비(%)', dd52);
  cmp('최근 5일 수익률(%)', i => ret(S, i, 5));
  cmp('최근 20일 수익률(%)', i => ret(S, i, 20));
  cmp('거래량/20일평균', i => (i >= 21 && mean(V.slice(i - 20, i)) ? V[i] / mean(V.slice(i - 20, i)) : null));
}

/* ── D. 핵심 검증: 조건부 +10% 확률과 -10% 확률 ── */
console.log('\n■ D. 핵심 — 조건에 따라 "20일 안에 +10% 상승" 확률이 오르는가');
console.log('   (같은 조건에서 -10% 하락 확률도 함께 올라가면 그건 변동성일 뿐 상승 신호가 아니다)');
function hits(i, h, thr) {          // 앞으로 h일 안에 고점이 thr% 이상 / 저점이 -thr% 이하
  if (i + h >= N) return null;
  let up = false, dn = false;
  for (let k = i + 1; k <= i + h; k++) { if (S[k] / S[i] - 1 >= thr / 100) up = true; if (S[k] / S[i] - 1 <= -thr / 100) dn = true; }
  return { up, dn };
}
const conds = [
  ['전체 (기준선)', i => true],
  ['변동성 상위 20%', i => { const v = vol20(i); return v != null && v >= volQ80(i); }],
  ['변동성 하위 20%', i => { const v = vol20(i); return v != null && v <= volQ20(i); }],
  ['52주 고점 대비 -20% 이하', i => { const d = dd52(i); return d != null && d <= -20; }],
  ['52주 신고가 부근(-3% 이내)', i => { const d = dd52(i); return d != null && d >= -3; }],
  ['최근 20일 -15% 이하 급락 후', i => { const r = ret(S, i, 20); return r != null && r <= -15; }],
  ['최근 20일 +15% 이상 급등 후', i => { const r = ret(S, i, 20); return r != null && r >= 15; }],
  ['거래량 20일평균의 1.5배 이상', i => (i >= 21 && mean(V.slice(i - 20, i)) ? V[i] / mean(V.slice(i - 20, i)) >= 1.5 : false)],
];
// 변동성 분위 (과거 3년 기준, 미래 정보 없음)
const volCache = {};
function volQ(i, p) {
  const key = i + '_' + p; if (volCache[key] != null) return volCache[key];
  const h = []; for (let j = Math.max(21, i - 750); j < i; j++) { const v = vol20(j); if (v != null) h.push(v); }
  if (h.length < 200) return volCache[key] = 1e9 * (p < .5 ? -1 : 1);
  h.sort((a, b) => a - b);
  return volCache[key] = h[Math.floor((h.length - 1) * p)];
}
const volQ80 = i => volQ(i, .8), volQ20 = i => volQ(i, .2);

console.log('   조건                          해당일수   +10%확률   -10%확률   차이');
for (const [nm, fn] of conds) {
  let n = 0, u = 0, d = 0;
  for (let i = 800; i < N - 21; i++) {
    if (!fn(i)) continue;
    const h = hits(i, 20, 10); if (!h) continue;
    n++; if (h.up) u++; if (h.dn) d++;
  }
  if (!n) continue;
  const up = u / n * 100, dn = d / n * 100;
  console.log('   ' + nm.padEnd(28) + String(n).padStart(7) + up.toFixed(1).padStart(11) + '%' + dn.toFixed(1).padStart(10) + '%' + (up - dn).toFixed(1).padStart(8) + '%p');
}

/* ── E. +10% 이후 ── */
console.log('\n■ E. 큰 상승 이후에는 어떻게 되나 (+5% 이상 상승일 기준)');
{
  const evt = []; for (let i = 1; i < N - 21; i++) { const r = ret(S, i, 1); if (r != null && r >= 5) evt.push(i); }
  for (const h of [1, 5, 20]) {
    const rs = evt.map(i => (i + h < N ? (S[i + h] / S[i] - 1) * 100 : null)).filter(x => x != null);
    const base = []; for (let i = 260; i < N - h; i++) base.push((S[i + h] / S[i] - 1) * 100);
    console.log('   ' + String(h).padStart(2) + '일 뒤: 급등 후 평균 ' + mean(rs).toFixed(2).padStart(6) + '% (상승 ' + (rs.filter(x => x > 0).length / rs.length * 100).toFixed(0) + '%)' +
      '   평상시 평균 ' + mean(base).toFixed(2).padStart(6) + '% (상승 ' + (base.filter(x => x > 0).length / base.length * 100).toFixed(0) + '%)');
  }
}

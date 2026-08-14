/**
 * 최소 이력 기준 산출 — 종목을 몇 년치부터 앱에 올려도 되는가.
 *
 * 배경: AI 관련주 상당수가 상장 3~5년 미만이다. 그런데 화면의 상수(z1·vol10y·regime 등)는
 * 10년 데이터로 구한 값이다. 짧은 이력으로 구한 값을 그대로 쓰면 화면이 거짓말을 한다.
 * "몇 년이면 되나"를 감이 아니라 측정으로 정하기 위한 스크립트다.
 *
 * 재는 것
 *  1) z1 표본 밖 성능 — 앞의 K년으로 z1을 맞추고 **나머지 기간**에서 적중률을 잰다.
 *     80%에서 얼마나 벗어나는지가 "10번 중 8번" 약속이 지켜지는지를 그대로 말해 준다.
 *  2) 평소 흔들림(vol) 안정성 — 창 길이에 따라 기준값이 얼마나 달라지나.
 *     첫 화면의 "평소의 N배"는 이 기준값이 흔들리면 통째로 흔들린다.
 *  3) 표본 수 — regime(신고가 국면)·market(큰 상승일)·earnings(실적 분기)가
 *     K년에서 각각 몇 건이나 모이나.
 *
 * 사용: node scripts/research/min_history.js
 * 원자료: scripts/research/.cache/factors.json (없으면 scripts/research/fetch/ 로 다시 받는다)
 */
const fs = require('fs');
const path = require('path');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, '.cache', 'factors.json'), 'utf8'));

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const Z = 1.2816;
const YEAR = 250;          // 1년 ≈ 250 거래일

function series(key) {
  const src = F[key];
  const dates = Object.keys(src).sort();
  const S = dates.map(d => src[d].c);
  const LR = [null];
  for (let i = 1; i < S.length; i++) LR.push(Math.log(S[i] / S[i - 1]));
  return { dates, S, LR };
}

/* 혼합변동성 — 20·60·250일 분산의 평균의 제곱근.
   창이 250일보다 짧으면 있는 만큼만 쓴다. 이때 "250일 성분"은 사실 250일이 아니다.
   그래서 minStart(=창을 온전히 채우는 첫 지점)를 따로 돌려준다. */
function blendedAt(LR, i, from) {
  const win = n => {
    const a = Math.max(from + 1, i - n + 1);
    if (i - a + 1 < 20) return null;              // 최소 20개는 있어야 분산이 의미 있다
    const s = []; for (let k = a; k <= i; k++) s.push(LR[k]);
    return stdev(s);
  };
  const vs = [20, 60, 250].map(win);
  if (vs.some(v => v == null)) return null;
  return Math.sqrt(mean(vs.map(v => v * v)));
}

/* 주어진 구간에서 적중률이 80%에 가장 가까워지는 보정 배수 k */
function fitZ1(S, LR, from, to) {
  let best = null;
  for (let k = 0.90; k <= 1.40001; k += 0.01) {
    const covs = [5, 10, 20].map(h => {
      const c = [];
      for (let i = from + 260; i <= to - h; i++) {
        const b = blendedAt(LR, i, from); if (b == null) continue;
        c.push(Math.abs(Math.log(S[i + h] / S[i])) <= Z * b * k * Math.sqrt(h) ? 1 : 0);
      }
      return c.length ? mean(c) * 100 : NaN;
    });
    if (covs.some(isNaN)) continue;
    const err = covs.reduce((s, c) => s + (c - 80) ** 2, 0);
    if (!best || err < best.err) best = { k: +k.toFixed(2), covs: covs.map(c => +c.toFixed(1)), err };
  }
  return best;
}

/* 주어진 배수 k를 다른 구간에 적용했을 때의 적중률 (표본 밖 검증) */
function coverageWith(S, LR, from, to, k, fitFrom) {
  return [5, 10, 20].map(h => {
    const c = [];
    for (let i = from; i <= to - h; i++) {
      const b = blendedAt(LR, i, fitFrom); if (b == null) continue;
      c.push(Math.abs(Math.log(S[i + h] / S[i])) <= Z * b * k * Math.sqrt(h) ? 1 : 0);
    }
    return { h, n: c.length, cov: c.length ? +(mean(c) * 100).toFixed(1) : null };
  });
}

const annVol = (LR, a, b) => {
  const s = []; for (let i = a; i <= b; i++) if (LR[i] != null) s.push(LR[i]);
  return +(stdev(s) * Math.sqrt(252) * 100).toFixed(1);
};

function run(key, label) {
  const { dates, S, LR } = series(key);
  const N = S.length;
  console.log('\n' + '='.repeat(72));
  console.log(label + '  (' + dates[0] + ' ~ ' + dates[N - 1] + ', ' + N + '거래일 ≈ ' + (N / YEAR).toFixed(1) + '년)');
  console.log('='.repeat(72));

  // ── 1) z1을 K년으로 맞추고 나머지에서 검증 ──
  console.log('\n[1] 앞의 K년으로 보정 배수(z1)를 맞추고 → 나머지 기간에서 적중률 (목표 80%)');
  console.log('    K년   z1     남은기간 적중률 1주/2주/1개월      80%에서 최대 이탈');
  for (const yrs of [2, 3, 4, 5, 7]) {
    const cut = Math.round(yrs * YEAR);
    if (cut + 300 >= N) { console.log(`    ${yrs}년   — 데이터 부족`); continue; }
    const fit = fitZ1(S, LR, 0, cut);
    if (!fit) { console.log(`    ${yrs}년   — 맞출 수 없음(구간이 너무 짧다)`); continue; }
    const oos = coverageWith(S, LR, cut + 260, N - 1, fit.k, cut);
    const devs = oos.filter(o => o.cov != null).map(o => Math.abs(o.cov - 80));
    console.log(`    ${yrs}년   ${fit.k.toFixed(2)}   `
      + oos.map(o => (o.cov == null ? '  -  ' : String(o.cov).padStart(5))).join(' / ')
      + `   (n=${oos[0].n})   ±${Math.max(...devs).toFixed(1)}%p`);
  }
  const full = fitZ1(S, LR, 0, N - 1);
  console.log(`    전체   ${full.k.toFixed(2)}   표본 안 적중률 ` + full.covs.join(' / ') + '  ← 지금 쓰는 값');

  // ── 2) 평소 흔들림 기준값이 창 길이에 따라 얼마나 달라지나 ──
  console.log('\n[2] "평소 흔들림" 기준값 (연 %) — 마지막 K년으로 계산');
  const rows = [1, 2, 3, 5, 10].map(y => {
    const a = Math.max(1, N - Math.round(y * YEAR));
    return { y, v: annVol(LR, a, N - 1) };
  });
  console.log('    ' + rows.map(r => `${r.y}년 ${r.v}%`).join('   '));
  const v10 = rows.find(r => r.y === 10).v;
  console.log('    10년 대비 차이: ' + rows.filter(r => r.y !== 10)
    .map(r => `${r.y}년 ${(r.v / v10).toFixed(2)}배`).join('   '));

  // ── 3) 표본 수 ──
  console.log('\n[3] K년에서 모이는 표본 수');
  const dd52 = i => { if (i < 250) return null; let h = -1e9; for (let k = i - 249; k <= i; k++) h = Math.max(h, S[k]); return S[i] / h - 1; };
  const kospi = F.kospi;
  for (const yrs of [1, 2, 3, 5, 10]) {
    const a = Math.max(300, N - Math.round(yrs * YEAR));
    let nearN = 0, big = 0, withMkt = 0;
    for (let i = a; i <= N - 21; i++) {
      const x = dd52(i); if (x != null && x >= -0.03) nearN++;
    }
    for (let i = a; i <= N - 1; i++) {
      const r = S[i] / S[i - 1] - 1;
      if (r >= 0.05) { big++; const kd = kospi[dates[i]], kp = kospi[dates[i - 1]];
        if (kd && kp && (kd.c / kp.c - 1) >= 0.015) withMkt++; }
    }
    const quarters = Math.round(yrs * 4);
    console.log(`    ${String(yrs).padStart(2)}년: 신고가 부근 ${String(nearN).padStart(4)}일 · `
      + `+5% 상승일 ${String(big).padStart(3)}일(시장 동반 ${big ? Math.round(withMkt / big * 100) : 0}%) · 실적 ${quarters}분기`);
  }
}

run('samsung', '삼성전자 005930');
run('hynix', 'SK하이닉스 000660');

console.log('\n' + '='.repeat(72));
console.log('읽는 법');
console.log('='.repeat(72));
console.log(`
[1] 이 앱의 핵심 약속은 "10번 중 8번은 이 범위"다. 짧은 이력으로 맞춘 보정 배수가
    나중 기간에서도 80%를 지키는지가 등록 가능 여부를 가른다.
    80%에서 크게 벗어나면 그 종목 화면은 지키지 못할 약속을 하게 된다.

[2] 첫 화면의 "평소의 N배"는 기준값이 흔들리면 통째로 흔들린다.
    창 길이에 따라 기준이 크게 달라진다면, 짧은 이력 종목에서 "평소"라는 말 자체가 성립하지 않는다.

[3] 신고가 국면·시장 동조·실적 배수는 표본 수가 적으면 우연이 된다.
    특히 신고가 국면은 서로 겹치는 날이 많아 실제 독립 사건 수는 표시된 일수보다 훨씬 적다.
`);

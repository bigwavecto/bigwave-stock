/**
 * 종목별 상수 산출 — 화면에 표시되는 수치는 반드시 그 종목 데이터로 검증한 값이어야 한다.
 * 삼성전자에서 구한 값을 다른 종목에 그대로 쓰면 거짓말이 된다.
 *
 * 산출 항목
 *  z1   : 80% 구간이 실제로 80%가 되는 보정 배수
 *  cov  : 그 배수에서의 1주/2주/1개월 적중률
 *  regime: 52주 신고가 부근 / 그 외 상태의 20일 내 ±10% 도달 빈도 (표본 밖)
 *  market: +5% 이상 상승일 중 코스피 동반 상승 비율
 *  earn : 실적 발표 주간(1·4·7·10월 초순)의 변동 배수
 *  vol10y: 10년 평균 연환산 변동성, 10년 상승 배수
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const D = CACHE;
const F = JSON.parse(fs.readFileSync(D + '/factors.json', 'utf8'));

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

function analyse(key, label) {
  const src = F[key], kospi = F.kospi;
  const dates = Object.keys(src).sort();
  const S = dates.map(d => src[d].c);
  const N = S.length;
  const LR = [null]; for (let i = 1; i < N; i++) LR.push(Math.log(S[i] / S[i - 1]));
  const pv = (i, n) => { if (i - n < 1) return null; const s = []; for (let k = i - n + 1; k <= i; k++) s.push(LR[k]); return stdev(s); };
  const blended = i => (i < 251 ? null : Math.sqrt(mean([20, 60, 250].map(n => Math.pow(pv(i, n), 2)))));
  const Z = 1.2816;

  // 1) 보정 배수 — 1주/2주/1개월 적중률이 80%에 가장 가까운 값
  let best = null;
  for (let k = 0.90; k <= 1.30001; k += 0.01) {
    const covs = [5, 10, 20].map(h => {
      const c = [];
      for (let i = 300; i <= N - 1 - h; i++) {
        const b = blended(i); if (b == null) continue;
        const band = Z * b * k * Math.sqrt(h);
        c.push(Math.abs(Math.log(S[i + h] / S[i])) <= band ? 1 : 0);
      }
      return mean(c) * 100;
    });
    const err = covs.reduce((s, c) => s + (c - 80) ** 2, 0);
    if (!best || err < best.err) best = { k: +k.toFixed(2), covs: covs.map(c => +c.toFixed(1)), err };
  }

  // 2) 국면 — 표본 밖 판정(과거 데이터로만), 20일 내 ±10% 도달
  const dd52 = i => { if (i < 250) return null; let h = -1e9; for (let k = i - 249; k <= i; k++) h = Math.max(h, S[k]); return S[i] / h - 1; };
  const near = i => { const x = dd52(i); return x != null && x >= -0.03; };
  const bar = (i, h, pct) => { for (let k = i + 1; k <= i + h; k++) { const r = S[k] / S[i] - 1; if (pct > 0 ? r >= pct / 100 : r <= pct / 100) return true; } return false; };
  const bk = { near: { n: 0, up: 0, dn: 0 }, far: { n: 0, up: 0, dn: 0 } };
  for (let i = 300; i <= N - 21; i++) {
    const st = near(i); if (st == null) continue;
    const b = bk[st ? 'near' : 'far'];
    b.n++; if (bar(i, 20, 10)) b.up++; if (bar(i, 20, -10)) b.dn++;
  }
  // 국면이 뒤집힌 시기가 있었는지 (정직성 경고용)
  const flips = [];
  for (const [a, b] of [['2019-01-01', '2022-01-01'], ['2022-01-01', '2025-01-01'], ['2025-01-01', '2027-01-01']]) {
    let n = 0, up = 0, dn = 0;
    for (let i = 300; i <= N - 21; i++) {
      if (dates[i] < a || dates[i] >= b || !near(i)) continue;
      n++; if (bar(i, 20, 10)) up++; if (bar(i, 20, -10)) dn++;
    }
    if (n >= 20) flips.push({ p: a.slice(0, 4) + '~' + b.slice(0, 4), n, up: +(up / n * 100).toFixed(1), dn: +(dn / n * 100).toFixed(1) });
  }

  // 3) 시장 동조 — +5% 이상 상승일 중 코스피 +1.5% 이상 동반 비율
  let big = 0, withMkt = 0, solo = 0;
  for (let i = 1; i < N; i++) {
    const r = (S[i] / S[i - 1] - 1) * 100; if (!(r >= 5)) continue;
    big++;
    const kd = dates[i], kp = dates[i - 1];
    if (kospi[kd] && kospi[kp]) {
      const kr = (kospi[kd].c / kospi[kp].c - 1) * 100;
      if (kr >= 1.5) withMkt++; else solo++;
    }
  }

  // 4) 실적 주간 배수
  const AR = LR.map(x => (x == null ? null : Math.abs(x) * 100));
  const inW = [], out = [];
  for (let i = 1; i < N; i++) {
    const m = +dates[i].slice(5, 7), dd = +dates[i].slice(8, 10);
    (([1, 4, 7, 10].includes(m) && dd <= 12) ? inW : out).push(AR[i]);
  }

  // 5) 10년 요약
  const rets = LR.slice(1);
  const out2 = {
    label,
    days: N, from: dates[0], to: dates[N - 1],
    z1: best.k, cov: { w1: best.covs[0], w2: best.covs[1], m1: best.covs[2] },
    regime: {
      nearUp: +(bk.near.up / bk.near.n * 100).toFixed(1), nearDn: +(bk.near.dn / bk.near.n * 100).toFixed(1), nearN: bk.near.n,
      farUp: +(bk.far.up / bk.far.n * 100).toFixed(1), farDn: +(bk.far.dn / bk.far.n * 100).toFixed(1), farN: bk.far.n,
      byPeriod: flips
    },
    market: { bigDays: big, withMarketPct: big ? +(withMkt / big * 100).toFixed(0) : null, soloPct: big ? +(solo / big * 100).toFixed(0) : null },
    earnings: { ratio: +(mean(inW) / mean(out)).toFixed(2) },
    vol10y: +(stdev(rets) * Math.sqrt(252) * 100).toFixed(0),
    growth10y: +(S[N - 1] / S[0]).toFixed(1)
  };
  return out2;
}

const res = { '005930': analyse('samsung', '삼성전자'), '000660': analyse('hynix', 'SK하이닉스') };
fs.writeFileSync(D + '/symbol_stats.json', JSON.stringify(res, null, 2));
for (const [code, r] of Object.entries(res)) {
  console.log('\n■ ' + r.label + ' (' + code + ')  ' + r.from + ' ~ ' + r.to + '  ' + r.days + '일');
  console.log('  보정 배수 ' + r.z1 + ' → 적중률 1주 ' + r.cov.w1 + '% / 2주 ' + r.cov.w2 + '% / 1개월 ' + r.cov.m1 + '%');
  console.log('  신고가 부근(n=' + r.regime.nearN + '): +10% ' + r.regime.nearUp + '% / -10% ' + r.regime.nearDn + '%');
  console.log('  그 외    (n=' + r.regime.farN + '): +10% ' + r.regime.farUp + '% / -10% ' + r.regime.farDn + '%');
  console.log('  시기별 신고가: ' + r.regime.byPeriod.map(p => p.p + ' +' + p.up + '/-' + p.dn).join('  '));
  console.log('  +5% 상승일 ' + r.market.bigDays + '건 중 코스피 동반 ' + r.market.withMarketPct + '%, 단독 ' + r.market.soloPct + '%');
  console.log('  실적주간 변동 ' + r.earnings.ratio + '배 | 10년 변동성 ' + r.vol10y + '% | 10년 ' + r.growth10y + '배');
}

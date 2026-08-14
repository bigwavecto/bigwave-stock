/**
 * 워크포워드 백테스트 — 배포된 예측 모델 vs 랜덤워크
 *
 * 각 시점 i에서 closes[0..i]만 사용해 예측하고 closes[i+h] 실제값과 비교한다.
 * (미래 정보 사용 없음)
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const rows = JSON.parse(fs.readFileSync(path.join(CACHE, 'long.json'), 'utf8'));
const closes = rows.map(r => r.c);
const N = closes.length;

const sma = (a, n) => { if (a.length < n) return null; let s = 0; for (let k = a.length - n; k < a.length; k++) s += a[k]; return s / n; };
const stdev = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); };

// 배포 모델의 drift 계산을 그대로 옮긴 것
function driftOf(hist, variant, target) {
  const last = hist[hist.length - 1];
  const rets = []; for (let i = 1; i < hist.length; i++) rets.push(Math.log(hist[i] / hist[i - 1]));
  const alpha = 2 / 11; let mom = 0;
  rets.slice(-10).forEach(r => { mom = alpha * r + (1 - alpha) * mom; });
  const s20 = sma(hist, 20);
  const rev = s20 ? 0.06 * Math.log(s20 / last) : 0;
  let ana = 0;
  if (variant === 'full') ana = Math.log(1.25) / 252;            // 컨센서스 프리미엄 25% 가정
  if (variant === 'current') ana = Math.log(target / last) / 252; // 실제 배포값(493,542원)
  if (variant === 'naive') return 0;
  if (variant === 'noana') return clamp(0.4 * mom + 0.3 * rev);
  return clamp(0.4 * mom + 0.3 * rev + 0.3 * ana);
}
const clamp = d => Math.max(-0.015, Math.min(0.015, d));

const HORIZONS = [1, 2, 3, 5, 10, 20, 60, 120];
const MAXH = Math.max(...HORIZONS);
const START = 60;

// Newey-West 보정 t값 (겹치는 예측구간의 자기상관 보정)
function nwT(d, lag) {
  const n = d.length, m = d.reduce((a, b) => a + b, 0) / n;
  const e = d.map(x => x - m);
  let g0 = e.reduce((s, x) => s + x * x, 0) / n, v = g0;
  for (let L = 1; L <= lag; L++) {
    let g = 0; for (let i = L; i < n; i++) g += e[i] * e[i - L];
    g /= n; v += 2 * (1 - L / (lag + 1)) * g;
  }
  return m / Math.sqrt(v / n);
}

function run(variant, from, to, target) {
  const out = {};
  for (const h of HORIZONS) {
    const ae = [], aeN = [], dir = [], cov = [], band = [], predRet = [], realRet = [];
    for (let i = from; i <= Math.min(to, N - 1 - h); i++) {
      const hist = closes.slice(0, i + 1), last = hist[hist.length - 1];
      const drift = driftOf(hist, variant, target);
      const rets = []; for (let k = 1; k < hist.length; k++) rets.push(Math.log(hist[k] / hist[k - 1]));
      const vol = stdev(rets.slice(-20));
      const pred = last * Math.exp(drift * h);
      const bandW = 1.2816 * vol * Math.sqrt(h);
      const lo = last * Math.exp(drift * h - bandW), hi = last * Math.exp(drift * h + bandW);
      const act = closes[i + h];
      ae.push(Math.abs(pred / act - 1) * 100);
      aeN.push(Math.abs(last / act - 1) * 100);           // 랜덤워크(=오늘 가격 그대로)
      if (pred !== last) dir.push((pred > last) === (act > last) ? 1 : 0);
      cov.push(act >= lo && act <= hi ? 1 : 0);
      band.push((Math.exp(bandW) - 1) * 100);              // ± 대략 몇 %인가
      predRet.push(drift * h); realRet.push(Math.log(act / last));
    }
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const diff = ae.map((x, i) => x - aeN[i]);             // 음수면 모델이 낫다
    // 예측 방향과 실제 수익률의 상관계수
    const mp = mean(predRet), mr = mean(realRet);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < predRet.length; i++) { const a = predRet[i] - mp, b = realRet[i] - mr; sxy += a * b; sxx += a * a; syy += b * b; }
    out[h] = {
      n: ae.length,
      mae: mean(ae), maeNaive: mean(aeN),
      ratio: mean(ae) / mean(aeN),
      tStat: nwT(diff, h),
      dirAcc: dir.length ? mean(dir) * 100 : null,
      coverage: mean(cov) * 100,
      bandPct: mean(band),
      corr: sxy / Math.sqrt(sxx * syy)
    };
  }
  return out;
}

function table(title, res) {
  console.log('\n■ ' + title);
  console.log('  h    n     모델MAE%  랜덤워크MAE%  비율   t값     방향적중%  구간적중%  구간폭±%   상관');
  for (const h of HORIZONS) {
    const r = res[h]; if (!r || !r.n) continue;
    console.log(
      '  ' + String(h).padStart(3) + String(r.n).padStart(6) +
      r.mae.toFixed(2).padStart(11) + r.maeNaive.toFixed(2).padStart(13) +
      r.ratio.toFixed(3).padStart(8) + r.tStat.toFixed(2).padStart(8) +
      (r.dirAcc == null ? '     -' : r.dirAcc.toFixed(1).padStart(11)) +
      r.coverage.toFixed(1).padStart(11) + r.bandPct.toFixed(1).padStart(10) +
      r.corr.toFixed(3).padStart(8));
  }
}

console.log('데이터:', N, '거래일 |', rows[0].d, '~', rows[N - 1].d);
console.log('비율<1 이면 모델이 랜덤워크보다 정확. t값 음수·절대값>2 이면 통계적으로 유의하게 낫다.');
console.log('구간적중%는 80%에 가까워야 정직한 신뢰구간.');

table('전체 10년 · 배포 모델(컨센서스 프리미엄 25% 가정)', run('full', START, N - 2));
table('전체 10년 · 컨센서스 항목 제거(모멘텀+평균회귀만)', run('noana', START, N - 2));
table('최근 1년 · 실제 배포 모델(목표주가 493,542원 그대로)', run('current', N - 250, N - 2, 493542));

// 변동성 국면 정보
const rets = []; for (let i = 1; i < N; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
const ann = a => stdev(a) * Math.sqrt(252) * 100;
console.log('\n■ 변동성(연환산)');
console.log('  10년 전체:', ann(rets).toFixed(0) + '%  | 최근 1년:', ann(rets.slice(-250)).toFixed(0) + '%  | 최근 20일:', ann(rets.slice(-20)).toFixed(0) + '%');

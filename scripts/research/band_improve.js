/**
 * 평균가 이격(거리)을 범위 계산에 넣으면 실제로 나아지는가 (로드맵 2-1 후속)
 *
 * 심화 검증에서 "평균가에서 멀수록 이후 더 크게 흔들린다"가 나왔고,
 * 지금 쓰는 혼합변동성(20·60·250일)을 통제해도 남았다(잔차 t=3.8~5.1).
 * 그런데 통계적으로 남는 것과 **화면이 나아지는 것**은 다르다.
 * 실제로 구간 적중률과 폭이 좋아지는지 워크포워드로 확인한다.
 *
 * 판정 기준: 같은 폭에서 적중률이 80%에 더 가까워야 한다.
 *            폭만 넓혀 적중률을 올리는 것은 개선이 아니다(그냥 넓힌 것).
 *
 * 실행: node scripts/research/band_improve.js
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
const F = JSON.parse(fs.readFileSync(path.join(CACHE, 'factors.json'), 'utf8'));
const SYM = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'symbols.json'), 'utf8'));

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const Z = 1.2816;

function analyse(key, code, label) {
  const src = F[key];
  const dates = Object.keys(src).sort();
  const S = dates.map(d => src[d].c), N = S.length;
  const LR = [null]; for (let i = 1; i < N; i++) LR.push(Math.log(S[i] / S[i - 1]));
  const pv = (i, n) => { if (i - n < 1) return null; const s = []; for (let k = i - n + 1; k <= i; k++) s.push(LR[k]); return stdev(s); };
  const blended = i => (i < 251 ? null : Math.sqrt(mean([20, 60, 250].map(n => Math.pow(pv(i, n), 2)))));
  const sma = (i, n) => { if (i - n + 1 < 0) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += S[k]; return s / n; };
  const gap = i => { const m = sma(i, 120); return m ? Math.abs(Math.log(S[i] / m)) : null; };   // 6개월 평균가 거리

  const z1 = (SYM.symbols.find(s => s.code === code) || {}).stats.z1 || 1.04;

  // 이격 거리를 배수로 바꾼다: 과거 3년 분포에서의 위치로 정규화 → 0.85~1.25 배
  function gapMult(i) {
    const g = gap(i); if (g == null || i < 800) return null;
    const hist = [];
    for (let j = i - 750; j < i; j++) { const v = gap(j); if (v != null) hist.push(v); }
    if (hist.length < 400) return null;
    hist.sort((a, b) => a - b);
    let rank = 0; while (rank < hist.length && hist[rank] < g) rank++;
    const pct = rank / hist.length;               // 0~1
    return 0.85 + 0.40 * pct;                     // 하위면 0.85, 상위면 1.25
  }

  function evalBand(h, mode) {
    const cov = [], wid = [];
    for (let i = 800; i <= N - 1 - h; i++) {
      const b = blended(i); if (b == null) continue;
      const gm = gapMult(i); if (gm == null) continue;      // 모든 방식을 같은 표본에서 비교
      let k = z1;
      if (mode === 'gap') k = z1 * gm;
      const band = Z * b * k * Math.sqrt(h);
      const r = Math.log(S[i + h] / S[i]);
      cov.push(Math.abs(r) <= band ? 1 : 0);
      wid.push((Math.exp(band) - 1) * 100);
    }
    return { n: cov.length, cov: mean(cov) * 100, wid: mean(wid) };
  }

  console.log(`\n■ ${label} (${code})   현재 보정배수 z1=${z1}`);
  console.log('   기간    방식              검증일수  적중률%   평균폭±%   80% 오차');
  for (const h of [5, 10, 20]) {
    for (const [nm, mode] of [['현행 (혼합변동성만)', 'now'], ['+ 평균가 이격 반영', 'gap']]) {
      const r = evalBand(h, mode);
      console.log('   ' + String(h).padStart(3) + '일   ' + nm.padEnd(20)
        + String(r.n).padStart(6) + r.cov.toFixed(1).padStart(9) + r.wid.toFixed(1).padStart(11)
        + Math.abs(r.cov - 80).toFixed(1).padStart(11));
    }
  }
}

console.log('='.repeat(80));
console.log('평균가 이격을 범위에 반영하면 나아지는가');
console.log('  같은 폭에서 적중률이 80%에 더 가까워야 개선이다. 폭만 넓히는 것은 개선이 아니다.');
console.log('='.repeat(80));
analyse('samsung', '005930', '삼성전자');
analyse('hynix', '000660', 'SK하이닉스');
console.log('');

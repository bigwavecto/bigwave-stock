/**
 * 섹션 검증 심화 (로드맵 2-1) — "변동성을 예측한다"는 결과를 두 번 더 의심한다.
 *
 * 1차 검증에서 3개월·6개월 평균가 이격과 3개월 고저 내 위치가 이후 변동성과
 * 상관이 있다고 나왔다. 그런데 그것만으로는 화면에 남길 근거가 못 된다. 두 가지를 더 봐야 한다.
 *
 *  ① 부호인가 거리인가
 *     log(P/평균) 은 위/아래를 구분한다. 이 표본은 두 종목 모두 크게 오른 구간이라
 *     "위에 있음"과 "많이 올랐음"이 뒤섞인다. **거리(절대값)** 로도 예측되는지 봐야
 *     "평균에서 멀수록 흔들린다"는 해석이 성립한다.
 *
 *  ② 이미 쓰는 변동성 지표에 더해주는 게 있는가
 *     앱은 이미 20·60·250일 혼합 변동성으로 범위를 계산한다. 이격도가 그것과
 *     같은 얘기를 하는 것뿐이라면 화면에 남길 예측적 근거는 없다.
 *     현재 변동성으로 설명하고 남은 부분(잔차)과의 상관을 본다.
 *
 * 실행: node scripts/research/section_audit2.js
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
const F = JSON.parse(fs.readFileSync(path.join(CACHE, 'factors.json'), 'utf8'));

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

function nwT(x, y, lag) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  if (!sxx || !syy) return { ic: 0, t: 0 };
  const beta = sxy / sxx, e = [];
  for (let i = 0; i < n; i++) e.push((y[i] - my) - beta * (x[i] - mx));
  let s = 0; for (let i = 0; i < n; i++) s += ((x[i] - mx) * e[i]) ** 2; s /= n;
  for (let L = 1; L <= lag; L++) {
    let g = 0; for (let i = L; i < n; i++) g += (x[i] - mx) * e[i] * (x[i - L] - mx) * e[i - L];
    g /= n; s += 2 * (1 - L / (lag + 1)) * g;
  }
  const se = Math.sqrt(s * n) / (sxx / Math.sqrt(n)) / Math.sqrt(n);
  return { ic: sxy / Math.sqrt(sxx * syy), t: beta / (se || 1e-12) };
}

function analyse(key, label) {
  const src = F[key];
  const dates = Object.keys(src).sort();
  const S = dates.map(d => src[d].c), N = S.length;
  const LR = [null]; for (let i = 1; i < N; i++) LR.push(Math.log(S[i] / S[i - 1]));
  const sma = (i, n) => { if (i - n + 1 < 0) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += S[k]; return s / n; };
  const pv = (i, n) => { if (i - n < 1) return null; const s = []; for (let k = i - n + 1; k <= i; k++) s.push(LR[k]); return stdev(s); };
  // 앱이 실제로 쓰는 혼합 변동성 (20·60·250일)
  const blended = i => (i < 251 ? null : Math.sqrt(mean([20, 60, 250].map(n => Math.pow(pv(i, n), 2)))));
  const fwdVol = (i, h) => { if (i + h >= N) return null; const s = []; for (let k = i + 1; k <= i + h; k++) s.push(LR[k]); return Math.log(stdev(s) + 1e-12); };

  const feats = [
    ['3개월 평균가 이격 (부호)', i => { const m = sma(i, 60); return m ? Math.log(S[i] / m) : null; }],
    ['3개월 평균가 이격 (거리)', i => { const m = sma(i, 60); return m ? Math.abs(Math.log(S[i] / m)) : null; }],
    ['6개월 평균가 이격 (부호)', i => { const m = sma(i, 120); return m ? Math.log(S[i] / m) : null; }],
    ['6개월 평균가 이격 (거리)', i => { const m = sma(i, 120); return m ? Math.abs(Math.log(S[i] / m)) : null; }],
    ['3개월 고저 내 위치 (0~1)', i => {
      if (i < 60) return null;
      const w = S.slice(i - 59, i + 1), lo = Math.min(...w), hi = Math.max(...w);
      return hi > lo ? (S[i] - lo) / (hi - lo) : null;
    }],
    ['3개월 고저 폭 (범위 크기)', i => {
      if (i < 60) return null;
      const w = S.slice(i - 59, i + 1);
      return Math.log(Math.max(...w) / Math.min(...w));
    }],
  ];

  // 이후 20일 변동성을 현재 혼합변동성으로 설명하고 남은 잔차
  const xs = [], ys = [], idx = [];
  for (let i = 300; i < N - 20; i++) {
    const b = blended(i), y = fwdVol(i, 20);
    if (b == null || y == null) continue;
    xs.push(Math.log(b)); ys.push(y); idx.push(i);
  }
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const beta = sxy / sxx;
  const resid = ys.map((y, i) => y - (my + beta * (xs[i] - mx)));

  console.log(`\n■ ${label}`);
  console.log('  지표                          이후변동성 IC     t      │ 혼합변동성 통제 후 잔차 IC     t');
  for (const [nm, fn] of feats) {
    const a = [], b = [], r = [];
    for (let k = 0; k < idx.length; k++) {
      const v = fn(idx[k]);
      if (v == null || !isFinite(v)) continue;
      a.push(v); b.push(ys[k]); r.push(resid[k]);
    }
    if (a.length < 100) { console.log('  ' + nm.padEnd(28) + '  표본 부족'); continue; }
    const raw = nwT(a, b, 20), res = nwT(a, r, 20);
    const mark = Math.abs(res.t) > 2 ? ' ★' : '';
    console.log('  ' + nm.padEnd(28) + raw.ic.toFixed(3).padStart(8) + raw.t.toFixed(2).padStart(7)
      + '   │ ' + res.ic.toFixed(3).padStart(10) + res.t.toFixed(2).padStart(7) + mark);
  }
  return null;
}

console.log('='.repeat(92));
console.log('부호 vs 거리, 그리고 "이미 쓰는 혼합변동성에 더해주는 게 있는가"');
console.log('  ★ = 잔차에서도 |t|>2  → 현재 변동성 지표가 놓친 것을 이 지표가 잡아낸다는 뜻');
console.log('='.repeat(92));
analyse('samsung', '삼성전자 (005930)');
analyse('hynix', 'SK하이닉스 (000660)');
console.log('');

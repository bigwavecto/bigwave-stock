/**
 * 섹션 검증 — 화면에 있는 요소들이 실제로 뭔가를 예측하는지 판정한다. (로드맵 2-1)
 *
 * 이 앱의 입장은 확고하다: **방향은 예측 못 하고, 변동 폭은 예측 가능하다.**
 * 그래서 각 요소를 두 잣대로 잰다.
 *   ① 이후 수익률을 예측하는가  → 하면 "방향 예측"이므로 앱 입장과 충돌한다(또는 대단한 발견)
 *   ② 이후 변동성을 예측하는가  → 하면 범위 계산에 기여하므로 남길 근거가 된다
 * 둘 다 아니면 화면에서 뺀다.
 *
 * 검증 대상
 *   - 종합 점수("지금 분위기" 배지)  ← index.html renderSummary의 공식을 그대로 재현
 *   - RSI(14)
 *   - 1개월/3개월/6개월 평균가 대비 위치
 *   - 최근 3개월 고저 범위 내 위치(지지·저항)
 *   - 연환산 변동성(20일)  ← 대조군. 이건 검증된 요소라 확실히 통과해야 정상
 *
 * 실행: node scripts/research/section_audit.js
 * 선행: node scripts/research/fetch/fetch_factors.js  (원자료 → .cache/)
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
const F = JSON.parse(fs.readFileSync(path.join(CACHE, 'factors.json'), 'utf8'));

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

/* Newey-West 보정 t값 — 예측 구간이 겹쳐 생기는 자기상관을 보정한다 */
function nwT(x, y, lag) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  if (!sxx || !syy) return { ic: 0, t: 0, n };
  const beta = sxy / sxx, e = [];
  for (let i = 0; i < n; i++) e.push((y[i] - my) - beta * (x[i] - mx));
  let s = 0; for (let i = 0; i < n; i++) s += ((x[i] - mx) * e[i]) ** 2; s /= n;
  for (let L = 1; L <= lag; L++) {
    let g = 0; for (let i = L; i < n; i++) g += (x[i] - mx) * e[i] * (x[i - L] - mx) * e[i - L];
    g /= n; s += 2 * (1 - L / (lag + 1)) * g;
  }
  const se = Math.sqrt(s * n) / (sxx / Math.sqrt(n)) / Math.sqrt(n);
  return { ic: sxy / Math.sqrt(sxx * syy), t: beta / (se || 1e-12), n };
}

function analyse(key, label, code) {
  const src = F[key];
  const dates = Object.keys(src).sort();
  const S = dates.map(d => src[d].c);
  const N = S.length;
  const LR = [null]; for (let i = 1; i < N; i++) LR.push(Math.log(S[i] / S[i - 1]));

  const sma = (i, n) => { if (i - n + 1 < 0) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += S[k]; return s / n; };
  const rsi = (i, n = 14) => {
    if (i - n < 0) return null;
    let g = 0, l = 0;
    for (let k = i - n + 1; k <= i; k++) { const c = S[k] - S[k - 1]; if (c > 0) g += c; else l -= c; }
    return l === 0 ? 100 : 100 - 100 / (1 + (g / n) / (l / n));
  };
  const vol20 = i => { if (i < 21) return null; const s = []; for (let k = i - 19; k <= i; k++) s.push(LR[k]); return stdev(s) * Math.sqrt(252) * 100; };

  /* index.html renderSummary 의 점수 공식을 그대로 재현.
     증권사 목표가는 과거 값을 구할 수 없으므로 "현재가보다 30% 위" 조건이
     늘 참인 경우(+1 고정)와 늘 거짓인 경우(0 고정) 둘 다 본다 → 결론이 갈리는지 확인 */
  function scoreAt(i, targetBonus) {
    const s20 = sma(i, 20), s60 = sma(i, 60), r = rsi(i), v = vol20(i);
    if (s20 == null || s60 == null || r == null || v == null) return null;
    let sc = 0;
    sc += S[i] > s20 ? 1 : -1;
    sc += S[i] > s60 ? 1 : -1;
    if (r < 30) sc += 1; else if (r > 70) sc -= 1;
    sc += targetBonus;
    if (v > 60) sc -= 1;
    return sc;
  }
  const labelOf = sc => sc >= 3 ? '좋음' : sc >= 1 ? '조금 좋음' : sc >= -1 ? '보통' : '조심';

  /* 지표 정의 */
  const feats = [
    ['종합 점수(목표가 +1 가정)', i => scoreAt(i, 1)],
    ['종합 점수(목표가 0 가정)', i => scoreAt(i, 0)],
    ['RSI(14)', i => rsi(i)],
    ['1개월 평균가 대비', i => { const m = sma(i, 20); return m ? Math.log(S[i] / m) : null; }],
    ['3개월 평균가 대비', i => { const m = sma(i, 60); return m ? Math.log(S[i] / m) : null; }],
    ['6개월 평균가 대비', i => { const m = sma(i, 120); return m ? Math.log(S[i] / m) : null; }],
    ['3개월 고저 내 위치', i => {
      if (i < 60) return null;
      const w = S.slice(i - 59, i + 1), lo = Math.min(...w), hi = Math.max(...w);
      return hi > lo ? (S[i] - lo) / (hi - lo) : null;
    }],
    ['변동성(20일) — 대조군', i => vol20(i)],
  ];

  const fwdRet = (i, h) => (i + h < N ? Math.log(S[i + h] / S[i]) : null);
  const fwdVol = (i, h) => { if (i + h >= N) return null; const s = []; for (let k = i + 1; k <= i + h; k++) s.push(LR[k]); return Math.log(stdev(s) + 1e-12); };

  console.log(`\n${'='.repeat(78)}`);
  console.log(`■ ${label} (${code})   ${dates[0]} ~ ${dates[N - 1]}  ${N}일`);
  console.log('='.repeat(78));
  console.log('  |t|>2 여야 통계적으로 의미가 있다. 수익률 예측은 실패해야 정상(앱 입장), 변동성 예측은 성공하면 남길 근거.\n');
  console.log('  지표                        수익률 5일      수익률 20일     변동성 20일');
  console.log('                              IC     t        IC     t        IC     t');

  const verdict = [];
  for (const [nm, fn] of feats) {
    const cells = [];
    const res = {};
    for (const [target, h, kind] of [[fwdRet, 5, 'ret'], [fwdRet, 20, 'ret'], [fwdVol, 20, 'vol']]) {
      const xs = [], ys = [];
      for (let i = 300; i < N - h; i++) {
        const v = fn(i), y = target(i, h);
        if (v == null || y == null || !isFinite(v)) continue;
        xs.push(v); ys.push(y);
      }
      if (xs.length < 100) { cells.push('    -      -'); continue; }
      const r = nwT(xs, ys, h);
      cells.push(r.ic.toFixed(3).padStart(6) + r.t.toFixed(2).padStart(7));
      res[kind + h] = r;
    }
    console.log('  ' + nm.padEnd(26) + cells.join('  '));
    verdict.push({ nm, ret5: res.ret5, ret20: res.ret20, vol20: res.vol20 });
  }

  /* "지금 분위기" 라벨별로 이후 실제 수익률 — 가장 알기 쉬운 형태 */
  console.log('\n  ▸ "지금 분위기" 배지가 표시된 뒤 실제로 어떻게 됐나 (목표가 +1 가정, 20일 뒤)');
  const buckets = {};
  for (let i = 300; i < N - 20; i++) {
    const sc = scoreAt(i, 1); if (sc == null) continue;
    const y = fwdRet(i, 20); if (y == null) continue;
    const L = labelOf(sc);
    (buckets[L] = buckets[L] || []).push((Math.exp(y) - 1) * 100);
  }
  for (const L of ['좋음', '조금 좋음', '보통', '조심']) {
    const b = buckets[L];
    if (!b || b.length < 20) { console.log(`     ${L.padEnd(6)} 표본 부족`); continue; }
    const up = b.filter(x => x > 0).length / b.length * 100;
    console.log(`     ${L.padEnd(6)} n=${String(b.length).padStart(4)}   평균 ${mean(b).toFixed(2).padStart(6)}%   상승 ${up.toFixed(0).padStart(3)}%`);
  }

  return verdict;
}

const targets = [['samsung', '삼성전자', '005930'], ['hynix', 'SK하이닉스', '000660']];
const all = {};
for (const [k, l, c] of targets) all[c] = analyse(k, l, c);

/* 종합 판정 — 두 종목 모두에서 유의해야 "쓸모 있음"으로 본다 */
console.log(`\n${'='.repeat(78)}`);
console.log('■ 종합 판정  (두 종목 모두에서 |t|>2 여야 인정)');
console.log('='.repeat(78));
const names = all['005930'].map(v => v.nm);
for (const nm of names) {
  const a = all['005930'].find(v => v.nm === nm), b = all['000660'].find(v => v.nm === nm);
  const sig = (x, k) => x && x[k] && Math.abs(x[k].t) > 2;
  const retBoth = (sig(a, 'ret5') || sig(a, 'ret20')) && (sig(b, 'ret5') || sig(b, 'ret20'));
  const volBoth = sig(a, 'vol20') && sig(b, 'vol20');
  let v;
  if (volBoth && !retBoth) v = '✅ 변동성 예측에 기여 — 남길 근거 있음';
  else if (volBoth && retBoth) v = '⚠️ 둘 다 유의 — 개별 검토 필요';
  else if (retBoth) v = '⚠️ 수익률만 유의 — 앱 입장과 충돌, 재검토';
  else v = '❌ 아무것도 예측 못 함';
  console.log('  ' + nm.padEnd(26) + v);
}
console.log('');

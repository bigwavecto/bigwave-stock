/**
 * 요인 기반 방향/확률 예측 검증
 *  1) 개별 요인의 예측력 (IC = 요인값과 이후 수익률의 상관, 겹침 보정 t값)
 *  2) 요인 조합 로지스틱 회귀로 "오를 확률 %" 예보 → 워크포워드 평가
 *  3) 예보 확률 구간별 실제 상승률 (캘리브레이션) + 5분위 검정
 *
 * 미래 정보 차단: 미국 지표는 한국 날짜 d 직전의 미국 종가만 사용.
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const F = JSON.parse(fs.readFileSync(path.join(CACHE, 'factors.json'), 'utf8'));

/* ── 날짜 정렬 ── */
const dates = Object.keys(F.samsung).sort();
const usKeys = {};
for (const k of ['nasdaq', 'vix', 'sox', 'tsmc']) usKeys[k] = Object.keys(F[k]).sort();

function usValueBefore(name, d) {           // 한국 날짜 d 시점에 알 수 있는 최신 미국 종가
  const ks = usKeys[name];
  let lo = 0, hi = ks.length - 1, res = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (ks[m] < d) { res = ks[m]; lo = m + 1; } else hi = m - 1; }
  return res ? F[name][res].c : null;
}

// 각 시리즈를 삼성 거래일에 맞춰 정렬한 배열로
const S = dates.map(d => F.samsung[d].c);
const SV = dates.map(d => F.samsung[d].v);
const KS = dates.map(d => (F.kospi[d] ? F.kospi[d].c : null));
const HY = dates.map(d => (F.hynix[d] ? F.hynix[d].c : null));
const FX = dates.map(d => (F.usdkrw[d] ? F.usdkrw[d].c : null));
const NQ = dates.map(d => usValueBefore('nasdaq', d));
const VX = dates.map(d => usValueBefore('vix', d));
const SX = dates.map(d => usValueBefore('sox', d));
const TS = dates.map(d => usValueBefore('tsmc', d));
const ffill = a => { let last = null; return a.map(x => (x == null ? last : (last = x))); };
[KS, HY, FX, NQ, VX, SX, TS].forEach(a => { const f = ffill(a); for (let i = 0; i < a.length; i++) a[i] = f[i]; });

const N = dates.length;
const lr = (a, i, n) => (i - n >= 0 && a[i] && a[i - n] ? Math.log(a[i] / a[i - n]) : null);
const smaAt = (a, i, n) => { if (i - n + 1 < 0) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; };
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); };
function volAt(i, n) { if (i - n < 0) return null; const r = []; for (let k = i - n + 1; k <= i; k++) r.push(Math.log(S[k] / S[k - 1])); return sd(r); }
function rsiAt(i, n = 14) {
  if (i - n < 0) return null; let g = 0, l = 0;
  for (let k = i - n + 1; k <= i; k++) { const ch = S[k] - S[k - 1]; if (ch > 0) g += ch; else l -= ch; }
  return l === 0 ? 100 : 100 - 100 / (1 + (g / n) / (l / n));
}

/* ── 요인 정의 ── */
const FEATS = [
  ['단기반전 1일', i => lr(S, i, 1)],
  ['모멘텀 5일', i => lr(S, i, 5)],
  ['모멘텀 20일', i => lr(S, i, 20)],
  ['모멘텀 60일', i => lr(S, i, 60)],
  ['모멘텀 120일', i => lr(S, i, 120)],
  ['모멘텀 252일', i => lr(S, i, 252)],
  ['20일선 이격', i => { const m = smaAt(S, i, 20); return m ? Math.log(S[i] / m) : null; }],
  ['60일선 이격', i => { const m = smaAt(S, i, 60); return m ? Math.log(S[i] / m) : null; }],
  ['200일선 이격', i => { const m = smaAt(S, i, 200); return m ? Math.log(S[i] / m) : null; }],
  ['RSI 14', i => rsiAt(i)],
  ['변동성 20일', i => volAt(i, 20)],
  ['변동성 국면', i => { const a = volAt(i, 20), b = volAt(i, 250); return a && b ? Math.log(a / b) : null; }],
  ['52주고점 대비', i => { if (i < 250) return null; let h = -1e9; for (let k = i - 249; k <= i; k++) h = Math.max(h, S[k]); return Math.log(S[i] / h); }],
  ['52주저점 대비', i => { if (i < 250) return null; let l = 1e9; for (let k = i - 249; k <= i; k++) l = Math.min(l, S[k]); return Math.log(S[i] / l); }],
  ['거래량 급증', i => { const a = smaAt(SV, i, 5), b = smaAt(SV, i, 60); return a && b ? Math.log(a / b) : null; }],
  ['코스피 5일', i => lr(KS, i, 5)],
  ['코스피 20일', i => lr(KS, i, 20)],
  ['하이닉스 1일', i => lr(HY, i, 1)],
  ['하이닉스 5일', i => lr(HY, i, 5)],
  ['하이닉스 20일', i => lr(HY, i, 20)],
  ['반도체지수 1일', i => lr(SX, i, 1)],
  ['반도체지수 5일', i => lr(SX, i, 5)],
  ['반도체지수 20일', i => lr(SX, i, 20)],
  ['나스닥 1일', i => lr(NQ, i, 1)],
  ['나스닥 5일', i => lr(NQ, i, 5)],
  ['TSMC 1일', i => lr(TS, i, 1)],
  ['TSMC 5일', i => lr(TS, i, 5)],
  ['VIX 수준', i => (VX[i] ? Math.log(VX[i]) : null)],
  ['VIX 5일변화', i => lr(VX, i, 5)],
  ['원달러 5일', i => lr(FX, i, 5)],
  ['원달러 20일', i => lr(FX, i, 20)],
  ['코스피 대비 초과', i => { const a = lr(S, i, 20), b = lr(KS, i, 20); return a != null && b != null ? a - b : null; }],
];

const START = 260;                                   // 252일 모멘텀 확보 후 시작
function buildX(i) { const row = []; for (const [, fn] of FEATS) { const v = fn(i); if (v == null || !isFinite(v)) return null; row.push(v); } return row; }

const X = [], IDX = [];
for (let i = START; i < N; i++) { const r = buildX(i); if (r) { X.push(r); IDX.push(i); } }
const fwd = (i, h) => (i + h < N ? Math.log(S[i + h] / S[i]) : null);

console.log('요인 행렬:', X.length, '행 ×', FEATS.length, '열 |', dates[IDX[0]], '~', dates[IDX[IDX.length - 1]]);

/* ── Newey-West t값 ── */
function nwT(x, y, lag) {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const r = sxy / Math.sqrt(sxx * syy);
  const beta = sxy / sxx, e = [];
  for (let i = 0; i < n; i++) e.push((y[i] - my) - beta * (x[i] - mx));
  let s = 0; for (let i = 0; i < n; i++) s += ((x[i] - mx) * e[i]) ** 2; s /= n;
  for (let L = 1; L <= lag; L++) { let g = 0; for (let i = L; i < n; i++) g += (x[i] - mx) * e[i] * (x[i - L] - mx) * e[i - L]; g /= n; s += 2 * (1 - L / (lag + 1)) * g; }
  const se = Math.sqrt(s * n) / (sxx / Math.sqrt(n)) / Math.sqrt(n);
  return { r, t: beta / (se || 1e-12) };
}

/* ── 1) 개별 요인 예측력 ── */
for (const h of [5, 20]) {
  const rows = [];
  for (let f = 0; f < FEATS.length; f++) {
    const xs = [], ys = [];
    for (let k = 0; k < X.length; k++) { const y = fwd(IDX[k], h); if (y != null) { xs.push(X[k][f]); ys.push(y); } }
    const { r, t } = nwT(xs, ys, h);
    rows.push({ name: FEATS[f][0], ic: r, t, n: xs.length });
  }
  rows.sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
  console.log(`\n■ 개별 요인 예측력 (${h}거래일 뒤 수익률과의 상관) — |t|>2 여야 통계적으로 유의`);
  console.log('   요인                  상관(IC)      t값     판정');
  for (const r of rows.slice(0, 12)) {
    console.log('   ' + r.name.padEnd(20) + r.ic.toFixed(3).padStart(9) + r.t.toFixed(2).padStart(9) +
      '     ' + (Math.abs(r.t) > 2 ? '유의' : '무의미'));
  }
  console.log('   … 나머지 ' + (rows.length - 12) + '개 요인은 |t| < ' + Math.abs(rows[12].t).toFixed(2));
  console.log('   유의한 요인 수: ' + rows.filter(r => Math.abs(r.t) > 2).length + ' / ' + rows.length);
}

/* ── 2) 로지스틱 회귀 확률 예보 (워크포워드) ── */
function fitLogit(Xtr, ytr, lambda = 1.0, iters = 400, lr0 = 0.5) {
  const p = Xtr[0].length, n = Xtr.length;
  const w = new Array(p).fill(0); let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(p).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < p; j++) z += w[j] * Xtr[i][j];
      const pr = 1 / (1 + Math.exp(-z)), d = pr - ytr[i];
      for (let j = 0; j < p; j++) gw[j] += d * Xtr[i][j];
      gb += d;
    }
    const step = lr0 / (1 + it / 60);
    for (let j = 0; j < p; j++) w[j] -= step * (gw[j] / n + lambda * w[j] / n);
    b -= step * gb / n;
  }
  return { w, b };
}

function walkForward(h, featIdx, lambda) {
  const MIN = 750, REFIT = 21;
  const preds = [], acts = [], baseRates = [];
  let model = null, mu = null, sg = null, base = null;
  for (let k = MIN; k < X.length; k++) {
    if (fwd(IDX[k], h) == null) break;
    if ((k - MIN) % REFIT === 0) {
      const tr = [], ty = [];
      for (let j = 0; j < k - h; j++) {                       // 결과를 이미 아는 구간만 학습
        const y = fwd(IDX[j], h); if (y == null) continue;
        tr.push(featIdx.map(f => X[j][f])); ty.push(y > 0 ? 1 : 0);
      }
      mu = tr[0].map((_, j) => tr.reduce((s, r) => s + r[j], 0) / tr.length);
      sg = tr[0].map((_, j) => { const m = mu[j]; return Math.sqrt(tr.reduce((s, r) => s + (r[j] - m) ** 2, 0) / tr.length) || 1; });
      const z = tr.map(r => r.map((v, j) => (v - mu[j]) / sg[j]));
      model = fitLogit(z, ty, lambda);
      base = ty.reduce((a, b2) => a + b2, 0) / ty.length;
    }
    const raw = featIdx.map(f => X[k][f]);
    let zz = model.b; raw.forEach((v, j) => { zz += model.w[j] * ((v - mu[j]) / sg[j]); });
    preds.push(1 / (1 + Math.exp(-zz)));
    acts.push(fwd(IDX[k], h) > 0 ? 1 : 0);
    baseRates.push(base);
  }
  const n = preds.length;
  const bs = preds.reduce((s, p, i) => s + (p - acts[i]) ** 2, 0) / n;
  const bsBase = baseRates.reduce((s, p, i) => s + (p - acts[i]) ** 2, 0) / n;
  // AUC
  const pairs = preds.map((p, i) => [p, acts[i]]).sort((a, b) => a[0] - b[0]);
  let pos = 0, neg = 0, rankSum = 0;
  pairs.forEach(([, a], i) => { if (a === 1) { pos++; rankSum += i + 1; } else neg++; });
  const auc = pos && neg ? (rankSum - pos * (pos + 1) / 2) / (pos * neg) : 0.5;
  const acc = preds.reduce((s, p, i) => s + ((p > 0.5 ? 1 : 0) === acts[i] ? 1 : 0), 0) / n;
  return { n, bs, bsBase, bss: 1 - bs / bsBase, auc, acc, sharp: sd(preds), preds, acts, avgBase: baseRates.reduce((a, b) => a + b, 0) / n };
}

const ALL = FEATS.map((_, i) => i);
const CORE = [0, 5, 9, 12, 18, 21, 24, 28, 30];   // 문헌상 근거 있는 소수 요인
console.log('\n■ 요인 조합 → "오를 확률 %" 예보 성능 (워크포워드, 학습 최소 3년)');
console.log('   BSS>0 이면 "그냥 평균 확률" 보다 낫다는 뜻. AUC 0.5=무작위. 예보편차=확률이 50%에서 얼마나 벌어지나');
console.log('   기간  요인수  검증일수   BSS      AUC    방향적중%  기준상승률%  예보편차');
for (const h of [5, 20]) {
  for (const [tag, set, lam] of [['전체', ALL, 3.0], ['핵심', CORE, 1.0]]) {
    const r = walkForward(h, set, lam);
    console.log('   ' + String(h).padStart(3) + tag.padStart(6) + String(set.length).padStart(4) +
      String(r.n).padStart(9) + (r.bss >= 0 ? '  ' : ' ') + r.bss.toFixed(4).padStart(8) +
      r.auc.toFixed(3).padStart(9) + (r.acc * 100).toFixed(1).padStart(10) +
      (r.avgBase * 100).toFixed(1).padStart(12) + (r.sharp * 100).toFixed(1).padStart(10));
  }
}

/* ── 3) 캘리브레이션 + 5분위 ── */
for (const h of [5, 20]) {
  const r = walkForward(h, ALL, 3.0);
  const b = {};
  r.preds.forEach((p, i) => { const k = Math.min(0.75, Math.max(0.25, Math.round(p * 20) / 20)); (b[k] = b[k] || []).push(r.acts[i]); });
  console.log(`\n■ ${h}일 예보 캘리브레이션 — "X% 라고 말했을 때 실제로 오른 비율"`);
  console.log('   ' + Object.keys(b).map(Number).sort((a, c) => a - c)
    .filter(k => b[k].length >= 30)
    .map(k => `${(k * 100).toFixed(0)}%→${(b[k].reduce((x, y) => x + y, 0) / b[k].length * 100).toFixed(0)}% (n=${b[k].length})`).join('  '));

  const srt = r.preds.map((p, i) => [p, r.acts[i]]).sort((a, c) => a[0] - c[0]);
  const q = Math.floor(srt.length / 5);
  console.log('   5분위(확률 낮은순→높은순) 실제 상승률: ' +
    [0, 1, 2, 3, 4].map(g => {
      const seg = srt.slice(g * q, g === 4 ? srt.length : (g + 1) * q);
      return (seg.reduce((s, x) => s + x[1], 0) / seg.length * 100).toFixed(0) + '%';
    }).join(' → '));
}

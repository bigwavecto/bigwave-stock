/** 밴드 배수 캘리브레이션 — 전체 표본(수급 무관)에서 80%에 가장 가까운 배수 찾기 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const px = JSON.parse(fs.readFileSync(path.join(CACHE, 'long.json'), 'utf8'));
const S = px.map(r => r.c), N = S.length;
const R = [null]; for (let i = 1; i < N; i++) R.push(Math.log(S[i] / S[i - 1]));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const stdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const pv = (i, n) => { if (i - n < 1) return null; const s = []; for (let k = i - n + 1; k <= i; k++) s.push(R[k]); return stdev(s); };
const blended = i => (i < 251 ? null : Math.sqrt(mean([20, 60, 250].map(n => Math.pow(pv(i, n), 2)))));
const Z = 1.2816;

console.log('현행(배수 1.00)과 후보 배수들의 구간 적중률 / 평균 폭 — 목표 80%');
console.log('  배수    1주 적중/폭      2주 적중/폭      1개월 적중/폭     3개월 적중/폭');
for (const k of [1.00, 1.03, 1.05, 1.08, 1.12]) {
  const cells = [];
  for (const h of [5, 10, 20, 60]) {
    const cov = [], wid = [];
    for (let i = 300; i <= N - 1 - h; i++) {
      const b = blended(i); if (b == null) continue;
      const band = Z * b * k * Math.sqrt(h);
      const r = Math.log(S[i + h] / S[i]);
      cov.push(r >= -band && r <= band ? 1 : 0); wid.push((Math.exp(band) - 1) * 100);
    }
    cells.push((mean(cov) * 100).toFixed(1) + '% / ±' + mean(wid).toFixed(1) + '%');
  }
  console.log('  ' + k.toFixed(2) + '   ' + cells.map(c => c.padEnd(16)).join(''));
}
console.log('\n※ 정규분포 가정(z=1.2816)은 실제 수익률의 두꺼운 꼬리를 과소평가한다.');
console.log('  배수를 키우면 적중률이 80%에 가까워지지만 범위도 넓어진다 — 균형점을 골라야 한다.');

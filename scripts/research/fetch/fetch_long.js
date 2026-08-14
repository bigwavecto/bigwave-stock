// 백테스트용 장기 시세 수집 (10년)
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '..', '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const URL = 'https://query1.finance.yahoo.com/v8/finance/chart/005930.KS?range=10y&interval=1d';
(async () => {
  const r = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error('야후 응답 오류: ' + r.status);
  const d = await r.json();
  const res = d.chart.result[0];
  const ts = res.timestamp, q = res.indicators.quote[0];
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close[i] == null) continue;
    rows.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10), c: q.close[i] });
  }
  fs.writeFileSync(path.join(CACHE, 'long.json'), JSON.stringify(rows));
  console.log(rows.length, '일치 |', rows[0].d, '~', rows[rows.length - 1].d);
  console.log('첫 종가', Math.round(rows[0].c), '| 마지막 종가', Math.round(rows[rows.length - 1].c));
})();

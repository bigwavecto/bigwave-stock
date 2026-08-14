// 요인 분석용 다중 시계열 수집 (10년 일봉)
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '..', '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const TICKERS = {
  samsung: '005930.KS',   // 삼성전자
  kospi: '%5EKS11',       // 코스피
  hynix: '000660.KS',     // SK하이닉스 (동종업계)
  usdkrw: 'KRW=X',        // 원/달러
  nasdaq: '%5EIXIC',      // 나스닥
  vix: '%5EVIX',          // 변동성지수
  sox: '%5ESOX',          // 필라델피아 반도체지수
  tsmc: 'TSM'             // TSMC (미국 상장)
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const out = {};
  for (const [name, sym] of Object.entries(TICKERS)) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=10y&interval=1d`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log('✗', name, sym, 'HTTP', r.status); continue; }
      const j = await r.json();
      const res = j.chart.result[0];
      const ts = res.timestamp, q = res.indicators.quote[0];
      const series = {};
      for (let i = 0; i < ts.length; i++) {
        if (q.close[i] == null) continue;
        const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
        series[d] = { c: q.close[i], v: q.volume ? (q.volume[i] || 0) : 0 };
      }
      out[name] = series;
      const ks = Object.keys(series);
      console.log('✓', name.padEnd(9), sym.padEnd(12), ks.length, '일치 |', ks[0], '~', ks[ks.length - 1]);
    } catch (e) { console.log('✗', name, e.message); }
    await sleep(400);
  }
  fs.writeFileSync(path.join(CACHE, 'factors.json'), JSON.stringify(out));
  console.log('\n저장 완료:', Object.keys(out).join(', '));
})();

/**
 * 네이버 금융 외국인·기관 매매동향 10년치 수집.
 * 주의: 이 페이지의 종가·수량은 액면분할(2018-05, 50:1) 미조정이다.
 *       따라서 종가는 쓰지 않고, 수급은 반드시 "당일 거래량 대비 비율"로 정규화한다.
 */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '..', '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parse(html) {
  const out = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    if (!/\d{4}\.\d{2}\.\d{2}/.test(tr)) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (cells.length < 9) continue;
    const n = s => { const v = +String(s).replace(/[,%\s+]/g, ''); return isFinite(v) ? v : null; };
    // 0날짜 1종가 2전일비 3등락률 4거래량 5기관순매매 6외국인순매매 7외국인보유주수 8외국인보유율
    out.push({ d: cells[0].replace(/\./g, '-'), vol: n(cells[4]), org: n(cells[5]), frn: n(cells[6]), frnHold: n(cells[8]) });
  }
  return out;
}

(async () => {
  const all = new Map();
  let fails = 0;
  for (let p = 1; p <= 128; p++) {
    try {
      const r = await fetch(`https://finance.naver.com/item/frgn.naver?code=005930&page=${p}`, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = parse(await r.text());
      if (!rows.length) { fails++; if (fails >= 3) break; }
      else { fails = 0; rows.forEach(x => all.set(x.d, x)); }
    } catch (e) {
      fails++; console.log('  page', p, '실패:', e.message);
      if (fails >= 3) break;
      await sleep(1200);
    }
    if (p % 25 === 0) console.log('  ...', p, '페이지, 누적', all.size, '일');
    await sleep(220);
  }
  const rows = [...all.values()].sort((a, b) => a.d.localeCompare(b.d));
  fs.writeFileSync(path.join(CACHE, 'flow.json'), JSON.stringify(rows));
  console.log('\n수집 완료:', rows.length, '일 |', rows[0].d, '~', rows[rows.length - 1].d);
  const miss = rows.filter(r => r.vol == null || r.frn == null || r.org == null || !r.vol).length;
  console.log('결측/0거래량 행:', miss);
  console.log('최근 3일:', JSON.stringify(rows.slice(-3)));
  // 분할 전후 스케일 확인 (비율로 쓰면 무해함을 보이기 위해)
  const pre = rows.find(r => r.d === '2018-05-02'), post = rows.find(r => r.d === '2018-05-08');
  if (pre) console.log('분할 전 예시', pre.d, '거래량', pre.vol, '외국인', pre.frn, '→ 비율', (pre.frn / pre.vol).toFixed(4));
  if (post) console.log('분할 후 예시', post.d, '거래량', post.vol, '외국인', post.frn, '→ 비율', (post.frn / post.vol).toFixed(4));
})();

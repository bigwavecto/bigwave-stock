/**
 * 수급(투자자별 순매수) 데이터를 자동으로 받아올 수 있는 경로 탐색.
 * GitHub Actions(Node, 키 없음)에서 매일 돌아야 하므로 무인증·무키 경로가 필요하다.
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function tryIt(name, fn) {
  try {
    const r = await fn();
    console.log('✓', name, '→', r);
  } catch (e) {
    console.log('✗', name, '→', e.message.slice(0, 120));
  }
}

(async () => {
  // 1) KRX 정보데이터시스템 — 투자자별 거래실적(개별종목) 일별추이
  await tryIt('KRX MDCSTAT02303', async () => {
    const body = new URLSearchParams({
      bld: 'dbms/MDC/STAT/standard/MDCSTAT02303',
      locale: 'ko_KR', isuCd: 'KR7005930003', isuCd2: '005930',
      strtDd: '20260701', endDd: '20260813',
      askBid: '3', trdVolVal: '2', money: '1', csvxls_isNo: 'false'
    });
    const r = await fetch('http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': 'http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020203',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body
    });
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = JSON.parse(t);
    const key = Object.keys(j)[0];
    const rows = j[key] || [];
    return 'HTTP 200, ' + key + ' ' + rows.length + '행, 샘플=' + JSON.stringify(rows[0] || {}).slice(0, 200);
  });

  // 2) 네이버 금융 외국인·기관 매매 (HTML)
  await tryIt('네이버 frgn.naver', async () => {
    const r = await fetch('https://finance.naver.com/item/frgn.naver?code=005930&page=1', { headers: { 'User-Agent': UA } });
    const t = await r.text();
    const rows = (t.match(/<tr[^>]*onmouseover/g) || []).length;
    const dates = (t.match(/\d{4}\.\d{2}\.\d{2}/g) || []).slice(0, 3);
    return 'HTTP ' + r.status + ', 데이터행 ' + rows + ', 날짜샘플 ' + dates.join(',');
  });

  // 3) 네이버 모바일 API
  await tryIt('네이버 m.stock API (trend)', async () => {
    const r = await fetch('https://m.stock.naver.com/api/stock/005930/trend?pageSize=20&page=1', { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' } });
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 60));
    const j = JSON.parse(t);
    return 'HTTP 200, ' + (Array.isArray(j) ? j.length + '행' : Object.keys(j).join(',')) + ' 샘플=' + JSON.stringify(Array.isArray(j) ? j[0] : j).slice(0, 220);
  });

  // 4) 네이버 시세 API (외국인 보유율 포함 여부)
  await tryIt('네이버 m.stock integration', async () => {
    const r = await fetch('https://m.stock.naver.com/api/stock/005930/integration', { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return 'HTTP 200, keys=' + Object.keys(j).slice(0, 12).join(',');
  });

  // 5) KRX 전체 투자자별 (코스피 시장 단위) — 종목 단위가 막히면 시장 단위라도
  await tryIt('KRX 시장 투자자별 MDCSTAT02201', async () => {
    const body = new URLSearchParams({
      bld: 'dbms/MDC/STAT/standard/MDCSTAT02201', locale: 'ko_KR',
      mktId: 'STK', invstTpCd: '', strtDd: '20260801', endDd: '20260813',
      share: '1', money: '1', csvxls_isNo: 'false'
    });
    const r = await fetch('http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Referer': 'http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd', 'X-Requested-With': 'XMLHttpRequest' },
      body
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = JSON.parse(await r.text());
    const key = Object.keys(j)[0];
    return 'HTTP 200, ' + key + ' ' + (j[key] || []).length + '행';
  });
})();

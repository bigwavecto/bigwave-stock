/** 장기 수급 이력이 가능한 경로 탐색: 네이버 HTML 페이지네이션 / KRX 정식 엔드포인트 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 네이버 HTML 파서 ──
function parseNaverHtml(html) {
  const out = [];
  // 각 데이터 행: 날짜 셀 뒤로 숫자 셀들이 이어진다
  const re = /<tr[\s\S]*?<\/tr>/g;
  for (const tr of html.match(re) || []) {
    if (!/\d{4}\.\d{2}\.\d{2}/.test(tr)) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (cells.length < 9) continue;
    const d = cells[0].replace(/\./g, '-');
    const n = s => +String(s).replace(/[,%\s+]/g, '');
    out.push({ d, c: n(cells[1]), org: n(cells[5]), frn: n(cells[6]), frnHold: n(cells[8]) });
  }
  return out;
}

(async () => {
  console.log('■ 네이버 HTML (finance.naver.com/item/frgn.naver) 페이지 깊이 확인');
  for (const p of [1, 2, 50, 100, 123, 200]) {
    try {
      const r = await fetch(`https://finance.naver.com/item/frgn.naver?code=005930&page=${p}`, { headers: { 'User-Agent': UA } });
      const html = await r.text();
      const rows = parseNaverHtml(html);
      console.log('  page', String(p).padStart(4), '→', String(rows.length).padStart(3), '행',
        rows.length ? '| ' + rows[0].d + ' ~ ' + rows[rows.length - 1].d + ' | 샘플 ' + JSON.stringify(rows[0]) : '');
    } catch (e) { console.log('  page', p, '실패', e.message); }
    await sleep(250);
  }

  console.log('\n■ KRX 정보데이터시스템 bld 코드 탐색');
  const blds = [
    ['MDCSTAT02203', '투자자별 거래실적(개별종목) 일별추이'],
    ['MDCSTAT02303', '(대안 코드)'],
    ['MDCSTAT02403', '(대안 코드)'],
  ];
  for (const [bld, desc] of blds) {
    try {
      const body = new URLSearchParams({
        bld: 'dbms/MDC/STAT/standard/' + bld, locale: 'ko_KR',
        inqTpCd: '2', trdVolVal: '2', askBid: '3',
        isuCd: 'KR7005930003', isuCd2: 'KR7005930003', codeNmisuCd_finder_stkisu0_0: '삼성전자',
        param1isuCd_finder_stkisu0_0: '', strtDd: '20260701', endDd: '20260813',
        detailView: '1', money: '1', csvxls_isNo: 'false'
      });
      const r = await fetch('https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', {
        method: 'POST',
        headers: {
          'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Referer': 'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020403',
          'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json, text/javascript, */*; q=0.01'
        }, body
      });
      const t = await r.text();
      if (!r.ok) { console.log('  ', bld, desc, '→ HTTP', r.status); continue; }
      const j = JSON.parse(t);
      const key = Object.keys(j).find(k => Array.isArray(j[k]));
      console.log('  ', bld, desc, '→ HTTP 200,', key, (j[key] || []).length, '행', JSON.stringify((j[key] || [])[0] || {}).slice(0, 160));
    } catch (e) { console.log('  ', bld, '실패', e.message.slice(0, 80)); }
    await sleep(400);
  }
})();

/**
 * 라우팅 검사 — `/`가 상황에 따라 랜딩/리포트로 제대로 갈리는지 본다.
 *
 * 조건이 셋(?code= / 마지막 종목 기억 / ?home=1)이라 눈으로 확인하면 빠뜨리기 쉽다.
 * 브라우저 없이 HTML 소스만 본다 — 라우팅 판단은 <head> 인라인 스크립트가 하므로
 * 소스에 그 코드가 있는지, 두 페이지가 각자 살아 있는지까지가 여기서 볼 수 있는 범위다.
 * 실제 이동 동작은 브라우저에서 따로 확인한다(계획서 Task 1 Step 10).
 *
 * 사용: node scripts/verify/serve.js 를 띄운 뒤 node scripts/verify/routing.js
 */
const http = require('http');
const BASE = 'http://localhost:8731';

function get(p) {
  return new Promise((res, rej) => {
    http.get(BASE + p, r => {
      let b = '';
      r.on('data', d => b += d);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
}

(async () => {
  const fails = [];
  const check = (name, cond, detail) => { if (!cond) fails.push(name + (detail ? ' — ' + detail : '')); };

  const root = await get('/');
  check('/ 가 200이어야 한다', root.status === 200, 'status=' + root.status);
  check('/ 에 라우팅 스크립트가 있어야 한다', /location\.replace\(\s*['"]\.\/report\.html/.test(root.body));
  check('/ 가 ssn_last_symbol 을 읽어야 한다', root.body.includes('ssn_last_symbol'));
  check('/ 가 ?home=1 을 처리해야 한다', root.body.includes("'home'") || root.body.includes('"home"'));

  check('랜딩에 서비스 이름이 있어야 한다', root.body.includes('주가 리포트'));
  check('랜딩이 종목 목록을 자동으로 그려야 한다', root.body.includes('symbols.json'));
  check('랜딩이 요약 시세를 읽어야 한다', root.body.includes('summary.json'));
  check('랜딩에 면책 문구가 있어야 한다', root.body.includes('투자 권유가 아니'));
  check('랜딩이 Chart.js를 부르지 않아야 한다', !root.body.includes('chart.umd.min.js'));

  const rep = await get('/report.html');
  check('/report.html 이 200이어야 한다', rep.status === 200, 'status=' + rep.status);
  check('report.html 에 모델이 있어야 한다', rep.body.includes('function makeForecast'));
  check('report.html 에 예측 기록 키가 있어야 한다', rep.body.includes('_predictions_v1'));

  if (fails.length) {
    console.error('\n✗ 라우팅 검사 실패\n');
    fails.forEach((f, i) => console.error(`  ${i + 1}. ${f}`));
    process.exit(1);
  }
  console.log('✅ 라우팅 검사 통과 — /, /report.html 모두 정상');
})().catch(e => { console.error('✗ 검사 실행 실패:', e.message); process.exit(1); });

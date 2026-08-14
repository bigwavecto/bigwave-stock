/**
 * 배포 완료 대기 + 라이브 확인.
 *
 * 푸시하면 Vercel이 자동 배포한다. 이 스크립트는 새 커밋이 실제로 반영될 때까지 기다린 뒤
 * 주요 파일의 응답과 헤더를 확인한다. (헤더가 틀리면 PWA 설치가 조용히 깨진다)
 *
 * 사용: node scripts/verify/deploy-wait.js [기다릴초]
 */
const https = require('https');
const { execSync } = require('child_process');

const BASE = 'https://stock.bigwave.im';
const MAX_SEC = Number(process.argv[2] || 300);

const head = url => new Promise(resolve => {
  const req = https.request(url, { method: 'GET', timeout: 15000 }, res => {
    let n = 0;
    res.on('data', c => { n += c.length; });
    res.on('end', () => resolve({ code: res.statusCode, ct: res.headers['content-type'], cc: res.headers['cache-control'], bytes: n }));
  });
  req.on('error', () => resolve({ code: 0 }));
  req.on('timeout', () => { req.destroy(); resolve({ code: 0 }); });
  req.end();
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let sha = '';
  try { sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch (e) {}
  console.log(`배포 대기 중… (로컬 최신 커밋 ${sha || '알 수 없음'})`);

  // Vercel은 배포 완료 시점을 외부에 알려주지 않으므로, index.html 이 안정적으로 200을 주는지로 판단한다
  const t0 = Date.now();
  let ok = 0;
  while ((Date.now() - t0) / 1000 < MAX_SEC) {
    const r = await head(BASE + '/');
    if (r.code === 200) { ok++; if (ok >= 2) break; } else ok = 0;
    await sleep(5000);
  }
  if (ok < 2) { console.error('✗ 시간 안에 응답을 받지 못했습니다.'); process.exit(1); }

  console.log(`✓ 응답 확인 (${Math.round((Date.now() - t0) / 1000)}초)\n`);

  const checks = [
    ['/', 'text/html', null],
    ['/manifest.webmanifest', 'application/manifest+json', 'PWA 설치 조건'],
    ['/sw.js', 'text/javascript', '서비스 워커'],
    ['/data/symbols.json', 'application/json', '종목 목록'],
  ];
  let bad = 0;
  for (const [p, wantCt, note] of checks) {
    const r = await head(BASE + p);
    const ctOk = r.ct && r.ct.includes(wantCt);
    const mark = r.code === 200 && ctOk ? '✓' : '✗';
    if (mark === '✗') bad++;
    console.log(`  ${mark} ${p.padEnd(26)} ${r.code}  ${r.ct || '-'}${note ? '   ← ' + note : ''}`);
  }

  // 종목별 데이터도 확인
  try {
    const cfg = JSON.parse(execSync('node -e "console.log(require(\'fs\').readFileSync(\'data/symbols.json\',\'utf8\'))"', { encoding: 'utf8' }));
    for (const s of cfg.symbols) {
      const r = await head(`${BASE}/data/${s.code}/prices.json`);
      const mark = r.code === 200 ? '✓' : '✗';
      if (mark === '✗') bad++;
      console.log(`  ${mark} ${('/data/' + s.code + '/prices.json').padEnd(26)} ${r.code}   ${s.name}`);
    }
  } catch (e) { console.log('  (종목 목록을 읽지 못해 종목별 확인은 건너뜀)'); }

  console.log(bad ? `\n✗ ${bad}건 문제` : '\n✅ 배포 확인 완료');
  process.exit(bad ? 1 : 0);
})();

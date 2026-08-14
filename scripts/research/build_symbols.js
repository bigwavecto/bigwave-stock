/**
 * data/symbols.json 생성 — 산출된 상수(.cache/symbol_stats.json)와 종목 목록(fetch/tickers.js)을 합친다.
 *
 * 손으로 옮겨 적지 않는 이유: 상수를 복사하다 한 줄만 틀려도 화면이 조용히 거짓말을 한다.
 * 그리고 이력이 모자란 항목은 산출 단계에서 이미 빠져 있으므로(docs/adr/008),
 * 그대로 옮기면 규칙이 자동으로 지켜진다.
 *
 * 사용:
 *   node scripts/research/fetch/fetch_factors.js
 *   node scripts/research/symbol_stats.js
 *   node scripts/research/build_symbols.js
 */
const fs = require('fs');
const path = require('path');
const { SYMBOLS } = require('./fetch/tickers');

const REPO = path.join(__dirname, '..', '..');
const STATS = path.join(__dirname, '.cache', 'symbol_stats.json');
const OUT = path.join(REPO, 'data', 'symbols.json');

if (!fs.existsSync(STATS)) {
  console.error('✗ .cache/symbol_stats.json 이 없습니다. symbol_stats.js 를 먼저 돌리세요.');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(STATS, 'utf8'));

/* 화면이 쓰는 항목만 옮긴다. label/from/to/days 같은 산출 메타는 넣지 않는다. */
const KEEP = ['z1', 'cov', 'regime', 'market', 'earnings', 'histYears', 'volBase', 'growth'];

const out = { updated: new Date().toISOString().slice(0, 10), note: '', symbols: [] };
out.note = 'stats는 각 종목의 데이터로 직접 검증한 값이다. 다른 종목 값을 복사해 쓰면 화면에 거짓이 표시된다. '
  + '항목마다 필요한 최소 이력이 다르다(docs/adr/008): 흔들림 기준·시장 동조·실적 배수는 5년, 국면(신고가)은 10년. '
  + '계산할 수 없으면 그 항목을 넣지 않는다 — 앱이 해당 줄을 감춘다. '
  + '이 파일은 scripts/research/build_symbols.js 가 만든다. 손으로 고치지 말 것.';

const skipped = [];
for (const s of SYMBOLS) {
  const r = raw[s.code];
  if (!r) { skipped.push(s.name + '(상수 없음)'); continue; }
  if (r.__tooShort) { skipped.push(s.name + '(이력 3년 미만 — 등록 불가)'); continue; }
  const stats = {};
  for (const k of KEEP) if (r[k] != null) stats[k] = r[k];
  // earnings 는 산출부가 { ratio } 로 주는데 화면은 숫자를 쓴다
  if (stats.earnings && typeof stats.earnings === 'object') stats.earnings = stats.earnings.ratio;
  out.symbols.push({ code: s.code, name: s.name, yahoo: s.yahoo, category: s.category, peer: s.peer, stats });
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log('✅ data/symbols.json 생성 — ' + out.symbols.length + '개 종목');
for (const s of out.symbols) {
  const st = s.stats;
  const miss = ['volBase', 'market', 'earnings', 'regime'].filter(k => st[k] == null);
  console.log('  ' + s.code + ' ' + s.name.padEnd(14) + ' [' + s.category + ']'
    + ' 이력 ' + st.histYears + '년 · z1 ' + st.z1
    + (st.volBase ? ' · 흔들림 ' + st.volBase.pct + '%' : '')
    + (st.market ? ' · 시장동반 ' + st.market.withMarketPct + '%' : '')
    + (miss.length ? '   ⚠️ 뺀 항목: ' + miss.join(', ') : ''));
}
if (skipped.length) console.log('\n건너뛴 종목: ' + skipped.join(', '));

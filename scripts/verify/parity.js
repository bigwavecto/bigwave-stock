/**
 * 모델 이중 구현 일치 검사 — CLAUDE.md "핵심 규칙 1"의 자동 감시자.
 *
 * 예측 모델은 report.html(화면용)과 scripts/update_daily.js(Actions용) 두 곳에 있다.
 * 둘이 어긋나면 **화면에 보이는 범위와 저장되는 기록이 달라진다.** 그런데 눈으로는
 * 티가 안 나기 때문에 조용히 깨진다. 그래서 커밋 전에 기계가 확인한다.
 *
 * 방법: 두 파일의 실제 소스에서 모델 부분만 잘라내 실행하고, 등록된 모든 종목에 대해
 *       20개 예측 포인트와 변동성이 완전히 같은지 비교한다. (복사본이 아니라 배포되는 코드 그 자체)
 *
 * 종목별 보정 배수(z1)가 다르므로 종목마다 따로 검사한다.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');

function readSymbols() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'symbols.json'), 'utf8'));
  return cfg.symbols;
}

/* update_daily.js: 실행부(async IIFE) 앞까지가 모델 정의 구간 */
function loadScriptModel() {
  let src = fs.readFileSync(path.join(REPO, 'scripts', 'update_daily.js'), 'utf8');
  const cut = src.indexOf('(async ()=>{');
  if (cut < 0) throw new Error('update_daily.js에서 실행부(`(async ()=>{`)를 찾지 못했습니다. 구조가 바뀌었으면 이 스크립트도 고쳐야 합니다.');
  src = src.slice(0, cut)
    .replace(/^const fs = require\([^\n]*\n/m, '')
    .replace(/^const path = require\([^\n]*\n/m, '')
    .replace(/^const DATA_DIR[^\n]*\n/m, '');
  return new Function(src + '\nreturn { makeForecast, blendedVol, zOf, Z80 };')();
}

/* report.html: 모델 구간(3장)만 잘라낸다. SYM/ST는 검사용으로 주입한다. */
function loadHtmlModel() {
  const html = fs.readFileSync(path.join(REPO, 'report.html'), 'utf8');
  const pick = (start, end) => {
    const a = html.indexOf(start);
    if (a < 0) throw new Error(`report.html에서 "${start}" 를 찾지 못했습니다.`);
    const b = html.indexOf(end, a);
    if (b < 0) throw new Error(`report.html에서 "${start}" 뒤의 "${end}" 를 찾지 못했습니다.`);
    return html.slice(a, b);
  };
  const src =
    pick('const KR_HOLIDAYS', 'const storeKey') +
    pick('function stdev', '/* ============ 3.') +
    pick('function nextBusinessDays', '/* ============ 4.');
  // SYM/ST는 원래 화면 상태에 있는 값이라, 검사할 때 밖에서 넣어 준다
  const wrapper = 'let SYM = null; const ST = () => (SYM && SYM.stats) || {};\n' + src +
    '\nreturn { makeForecast, blendedVol, fcZ, Z80, setSymbol: s => { SYM = s; } };';
  return new Function(wrapper)();
}

function pricesOf(code) {
  const p = path.join(REPO, 'data', code, 'prices.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')).rows;
}

function run() {
  const symbols = readSymbols();
  const A = loadScriptModel();   // update_daily.js
  const B = loadHtmlModel();     // index.html

  if (Math.abs(A.Z80 - B.Z80) > 1e-12) {
    console.error(`✗ 기본 계수 Z80이 다릅니다: update_daily=${A.Z80} vs index.html=${B.Z80}`);
    return 1;
  }

  let bad = 0, checked = 0;
  for (const sym of symbols) {
    const rows = pricesOf(sym.code);
    if (!rows) { console.log(`  - ${sym.name}(${sym.code}): prices.json 없음 — 건너뜀`); continue; }

    const a = A.makeForecast(rows, A.zOf(sym));
    B.setSymbol(sym);
    const b = B.makeForecast(rows);
    checked++;

    const problems = [];
    if (Math.abs(A.zOf(sym) - B.fcZ()) > 1e-12) problems.push(`보정계수 ${A.zOf(sym)} vs ${B.fcZ()}`);
    if (Math.abs(a.vol - b.vol) > 1e-12) problems.push(`변동성 ${a.vol} vs ${b.vol}`);
    if (a.pts.length !== b.pts.length) problems.push(`포인트 수 ${a.pts.length} vs ${b.pts.length}`);
    else {
      for (let i = 0; i < a.pts.length; i++) {
        const x = a.pts[i], y = b.pts[i];
        if (x.d !== y.d || x.v !== y.v || x.lo !== y.lo || x.hi !== y.hi) {
          problems.push(`${i + 1}번째 포인트 ${JSON.stringify(x)} vs ${JSON.stringify(y)}`);
          break;
        }
      }
    }

    if (problems.length) {
      bad++;
      console.error(`  ✗ ${sym.name}(${sym.code}) 불일치`);
      problems.forEach(p => console.error(`      ${p}`));
    } else {
      const w = (Math.sqrt(a.pts[4].hi / a.pts[4].lo) - 1) * 100;
      console.log(`  ✓ ${sym.name}(${sym.code}) 일치 — 1주 ${a.pts[4].lo.toLocaleString('ko-KR')}~${a.pts[4].hi.toLocaleString('ko-KR')} (±${w.toFixed(0)}%)`);
    }
  }

  if (!checked) { console.error('✗ 검사한 종목이 없습니다. data/<코드>/prices.json 을 확인하세요.'); return 1; }
  if (bad) {
    console.error(`\n✗ ${bad}개 종목에서 모델이 어긋났습니다.`);
    console.error('  report.html의 makeForecast와 scripts/update_daily.js의 makeForecast를 같게 맞추세요.');
    return 1;
  }
  console.log(`\n✅ 두 구현이 완전히 동일합니다 (${checked}개 종목).`);
  return 0;
}

if (require.main === module) {
  try { process.exit(run()); }
  catch (e) { console.error('✗ 파리티 검사 실패:', e.message); process.exit(1); }
}
module.exports = { run };

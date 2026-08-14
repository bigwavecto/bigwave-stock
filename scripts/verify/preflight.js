/**
 * 커밋 전 자동 검사 — .claude/settings.json 의 PreToolUse 훅이 호출한다.
 *
 * 사람이 눈으로 못 잡는 것만 검사한다. 통과하면 조용하고, 걸리면 이유를 말한다.
 *
 *  [차단]  모델 이중 구현 불일치  — 화면과 기록이 달라지는데 티가 안 난다
 *  [차단]  data/**.json 깨짐      — 앱 전체가 안 뜬다
 *  [경고]  화면 파일만 바뀌고 sw.js CACHE 그대로 — 사용자가 옛 화면에 갇힌다
 *
 * 종료코드 0 = 통과(경고 포함), 1 = 차단.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const REPO = path.join(__dirname, '..', '..');

const errors = [];
const warnings = [];

/* ── 1. 모델 이중 구현 일치 (차단) ── */
function checkParity() {
  try {
    const out = execSync('node ' + JSON.stringify(path.join(__dirname, 'parity.js')), { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim();
  } catch (e) {
    // parity.js 는 성공 줄을 stdout, 실패 줄을 stderr 에 쓴다. 둘을 합쳐 한 번만 보여준다.
    const detail = [String(e.stdout || '').trim(), String(e.stderr || '').trim()]
      .filter(Boolean).join('\n').split('\n').map(l => '    ' + l).join('\n');
    errors.push('모델 이중 구현이 어긋났습니다 (report.html ↔ scripts/update_daily.js)\n' + detail);
    return null;
  }
}

/* ── 2. 데이터 JSON 유효성 (차단) ── */
function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJson(p, out);
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

/* 이력이 짧은 종목에 긴 이력이 필요한 상수가 들어 있으면 막는다 (docs/adr/008).
   항목마다 필요한 최소 이력이 다르고, 모자란 값을 넣으면 화면이 조용히 거짓말을 한다.
   특히 시장 동조는 창 길이에 따라 문구가 정반대로 뒤집힌다(하이닉스 1년 87% vs 10년 70%). */
// 문턱은 "반올림해서 그 해에 닿는가" 기준이다. 9.8년치를 10년이라 부르는 것은
// 이 앱이 이미 쓰는 관행이고(방법론 카드의 "10년치 2,385번"), 0.2년 차이로
// 카드를 감추는 것이 오히려 정확도에 도움이 되지 않는다.
const HIST_MIN = { volBase: 4.5, market: 4.5, earnings: 4.5, regime: 9.5 };

function checkHistory(s) {
  const st = s.stats, y = st.histYears;
  const who = `symbols.json: ${s.code}(${s.name})`;
  if (y == null) { errors.push(`${who} 에 stats.histYears 가 없습니다. 몇 년치로 계산한 값인지 밝혀야 합니다 (docs/adr/008).`); return; }
  if (y < 2.5) { errors.push(`${who} 의 이력이 ${y}년입니다. 등록 최소 이력은 3년입니다 (docs/adr/008).`); return; }
  for (const [k, need] of Object.entries(HIST_MIN)) {
    if (st[k] != null && y < need) {
      errors.push(`${who} 는 이력이 ${y}년인데 stats.${k} 가 들어 있습니다. 이 항목은 ${need}년 이상이 필요합니다 (docs/adr/008). 빼면 앱이 해당 줄을 감춥니다.`);
    }
  }
  if (st.volBase && st.volBase.years != null && st.volBase.years > y) {
    errors.push(`${who} 의 volBase.years(${st.volBase.years})가 실제 이력(${y}년)보다 깁니다.`);
  }
}

function checkJson() {
  const files = walkJson(path.join(REPO, 'data'));
  let ok = 0;
  for (const f of files) {
    const rel = path.relative(REPO, f).replace(/\\/g, '/');
    try { JSON.parse(fs.readFileSync(f, 'utf8')); ok++; }
    catch (e) { errors.push(`${rel} 이 올바른 JSON이 아닙니다 — ${e.message}`); }
  }
  // symbols.json 은 앱과 스크립트가 모두 의존하므로 구조까지 본다
  const sp = path.join(REPO, 'data', 'symbols.json');
  if (fs.existsSync(sp)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(sp, 'utf8'));
      if (!Array.isArray(cfg.symbols) || !cfg.symbols.length) errors.push('symbols.json 에 symbols 배열이 없습니다.');
      else for (const s of cfg.symbols) {
        const miss = ['code', 'name', 'yahoo', 'stats'].filter(k => !s[k]);
        if (miss.length) errors.push(`symbols.json: ${s.code || '(코드없음)'} 에 ${miss.join(', ')} 가 없습니다.`);
        else if (!s.stats.z1) errors.push(`symbols.json: ${s.code} 에 stats.z1 이 없습니다. 그 종목 데이터로 직접 계산해 넣어야 합니다 (scripts/research/symbol_stats.js).`);
        else checkHistory(s);
      }
    } catch (e) { /* 위에서 이미 잡힘 */ }
  }
  return ok + '/' + files.length;
}

/* ── 3. 화면을 고쳤는데 캐시 버전이 그대로인가 (경고) ── */
function checkCacheBump() {
  let staged = '';
  try { staged = execSync('git diff --cached --name-only', { cwd: REPO, encoding: 'utf8' }); } catch (e) { return null; }
  const files = staged.split('\n').map(s => s.trim()).filter(Boolean);
  // 화면 파일이 둘(랜딩·리포트)이므로 어느 쪽을 고쳐도 캐시 버전을 봐야 한다
  if (!files.some(f => f === 'index.html' || f === 'report.html')) return null;
  if (files.includes('sw.js')) return 'ok';
  warnings.push('화면 파일(index.html / report.html)을 고쳤는데 sw.js 가 그대로입니다.\n'
    + '    sw.js 의 CACHE 버전을 올리지 않으면 이미 방문한 사용자가 옛 화면에 갇힐 수 있습니다.\n'
    + '    (정적 파일만 해당. HTML·데이터는 네트워크 우선이라 대개 괜찮습니다)');
  return 'warn';
}

/* ── 실행 ── */
const parity = checkParity();
const jsonRes = checkJson();
checkCacheBump();

if (errors.length) {
  console.error('\n🚫 커밋 전 검사에서 막혔습니다.\n');
  errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}\n`));
  if (warnings.length) warnings.forEach(w => console.error(`  ⚠️  ${w}\n`));
  process.exit(1);
}

if (warnings.length) {
  console.log('\n⚠️  경고 (커밋은 진행됩니다)\n');
  warnings.forEach(w => console.log(`  ${w}\n`));
}
console.log(`✅ 커밋 전 검사 통과 — 모델 일치, JSON ${jsonRes}${warnings.length ? ' (경고 ' + warnings.length + '건)' : ''}`);
process.exit(0);

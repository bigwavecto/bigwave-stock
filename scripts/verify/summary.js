/**
 * data/summary.json 검사 — 랜딩과 종목 시트가 이 파일 하나로 전 종목 시세를 읽는다.
 *
 * 형식이 어긋나면 랜딩에서 시세가 통째로 사라진다. 그런데 앱은 그 경우에도
 * 이름만으로 계속 동작하도록 만들어 두었기 때문에 **화면만 봐서는 눈치채기 어렵다.**
 * 그래서 기계가 본다.
 *
 * 사용: node scripts/verify/summary.js
 */
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');

const fails = [];
const p = path.join(REPO, 'data', 'summary.json');

if (!fs.existsSync(p)) {
  fails.push('data/summary.json 이 없습니다. node scripts/update_daily.js 를 먼저 돌리세요.');
} else {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fails.push('summary.json 이 올바른 JSON이 아닙니다 — ' + e.message); }

  if (j) {
    if (!j.updated) fails.push('updated 가 없습니다.');
    if (!Array.isArray(j.rows) || !j.rows.length) fails.push('rows 배열이 비었습니다.');

    const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'symbols.json'), 'utf8'));
    for (const s of cfg.symbols) {
      const row = (j.rows || []).find(r => r.code === s.code);
      if (!row) { fails.push(`${s.code}(${s.name}) 가 rows 에 없습니다.`); continue; }
      if (row.name !== s.name) fails.push(`${s.code} 의 이름이 symbols.json 과 다릅니다: "${row.name}" vs "${s.name}"`);
      if (typeof row.c !== 'number' || !(row.c > 0)) fails.push(`${s.code} 의 c(종가) 가 양수가 아닙니다: ${row.c}`);
      if (typeof row.chg !== 'number' || !isFinite(row.chg)) fails.push(`${s.code} 의 chg(등락률) 가 숫자가 아닙니다: ${row.chg}`);
    }
  }
}

if (fails.length) {
  console.error('\n✗ summary.json 검사 실패\n');
  fails.forEach((f, i) => console.error(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log('✅ summary.json 검사 통과');

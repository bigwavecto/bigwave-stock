/** data/flow.json을 최근 250거래일로 한 번 채운다 (이후로는 스크립트가 매일 1페이지씩 누적) */
const fs = require('fs');
const path = require('path');
const CACHE = path.join(__dirname, '..', '.cache');
require('fs').mkdirSync(CACHE, { recursive: true });
const SRC = path.join(CACHE, 'flow.json');                 // 조사 때 받은 2,560일 (필드명 frnHold)
const DST = path.join(__dirname, '..', '..', '..', 'data', '005930', 'flow.json');
const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
let cur = { rows: [] };
try { cur = JSON.parse(fs.readFileSync(DST, 'utf8')); } catch (e) {}

const merged = {};
for (const r of src) {
  if (!r.vol || r.org == null || r.frn == null) continue;
  merged[r.d] = { d: r.d, vol: r.vol, org: r.org, frn: r.frn, hold: r.frnHold };
}
for (const r of cur.rows || []) merged[r.d] = r;      // 스크립트가 방금 받은 최신분 우선

const rows = Object.values(merged).sort((a, b) => a.d.localeCompare(b.d)).slice(-250);
fs.writeFileSync(DST, JSON.stringify({ updated: rows[rows.length - 1].d, rows }, null, 0));
console.log('flow.json 시딩 완료:', rows.length, '일 |', rows[0].d, '~', rows[rows.length - 1].d);
console.log('필드 확인:', JSON.stringify(rows[rows.length - 1]));
const bad = rows.filter(r => r.hold == null).length;
console.log('보유율 결측:', bad, '행');

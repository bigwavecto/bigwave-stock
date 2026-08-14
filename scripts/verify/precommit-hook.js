/**
 * Claude Code PreToolUse 훅 — Bash 호출을 가로채서 `git commit` 일 때만 검사한다.
 *
 * 훅은 모든 Bash 호출마다 실행되므로, 커밋이 아니면 아무것도 하지 않고 즉시 빠져나간다.
 *
 * 종료코드 규약 (Claude Code)
 *   0 = 통과 (그대로 실행)
 *   2 = 차단 (stderr 내용이 Claude에게 전달됨)
 *
 * 검사 내용은 scripts/verify/preflight.js 에 있다.
 * 훅이 방해가 되면 .claude/settings.json 의 hooks 항목을 지우면 된다.
 */
const path = require('path');
const { execFileSync } = require('child_process');

let raw = '';
try { raw = require('fs').readFileSync(0, 'utf8'); } catch (e) { process.exit(0); }

let payload;
try { payload = JSON.parse(raw); } catch (e) { process.exit(0); }

const cmd = (payload && payload.tool_input && payload.tool_input.command) || '';

// `git commit` 이 들어 있지 않으면 관심 없음.
// --amend, -m, 히어독 등 어떤 형태든 "git ... commit" 이면 걸린다.
if (!/\bgit\b[^\n|;&]*\bcommit\b/.test(cmd)) process.exit(0);

// 검사 자체를 건너뛰고 싶을 때를 위한 탈출구 (의도적으로 명시해야만 통과)
if (/SKIP_PREFLIGHT=1/.test(cmd)) {
  console.error('⚠️  SKIP_PREFLIGHT=1 로 커밋 전 검사를 건너뜁니다.');
  process.exit(0);
}

try {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'preflight.js')], { encoding: 'utf8' });
  process.stdout.write(out);
  process.exit(0);
} catch (e) {
  const text = String(e.stdout || '') + String(e.stderr || '');
  console.error(text.trim());
  console.error('\n커밋을 멈췄습니다. 위 문제를 고친 뒤 다시 시도하세요.');
  console.error('정말 이대로 커밋해야 한다면 명령 앞에 SKIP_PREFLIGHT=1 을 붙이세요.');
  process.exit(2);
}

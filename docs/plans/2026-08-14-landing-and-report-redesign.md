# 랜딩 + 리포트 재설계 구현 계획

> **작업자에게:** 이 계획은 한 번에 하나씩, 순서대로 실행한다.
> 각 작업은 **검사 → 실패 확인 → 구현 → 통과 확인 → 커밋** 으로 끝난다.
> 체크박스(`- [ ]`)로 진행을 추적한다.

**목표:** 처음 온 사람은 랜딩에서 서비스를 이해하고 종목을 고르고, 다시 온 사람은 랜딩을 보지 않고 바로 자기 종목 리포트로 가게 한다. 리포트는 첫 화면에서 오늘 필요한 것이 끝나게 재구성한다.

**접근:** 페이지를 둘로 나눈다 — `index.html`(랜딩), `report.html`(리포트). `/`에 들어오면 `<head>` 인라인 스크립트가 화면이 그려지기 전에 판단해 넘긴다. 빌드 단계는 만들지 않는다. 두 파일 모두 사람이 직접 고친다.

**기술:** 빌드 없는 정적 HTML/CSS/JS, Chart.js(vendor 동봉), 서비스 워커(PWA), Node 스크립트(GitHub Actions), Vercel 정적 배포.

**설계서:** `docs/specs/2026-08-14-report-page-redesign.md` — **작업 전 반드시 읽을 것.**

## 전역 제약 (모든 작업에 적용)

- **테스트 프레임워크가 없다.** 이 프로젝트는 의도적으로 두지 않았다(2026-08-14 결정). 검사 수단은 두 가지다.
  - `node scripts/verify/preflight.js` — 모델 이중 구현 일치, `data/**.json` 유효성, 캐시 버전
  - 브라우저 검사 — `node scripts/verify/serve.js`(포트 8731) + 같은 출처 iframe에 넣고 폭을 바꿔가며 측정
- **창 리사이즈(`resize_window`)는 이 환경에서 먹지 않는다.** 반드시 iframe 폭을 바꾸고, **폭마다 `iframe.src`를 다시 지정해 처음부터 로드**한다. 안 그러면 Chart.js 캔버스가 이전 크기로 남아 **없는 넘침이 잡힌다.**
- **가로 넘침은 요소만 훑으면 놓친다.** 텍스트 노드가 넘치는 경우가 있다. `scrollWidth > clientWidth`인 요소를 훑어야 잡힌다.
- **콘솔의 `:0:0 Object` 예외 2건은 무시한다.** 브라우저 확장 프로그램 것이고 앱과 무관하다(확인 완료).
- **모델 이중 구현 일치는 절대 깨지 않는다.** 예측 모델은 `report.html`과 `scripts/update_daily.js` 두 곳에 있다. 한쪽만 고치면 화면과 저장 기록이 달라지는데 **눈으로는 티가 안 난다.**
- **`localStorage` 키를 건드리지 않는다.** 예측 기록 키 `ssn<코드>_predictions_v1`, 마지막 종목 키 `ssn_last_symbol`.
- **`predictions.json`의 과거 기록은 수정·삭제 금지.**
- **화면 문구는 해요체.** 전문용어 금지, 투자 권유로 읽힐 표현 금지. 대응표는 CLAUDE.md 「문체 규칙」.
- **정보량을 줄이지 않는다.** 접기는 허용, 삭제는 불가.
- **랜딩에 종목별 숫자를 쓰지 않는다.** 종목마다 다른 값을 공통 화면에 쓰면 거짓이 된다(ADR 002).
- **`index.html`(또는 `report.html`)을 고치면 `sw.js`의 `CACHE` 버전을 올린다.**
- **`vercel.json`에 주석을 넣지 않는다.** `"//"` 같은 키를 쓰면 배포가 거부된다.
- 커밋 메시지는 한국어. 훅(`preflight.js`)이 자동으로 돈다. 정말 우회해야 하면 `SKIP_PREFLIGHT=1`.

---

## 파일 구조

| 파일 | 책임 | 상태 |
|---|---|---|
| `index.html` | 랜딩 — 라우팅 판단, 서비스 소개, 종목 고르기 | 신설 |
| `report.html` | 리포트 — 데이터·모델·차트·모든 섹션 | `git mv index.html report.html` 후 수정 |
| `sw.js` | 오프라인 캐시. **주소별로** 화면을 저장 | 수정 |
| `manifest.webmanifest` | PWA. `start_url`을 리포트로, 이름은 종목 중립 | 수정 |
| `vercel.json` | 응답 헤더 | 수정 |
| `data/summary.json` | 전 종목 마지막 시세 — 랜딩·종목 시트가 한 번에 읽는다 | 신설(자동 생성) |
| `scripts/update_daily.js` | 매일 데이터 갱신 + `summary.json` 쓰기 | 수정 |
| `scripts/verify/parity.js` | 모델 이중 구현 검사 — 대상 파일명 | 수정 |
| `scripts/verify/preflight.js` | 커밋 전 검사 — 대상 파일명 | 수정 |
| `robots.txt`, `sitemap.xml` | 검색 노출 | 신설 |
| `scripts/tools/make_og.js`, `icons/og.png` | 공유 카드 이미지 | 신설 |
| `docs/adr/008-*.md` | 이번 결정 기록 | 신설 |

---

## Task 1: 리포트를 `report.html`로 분리하고 `/`를 라우터로 만든다

**파일**
- 이동: `index.html` → `report.html` (`git mv` — 기록을 보존한다)
- 생성: `index.html` (라우터. 랜딩 화면은 Task 4에서 채운다)
- 수정: `scripts/verify/parity.js:36`, `scripts/verify/preflight.js:29,74`
- 수정: `vercel.json` (헤더 대상)
- 수정: `manifest.webmanifest`

**인터페이스**
- 이후 작업이 의존하는 것:
  - `report.html` — 리포트 본체. `?code=<종목코드>`, `?h=<5|10|20>`를 받는다
  - `index.html` — 라우터. `?home=1`이면 랜딩을 보여준다
  - `localStorage` 키 `ssn_last_symbol` — 마지막에 본 종목 코드

- [ ] **Step 1: 검사 스크립트를 먼저 만든다**

`scripts/verify/routing.js` 를 새로 만든다. 정적 서버가 떠 있다고 가정하고 4가지를 확인한다.

```js
/**
 * 라우팅 검사 — `/`가 상황에 따라 랜딩/리포트로 제대로 갈리는지 본다.
 * 사람이 눈으로 확인하기 번거롭고, 조건이 3개라 빠뜨리기 쉬워서 자동화한다.
 *
 * 사용: node scripts/verify/serve.js 를 띄운 뒤 node scripts/verify/routing.js
 * 브라우저 없이 HTML 소스만 본다(라우팅 판단은 <head> 인라인 스크립트가 한다).
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
```

- [ ] **Step 2: 검사를 돌려 실패하는지 확인한다**

```bash
node scripts/verify/serve.js &   # 이미 떠 있으면 생략
node scripts/verify/routing.js
```

기대: **실패.** `/report.html` 이 404이고 `/`에 라우팅 스크립트가 없다.

- [ ] **Step 3: 파일을 옮긴다**

```bash
git mv index.html report.html
```

- [ ] **Step 4: `index.html`을 라우터로 새로 만든다**

랜딩 화면 내용은 Task 4에서 채운다. 지금은 **라우팅이 되는 최소 형태**로 만든다.

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<script>
/* 다시 온 사람은 랜딩을 보지 않는다. 화면이 그려지기 전에 넘겨야 깜빡이지 않으므로
   <head> 맨 위에서 판단한다.
   location.replace 를 쓰는 이유: 히스토리에 남지 않아야 리포트에서 뒤로 가기를 눌렀을 때
   랜딩 → 리포트 → 랜딩 … 루프에 빠지지 않는다.
   localStorage 가 막혀 있어도(사생활 보호 모드 등) 랜딩은 떠야 하므로 통째로 try 로 감싼다. */
(function () {
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('home') === '1') return;              // 일부러 랜딩을 보려는 경우
    var code = q.get('code') || localStorage.getItem('ssn_last_symbol');
    if (!code) return;                              // 진짜 첫 방문 → 랜딩
    var h = q.get('h');
    location.replace('./report.html?code=' + encodeURIComponent(code)
      + (h ? '&h=' + encodeURIComponent(h) : ''));
  } catch (e) { /* 랜딩을 보여주면 된다 */ }
})();
</script>
<title>주가 리포트 — 앞으로 얼마나 흔들릴까요</title>
</head>
<body>
  <main>
    <h1>주가 리포트</h1>
    <p>종목을 고르면 리포트로 갑니다.</p>
    <ul id="symList"><li><a href="./report.html?code=005930">삼성전자</a></li></ul>
  </main>
</body>
</html>
```

> 이 화면은 Task 4에서 통째로 바뀐다. 지금 목적은 **`/`가 살아 있고 라우팅이 도는 것**뿐이다.

- [ ] **Step 5: 검사 스크립트들이 새 파일명을 보게 고친다**

`scripts/verify/parity.js` — 3곳:

```js
// 34번째 줄 주석
/* report.html: 모델 구간(3장)만 잘라낸다. SYM/ST는 검사용으로 주입한다. */
function loadHtmlModel() {
  const html = fs.readFileSync(path.join(REPO, 'report.html'), 'utf8');
```

같은 함수 안의 오류 문구 2개도 `index.html` → `report.html` 로 바꾼다(39, 41번째 줄).
107번째 줄 안내 문구도 바꾼다:

```js
    console.error('  report.html의 makeForecast와 scripts/update_daily.js의 makeForecast를 같게 맞추세요.');
```

`scripts/verify/preflight.js` — 2곳:

```js
// 29번째 줄
    errors.push('모델 이중 구현이 어긋났습니다 (report.html ↔ scripts/update_daily.js)\n' + detail);
```

```js
// 74번째 줄 — 화면 파일이 둘로 늘었으므로 둘 다 본다
  const touchedScreen = files.some(f => f === 'index.html' || f === 'report.html');
  if (!touchedScreen) return null;
```

76번째 줄 경고 문구도 함께 고친다:

```js
  warnings.push('화면 파일(index.html / report.html)을 고쳤는데 sw.js 가 그대로입니다.\n'
```

- [ ] **Step 6: `vercel.json`의 헤더 대상을 넓힌다**

`/index.html` 규칙을 **모든 HTML**로 바꾼다. 매일 갱신되는 화면이 1년 캐시에 갇히면 안 된다.

```json
    {
      "source": "/(.*).html",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
    },
```

- [ ] **Step 7: `manifest.webmanifest`를 고친다**

`start_url`을 리포트로 보내고, 이름에서 종목을 뺀다(여러 종목을 지원한다).

```json
  "name": "주가 리포트",
  "short_name": "주가 리포트",
  "description": "주가가 앞으로 어느 범위에서 움직일지, 특정 가격에 닿을 가능성이 얼마인지 매일 알려드립니다. 오를지 내릴지는 예측하지 않습니다.",
  "start_url": "./report.html?src=pwa",
```

> 이미 홈 화면에 추가한 사람의 아이콘이 옛 주소(`./?src=pwa`)로 열려도, Task 1의 라우터가 받아서 리포트로 넘긴다. 깨지지 않는다.

- [ ] **Step 8: `sw.js`의 `CACHE` 버전을 올리고 `report.html`을 목록에 넣는다**

```js
const CACHE = 'ssn-multi-v5';

const SHELL = [
  './',
  './index.html',
  './report.html',
  './manifest.webmanifest',
  './data/symbols.json',
  './vendor/chart.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];
```

- [ ] **Step 9: 검사를 다시 돌려 통과하는지 확인한다**

```bash
node scripts/verify/routing.js
node scripts/verify/preflight.js
```

기대: 둘 다 **통과.** preflight의 파리티 검사가 `report.html`을 읽어 두 종목 모두 일치라고 나와야 한다.

- [ ] **Step 10: 브라우저로 4가지 경로를 확인한다**

브라우저에서 `http://localhost:8731/` 계열을 열고 다음을 실행한다.

```js
// 1) 첫 방문 — 기억을 지우고 / 로 가면 랜딩이 떠야 한다
localStorage.removeItem('ssn_last_symbol');
location.href = '/';
// → 주소가 그대로 '/' 이고 "종목을 고르면" 문구가 보이면 통과

// 2) 기존 공유 링크 — 하이닉스로 넘어가야 한다
location.href = '/?code=000660';
// → 주소가 /report.html?code=000660 이고 제목이 SK하이닉스면 통과

// 3) 재방문 — 기억한 종목으로 넘어가야 한다
location.href = '/';
// → /report.html?code=000660 로 넘어가면 통과 (2번에서 기억이 저장됐다)

// 4) 랜딩 강제 보기
location.href = '/?home=1';
// → 주소가 그대로이고 랜딩이 보이면 통과
```

**확인할 것**: 2·3번에서 랜딩이 **깜빡이지 않아야 한다.** 흰 화면이 스쳐 보이면 라우팅 스크립트가 `<head>` 맨 위에 있는지 다시 본다.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "리포트를 report.html로 분리하고 /를 라우터로 만듦

다시 온 사람은 랜딩을 건너뛰고 바로 자기 종목 리포트로 간다.
판단은 head 인라인 스크립트에서 location.replace로 처리해
깜빡임과 뒤로가기 루프를 막았다.

기존 공유 링크(?code=)와 이미 설치된 홈 화면 아이콘(옛 start_url)도
같은 규칙이 받아서 리포트로 넘긴다.

parity.js·preflight.js가 report.html을 보게 고쳤고,
vercel.json의 캐시 헤더를 모든 HTML로 넓혔다."
```

---

## Task 2: 서비스 워커가 두 페이지를 뒤섞는 문제를 고친다

**파일**
- 수정: `sw.js:70-82` (화면 캐시 전략)

**배경**

지금은 모든 화면 응답을 `./index.html` **키 하나**에 저장하고(75번째 줄), 오프라인일 때도 항상 그것을 돌려준다(78번째 줄). 페이지가 하나일 때는 문제가 없었지만, Task 1에서 둘이 됐으므로 **서로를 덮어쓴다.**

**인터페이스**
- 이후 작업이 의존하는 것: 오프라인에서 `/`는 랜딩, `/report.html`은 리포트가 뜬다

- [ ] **Step 1: 버그를 재현하는 검사를 먼저 만든다**

브라우저에서 실행한다. **서버는 켜 둔 채로** 시작한다.

```js
// 1. 두 페이지를 모두 방문해 캐시에 담는다
await fetch('/');           await new Promise(r=>setTimeout(r,300));
await fetch('/report.html'); await new Promise(r=>setTimeout(r,300));
// 서비스 워커가 실제로 저장하도록 navigate로도 한 번씩 방문해야 한다.
// (아래는 방문 후 다시 이 스크립트를 실행해 확인하는 용도)

// 2. 캐시에 무엇이 들어 있는지 본다
const c = await caches.open((await caches.keys())[0]);
const keys = (await c.keys()).map(r => r.url.replace(location.origin, ''));
const landing = await (await c.match('./index.html'))?.text();
JSON.stringify({
  keys: keys.filter(k => k.endsWith('.html') || k === '/'),
  // 랜딩 자리에 리포트가 들어갔는지 — 리포트에만 있는 문구로 판별한다
  landingSlotHasReport: !!landing && landing.includes('function makeForecast')
}, null, 1);
```

기대(고치기 전): `landingSlotHasReport: true` — **랜딩 자리에 리포트가 들어가 있다.** 이것이 버그다.

- [ ] **Step 2: 실제로 오프라인에서 랜딩이 깨지는지 눈으로 확인한다**

1. 서버를 켠 채 `/` 와 `/report.html` 을 한 번씩 방문한다(서비스 워커가 저장하도록)
2. 서버를 끈다 — `$p = (Get-NetTCPConnection -LocalPort 8731 -State Listen).OwningProcess; Stop-Process -Id $p -Force`
3. `/` 를 새로고침한다

기대(고치기 전): **랜딩 자리에 리포트가 뜬다.**

> 첫 방문에는 데이터가 캐시되지 않는다. 서비스 워커가 아직 제어권을 잡기 전이라서다. **두 번째 방문부터** 오프라인이 완전해진다. 이 순서를 지키지 않으면 "오프라인 실패"로 오판한다.

- [ ] **Step 3: 캐시 키를 주소별로 바꾼다**

`sw.js`의 화면(HTML) 처리 블록을 통째로 아래로 바꾼다.

```js
  // 화면(HTML): 네트워크 우선 — 매일 갱신되므로 최신을 먼저 본다.
  // 캐시 키는 **주소별로** 따로 잡는다. 예전에는 모든 화면을 './index.html' 한 자리에
  // 저장해서, 페이지가 둘 이상이면 서로를 덮어썼다 (오프라인에서 랜딩을 열면 리포트가 떴다).
  // 폴백 순서: 그 주소 → 랜딩 → 루트. 마지막까지 없으면 오류를 돌려준다.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith((async () => {
      const key = stripQuery(req.url);
      try {
        const res = await fetch(req);
        if (res && res.ok) (await caches.open(CACHE)).put(key, res.clone());
        return res;
      } catch (err) {
        return (await caches.match(key))
          || (await caches.match('./index.html'))
          || (await caches.match('./'))
          || Response.error();
      }
    })());
    return;
  }
```

파일 맨 위 주석도 함께 고친다(10번째 줄).

```js
 * 화면 파일(index.html·report.html)을 고치면 CACHE 버전을 반드시 올릴 것.
 * 안 올리면 사용자가 옛 화면을 계속 본다.
```

- [ ] **Step 4: `CACHE` 버전을 올린다**

```js
const CACHE = 'ssn-multi-v6';
```

- [ ] **Step 5: 통과하는지 확인한다**

1. 서버를 다시 켠다
2. `/` 와 `/report.html` 을 각각 **두 번씩** 방문한다
3. Step 1의 검사 스크립트를 실행한다 → `landingSlotHasReport: false` 여야 한다
4. 서버를 끈다
5. `/` 새로고침 → **랜딩**이 뜬다
6. `/report.html?code=005930` 새로고침 → **리포트**가 뜨고 차트·시세·수급·시장 정보가 전부 보인다

여섯 가지가 모두 맞아야 통과다.

- [ ] **Step 6: 커밋**

```bash
git add sw.js
git commit -m "서비스 워커가 두 페이지를 뒤섞던 문제 수정

모든 화면 응답을 './index.html' 키 하나에 저장하고 오프라인에서도
항상 그것을 돌려주고 있었다. 페이지가 하나일 때는 문제가 없었지만
랜딩이 생기면서 서로를 덮어썼다 — 오프라인에서 /를 열면 리포트가 떴다.

캐시 키를 주소별(쿼리 제거)로 바꾸고 폴백을 '그 주소 → 랜딩 → 루트'
순서로 했다. 서버를 끈 상태에서 두 페이지가 각각 제대로 뜨는 것을 확인."
```

---

## Task 3: 전 종목 요약 데이터(`data/summary.json`)를 만든다

**파일**
- 수정: `scripts/update_daily.js:168-226`
- 생성: `data/summary.json` (스크립트가 만든다)

**인터페이스**
- 이후 작업이 의존하는 것:
  ```
  data/summary.json = { updated: "YYYY-MM-DD",
                        rows: [ { code, name, c, chg } ] }
  ```
  `c` = 마지막 종가(원), `chg` = 전일 대비 변화율(%, 소수 둘째 자리)

- [ ] **Step 1: 검사를 먼저 만든다**

`scripts/verify/summary.js`:

```js
/**
 * data/summary.json 검사 — 랜딩과 종목 시트가 이 파일 하나로 전 종목 시세를 읽는다.
 * 형식이 어긋나면 랜딩에서 시세가 통째로 사라지므로 자동으로 본다.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');

const fails = [];
const p = path.join(REPO, 'data', 'summary.json');
if (!fs.existsSync(p)) {
  fails.push('data/summary.json 이 없습니다. node scripts/update_daily.js 를 먼저 돌리세요.');
} else {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!j.updated) fails.push('updated 가 없습니다.');
  if (!Array.isArray(j.rows) || !j.rows.length) fails.push('rows 배열이 비었습니다.');
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'symbols.json'), 'utf8'));
  for (const s of cfg.symbols) {
    const row = (j.rows || []).find(r => r.code === s.code);
    if (!row) { fails.push(`${s.code} 가 rows 에 없습니다.`); continue; }
    if (row.name !== s.name) fails.push(`${s.code} 의 이름이 다릅니다: ${row.name} vs ${s.name}`);
    if (typeof row.c !== 'number' || !(row.c > 0)) fails.push(`${s.code} 의 c 가 숫자가 아닙니다.`);
    if (typeof row.chg !== 'number') fails.push(`${s.code} 의 chg 가 숫자가 아닙니다.`);
  }
}

if (fails.length) {
  console.error('\n✗ summary.json 검사 실패\n');
  fails.forEach((f, i) => console.error(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log('✅ summary.json 검사 통과');
```

- [ ] **Step 2: 검사를 돌려 실패를 확인한다**

```bash
node scripts/verify/summary.js
```

기대: **실패** — `data/summary.json 이 없습니다.`

- [ ] **Step 3: `updateSymbol`이 요약값을 돌려주게 고친다**

`scripts/update_daily.js`의 `updateSymbol` 함수 끝(213번째 줄 `}catch(e){ console.log('  시장 동조 실패(무시):', e.message); }` 다음)에 반환을 더한다.

```js
  // 랜딩·종목 시트가 전 종목 시세를 한 번에 읽도록 요약값을 돌려준다
  const prev = rows.length > 1 ? rows[rows.length-2].c : rows[rows.length-1].c;
  const last = rows[rows.length-1].c;
  return { code: sym.code, name: sym.name, c: last, chg: +((last/prev - 1) * 100).toFixed(2) };
}
```

- [ ] **Step 4: 실행부가 모아서 파일로 쓰게 고친다**

`(async ()=>{` 블록(216~226번째 줄)을 아래로 바꾼다.

```js
(async ()=>{
  const cfg = JSON.parse(fs.readFileSync(path.join(DATA_DIR,'symbols.json'),'utf8'));
  let ok = 0;
  const summary = [];
  let lastUpdated = null;
  for(const sym of cfg.symbols){
    console.log('\n▶', sym.name, '(' + sym.code + ')');
    try{
      const s = await updateSymbol(sym);
      ok++;
      if(s){ summary.push(s); }
    }
    catch(e){ console.error('  ✗ 실패:', e.message); }
  }
  console.log('\n완료:', ok, '/', cfg.symbols.length, '종목');
  if(ok === 0) throw new Error('모든 종목 갱신 실패');

  // 요약 파일 — 실패해도 전체를 중단시키지 않는다 (수급·시장지표와 같은 원칙).
  // 이 파일이 없으면 랜딩은 종목 이름만 보여주고 계속 동작한다.
  try{
    const anyPrices = JSON.parse(fs.readFileSync(path.join(DATA_DIR, summary[0].code, 'prices.json'),'utf8'));
    lastUpdated = anyPrices.updated;
    fs.writeFileSync(path.join(DATA_DIR,'summary.json'),
      JSON.stringify({ updated: lastUpdated, rows: summary }, null, 0));
    console.log('요약 저장:', summary.length, '종목');
  }catch(e){ console.log('요약 저장 실패(무시):', e.message); }
})().catch(e=>{ console.error('실패:', e.message); process.exit(1); });
```

- [ ] **Step 5: 실제로 돌려서 파일을 만든다**

```bash
node scripts/update_daily.js
node scripts/verify/summary.js
node scripts/verify/preflight.js
```

기대: 셋 다 **통과.** `data/summary.json`이 생기고 두 종목이 들어 있다.

> `update_daily.js`는 야후·네이버에서 실제로 데이터를 받는다. 네트워크가 막혀 있으면 실패한다. 그때는 `data/<코드>/prices.json`의 마지막 두 값으로 `summary.json`을 손으로 만들어 형식만 맞춰 두고, 다음 자동 실행에서 채워지게 한다.

- [ ] **Step 6: 커밋**

```bash
git add scripts/update_daily.js scripts/verify/summary.js data/
git commit -m "전 종목 요약 데이터(data/summary.json) 생성

랜딩과 종목 시트가 시세를 보여주려면 전 종목 마지막 값이 필요한데,
종목별 prices.json을 다 받으면 종목이 늘어날수록 느려진다.
매일 갱신하면서 요약 하나를 같이 쓴다. 30종목이어도 몇 KB다.

수급·시장지표와 같은 원칙으로, 요약 저장이 실패해도 전체를
중단시키지 않는다. 랜딩은 이 파일이 없으면 이름만 보여준다."
```

---

## Task 4: 랜딩 화면을 만든다

**파일**
- 수정: `index.html` (Task 1의 임시 화면을 진짜 랜딩으로 교체)

**인터페이스**
- 소비: `data/symbols.json`(종목 목록), `data/summary.json`(시세)
- 산출: 종목 버튼 → `./report.html?code=<코드>`

- [ ] **Step 1: 검사를 먼저 확장한다**

`scripts/verify/routing.js`의 `(async () => {` 블록 안, `const rep = await get('/report.html');` **앞**에 넣는다.

```js
  check('랜딩에 서비스 이름이 있어야 한다', root.body.includes('주가 리포트'));
  check('랜딩이 종목 목록을 자동으로 그려야 한다', root.body.includes('symbols.json'));
  check('랜딩이 요약 시세를 읽어야 한다', root.body.includes('summary.json'));
  check('랜딩에 면책 문구가 있어야 한다', root.body.includes('투자 권유가 아니'));
  check('랜딩이 Chart.js를 부르지 않아야 한다', !root.body.includes('chart.umd.min.js'));
```

- [ ] **Step 2: 검사를 돌려 실패를 확인한다**

```bash
node scripts/verify/routing.js
```

기대: **실패** — 랜딩 관련 5개가 걸린다.

- [ ] **Step 3: 랜딩을 만든다**

`index.html`의 `<head>` 라우팅 스크립트는 **그대로 두고**, 그 아래부터 교체한다.
스타일은 리포트와 공유하지 않고 랜딩용 최소 CSS만 인라인으로 쓴다(1~2KB).

담을 것과 문구:

| 자리 | 문구 |
|---|---|
| 제목 | `주가 리포트` |
| 한 줄 소개 | `앞으로 얼마나 흔들릴지 알려드려요` |
| 주장 1 (✕) | `오를지 내릴지는 맞히지 않아요` / `10년치로 해봤는데 안 맞았거든요` |
| 주장 2 (✓) | `대신 "이 범위 안에 있을 거예요"를 알려드려요` / `10번 중 8번은 그 안에 들어와요` |
| 주장 3 (✓) | `진짜 맞는지 매일 채점해서 성적표로 보여드려요` |
| 목록 제목 | `어떤 종목을 보시겠어요?` |
| 면책 | `참고용이에요. 투자 권유가 아니에요.` |
| 갱신 안내 | `평일 오후 4시 40분에 자동으로 갱신돼요.` |

종목 목록을 그리는 스크립트:

```html
<script>
/* 종목 목록은 symbols.json에서 자동으로 그린다.
   종목이 30개가 돼도 이 파일을 고칠 필요가 없다.
   시세는 summary.json 하나로 읽는다 — 종목별 prices.json을 다 받으면 느려진다.
   summary.json을 못 받아도 이름과 코드만으로 목록은 나온다. */
(async function () {
  const box = document.getElementById('symList');
  let syms = [], px = {};
  try {
    const r = await fetch('./data/symbols.json?t=' + Date.now());
    if (r.ok) syms = (await r.json()).symbols || [];
  } catch (e) { }
  if (!syms.length) { box.innerHTML = '<p class="muted">종목 목록을 불러오지 못했어요. 잠시 뒤 다시 열어보세요.</p>'; return; }
  try {
    const r = await fetch('./data/summary.json?t=' + Date.now());
    if (r.ok) (await r.json()).rows.forEach(x => { px[x.code] = x; });
  } catch (e) { }

  const won = n => n.toLocaleString('ko-KR') + '원';
  box.innerHTML = syms.map(s => {
    const p = px[s.code];
    const right = p
      ? '<span class="px">' + won(p.c) + '</span><span class="chg ' + (p.chg >= 0 ? 'up' : 'down') + '">'
        + (p.chg >= 0 ? '▲' : '▼') + ' ' + (p.chg >= 0 ? '+' : '') + p.chg.toFixed(1) + '%</span>'
      : '';
    return '<a class="sym" href="./report.html?code=' + s.code + '">'
      + '<span class="nm">' + s.name + '<span class="cd">' + s.code + '</span></span>'
      + '<span class="val">' + right + '</span></a>';
  }).join('');
})();
</script>
```

**지켜야 할 것**

- 종목 버튼은 `<a href>`로 만든다. 키보드·새 탭 열기가 공짜로 따라온다
- 터치 높이 최소 44px, 넉넉하게는 64px
- **종목별 숫자(변동성·신고가 효과 등)를 쓰지 않는다.** "10번 중 8번"만 쓴다 — 두 종목 모두에서 성립하는 공통 사실이다
- `<main>`, `<h1>`, `<footer>` 를 쓴다
- Chart.js를 부르지 않는다

- [ ] **Step 4: 검사를 다시 돌린다**

```bash
node scripts/verify/routing.js
```

기대: **통과.**

- [ ] **Step 5: 브라우저로 확인한다**

```js
localStorage.removeItem('ssn_last_symbol');
location.href = '/?home=1';
```

확인할 것:
- 종목 버튼 2개가 이름·코드·시세와 함께 보인다
- 버튼을 누르면 그 종목 리포트로 간다
- Tab 키만으로 두 버튼을 오갈 수 있고 Enter로 들어간다
- 콘솔 에러 0

폭별 넘침도 잰다. **폭마다 `iframe.src`를 다시 지정해 처음부터 로드할 것.**

```js
window.check = async function (w, p) {
  document.querySelectorAll('iframe.qa').forEach(e => e.remove());
  const f = document.createElement('iframe');
  f.className = 'qa';
  f.style.cssText = 'width:' + w + 'px;height:900px;border:0;position:fixed;top:0;left:0;z-index:99999;background:#fff';
  document.body.appendChild(f);
  f.src = p;
  await new Promise(r => { f.onload = r; setTimeout(r, 9000); });
  await new Promise(r => setTimeout(r, 2500));
  const d = f.contentDocument;
  const bad = [...d.querySelectorAll('body *')].filter(e =>
    getComputedStyle(e).overflowX === 'visible' && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0)
    .map(e => e.tagName + '#' + e.id + ' ' + e.scrollWidth + '/' + e.clientWidth);
  return { w, p, overflow: d.documentElement.scrollWidth - d.documentElement.clientWidth, bad };
};
const rs = [];
for (const w of [320, 360, 390, 414, 768, 1200]) rs.push(await window.check(w, '/?home=1'));
document.querySelectorAll('iframe.qa').forEach(e => e.remove());
JSON.stringify(rs, null, 1);
```

기대: 모든 폭에서 `overflow: 0`, `bad: []`.

- [ ] **Step 6: `sw.js` 캐시 버전을 올리고 커밋**

```js
const CACHE = 'ssn-multi-v7';
```

```bash
git add index.html sw.js scripts/verify/routing.js
git commit -m "랜딩 화면 신설

처음 온 사람에게 이 앱이 무엇인지 먼저 답한다 — 오를지 내릴지는
맞히지 않고, 대신 범위를 알려주며, 진짜 맞는지 매일 채점한다는 것.

종목 목록은 symbols.json에서 자동으로 그린다. 종목이 30개가 돼도
이 파일을 고칠 필요가 없다. 시세는 summary.json 하나로 읽는다.

랜딩에는 종목별 숫자를 쓰지 않는다(ADR 002). '10번 중 8번'은
두 종목 모두에서 성립하는 공통 사실이라 안전하다.
Chart.js는 부르지 않아 랜딩이 가볍다."
```

---

## Task 5: 리포트 첫 화면(요약 블록)을 재구성한다

**파일**
- 수정: `report.html` — `.price-row`·`.summary-banner` 영역과 `renderStats`·`renderSummary`

**인터페이스**
- 소비: `FC`(예측), `DATA`(시세), `volNowPct(data)`, `ST().vol10y`
- 산출: 첫 화면 요소 id — `curPrice`, `chg`, `volN`, `summaryTxt`, 그리고 새로 만드는 `bandBar`, `whyLink`, `scoreLink`

- [ ] **Step 1: 목표를 검사로 적는다**

브라우저 검사 스크립트. 첫 화면이 390px에서 스크롤 없이 들어오는지 잰다.

```js
window.firstScreen = async function () {
  document.querySelectorAll('iframe.qa').forEach(e => e.remove());
  const f = document.createElement('iframe');
  f.className = 'qa';
  f.style.cssText = 'width:390px;height:700px;border:0;position:fixed;top:0;left:0;z-index:99999;background:#fff';
  document.body.appendChild(f);
  f.src = '/report.html?code=005930';
  await new Promise(r => { f.onload = r; setTimeout(r, 9000); });
  await new Promise(r => setTimeout(r, 3000));
  const d = f.contentDocument;
  const bottom = e => e ? e.getBoundingClientRect().bottom : null;
  return {
    // 요약 블록 아래끝이 700px(첫 화면) 안에 들어와야 한다
    summaryBottom: bottom(d.querySelector('.summary-banner')),
    hasBar: !!d.getElementById('bandBar'),
    hasWhy: !!d.getElementById('whyLink'),
    hasScore: !!d.getElementById('scoreLink'),
    priceCells: d.querySelectorAll('.price-row .stat').length,
    overflow: d.documentElement.scrollWidth - d.documentElement.clientWidth
  };
};
JSON.stringify(await window.firstScreen(), null, 1);
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

기대: `hasBar/hasWhy/hasScore` 가 `false`, `priceCells` 가 5, `summaryBottom` 이 700을 넘는다.

- [ ] **Step 3: 시세 칸을 2개로 줄이고 나머지를 "지금 상황"으로 옮긴다**

`report.html`의 `.price-row`에서 `hi52`·`lo52`·`yret` 칸을 뺀다.

```html
  <div class="price-row">
    <div class="stat"><div class="k">지금 가격</div><div class="v" id="curPrice">-</div></div>
    <div class="stat"><div class="k">어제보다</div><div class="v" id="chg">-</div></div>
  </div>
```

뺀 세 값은 "지금 상황" 카드의 `1년 최고가와 비교하면` 묶음 위에 넣는다.

```html
    <div class="sub-h" style="margin-top:20px">1년 동안 어디까지 갔었나요</div>
    <div id="yearBox" class="muted">-</div>
```

`renderStats`에서 `hi52`·`lo52`·`yret`에 쓰던 값을 `yearBox`에 `.kv` 세 줄로 옮긴다. **값을 지우지 않는다** — 자리만 옮기는 것이다.

- [ ] **Step 4: 요약 블록에 범위 막대와 두 링크를 넣는다**

```html
  <div class="summary-banner">
    <div class="vol-circle" id="volCircle"><span class="n" id="volN">-</span><span class="t">지금 흔들림</span></div>
    <div class="summary-txt" id="summaryTxt">데이터를 보는 중이에요…</div>
    <div class="band" id="bandBar" aria-hidden="true"></div>
    <p class="trust">
      <a href="#methodCard" id="whyLink">오를지 내릴지는 맞히지 않아요. 왜요? ›</a>
      <a href="#scoreCard" id="scoreLink">지금까지 성적 ›</a>
    </p>
    <p class="mini-disc">참고용이에요. 투자 권유가 아니에요.</p>
  </div>
```

`renderSummary` 안에서 막대와 링크 문구를 채운다.

```js
  // 예상 범위를 막대로 — 숫자만으로는 폭이 얼마나 넓은지 감이 안 온다
  const bb = document.getElementById('bandBar');
  if (bb) bb.innerHTML =
    '<span class="lo">' + fmt(pt.lo) + '</span>'
    + '<span class="track"><span class="fill"></span><span class="now" style="left:'
    + (Math.log(fc.base / pt.lo) / Math.log(pt.hi / pt.lo) * 100).toFixed(1) + '%"></span></span>'
    + '<span class="hi">' + fmt(pt.hi) + '</span>';

성적 링크 문구는 **`renderScoreCard`가 채운다.** `renderSummary`보다 나중에 돌기 때문이다
(`renderAll` 순서: `renderSummary` → `renderProb` → `renderHistory` → `renderScoreCard`).

`renderScoreCard` 함수 끝(성적표 한 줄 요약을 만든 뒤)에 붙인다.

```js
  /* 첫 화면의 성적 링크 문구.
     주의: 화면에 "지금까지 성적 80%"라고 쓰려면 그게 **실제 채점 결과**여야 한다.
     10년 백테스트 값(symbols.json의 stats.cov)을 "지금까지 성적"이라고 쓰면 거짓말이 된다.
     실제 v2 기록은 2026-08-14부터 쌓이기 시작해 아직 적다.
     그래서 20건 미만이면 숫자를 쓰지 않고 문구만 바꾼다 —
     표본이 적을 때 숫자를 보여주는 것은 운을 성적으로 파는 셈이다.
     (20이라는 기준은 성적표 색칠 기준과 같다) */
  const sl = document.getElementById('scoreLink');
  if (sl) {
    const n2 = a2.length;
    sl.textContent = n2 >= 20
      ? '지금까지 성적: 범위 적중 ' + (a2.filter(x => x.hit).length / n2 * 100).toFixed(0) + '% ›'
      : '10년치로 시험한 성적 보기 ›';
  }
```

> 두 문구 모두 사실이다. 앞은 실제 채점 결과, 뒤는 성적표 안에 10년 검증 내용이 있다는 안내다.
> **설계서 그림의 "범위 적중 80.5%"는 기록이 충분히 쌓인 뒤의 모습이다.**

링크가 가리킬 id를 지금 붙여 둔다 — 기존 성적표 카드에 `id="scoreCard"`, 방법론 카드에 `id="methodCard"`.
Task 6에서 방법론 카드가 `<details>`로 바뀌어도 id는 그대로다.
접힌 섹션을 **자동으로 펼치는 처리**는 Task 6에서 붙인다.

- [ ] **Step 5: `summaryTxt` 문구를 4줄로 줄인다**

지금 세 문단인 것을 아래로 줄인다. 방법론 설명은 `왜요? ›` 링크가 대신한다.

```js
  document.getElementById('summaryTxt').innerHTML =
    '<b>' + nm + ' 뒤 가격은 ' + fmt(pt.lo) + '~' + fmt(pt.hi) + '원</b> 사이일 가능성이 높아요. '
    + '지금 ' + fmt(fc.base) + '원에서 위아래로 ±' + w.toFixed(0) + '% 정도예요.<br>'
    + (ratio != null
      ? '요즘 ' + SYM.name + '는 <b>' + word + '</b>. 1년 기준 ' + volA.toFixed(0) + '%인데 '
        + '지난 10년 평균은 ' + base10 + '%였어요.'
      : '');
```

- [ ] **Step 6: 검사를 다시 돌린다**

기대: `hasBar/hasWhy/hasScore` 가 모두 `true`, `priceCells` 가 2, **`summaryBottom` 이 700 이하**, `overflow` 가 0.

700을 넘으면 `mini-disc` 한 줄을 요약 블록 밖(첫 화면 아래)으로 내린다.

- [ ] **Step 7: 폭별 넘침을 잰다**

Task 4 Step 5의 `window.check`를 그대로 쓰되 경로를 바꾼다.

```js
const rs = [];
for (const [w, c] of [[320,'005930'],[360,'000660'],[390,'005930'],[414,'000660'],[768,'005930'],[1200,'000660']])
  rs.push(await window.check(w, '/report.html?code=' + c));
document.querySelectorAll('iframe.qa').forEach(e => e.remove());
JSON.stringify(rs.map(x => ({ w: x.w, p: x.p, overflow: x.overflow, bad: x.bad })), null, 1);
```

기대: 전부 `overflow: 0`, `bad: []`.

- [ ] **Step 8: `sw.js` 버전을 올리고 커밋**

```bash
git add report.html sw.js
git commit -m "리포트 첫 화면 재구성

스크롤 없이 오늘 필요한 것이 끝나게 했다 — 가격·어제 대비·예상 범위
막대·지금 흔들림. 1년 최고/최저/수익률은 '지금 상황' 카드로 옮겼다
(정보를 뺀 것이 아니라 자리를 옮긴 것이다).

'오를지 내릴지는 맞히지 않아요 왜요?'와 '지금까지 성적'을 나란히 뒀다.
선언만 있으면 이상해 보이고, 근거가 붙어야 설득이 된다. 랜딩을
건너뛰고 들어온 재방문자에게도 이 맥락이 남아야 한다."
```

---

## Task 6: 접기(`<details>`)를 적용한다

**파일**
- 수정: `report.html` — 방법론 카드, 성적표 카드 안의 예측 기록 표

**인터페이스**
- 산출: `#methodCard`, `#scoreCard`, `#histDetails` — 첫 화면 링크가 가리키는 id

- [ ] **Step 1: 검사를 먼저 만든다**

```js
window.foldCheck = async function () {
  document.querySelectorAll('iframe.qa').forEach(e => e.remove());
  const f = document.createElement('iframe');
  f.className = 'qa';
  f.style.cssText = 'width:390px;height:900px;border:0;position:fixed;top:0;left:0;z-index:99999;background:#fff';
  document.body.appendChild(f);
  f.src = '/report.html?code=005930';
  await new Promise(r => { f.onload = r; setTimeout(r, 9000); });
  await new Promise(r => setTimeout(r, 3000));
  const d = f.contentDocument;
  const method = d.getElementById('methodCard');
  const hist = d.getElementById('histDetails');
  const before = { methodOpen: method && method.open, histOpen: hist && hist.open };
  // 첫 화면의 '왜요?' 링크를 누르면 접힌 방법론이 펼쳐져야 한다
  d.getElementById('whyLink').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    isDetails: { method: method && method.tagName === 'DETAILS', hist: hist && hist.tagName === 'DETAILS' },
    before,
    afterClickMethodOpen: method && method.open,
    scoreCardVisible: !!d.getElementById('scoreCard') && d.getElementById('scoreCard').tagName !== 'DETAILS'
  };
};
JSON.stringify(await window.foldCheck(), null, 1);
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

기대: `isDetails` 가 모두 `false`(아직 `<div>`다).

- [ ] **Step 3: 방법론 카드를 `<details>`로 바꾼다**

```html
  <details class="card" id="methodCard">
    <summary><h2>왜 “얼마가 된다”고 말하지 않나요?</h2></summary>
    <p class="lead">맞히려고 해봤는데 <span class="hl">안 맞았거든요.</span> 10년치로 2,385번 시험해 본 이야기예요.</p>
    …기존 내용 그대로…
  </details>
```

- [ ] **Step 4: 성적표 안의 예측 기록 표만 `<details>`로 감싼다**

성적표 카드 자체는 `<div class="card" id="scoreCard">`로 **펼쳐 둔다.**
그 안의 `#histTable` 묶음만 감싼다.

```html
    <details id="histDetails">
      <summary>예상 하나하나를 날짜별로 보기</summary>
      <p class="scroll-hint no-hint-mobile">표를 옆으로 밀면 결과와 오차가 보여요 →</p>
      <div class="tscroll">
        <table id="histTable" class="vtable">…기존 그대로…</table>
      </div>
    </details>
```

- [ ] **Step 5: 링크가 접힌 섹션을 펼치게 한다**

`report.html`의 초기화 블록에 넣는다.

```js
  /* 첫 화면 링크로 접힌 섹션에 들어가면 자동으로 펼친다.
     펼치지 않으면 "눌렀는데 아무것도 안 보인다"가 된다.
     주소창에 #methodCard 를 직접 넣고 들어오는 경우도 같이 처리한다. */
  function openTarget(hash){
    const el = hash && document.querySelector(hash);
    if(!el) return;
    if(el.tagName === 'DETAILS') el.open = true;
    const d = el.closest('details');
    if(d) d.open = true;
    el.scrollIntoView({ behavior:'smooth', block:'start' });
  }
  document.querySelectorAll('.trust a[href^="#"]').forEach(a=>{
    a.addEventListener('click', e=>{ e.preventDefault(); openTarget(a.getAttribute('href')); history.replaceState(null,'',a.getAttribute('href')); });
  });
  if(location.hash) setTimeout(()=>openTarget(location.hash), 300);
```

- [ ] **Step 6: `<summary>` 모양을 다듬는다**

기본 삼각형이 카드 제목과 어울리지 않는다. CSS를 더한다.

```css
  details.card > summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px}
  details.card > summary::-webkit-details-marker{display:none}
  details.card > summary::after{content:'펼치기 ▾';margin-left:auto;font-size:.78rem;font-weight:700;color:var(--sub)}
  details.card[open] > summary::after{content:'접기 ▴'}
  details.card > summary h2{margin-bottom:0}
  #histDetails > summary{cursor:pointer;font-size:.85rem;font-weight:700;color:var(--sub);padding:10px 0;min-height:44px;display:flex;align-items:center}
```

- [ ] **Step 7: 검사를 다시 돌린다**

기대: `isDetails` 둘 다 `true`, `before.methodOpen` 이 `false`, **`afterClickMethodOpen` 이 `true`**, `scoreCardVisible` 이 `true`.

- [ ] **Step 8: 키보드로 확인한다**

Tab으로 `펼치기 ▾`에 초점이 가고 Enter/Space로 펼쳐지는지 본다. `<details>`를 쓰면 자동으로 되지만 CSS로 가려지지 않았는지 눈으로 확인한다.

- [ ] **Step 9: 폭별 넘침을 잰다** (Task 5 Step 7과 같은 방법, 펼친 상태·접은 상태 둘 다)

- [ ] **Step 10: `sw.js` 버전을 올리고 커밋**

```bash
git add report.html sw.js
git commit -m "방법론과 예측 기록 표를 접는다

긴 페이지에서 매번 지나쳐야 하는 두 곳만 접었다. details 표준 요소를
써서 스크린리더·키보드·인쇄가 공짜로 따라온다.

성적표는 펼쳐 둔다. 처음 온 사람이 이 앱을 믿을 유일한 근거라
접으면 아무도 안 본다. 그 안의 날짜별 기록 표만 접었다.

첫 화면 링크로 들어가면 접힌 섹션이 자동으로 펼쳐진다.
안 그러면 '눌렀는데 아무것도 안 보인다'가 된다."
```

---

## Task 7: 종목 시트를 만든다

**파일**
- 수정: `report.html` — `.symbar`를 종목 이름 탭 + 시트로 교체, `renderSymBar` 재작성

**인터페이스**
- 소비: `SYMBOLS`(전역), `data/summary.json`, `showSymbol(code)`
- 산출: `#symTab`(여는 버튼), `#symSheet`(시트)

- [ ] **Step 1: 검사를 먼저 만든다**

```js
window.sheetCheck = async function () {
  document.querySelectorAll('iframe.qa').forEach(e => e.remove());
  const f = document.createElement('iframe');
  f.className = 'qa';
  f.style.cssText = 'width:390px;height:900px;border:0;position:fixed;top:0;left:0;z-index:99999;background:#fff';
  document.body.appendChild(f);
  f.src = '/report.html?code=005930';
  await new Promise(r => { f.onload = r; setTimeout(r, 9000); });
  await new Promise(r => setTimeout(r, 3000));
  const d = f.contentDocument, w = f.contentWindow;
  const tab = d.getElementById('symTab'), sheet = d.getElementById('symSheet');
  if (!tab || !sheet) return { tab: !!tab, sheet: !!sheet };
  tab.click(); await new Promise(r => setTimeout(r, 400));
  const openState = {
    visible: w.getComputedStyle(sheet).display !== 'none',
    role: sheet.getAttribute('role'),
    focusInside: sheet.contains(d.activeElement),
    items: sheet.querySelectorAll('[data-code]').length
  };
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  return {
    tab: true, sheet: true, openState,
    closedAfterEsc: w.getComputedStyle(sheet).display === 'none',
    focusReturned: d.activeElement === tab
  };
};
JSON.stringify(await window.sheetCheck(), null, 1);
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

기대: `{ tab: false, sheet: false }`.

- [ ] **Step 3: 상단을 이름 탭으로 바꾼다**

기존 `<div class="symbar" id="symBar"></div>` 를 교체한다.

```html
  <div class="symbar">
    <button class="sym-tab" id="symTab" aria-haspopup="dialog" aria-expanded="false">
      <span id="symTabName">-</span><span class="code" id="symTabCode"></span><span class="caret">▾</span>
    </button>
  </div>

  <div class="sheet-back" id="symSheetBack" hidden></div>
  <div class="sheet" id="symSheet" role="dialog" aria-modal="true" aria-label="종목 고르기" hidden>
    <div class="sheet-head">
      <strong>종목 고르기</strong>
      <button class="sheet-close" id="symSheetClose" aria-label="닫기">✕</button>
    </div>
    <input type="search" id="symSearch" placeholder="종목 이름이나 코드로 찾기" aria-label="종목 검색">
    <div id="symSheetList"></div>
  </div>
```

- [ ] **Step 4: 시트 로직을 쓴다**

`renderSymBar`를 아래로 갈아끼운다.

```js
/* 종목 시트. 종목이 늘어나도 첫 화면이 그대로이도록 목록을 시트 안에 둔다.
   차트 확대 모달과 같은 규칙을 쓴다 — ESC·배경 클릭·닫기 버튼으로 닫히고,
   닫으면 초점이 원래 버튼으로 돌아온다. */
let SUMMARY = null;
let sheetPrevFocus = null;

async function loadSummary(){
  if(SUMMARY) return SUMMARY;
  try{
    const r = await fetchWithTimeout('./data/summary.json?t='+Date.now(), 6000);
    if(r.ok){ const j = await r.json(); SUMMARY = {}; (j.rows||[]).forEach(x=>{ SUMMARY[x.code]=x; }); }
  }catch(e){ SUMMARY = {}; }
  return SUMMARY || {};
}

function renderSymBar(){
  document.getElementById('symTabName').textContent = SYM.name;
  document.getElementById('symTabCode').textContent = SYM.code;
}

async function renderSheetList(q){
  const px = await loadSummary();
  const box = document.getElementById('symSheetList');
  const kw = (q||'').trim().toLowerCase();
  const hit = SYMBOLS.filter(s => !kw || s.name.toLowerCase().includes(kw) || s.code.includes(kw));
  if(!hit.length){ box.innerHTML = '<p class="muted" style="padding:14px">찾는 종목이 없어요.</p>'; return; }
  // 카테고리가 없으면 한 묶음으로 나온다 (종목이 늘어나면 symbols.json에 category를 넣는다)
  const groups = {};
  hit.forEach(s => { (groups[s.category || '전체'] = groups[s.category || '전체'] || []).push(s); });
  box.innerHTML = Object.entries(groups).map(([g, list]) =>
    '<div class="sheet-group">' + (Object.keys(groups).length > 1 ? '<div class="sheet-gh">'+g+'</div>' : '')
    + list.map(s => {
        const p = px[s.code];
        const right = p ? '<span class="px">'+p.c.toLocaleString('ko-KR')+'원</span>'
          + '<span class="'+(p.chg>=0?'up':'down')+'">'+(p.chg>=0?UPI:DNI)+' '+(p.chg>=0?'+':'')+p.chg.toFixed(1)+'%</span>' : '';
        return '<button class="sheet-item'+(s.code===SYM.code?' on':'')+'" data-code="'+s.code+'">'
          + '<span class="nm">'+s.name+'<span class="cd">'+s.code+'</span></span>'
          + '<span class="val">'+right+'</span></button>';
      }).join('')
    + '</div>').join('');
  box.querySelectorAll('.sheet-item').forEach(b => b.addEventListener('click', ()=>{
    const c = b.dataset.code;
    closeSheet();
    if(c !== SYM.code) showSymbol(c);
  }));
}

function openSheet(){
  sheetPrevFocus = document.activeElement;
  document.getElementById('symSheet').hidden = false;
  document.getElementById('symSheetBack').hidden = false;
  document.getElementById('symTab').setAttribute('aria-expanded','true');
  const s = document.getElementById('symSearch');
  // 종목이 적으면 검색창이 오히려 방해가 된다
  s.style.display = SYMBOLS.length > 5 ? '' : 'none';
  renderSheetList('');
  if(SYMBOLS.length > 5) s.focus(); else document.getElementById('symSheetClose').focus();
}

function closeSheet(){
  document.getElementById('symSheet').hidden = true;
  document.getElementById('symSheetBack').hidden = true;
  document.getElementById('symTab').setAttribute('aria-expanded','false');
  if(sheetPrevFocus) sheetPrevFocus.focus();
}
```

초기화 블록에 연결한다.

```js
  document.getElementById('symTab').addEventListener('click', openSheet);
  document.getElementById('symSheetClose').addEventListener('click', closeSheet);
  document.getElementById('symSheetBack').addEventListener('click', closeSheet);
  document.getElementById('symSearch').addEventListener('input', e=>renderSheetList(e.target.value));
  addEventListener('keydown', e=>{ if(e.key==='Escape' && !document.getElementById('symSheet').hidden) closeSheet(); });
```

> 기존 ESC 처리(`closeChartModal`)와 겹치지 않게, 차트 모달이 열려 있을 때는 그쪽이 먼저 닫히도록 순서를 확인한다.

- [ ] **Step 5: 시트 CSS를 더한다**

아래에서 올라오는 형태. 터치 목표 44px 이상.

```css
  .sym-tab{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);
    border-radius:999px;padding:9px 16px;min-height:44px;font-size:.95rem;font-weight:800;cursor:pointer;color:var(--txt)}
  .sym-tab .code{font-size:.72rem;font-weight:600;color:var(--sub);font-variant-numeric:tabular-nums}
  .sym-tab .caret{color:var(--sub)}
  .sheet-back{position:fixed;inset:0;background:rgba(28,35,51,.4);z-index:60}
  .sheet{position:fixed;left:0;right:0;bottom:0;z-index:61;background:var(--card);border-radius:18px 18px 0 0;
    padding:16px;max-height:80vh;overflow-y:auto;box-shadow:0 -6px 24px rgba(28,35,51,.18)}
  .sheet-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
  .sheet-close{background:none;border:0;font-size:1rem;cursor:pointer;color:var(--sub);min-width:44px;min-height:44px}
  #symSearch{width:100%;padding:11px 14px;border:1px solid var(--line);border-radius:10px;font-size:.95rem;margin-bottom:12px}
  .sheet-gh{font-size:.78rem;font-weight:800;color:var(--sub);margin:10px 2px 6px}
  .sheet-item{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;
    background:none;border:0;border-bottom:1px solid var(--line);padding:14px 4px;min-height:56px;cursor:pointer;
    font-size:.95rem;color:var(--txt);text-align:left}
  .sheet-item.on{font-weight:800}
  .sheet-item .cd{font-size:.72rem;color:var(--sub);margin-left:7px;font-variant-numeric:tabular-nums}
  .sheet-item .val{display:flex;flex-direction:column;align-items:flex-end;font-size:.85rem;font-variant-numeric:tabular-nums}
  @media (min-width:700px){ .sheet{left:50%;transform:translateX(-50%);max-width:460px;border-radius:18px;bottom:auto;top:14vh} }
```

- [ ] **Step 6: 검사를 다시 돌린다**

기대: `openState.visible: true`, `role: "dialog"`, `focusInside: true`, `items: 2`, `closedAfterEsc: true`, `focusReturned: true`.

- [ ] **Step 7: 두 종목 전환을 확인한다**

시트에서 SK하이닉스를 고르고 확인한다.

- 제목·코드가 바뀐다
- **국면 카드가 "별로 다르지 않았어요"** 로 나온다 (삼성은 "오르는 쪽으로 기울었어요")
- **시장 카드가 "혼자 움직이는 날도 적지 않아요"** 로 나온다
- 흔들림 표의 `지난 10년 평균은 46%` (삼성은 34%)

**하나라도 삼성 값이 새어나오면 즉시 멈추고 원인을 찾는다.** 화면이 거짓이 된다.

- [ ] **Step 8: 폭별 넘침을 잰다** (시트를 연 상태로도 한 번)

- [ ] **Step 9: `sw.js` 버전을 올리고 커밋**

```bash
git add report.html sw.js
git commit -m "종목 전환을 목록 시트로 교체

상단 버튼 나열은 종목이 늘어나면 깨진다. 이름 탭을 누르면 아래에서
목록이 올라오는 방식으로 바꿨다. 종목이 30개가 돼도 첫 화면은 그대로다.

카테고리는 symbols.json의 category로 표현하고, 없으면 한 묶음으로
나온다. 검색창은 종목이 5개를 넘을 때만 보인다.

ESC·배경 클릭·닫기 버튼으로 닫히고, 닫으면 초점이 원래 버튼으로
돌아온다. 차트 확대 모달과 같은 규칙이다."
```

---

## Task 8: 접근성과 첫 로드 성능을 손본다

**파일**
- 수정: `report.html`(랜드마크·표 제목·Chart.js defer·차트 지연 렌더·움직임 줄이기), `index.html`(랜드마크)

- [ ] **Step 1: 검사를 먼저 만든다**

```js
window.a11yCheck = async function (p) {
  document.querySelectorAll('iframe.qa').forEach(e => e.remove());
  const f = document.createElement('iframe');
  f.className = 'qa';
  f.style.cssText = 'width:390px;height:900px;border:0;position:fixed;top:0;left:0;z-index:99999;background:#fff';
  document.body.appendChild(f);
  f.src = p;
  await new Promise(r => { f.onload = r; setTimeout(r, 9000); });
  await new Promise(r => setTimeout(r, 3000));
  const d = f.contentDocument;
  const tables = [...d.querySelectorAll('table')];
  return {
    landmarks: { main: !!d.querySelector('main'), header: !!d.querySelector('header'), footer: !!d.querySelector('footer') },
    h1: d.querySelectorAll('h1').length,
    tablesWithoutCaption: tables.filter(t => !t.querySelector('caption')).length,
    thWithoutScope: [...d.querySelectorAll('thead th')].filter(t => !t.getAttribute('scope')).length,
    chartDeferred: !!d.querySelector('script[src*="chart.umd"][defer]'),
    imgWithoutAlt: [...d.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length
  };
};
JSON.stringify(await window.a11yCheck('/report.html?code=005930'), null, 1);
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

기대: `main`·`footer` 가 `false`, `tablesWithoutCaption` 이 0보다 큼, `chartDeferred` 가 `false`.

- [ ] **Step 3: 랜드마크를 넣는다**

`report.html`의 `.wrap` 안에서 카드들을 `<main>`으로 감싸고, 출처·면책 부분을 `<footer>`로 만든다.
`index.html`도 `<main>`·`<footer>`를 갖추게 한다. `<h1>`은 페이지당 하나만 둔다.

- [ ] **Step 4: 표에 제목과 열 범위를 넣는다**

각 `<table>` 첫 자식으로 시각적으로 숨긴 `<caption>`을 넣는다.

```html
      <table>
        <caption class="sr-only">지금 가격과 평균가·최저가·최고가 비교</caption>
```

```css
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
```

`<thead>`의 모든 `<th>`에 `scope="col"`을 넣는다.

- [ ] **Step 5: Chart.js를 `defer`로 바꾸고 차트를 지연해 그린다**

`<head>`의 스크립트 태그를 고친다.

```html
<script defer src="./vendor/chart.umd.min.js"></script>
```

`defer`는 문서 파싱을 막지 않고, 순서도 보장된다. 앱 스크립트가 `Chart`를 바로 쓰지 않도록 차트 생성을 지연시킨다.

```js
/* 차트는 화면에 들어올 때 그린다. 첫 화면에 차트가 없으므로 그만큼 첫 표시가 빨라진다.
   Chart.js를 defer로 불러오므로 아직 준비 안 됐을 수 있어 load 이후로 미룬다. */
let chartPending = null;
function buildChartLazy(range){
  chartPending = range;
  const box = document.getElementById('chartBox');
  if(!('IntersectionObserver' in window)) { flushChart(); return; }
  if(box.__io) return;
  box.__io = new IntersectionObserver(es=>{
    if(es.some(e=>e.isIntersecting)){ box.__io.disconnect(); box.__io = null; flushChart(); }
  }, { rootMargin: '200px' });
  box.__io.observe(box);
}
function flushChart(){
  if(chartPending == null) return;
  if(typeof Chart === 'undefined'){ addEventListener('load', flushChart, { once:true }); return; }
  const r = chartPending; chartPending = null;
  buildChart(r);
}
```

`renderAll()`의 `buildChart(RANGE)` 호출을 `buildChartLazy(RANGE)`로 바꾼다.
**기간 버튼을 누를 때는 이미 화면에 있으므로 `buildChart`를 직접 부른다.**

- [ ] **Step 6: 움직임 줄이기 설정을 존중한다**

```css
  @media (prefers-reduced-motion: reduce){
    *{animation-duration:.001ms !important;transition-duration:.001ms !important;scroll-behavior:auto !important}
  }
```

차트 애니메이션도 끈다. `CHART_CFG`의 `options`에 넣는다.

```js
      animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
```

- [ ] **Step 7: 명도 대비를 확인한다**

`--sub`(#5b6785)를 흰 배경(#ffffff)에서 잰다. 대비 5.6:1로 기준(4.5:1)을 넘는다.
`.warnline` 안 글자는 배경이 `rgba(224,123,26,.08)`이라 실질 배경이 #fdf4ea 정도다. 같은 `--sub`로 4.5:1을 넘는지 아래로 확인한다.

```js
const lum = h => { const c = h.match(/\w\w/g).map(x=>{ let v=parseInt(x,16)/255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4); }); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
const ratio = (a,b)=>{ const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+.05)/(y+.05); };
JSON.stringify({ subOnWhite: ratio('5b6785','ffffff').toFixed(2), subOnWarn: ratio('5b6785','fdf4ea').toFixed(2) });
```

4.5 미만이면 `.warnline` 글자색을 `var(--txt)`로 바꾼다.

- [ ] **Step 8: 검사를 다시 돌린다**

기대: `landmarks` 전부 `true`, `h1: 1`, `tablesWithoutCaption: 0`, `thWithoutScope: 0`, `chartDeferred: true`, `imgWithoutAlt: 0`.
`index.html`에 대해서도 한 번 돌린다.

- [ ] **Step 9: 차트가 실제로 그려지는지 확인한다**

- 리포트를 열고 아래로 스크롤 → 차트가 그려진다
- 기간 버튼 7종(1개월/3개월/6개월/1년, 1주/2주/1개월)을 전부 눌러 콘솔 에러 0
- 차트를 눌러 확대·닫기(ESC 포함)가 된다

- [ ] **Step 10: `sw.js` 버전을 올리고 커밋**

```bash
git add report.html index.html sw.js
git commit -m "접근성과 첫 로드 손보기

랜드마크(main/header/footer), 표 제목(sr-only caption), th scope,
움직임 줄이기 설정 존중을 넣었다. 색만으로 정보를 전달하지 않는 것은
이미 ▲▼ 기호로 지키고 있다.

Chart.js를 defer로 바꾸고 차트를 화면에 들어올 때 그리게 했다.
첫 화면에 차트가 없으므로 그만큼 첫 표시가 빨라진다."
```

---

## Task 9: 공유 카드와 검색 노출을 정리한다

**파일**
- 수정: `report.html`(제목·설명·og 태그), `index.html`(og 태그)
- 생성: `robots.txt`, `sitemap.xml`, `scripts/tools/make_og.js`, `icons/og.png`

**배경**

지금 `report.html`의 `<title>`이 "삼성전자 주가 리포트"로 고정돼 있다. **하이닉스 링크를 공유하면 틀린 정보가 나간다.** 종목별로 맞추는 것은 [설계서 §5.4]에서 보류했으므로, **틀리지 않게** 만드는 것까지 한다.

- [ ] **Step 1: 검사를 먼저 만든다**

`scripts/verify/routing.js`에 넣는다.

```js
  for (const [p, body] of [['/', root.body], ['/report.html', rep.body]]) {
    check(p + ' 에 og:title 이 있어야 한다', /property=["']og:title["']/.test(body));
    check(p + ' 에 og:description 이 있어야 한다', /property=["']og:description["']/.test(body));
    check(p + ' 에 og:image 가 있어야 한다', /property=["']og:image["']/.test(body));
    check(p + ' 의 제목에 특정 종목명이 박혀 있으면 안 된다', !/<title>[^<]*삼성전자/.test(body));
  }
  const rob = await get('/robots.txt');
  check('robots.txt 가 있어야 한다', rob.status === 200);
  check('robots.txt 에 sitemap 이 적혀 있어야 한다', /sitemap/i.test(rob.body));
  const sm = await get('/sitemap.xml');
  check('sitemap.xml 이 있어야 한다', sm.status === 200);
  check('sitemap 에 report.html 이 있어야 한다', sm.body.includes('report.html'));
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

- [ ] **Step 3: 공유 카드 이미지를 만든다**

`scripts/tools/make_og.js` — 기존 `make_icons.js`와 같은 방식으로 외부 도구 없이 PNG를 직접 인코딩한다. 1200×630. 디자인은 아이콘과 같은 정체성을 쓴다 — **흰 주가선이 반투명 범위로 벌어지는 모양** + "주가 리포트" 글자.

```bash
node scripts/tools/make_og.js
```

`icons/og.png`가 생긴다. 파일 크기가 300KB를 넘으면 색 수를 줄인다.

- [ ] **Step 4: 두 페이지에 메타를 넣는다**

`index.html`:

```html
<title>주가 리포트 — 앞으로 얼마나 흔들릴까요</title>
<meta name="description" content="주가가 앞으로 어느 범위에서 움직일지, 특정 가격에 닿을 가능성이 얼마인지 매일 알려드려요. 오를지 내릴지는 예측하지 않아요. 10년치로 검증한 범위만 보여드려요.">
<link rel="canonical" href="https://stock.bigwave.im/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="주가 리포트">
<meta property="og:title" content="주가 리포트 — 앞으로 얼마나 흔들릴까요">
<meta property="og:description" content="오를지 내릴지는 맞히지 않아요. 대신 '10번 중 8번은 이 범위'를 알려드리고, 진짜 맞는지 매일 채점해요.">
<meta property="og:url" content="https://stock.bigwave.im/">
<meta property="og:image" content="https://stock.bigwave.im/icons/og.png">
<meta name="twitter:card" content="summary_large_image">
```

`report.html`도 같은 내용을 넣되 `og:url`만 `https://stock.bigwave.im/report.html` 로 한다.
**`<title>`에서 "삼성전자"를 뺀다.** 자바스크립트가 뜨면 지금처럼 종목명으로 바뀌는 동작(`document.title = SYM.name + ' 주가 리포트'`)은 **그대로 둔다.**

- [ ] **Step 5: `robots.txt`와 `sitemap.xml`을 만든다**

`robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://stock.bigwave.im/sitemap.xml
```

`sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://stock.bigwave.im/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://stock.bigwave.im/report.html</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
</urlset>
```

- [ ] **Step 6: `sw.js`의 `SHELL`에 `./icons/og.png`를 넣지 않는다**

공유 카드 이미지는 크롤러만 쓴다. 캐시에 넣으면 용량만 차지한다. **넣지 않는 것이 맞다.**

- [ ] **Step 7: 검사를 다시 돌린다**

```bash
node scripts/verify/routing.js
```

기대: **통과.**

- [ ] **Step 8: 커밋**

```bash
git add index.html report.html robots.txt sitemap.xml scripts/tools/make_og.js icons/og.png scripts/verify/routing.js
git commit -m "공유 카드와 검색 노출 정리

지금은 하이닉스 링크를 공유해도 '삼성전자 주가 리포트'로 뜬다.
종목별로 맞추는 것은 보류했으므로, 최소한 틀리지는 않게 종목 중립
문구로 바꿨다. 자바스크립트가 뜨면 종목명으로 바뀌는 동작은 그대로다.

og 태그가 아예 없어 공유하면 밋밋한 링크만 나가던 것도 채웠다.
공유 카드 이미지는 아이콘과 같은 방식으로 외부 도구 없이 만들었다.

이건 틀린 것을 고치는 작업이지 유입을 늘리는 작업이 아니다."
```

---

## Task 10: 문서를 갱신하고 전체를 검증한다

**파일**
- 생성: `docs/adr/008-landing-and-report-split.md`
- 수정: `docs/adr/README.md`, `CLAUDE.md`, `.claude/skills/verify-app/SKILL.md`, `.claude/WORKLOG.md`

- [ ] **Step 1: ADR 008을 쓴다**

형식은 `docs/adr/README.md`를 따른다 — 맥락 / 결정 / 근거 / 버린 대안 / **되돌리려면**.

담을 것:
- 랜딩과 리포트를 나눈 이유, 자동 통과 규칙
- **버린 대안**: 항상 랜딩부터(재방문자 마찰), 랜딩 없이 리포트가 겸함(서비스 얼굴이 없음)
- **버린 대안**: 종목별 정적 주소 — 위험 넷 중 셋이 "티가 안 나는" 종류였고 넷째는 되돌릴 수 없다. 설계서 §5.4의 재검토 조건을 그대로 옮긴다
- **되돌리려면**: 랜딩을 없애려면 `index.html`을 리포트로 되돌리고 `manifest`의 `start_url`을 되돌린다. 되돌리기 쉬운 결정임을 적는다

`docs/adr/README.md`의 목록 표에 008을 더한다.

- [ ] **Step 2: `CLAUDE.md`를 고친다**

바뀐 사실을 반영한다. 최소한 아래를 고쳐야 한다.

- 「구조」 — `index.html`(랜딩) / `report.html`(리포트) 두 파일로 나뉜 것
- 「데이터 로딩 우선순위 (index.html)」 → `report.html` 기준으로 제목과 본문 수정
- 「핵심 규칙 1」 — 모델 이중 구현 위치가 `report.html`
- `data/summary.json` 설명 추가
- 「스크립트 구성」 표에 `scripts/verify/routing.js`, `scripts/verify/summary.js`, `scripts/tools/make_og.js` 추가
- 「결정 기록(ADR)」 표에 008 추가

- [ ] **Step 3: `verify-app` 스킬을 고친다**

두 페이지가 됐으므로 검증 절차가 달라진다.

- 2번(데스크톱 확인)에 `/report.html` 추가
- 6번(오프라인)에 **랜딩과 리포트를 각각 확인**하는 단계 추가
- 새 검사 스크립트 2개(`routing.js`, `summary.js`)를 0번에 추가

- [ ] **Step 4: 전체 검증을 한 번에 돌린다**

```bash
node scripts/verify/preflight.js
node scripts/verify/summary.js
node scripts/verify/serve.js &
node scripts/verify/routing.js
```

브라우저에서 설계서 §9의 완료 기준 13개를 순서대로 확인한다.

1. preflight 통과
2. 320/360/390/414/768/1200px × (랜딩 + 두 종목) 가로 넘침 0
3. 콘솔 에러 0
4. 첫 방문에 `/`가 랜딩
5. 재방문에 `/`가 깜빡임 없이 리포트로
6. `/?code=000660`이 하이닉스로
7. `/?home=1`이 랜딩 강제 표시
8. 리포트 첫 화면이 390px에서 스크롤 없이
9. `왜요? ›`·`성적 ›`이 접힌 섹션을 펼치며 이동
10. 키보드만으로 시트 열기·고르기·닫기(초점 복귀)
11. **서버를 끈 상태에서 랜딩과 리포트가 각각 제대로**
12. 종목 전환 후에도 예측 기록 유지 — `JSON.stringify(Object.keys(JSON.parse(localStorage.getItem('ssn005930_predictions_v1')||'{}')).length)`
13. (배포 후)

**하나라도 실패하면 그 자리에서 고치고 처음부터 다시 돌린다.**

- [ ] **Step 5: `.claude/WORKLOG.md`에 항목을 추가한다**

`session-wrap` 스킬을 쓴다. 최신 항목이 위로 온다. 로드맵 표의 2번을 완료로 바꾸고, 5번(랜딩)이 일부 진행됐음을 적는다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "문서 갱신 + 전체 검증

ADR 008(랜딩과 리포트 분리) 신설, CLAUDE.md의 파일 구조·모델 위치·
데이터 로딩 설명을 report.html 기준으로 고쳤다.
verify-app 스킬에 두 페이지 검증 절차를 반영했다.

설계서 9장 완료 기준 12개를 로컬에서 모두 확인했다."
```

- [ ] **Step 7: 배포하고 라이브에서 다시 확인한다**

**푸시는 사용자 확인을 받고 한다.** 푸시하면 `stock.bigwave.im`에 바로 반영된다.

```bash
git pull --rebase
git push
node scripts/verify/deploy-wait.js
```

라이브에서 위 2~12번을 다시 확인한다. 특히:
- 이미 앱을 설치한 기기에서 홈 화면 아이콘이 리포트로 열리는지
- 서비스 워커가 새 버전으로 갈아끼워졌는지 (`caches.keys()`)
- 옛 공유 링크 `stock.bigwave.im/?code=000660`

---

## 자체 점검

**설계서 대비 빠진 것**

| 설계서 | 담당 작업 |
|---|---|
| §4.1 랜딩 | Task 4 |
| §4.2 리포트 첫 화면 | Task 5 |
| §4.3 섹션 순서·접기 | Task 6 |
| §4.4 종목 시트 | Task 7 |
| §5.1 두 페이지 | Task 1 |
| §5.2 자동 통과 규칙 | Task 1 |
| §5.3 PWA | Task 1 |
| §5.4 종목별 주소 보류 | Task 10 (ADR로 기록) |
| §5.5 summary.json | Task 3 |
| §6.1 접근성 | Task 8 |
| §6.2 첫 로드 성능 | Task 8 |
| §6.3 면책 위치 | Task 5 (요약 아래 한 줄), Task 4 (랜딩 하단) |
| §6.4 공유·검색 메타 | Task 9 |
| §7 유지 항목 | 전역 제약 + Task 7 Step 7(종목별 상수), Task 10 Step 4(예측 기록) |
| §8.1 서비스 워커 | Task 2 |
| §8.2 나머지 위험 | Task 1(깜빡임·뒤로가기·`?home=1`), Task 6(접기), Task 5(첫 화면 높이) |
| §9 완료 기준 | Task 10 Step 4 |

빠진 항목 없음.

**이름 일관성**

- `volNowPct(data)` — Task 5에서 소비. 2-2에서 이미 만들어 둔 함수다
- 성적 링크 문구 — `renderScoreCard` 안에서 `a2`(현재 방식 집계 배열)로 직접 채운다.
  전역 변수를 새로 만들지 않는다. `renderSummary`가 `renderScoreCard`보다 **먼저** 돌기 때문이다
- `agg` / `a2` / `a1` — `renderHistory`가 만들고 `renderScoreCard`가 받는 기존 값. 이름을 바꾸지 않는다
- `openSheet` / `closeSheet` / `renderSheetList` / `loadSummary` — Task 7에서 정의, 다른 곳에서 안 쓴다
- `buildChartLazy` / `flushChart` — Task 8에서 정의. 기존 `buildChart`는 그대로 남는다
- `openTarget` — Task 6에서 정의
- `ssn_last_symbol` — Task 1의 라우터와 `report.html`의 `SYM_KEY`가 **같은 문자열**이어야 한다

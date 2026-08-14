---
name: verify-app
description: Use when about to commit or deploy a change to index.html, data files, or the forecast model — runs the full browser verification routine (local server, desktop, mobile 390px, both symbols, offline, overflow, console errors). Also use when the user asks to "검증", "확인해줘", "테스트해줘" for the stock report app.
---

# 앱 검증 루틴

화면을 고친 뒤 **반드시** 이 순서로 확인한다. 아래 함정들은 전부 실제로 겪은 것이다.

## 0. 커밋 전 자동 검사부터

```
node scripts/verify/preflight.js
```

모델 이중 구현 일치·JSON 유효성·캐시 버전을 본다. 여기서 막히면 아래로 넘어가지 말 것.

## 1. 로컬 서버 기동

```
node scripts/verify/serve.js
```

백그라운드로 띄운다(포트 8731). `file://` 로 열면 안 된다 — 서비스 워커도, 같은 출처 iframe도 작동하지 않는다.

## 2. 데스크톱 확인

`http://localhost:8731/` 로 접속해서:

- 콘솔 에러 0
- 렌더가 끝났는지 — `불러오는 중`, `-` 로 남은 요소가 없어야 한다
- 가로 넘침 0

> **콘솔에 `:0:0 Object` 예외 2건이 보이면 무시한다.** 브라우저 확장 프로그램 것이고 앱과 무관하다(확인 완료).

## 3. 모바일 390px

**창 리사이즈(`resize_window`)는 이 환경에서 먹지 않는다.** 성공을 반환하고도 뷰포트가 안 바뀐다.
대신 **같은 출처 iframe에 사이트를 넣고 iframe 폭을 바꾼다.**

```js
const f = document.createElement('iframe');
f.src = '/?code=005930';
f.style.cssText = 'width:390px;height:820px;border:0;display:block';
document.body.appendChild(f);
```

> **폭을 바꿀 때마다 `iframe.src` 를 다시 지정해 처음부터 로드해야 한다.**
> 그냥 폭만 바꾸면 Chart.js 캔버스가 이전 크기로 남아 **없는 넘침이 잡힌다.**

## 4. 가로 넘침 검사 — 요소만 훑으면 놓친다

`getBoundingClientRect` 로 요소만 검사하면 **텍스트 노드가 넘치는 경우를 못 잡는다.**
(실제로 `#histTable td` 의 `white-space:nowrap` 때문에 224px 넘쳤는데 요소 검사로는 0건이었다.)

```js
// 이렇게 찾는다
[...d.querySelectorAll('body *')].filter(e =>
  getComputedStyle(e).overflowX === 'visible' &&
  e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0)
```

## 5. 두 종목 전환

- 상단 버튼으로 삼성전자 ↔ SK하이닉스
- `?code=000660` 직접 접속
- **종목마다 화면 숫자가 그 종목 것인지 확인** — 한 종목 값이 다른 종목에 새어나가면 즉시 거짓이 된다.
  특히 국면 카드 문구는 종목에 따라 정반대로 나와야 정상이다
  (삼성 "오르는 쪽으로 기울었어요" / 하이닉스 "별로 다르지 않았어요")

## 6. 오프라인

1. 서버를 **켠 채로 한 번 방문** (첫 방문에는 데이터가 캐시되지 않는다 — 서비스 워커가 아직 제어권이 없다)
2. **다시 방문** — 이때 데이터가 캐시된다
3. 서버 종료
4. 새로고침 → 차트·시세·수급·시장 정보가 전부 캐시에서 떠야 한다

> 이 순서를 지키지 않으면 "오프라인 실패"로 잘못 판단한다. 실제로 한 번 오판했다.

## 7. 마무리

- 서버 종료 (`Stop-Process -Name node`)
- 열어둔 탭 닫기
- `index.html` 을 고쳤으면 `sw.js` 의 `CACHE` 버전 올리기

## 배포 후

```
node scripts/verify/deploy-wait.js
```

Vercel 배포 완료를 기다린 뒤 `https://stock.bigwave.im` 에서 2~6번을 다시 확인한다.

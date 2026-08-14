# 삼성전자 주가 예측 보고서 앱

투자자용 삼성전자(KRX 005930) 주가 분석·5일 예측 보고서. 단일 페이지 정적 앱으로 GitHub Pages에 배포하고, GitHub Actions가 매일 데이터를 갱신한다. 사용자는 비개발자이므로 설명은 쉬운 용어로 한다.

## 구조

- `index.html` — **랜딩** (서비스 소개 + 종목 고르기). 아주 가볍게 유지하고 Chart.js를 부르지 않는다.
  - `<head>` 맨 위 인라인 스크립트가 **다시 온 사람을 리포트로 넘긴다** (`?code=` → 마지막 종목 기억 → 없으면 랜딩).
    `?home=1` 이면 강제로 랜딩을 본다. 근거는 [ADR 009](docs/adr/009-landing-and-report-split.md).
- `report.html` — **리포트 전체** (HTML+CSS+JS 단일 파일). 모델·차트·모든 섹션이 여기 있다.
  - 리포트 상단 홈 버튼은 반드시 `./?home=1` 로 보낸다. 그냥 `./` 면 랜딩이 곧바로 되돌려 보낸다.
- `data/prices.json` — 최근 1년 시세. Actions가 매일 갱신. `{updated, rows:[{d,c,v}]}` (d=날짜, c=종가, v=거래량 백만주)
### 여러 종목 구조 (2026-08-13~)

- `data/symbols.json` — 종목 목록 + **종목별 검증 상수**(`stats`). 앱과 스크립트 모두 이 파일을 읽는다.
  - **`stats`는 그 종목 데이터로 직접 계산한 값이다. 다른 종목 값을 복사하면 화면에 거짓이 뜬다.**
    (예: 신고가 부근 효과는 삼성 41.7% vs 17.3%로 크지만, 하이닉스는 40.2% vs 35.5%로 사실상 없다.
     시장 동조도 삼성 83% / 하이닉스 69%, 10년 변동성 34% / 46%로 다르다.)
  - 종목을 추가하면 `node scripts/research/symbol_stats.js` 로 **반드시 다시 계산**할 것.
  - **항목마다 필요한 최소 이력이 다르다** ([ADR 008](docs/adr/008-minimum-history.md)) —
    등록 자체가 3년 이상, `volBase`·`market`·`earnings`는 5년, `regime`은 10년.
    모자라면 그 항목을 **넣지 않는다**(앱이 줄을 감추고, `preflight`가 넣으면 막는다).
  - `stats.histYears`(실제 이력)와 `stats.volBase = {pct, years}`를 함께 적는다.
    화면이 "10년 평균" / "지난 3년 평균"을 구분해 말하기 위한 값이다.
- 종목별 데이터는 `data/<종목코드>/{prices,predictions,report,flow,market}.json`.
- 화면 전환: 상단 버튼 또는 `?code=000660`. 마지막 선택은 localStorage에 남는다.
- localStorage 키는 `ssn<코드>_predictions_v1` — 005930은 기존 키와 같아 예전 기록이 이어진다.
- `report.json`은 항목이 빠져도 된다(`rangeLo/rangeHi`, `rating` 등). **확인 못 한 값은 넣지 말 것.**
  앱이 빠진 항목의 줄을 알아서 감춘다.

- `data/<종목코드>/predictions.json` — 예측 기록 누적. `{ "기준일": {madeOn, base, m, vol, pts:[{d,v,lo,hi}]} }` (m=모델 버전, vol=그날의 일간 혼합변동성, pts는 20거래일치). 한번 기록된 예측은 절대 수정하지 않는다(예측-실제 비교의 공정성). **vol이 있어야 임계값 확률 예보를 나중에 재현·채점할 수 있다.**
- `data/flow.json` — 수급(외국인·기관 순매수). `{updated, rows:[{d,vol,org,frn,hold}]}` 최근 250거래일. **맥락 정보이고 예측에 쓰이지 않는다.**
- `data/market.json` — 시장 동조 지표. `{updated, kospi:{corr60,chg1}, hynix:…, sox:…}`. 역시 맥락 정보.
- `data/report.json` — 조사 데이터(전문가 의견·동향·종합평가). 수동 갱신 대상.
- `scripts/update_daily.js` — Actions가 실행. 시세 수집 + 예측 계산·누적 + 수급·시장지표 수집. **수급/시장지표 수집은 실패해도 전체를 중단시키지 않는다**(비공식 경로라 깨질 수 있음). 앱도 해당 파일이 없으면 그 카드만 "불러오지 못했습니다"로 표시한다.
- `.github/workflows/daily.yml` — 평일 16:40 KST 자동 실행 + 수동 실행 버튼.
- `vercel.json` — Vercel 배포 설정. 빌드는 없고 **헤더만** 잡는다. 각 항목의 이유:
  - `manifest.webmanifest`에 `Content-Type: application/manifest+json`을 직접 지정 —
    Vercel 기본 MIME 목록에 `.webmanifest`가 없을 수 있고, 틀리면 **"홈 화면에 추가"가 안 된다.**
  - `sw.js`·`index.html`·`data/`는 `max-age=0, must-revalidate` — 매일 갱신되는 내용이다.
    특히 서비스 워커가 캐시에 갇히면 사용자가 옛 화면에서 못 벗어난다.
  - `icons/`·`vendor/`는 1년 캐시 — 내용이 바뀌지 않는다.
  - **JSON에 주석을 넣지 말 것.** `"//"` 같은 키를 쓰면 Vercel이 스키마 검사에서
    `should NOT have additional property` 오류로 배포를 거부한다(실제로 겪음).
- `manifest.webmanifest`, `sw.js`, `icons/`, `vendor/chart.umd.min.js` — PWA(홈 화면에 추가) 구성.
  - **화면 파일(`index.html`·`report.html`)을 고치면 `sw.js`의 `CACHE` 버전을 올릴 것.** 안 올리면 정적 파일이 옛 캐시로 남는다.
  - HTML·데이터는 네트워크 우선이라 온라인이면 항상 최신을 본다. 아이콘·Chart.js만 캐시 우선.
  - 데이터는 앱이 `?t=` 를 붙여 요청하므로 SW가 **쿼리를 떼고** 캐시 키를 만든다. 이 규칙을 깨면 오프라인에서 데이터를 못 찾는다.
  - **화면도 주소별로 따로 저장한다.** 예전에는 모든 화면을 `./index.html` 한 자리에 넣어,
    페이지가 둘이 되자 오프라인에서 `/` 를 열면 리포트가 떴다. 페이지를 더 늘릴 때 같은 함정을 조심할 것.
  - Chart.js는 CDN이 아니라 `vendor/`에서 불러온다. CDN으로 되돌리면 오프라인에서 차트가 안 그려진다.

## 데이터 로딩 우선순위 (report.html)

1. `./data/prices.json` (Pages 배포 시 — Actions가 갱신한 데이터)
2. 야후 파이낸스 직접 fetch (CORS로 대부분 실패)
3. `r.jina.ai` 프록시 (로컬에서 파일로 직접 열었을 때)
4. HTML에 내장된 FALLBACK 문자열 (2026-08-12 기준)

report.json과 predictions.json도 같은 방식으로 로드하며, 실패하면 HTML 내장값/localStorage로 폴백한다. 따라서 이 파일은 **로컬 더블클릭과 Pages 배포 양쪽에서 모두 작동**한다.

## 결정 기록 (ADR) — `docs/adr/`

**"왜 그렇게 정했나"는 `docs/adr/`에 있다.** 결정 하나에 파일 하나.
아래 「핵심 규칙」이 *무엇을 지켜야 하나*라면, ADR은 *왜 그렇게 정했고 무엇이 있어야 되돌릴 수 있나*다.

| # | 결정 |
|---|---|
| [001](docs/adr/001-drop-direction-forecast.md) | 방향 예측 폐기, 범위 예측으로 전환 |
| [002](docs/adr/002-per-symbol-constants.md) | 검증 상수는 종목마다 다시 계산 |
| [003](docs/adr/003-no-downside-calibration.md) | 하락 확률 과대 예보를 보정하지 않음 |
| [004](docs/adr/004-no-long-horizon.md) | 3개월 초과 가격 예측 미제공 |
| [005](docs/adr/005-vercel-hosting.md) | Vercel + stock.bigwave.im 호스팅 |
| [006](docs/adr/006-reject-ma-distance.md) | 평균가 이격을 범위 계산에 넣지 않음 |
| [007](docs/adr/007-remove-mood-badge.md) | "지금 분위기" 배지 제거 |
| [008](docs/adr/008-minimum-history.md) | 종목 등록 최소 이력 3년, 이력별 표시 범위 |
| [009](docs/adr/009-landing-and-report-split.md) | 랜딩과 리포트 분리, 다시 온 사람은 자동 통과 |

**모델·화면 구성을 바꾸자는 논의가 나오면 먼저 해당 ADR의 "되돌리려면"을 읽을 것.**
거기에 뒤집기 위해 무엇을 측정해야 하는지가 적혀 있다. 새 결정을 내리면 ADR을 추가한다
(형식은 `docs/adr/README.md`).

## 핵심 규칙

1. **예측 모델(v2)은 두 곳에 중복 구현되어 있다**: `report.html`의 `makeForecast`와 `scripts/update_daily.js`의 `makeForecast`. 수정할 때는 반드시 두 곳을 동일하게 고친다. 검증 스크립트: 아래 "모델 검증" 참조.
   - **현재 모델은 방향을 예측하지 않는다.** 중심값 = 오늘 종가(수평), 범위 = `Z80 × z1 × 혼합변동성 × √t`, `Z80 = 1.2816`(정규분포 80% 계수), `z1` = 종목별 꼬리 보정(`symbols.json`의 `stats.z1`, 현재 두 종목 모두 1.04). 혼합변동성 = 20·60·250일 분산의 평균의 제곱근. 20거래일치를 만들어 앱에서 5/10/20일로 잘라 쓴다. 근거: [ADR 001](docs/adr/001-drop-direction-forecast.md).
   - **`z1` 보정을 빼지 말 것.** 정규분포 가정만으로는 두꺼운 꼬리 때문에 구간이 좁다. 10년 검증에서 보정 전 적중률 79.0/78.6/77.8%(목표 80%) → 보정 후 80.5/80.3/80.2%. `z1`은 종목마다 다시 계산한다([ADR 002](docs/adr/002-per-symbol-constants.md)).
   - **임계값 도달 확률**(`touchProb`)은 index.html에만 있다. 드리프트 0 배리어 공식 `2·Φ(-|ln(1+pct/100)|/(σ√h))`로 저장된 vol에서 계산한다. 상승 임계값 BSS +0.04~+0.18로 검증됨. 하락 확률이 과대 예보되는 것은 지난 10년이 8.5배 상승 구간이었기 때문이며, **보정하면 과거 상승장을 미래에 복사하는 것이므로 보정하지 않는다**([ADR 003](docs/adr/003-no-downside-calibration.md)).
   - **방향 예측을 되살리지 말 것.** 2026-08-13에 10년 2,385회 워크포워드 백테스트로 폐기한 결정이다. 이전 모델(모멘텀 0.4 + 평균회귀 0.3 + 컨센서스 0.3, 드리프트 상한 ±1.5%)은 1일~6개월 **모든 기간**에서 랜덤워크보다 부정확했고(5일 3.34% vs 3.24%), 방향 적중률 47.7%였다. 이후 다음도 모두 검증에서 탈락했다 — 32개 가격·거시 요인(5일 1/32 유의=우연 기대치, 1개월 0/32), 상승확률 예보(BSS 음수), 수급(기관 유의하나 2023년 이후 소멸), 장기 예측(6개월 1.179 / 1년 1.374), 신고가 규칙을 예측선에 반영(1.000 / 1.011), 비대칭 밴드(적중률 하락). **총 48개 요인·8가지 방식이 실패했다. 49번째를 시도하기 전에 [ADR 001](docs/adr/001-drop-direction-forecast.md)의 "되돌리려면"과 검증 보고서를 먼저 읽을 것**(링크는 ADR에 있다). 장기 예측은 [ADR 004](docs/adr/004-no-long-horizon.md).
   - **되는 것은 변동성 계열뿐이다**: 범위(구간 적중률 80%)와 임계값 도달 확률(BSS 양수). "얼마가 될까"는 실패하고 "얼마나 움직일까"는 성공한다는 것이 일관된 패턴이다.
2. **predictions.json의 과거 기록은 절대 수정·삭제 금지.** 스크립트도 이미 있는 날짜는 건너뛴다. 모델을 바꿔도 과거 기록은 그대로 두고 `m`(버전)으로 구분한다. 앱은 오늘 기록이 구버전이면 화면에만 현재 방식을 계산해 보여주고 파일은 건드리지 않는다.
3. **KR_HOLIDAYS(휴장일 목록)도 두 곳에 있다** (report.html, update_daily.js). 매년 연말 다음 해 휴장일을 두 곳 모두 추가한다. 현재 2027-03-01까지 등록됨.
4. report.json 갱신 시 JSON 유효성을 반드시 확인한다 (`node -e "JSON.parse(require('fs').readFileSync('data/report.json'))"`).

## 문체 규칙 (2026-08-13 확정)

사용자는 대부분 비전문가다. **화면에 보이는 모든 문구는 쉽고 간결하게, 해요체로 쓴다.**

- 전문용어를 쓰지 않는다. 이미 정한 대응: 임계값 도달 확률→"이 가격에 닿을 가능성", 80% 신뢰구간→"10번 중 8번은 이 안",
  랜덤워크→"아무 계산 없이 '오늘 가격 그대로'라고 말하는 방식", 이동평균→"최근 N개월 평균가", RSI→"과열·침체 지수",
  변동성→"얼마나 흔들리나", 지지선·저항선→"최근 3개월 최저가·최고가", 수급/순매수→"외국인·기관이 사고 있나요",
  상관계수→"거의 똑같이 움직여요/따로 노는 편이에요", 52주→"1년 중", 컨센서스→"증권사들이 보는 평균".
- **정보량은 줄이지 않는다.** 검증 결과와 한계 경고는 반드시 유지하되 쉬운 말로 옮긴다.
  (예: "2022~2025년에는 이 관계가 정반대였습니다" → "2022~2025년에는 완전히 반대였어요")
- **투자 권유로 읽힐 표현을 쓰지 않는다.** "분할 매수 검토" 같은 표현은 과거에 있었다가 삭제했다. 되살리지 말 것.
- report.json의 조사 문구도 같은 기준을 따른다. report.html 내장 폴백과 함께 고칠 것.

## "보고서 갱신" 요청 처리 절차 (반자동 조사 갱신)

사용자가 "보고서 갱신"을 요청하면:
1. 웹 검색: 삼성전자 목표주가 컨센서스, 실적·HBM·파운드리 뉴스, 메모리 가격·CXMT·거시 동향, 최근 급등락 원인
2. `data/report.json`만 수정: `updated`(오늘 날짜), `consensus`, `analysts`(2~4개), `rating`, `expertVerdict`(3~4문장), `factors`(4~8개, cls는 "pos"/"neg"/""), `newsVerdict`(3~4문장). 구조·필드명 변경 금지.
3. 종합평가는 전문가 관점에서 낙관 근거와 한계를 균형 있게, 투자 권유 표현 없이 작성.
4. 출처 링크는 `report.json`의 `sources`에 넣는다. HTML에 박으면 다른 종목 화면에 남의 출처가 뜬다.
5. 커밋·푸시하면 Pages에 자동 반영된다.

report.html에 내장된 REPORT_DATA는 오프라인 폴백용이므로 가끔(월 1회 정도) report.json 내용으로 동기화해주면 좋다.

## 배포 정보 (2026-08-13 완료)

- 저장소: `bigwavecto/bigwave-stock` (공개)
- **주소: https://stock.bigwave.im** (Vercel, 2026-08-13 이전)
  - Vercel 프로젝트 `bigwave-stock` (팀: bigwave's projects, Hobby). 임시 주소 `bigwave-stock.vercel.app`도 살아 있다.
  - DNS는 **후이즈에 그대로** 두고 서브도메인만 CNAME으로 연결했다.
    `stock` → `5e172cd43718b792.vercel-dns-017.com`
  - **네임서버를 Vercel(ns1/ns2.vercel-dns.com)로 옮기면 안 된다.** `bigwave.im`과 `www`가
    118.67.131.217에서 별도 서비스 중이라 같이 죽는다. Vercel 화면의 "Vercel DNS" 탭이 그것이니 누르지 말 것.
  - **Vercel Hobby는 비상업용 전용.** 빅웨이브가 수익을 내기 시작하면 Pro(월 $20)로 올려야 한다.
  - 저장소를 비공개로 바꿔도 Vercel 서비스는 유지된다(그 경우 GitHub Pages만 죽는다).
- 구 주소: `bigwavecto.github.io/bigwave-stock/` — Pages도 아직 살아 있다. 저장소를 비공개로 바꾸면 죽는다.
- 자동 갱신: 평일 16:40 KST (`.github/workflows/daily.yml`). 데이터 커밋마다 Vercel이 자동 재배포한다.

### 작업 시작 전 반드시 확인할 것

1. **`gh auth switch`를 실행하지 말 것.** 이 PC의 gh 계정 구성은 어느 계정이 활성이든 푸시·워크플로 실행이 되도록 이미 정리돼 있다. 전환하면 오히려 깨진다.
2. **커밋 신원은 저장소 로컬 설정으로 고정돼 있다.** 새로 clone하면 다시 설정해야 한다.
3. 위 1·2의 구체적인 계정명·설정값·배경은 **공개 저장소에 두지 않는다.** 로컬 전용 문서 `.claude/PRIVATE-NOTES.md`(gitignore됨)와 Claude 메모리에 있다. 메모리는 세션 시작 시 자동 로드되므로 별도 조치 없이 인지된다.
4. Git Bash에서 `gh api` 호출 시 경로 앞 슬래시를 빼야 한다(`user/repository_invitations`). 붙이면 MSYS가 파일경로로 바꿔 실패한다.

### 작업 이력

`.claude/WORKLOG.md`에 날짜순으로 누적한다(로컬 전용, gitignore됨). **작업을 마치면 반드시 항목을 추가한다.** 다음 세션이 경위를 파악하는 1차 자료이며, 세션 시작 시 자동으로 읽힌다.

## 스크립트 구성

| 경로 | 용도 |
|---|---|
| `scripts/update_daily.js` | Actions가 매일 실행 (시세·예측·수급·시장지표) |
| `scripts/verify/preflight.js` | **커밋 전 자동 검사.** 모델 일치·JSON·캐시 버전 |
| `scripts/verify/parity.js` | 모델 이중 구현 일치 검사 (등록된 모든 종목) |
| `scripts/verify/serve.js` | 로컬 정적 서버 (포트 8731) |
| `scripts/verify/deploy-wait.js` | 배포 완료 대기 + 라이브 헤더 확인 |
| `scripts/research/` | 백테스트·검증 스크립트. **종목 추가 시 필수** |
| `scripts/research/fetch/` | 원자료 수집 → `scripts/research/.cache/` (gitignore) |
| `scripts/tools/make_icons.js` | 앱 아이콘 생성 (외부 도구 없이 PNG 직접 인코딩) |

**조사용 원자료는 저장소에 넣지 않는다.** `.cache/`에 두고 `fetch/`로 다시 받는다.

## 스킬

- `verify-app` — 브라우저 검증 루틴 전체. **화면을 고쳤으면 이걸 쓴다.**
  창 리사이즈가 안 먹는 문제, 오프라인 검증 순서 같은 함정이 본문에 적혀 있다.
- `add-symbol` — 종목 추가 5단계. **1단계(그 종목으로 상수 재계산)를 건너뛰면 화면이 거짓말을 한다.**

## 커밋 전 자동 검사 (훅)

`.claude/settings.json`의 `PreToolUse` 훅이 `git commit`을 가로채 `preflight.js`를 돌린다.

- **차단**: 모델 이중 구현 불일치, `data/**.json` 깨짐
- **경고**: `index.html`만 바뀌고 `sw.js` CACHE 그대로

정말 그냥 커밋해야 하면 명령 앞에 `SKIP_PREFLIGHT=1`을 붙인다. 훅이 방해되면
`.claude/settings.json`의 `hooks` 항목을 지우면 된다.

## 검증 방법

- 스크립트: `node scripts/update_daily.js` 실행 후 data/*.json 확인
- **모델 이중 구현 일치 검증**: 두 파일의 `makeForecast` 소스를 잘라내 실행하고 결과를 비교한다. 모델을 수정하면 반드시 다시 돌릴 것.
- 앱: 브라우저에서 열어 콘솔 에러 없는지 확인. 모바일 확인은 **창 리사이즈가 이 환경에서 먹지 않으므로** 같은 출처 iframe에 사이트를 넣고 iframe 폭을 바꾸는 방식을 쓴다. 각 폭마다 `iframe.src`를 다시 지정해 처음부터 로드해야 한다(Chart.js 캔버스가 이전 크기로 남아 가짜 넘침이 잡힌다). 로컬 검증에는 정적 서버가 필요하다(`file://`은 같은 출처 iframe 접근 차단).

## 향후 확장 아이디어 (사용자와 논의 후 진행)

- 다른 종목 추가 (구조를 종목 파라미터화)
- Supabase 연동: 여러 종목·알림·사용자 설정이 필요해지는 시점에 도입 (현재는 불필요)
- 예측 정확도 통계 페이지 (predictions.json 누적 데이터 활용)

# 삼성전자 주가 예측 보고서 앱

투자자용 삼성전자(KRX 005930) 주가 분석·5일 예측 보고서. 단일 페이지 정적 앱으로 GitHub Pages에 배포하고, GitHub Actions가 매일 데이터를 갱신한다. 사용자는 비개발자이므로 설명은 쉬운 용어로 한다.

## 구조

- `index.html` — 앱 전체 (HTML+CSS+JS 단일 파일). Chart.js는 cdnjs에서 로드.
- `data/prices.json` — 최근 1년 시세. Actions가 매일 갱신. `{updated, rows:[{d,c,v}]}` (d=날짜, c=종가, v=거래량 백만주)
- `data/predictions.json` — 예측 기록 누적. `{ "기준일": {madeOn, base, pts:[{d,v,lo,hi}]} }`. 한번 기록된 예측은 절대 수정하지 않는다(예측-실제 비교의 공정성).
- `data/report.json` — 조사 데이터(전문가 의견·동향·종합평가). 수동 갱신 대상.
- `scripts/update_daily.js` — Actions가 실행. 시세 수집 + 예측 계산·누적.
- `.github/workflows/daily.yml` — 평일 16:40 KST 자동 실행 + 수동 실행 버튼.

## 데이터 로딩 우선순위 (index.html)

1. `./data/prices.json` (Pages 배포 시 — Actions가 갱신한 데이터)
2. 야후 파이낸스 직접 fetch (CORS로 대부분 실패)
3. `r.jina.ai` 프록시 (로컬 더블클릭 실행 시 사용됨)
4. HTML에 내장된 FALLBACK 문자열 (2026-08-12 기준)

report.json과 predictions.json도 같은 방식으로 로드하며, 실패하면 HTML 내장값/localStorage로 폴백한다. 따라서 이 파일은 **로컬 더블클릭과 Pages 배포 양쪽에서 모두 작동**한다.

## 핵심 규칙

1. **예측 모델은 두 곳에 중복 구현되어 있다**: `index.html`의 `makeForecast`와 `scripts/update_daily.js`의 `makeForecast`. 모델(가중치 0.4/0.3/0.3, 드리프트 상한 ±1.5%, 신뢰구간 1.2816σ, EMA 10일, SMA 20일)을 수정할 때는 반드시 두 곳을 동일하게 수정한다.
2. **predictions.json의 과거 기록은 절대 수정·삭제 금지.** 스크립트도 이미 있는 날짜는 건너뛴다.
3. **KR_HOLIDAYS(휴장일 목록)도 두 곳에 있다** (index.html, update_daily.js). 매년 연말 다음 해 휴장일을 두 곳 모두 추가한다. 현재 2027-03-01까지 등록됨.
4. report.json 갱신 시 JSON 유효성을 반드시 확인한다 (`node -e "JSON.parse(require('fs').readFileSync('data/report.json'))"`).

## "보고서 갱신" 요청 처리 절차 (반자동 조사 갱신)

사용자가 "보고서 갱신"을 요청하면:
1. 웹 검색: 삼성전자 목표주가 컨센서스, 실적·HBM·파운드리 뉴스, 메모리 가격·CXMT·거시 동향, 최근 급등락 원인
2. `data/report.json`만 수정: `updated`(오늘 날짜), `consensus`, `analysts`(2~4개), `rating`, `expertVerdict`(3~4문장), `factors`(4~8개, cls는 "pos"/"neg"/""), `newsVerdict`(3~4문장). 구조·필드명 변경 금지.
3. 종합평가는 전문가 관점에서 낙관 근거와 한계를 균형 있게, 투자 권유 표현 없이 작성.
4. index.html 하단 출처 링크(`<p class="src">`)도 필요시 갱신.
5. 커밋·푸시하면 Pages에 자동 반영된다.

index.html에 내장된 REPORT_DATA는 오프라인 폴백용이므로 가끔(월 1회 정도) report.json 내용으로 동기화해주면 좋다.

## 배포 절차 (최초 1회)

1. 이 폴더를 GitHub 저장소로 생성·푸시 (공개 저장소 — Pages 무료 사용 조건)
2. 저장소 Settings → Pages → Source: `main` 브랜치 `/ (root)` 선택
3. Actions 탭 → "일일 데이터 갱신" → "Run workflow"로 1회 수동 실행 (data/prices.json 첫 생성)
4. `https://<계정명>.github.io/<저장소명>/` 접속 확인 — 상단 배지가 "실시간 · 저장소 자동 갱신"이면 성공

## 검증 방법

- 스크립트: `node scripts/update_daily.js` 실행 후 data/*.json 확인
- 앱: jsdom 기반 스모크 테스트 (fetch를 목킹해 폴백 경로 확인, Chart 스텁). 브라우저에서 열어 콘솔 에러 없는지 확인.

## 향후 확장 아이디어 (사용자와 논의 후 진행)

- 다른 종목 추가 (구조를 종목 파라미터화)
- Supabase 연동: 여러 종목·알림·사용자 설정이 필요해지는 시점에 도입 (현재는 불필요)
- 예측 정확도 통계 페이지 (predictions.json 누적 데이터 활용)

---
name: add-symbol
description: Use when adding a new stock to the report app (사용자가 "종목 추가", "OO 추가해줘", "OO도 넣자" 라고 할 때). Covers computing the symbol's own verified constants, writing its research data, and generating its data files. Required before any new stock appears in the app.
---

# 종목 추가 절차

**순서를 지키는 것이 핵심이다. 1단계를 건너뛰면 화면이 거짓말을 한다.**

## 0. 이력이 충분한지 먼저 본다 ← 여기서 걸리면 추가하지 않는다

상장한 지 얼마 안 된 종목(AI 관련주에 많다)은 화면에 쓸 상수를 만들 수 없다.
**항목마다 필요한 이력이 다르다** — 근거와 수치는 [docs/adr/008](../../../docs/adr/008-minimum-history.md).

| 이력 | 등록 | 흔들림 표시 | 시장 동조 | 실적 배수 | 국면(신고가) |
|---|---|---|---|---|---|
| 3년 미만 | ❌ **추가하지 않는다** | | | | |
| 3~5년 | ✅ | "지난 N년 평균의 X배" | ❌ | ❌ | ❌ |
| 5~10년 | ✅ | "지난 N년 평균의 X배" | ✅ | ✅ | ❌ |
| 10년 이상 | ✅ | "10년 평균의 X배" | ✅ | ✅ | ✅ |

**계산할 수 없는 항목은 `symbols.json` 에 넣지 않는다.** 앱이 그 줄을 감춘다.
넣으면 `preflight` 가 커밋을 막는다.

핵심은 "짧으면 숨긴다"가 아니라 **기준 기간을 화면에 밝힌다** 는 것이다.
3년치를 "평소"라고 부르면 거짓말이지만(3년 창은 10년 기준보다 1.4배 높게 나온다),
"지난 3년 평균의 1.4배"는 사실이다.

## 1. 그 종목으로 검증 상수를 다시 계산한다 ← 가장 중요

```
node scripts/research/fetch/fetch_factors.js     # 10년치 시세 수집 (.cache/)
node scripts/research/symbol_stats.js            # 종목별 상수 산출
```

**다른 종목 값을 복사하면 안 된다.** 종목마다 결과가 정말 다르다.

| | 삼성전자 | SK하이닉스 |
|---|---|---|
| 신고가 부근 → 한 달 내 +10% | 41.7% (그 외 17.3%) → 뚜렷 | 40.2% (그 외 35.5%) → **사실상 없음** |
| +5% 상승일 중 코스피 동반 | 83% | 69% |
| 10년 변동성 | 34% | 46% |

`symbol_stats.js` 는 이력이 모자란 항목을 **알아서 빼고** 무엇을 뺐는지 알려준다.
출력 맨 아래 `⚠️ 이력이 짧아 뺀 항목` 줄을 반드시 확인할 것.

이 값들이 화면 문구를 직접 좌우한다. 국면 카드가 종목에 따라
"오르는 쪽으로 기울었어요" / "별로 다르지 않았어요" 로 갈리는 게 그 때문이다.

`symbol_stats.js` 는 지금 종목 2개가 하드코딩돼 있으니, 새 종목을 추가하면
`analyse()` 호출 목록에 넣고 `fetch_factors.js` 의 `TICKERS` 에도 추가한다.

## 2. `data/symbols.json` 에 등록

```json
{
  "code": "종목코드", "name": "종목명", "yahoo": "종목코드.KS",
  "peer": { "code": "...", "name": "...", "yahoo": "..." },
  "stats": { /* 1단계 결과를 그대로 */ }
}
```

`peer` 는 시장 동조 카드에 쓰는 동종업체다. 같은 업종에서 고른다.

## 3. `data/<코드>/report.json` 작성

웹 검색으로 조사한다. 목표주가 컨센서스, 최근 실적, 호재·악재.

> **확인 못 한 값은 넣지 않는다.** `rangeLo`/`rangeHi`, `rating` 등은 없어도 되고,
> 앱이 해당 줄을 알아서 감춘다. 없는 숫자를 지어내면 안 된다.
> (하이닉스는 평균 목표가만 확인돼 그것만 넣었다)

문체는 `CLAUDE.md` 의 문체 규칙을 따른다 — 해요체, 전문용어 금지, 투자 권유 표현 금지.

## 4. 데이터 파일 생성

```
node scripts/update_daily.js
```

등록된 모든 종목을 순회하며 `prices`·`predictions`·`flow`·`market` 을 만든다.
한 종목이 실패해도 나머지는 계속 진행된다.

## 5. 검증하고 배포

```
node scripts/verify/preflight.js
```

그다음 `verify-app` 스킬로 브라우저 검증. 특히 **새 종목의 화면 숫자가 그 종목 것인지** 확인한다.

`index.html` 을 고쳤다면 `sw.js` 의 `CACHE` 버전을 올린다.

## 6. 기록

`.claude/WORKLOG.md` 에 추가한 종목과 산출된 상수를 적는다.
나중에 "이 숫자 어디서 나왔지?" 를 답할 수 있어야 한다.

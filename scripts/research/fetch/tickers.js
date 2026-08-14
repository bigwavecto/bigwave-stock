/**
 * 조사 대상 종목 목록 — 수집(fetch_factors.js)과 상수 산출(symbol_stats.js)이 함께 쓴다.
 *
 * 두 곳에 따로 적어 두면 한쪽만 고쳤을 때 "수집은 됐는데 상수가 안 나온다"가 된다.
 * 종목을 추가할 때 **여기만** 고치면 된다.
 *
 * key   : factors.json 안에서 쓰는 이름
 * peer  : 시장 동조 카드에서 견줄 상대. 앱에 등록된 종목이 아니어도 된다.
 */
const SYMBOLS = [
  { key: 'samsung',  code: '005930', name: '삼성전자',        yahoo: '005930.KS',
    category: 'AI 반도체·부품', peer: { code: '000660', name: 'SK하이닉스',   yahoo: '000660.KS' } },
  { key: 'hynix',    code: '000660', name: 'SK하이닉스',      yahoo: '000660.KS',
    category: 'AI 반도체·부품', peer: { code: '005930', name: '삼성전자',     yahoo: '005930.KS' } },
  { key: 'hanmi',    code: '042700', name: '한미반도체',      yahoo: '042700.KS',
    category: 'AI 반도체·부품', peer: { code: '000660', name: 'SK하이닉스',   yahoo: '000660.KS' } },
  { key: 'isu',      code: '007660', name: '이수페타시스',    yahoo: '007660.KS',
    category: 'AI 반도체·부품', peer: { code: '042700', name: '한미반도체',   yahoo: '042700.KS' } },
  { key: 'hdelec',   code: '267260', name: 'HD현대일렉트릭',  yahoo: '267260.KS',
    category: 'AI 전력·인프라', peer: { code: '010120', name: 'LS ELECTRIC', yahoo: '010120.KS' } },
  { key: 'lselec',   code: '010120', name: 'LS ELECTRIC',    yahoo: '010120.KS',
    category: 'AI 전력·인프라', peer: { code: '267260', name: 'HD현대일렉트릭', yahoo: '267260.KS' } },
  { key: 'naver',    code: '035420', name: 'NAVER',          yahoo: '035420.KS',
    category: 'AI 플랫폼',      peer: { code: '035720', name: '카카오',       yahoo: '035720.KS' } },
];

/* 시장·거시 계열 — 종목이 아니라 비교 기준이다 */
const MARKET = {
  kospi:  '%5EKS11',      // 코스피
  usdkrw: 'KRW=X',        // 원/달러
  nasdaq: '%5EIXIC',      // 나스닥
  vix:    '%5EVIX',       // 변동성지수
  sox:    '%5ESOX',       // 필라델피아 반도체지수
  tsmc:   'TSM',          // TSMC (미국 상장)
};

module.exports = { SYMBOLS, MARKET };

/**
 * update_daily.js — 매일 자동 실행되는 데이터 갱신 스크립트 (GitHub Actions용)
 *
 * 하는 일:
 *  1. 야후 파이낸스에서 삼성전자(005930.KS) 최근 1년 시세를 받아 data/prices.json 저장
 *  2. 앱과 동일한 예측 모델로 향후 20거래일 범위를 계산해 data/predictions.json에 누적 저장
 *     (이미 그날 예측이 있으면 덮어쓰지 않음 → 예측-실제 비교의 공정성 유지)
 *  3. 수급(외국인·기관 순매수) → data/flow.json      [실패해도 전체는 계속 진행]
 *  4. 시장 동조 지표(코스피·하이닉스·SOX) → data/market.json  [실패해도 계속 진행]
 *
 * 3·4는 "맥락 정보"이고 예측에는 쓰이지 않는다. 비공식 경로라 언제든 깨질 수 있으므로
 * 실패해도 기존 파일을 남기고 넘어간다. 앱은 파일이 없거나 오래되면 해당 카드만 감춘다.
 *
 * 주의: 이 파일의 예측 모델(상수·수식)은 index.html의 makeForecast와 반드시 동일해야 합니다.
 *       모델을 바꾸려면 두 곳을 함께 수정하세요.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/005930.KS?range=1y&interval=1d';
// 한국 증시 휴장일 (매년 연말에 다음 해 휴장일 추가 필요)
const KR_HOLIDAYS = ['2026-08-17','2026-09-24','2026-09-25','2026-10-05','2026-10-09','2026-12-25','2026-12-31','2027-01-01','2027-02-16','2027-02-17','2027-02-18','2027-03-01'];

async function fetchPrices(){
  const r = await fetch(YAHOO_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if(!r.ok) throw new Error('야후 응답 오류: ' + r.status);
  const d = await r.json();
  const res = d.chart.result[0];
  const ts = res.timestamp, q = res.indicators.quote[0];
  const rows = [];
  for(let i=0;i<ts.length;i++){
    if(q.close[i]==null) continue;
    rows.push({ d: new Date(ts[i]*1000).toISOString().slice(0,10), c: Math.round(q.close[i]), v: q.volume[i] ? +(q.volume[i]/1e6).toFixed(1) : 0 });
  }
  if(rows.length < 100) throw new Error('데이터가 너무 적음: ' + rows.length);
  return rows;
}

function sma(arr,n){ if(arr.length<n) return null; let s=0; for(let k=arr.length-n;k<arr.length;k++)s+=arr[k]; return s/n; }
function stdev(a){ const m=a.reduce((x,y)=>x+y,0)/a.length; return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/a.length); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* ── 수급: 네이버 금융 외국인·기관 매매동향 ──
 * 이 페이지의 수량은 액면분할(2018-05, 50:1) 미조정이다. 절대 수량을 그대로 비교하면
 * 2018년 이전과 어긋나므로, 앱에서는 반드시 "거래량 대비 비율"로만 쓴다.
 * 페이지당 20거래일. 매일 1페이지만 받아 기존 파일에 누적한다. */
async function fetchFlow(){
  const r = await fetch('https://finance.naver.com/item/frgn.naver?code=005930&page=1', { headers: { 'User-Agent': UA } });
  if(!r.ok) throw new Error('네이버 응답 오류: ' + r.status);
  const html = await r.text();
  const out = [];
  for(const tr of html.match(/<tr[\s\S]*?<\/tr>/g) || []){
    if(!/\d{4}\.\d{2}\.\d{2}/.test(tr)) continue;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim());
    if(cells.length < 9) continue;
    const n = s => { const v = +String(s).replace(/[,%\s+]/g,''); return isFinite(v) ? v : null; };
    // 0날짜 1종가 2전일비 3등락률 4거래량 5기관순매매 6외국인순매매 7외국인보유주수 8외국인보유율
    const row = { d: cells[0].replace(/\./g,'-'), vol: n(cells[4]), org: n(cells[5]), frn: n(cells[6]), hold: n(cells[8]) };
    if(row.vol && row.org != null && row.frn != null) out.push(row);
  }
  if(out.length < 5) throw new Error('수급 파싱 실패 (구조 변경 의심): ' + out.length + '행');
  return out;
}

/* ── 시장 동조 지표: 코스피·SK하이닉스·필라델피아 반도체지수 ──
 * 삼성전자 +5% 이상 상승일의 84%가 코스피 동반 상승이었다. 개별 재료보다 시장·업종이
 * 큰 움직임을 더 많이 설명하므로, 얼마나 함께 움직이고 있는지를 보여준다. */
async function fetchMarket(samsungRows){
  const syms = { kospi:'%5EKS11', hynix:'000660.KS', sox:'%5ESOX' };
  const series = {};
  for(const [k, s] of Object.entries(syms)){
    try{
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?range=6mo&interval=1d`, { headers: { 'User-Agent': UA } });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), res = j.chart.result[0], q = res.indicators.quote[0];
      const m = {};
      for(let i=0;i<res.timestamp.length;i++){
        if(q.close[i]==null) continue;
        m[new Date(res.timestamp[i]*1000).toISOString().slice(0,10)] = q.close[i];
      }
      series[k] = m;
    }catch(e){ console.log('  시장지표', k, '실패:', e.message); }
  }
  // 최근 60거래일 일간 수익률 상관 (삼성 거래일 기준, 값이 없는 날은 건너뜀)
  const sd = samsungRows.slice(-61);
  const corrOf = m => {
    const xs=[], ys=[];
    for(let i=1;i<sd.length;i++){
      const a = m[sd[i].d], b = m[sd[i-1].d];
      if(a==null||b==null) continue;
      xs.push(Math.log(sd[i].c/sd[i-1].c)); ys.push(Math.log(a/b));
    }
    if(xs.length < 20) return null;
    const mx=xs.reduce((s,v)=>s+v,0)/xs.length, my=ys.reduce((s,v)=>s+v,0)/ys.length;
    let sxy=0,sxx=0,syy=0;
    for(let i=0;i<xs.length;i++){ sxy+=(xs[i]-mx)*(ys[i]-my); sxx+=(xs[i]-mx)**2; syy+=(ys[i]-my)**2; }
    return sxx&&syy ? +(sxy/Math.sqrt(sxx*syy)).toFixed(3) : null;
  };
  const last1 = m => {
    const ks = Object.keys(m).sort();
    if(ks.length < 2) return null;
    return +((m[ks[ks.length-1]]/m[ks[ks.length-2]]-1)*100).toFixed(2);
  };
  const out = {};
  for(const k of Object.keys(series)) out[k] = { corr60: corrOf(series[k]), chg1: last1(series[k]) };
  if(!Object.keys(out).length) throw new Error('시장지표 전부 실패');
  return out;
}

function nextBusinessDays(fromDate, n){
  const [y,m,dd]=fromDate.split('-').map(Number);
  const d=new Date(Date.UTC(y,m-1,dd));
  const out=[];
  while(out.length<n){
    d.setUTCDate(d.getUTCDate()+1);
    const dow=d.getUTCDay(); const ds=d.toISOString().slice(0,10);
    if(dow===0||dow===6||KR_HOLIDAYS.includes(ds)) continue;
    out.push(ds);
  }
  return out;
}

/* 예측 모델 v2 — index.html의 makeForecast와 동일해야 한다.
 *
 * 방향을 예측하지 않고 변동 범위만 낸다. 이전의 방향 예측 모델은 10년 2,385회 백테스트에서
 * 랜덤워크("며칠 뒤에도 오늘 가격")보다 모든 기간에서 부정확했고(5일 3.34% vs 3.24%),
 * 방향 적중률 47.7%로 동전 던지기 이하였다. 32개 요인을 넣어도 예측력이 없었다.
 * 반면 변동성은 예측 가능하므로 범위만 남겼다. 자세한 근거는 index.html의 주석 참조.
 */
const FC_DAYS = 20;   // 1개월치까지 저장 → 앱에서 1주/2주/1개월로 잘라 쓴다
// 80% 구간 계수 = 정규분포값 1.2816 × 1.05 보정.
// 두꺼운 꼬리 탓에 정규 가정만으로는 구간이 좁다. 10년 검증에서 보정 전 적중률
// 79.0/78.6/77.8% → 보정 후 80.5/80.3/80.2%. index.html과 반드시 동일해야 한다.
const FC_Z80  = 1.2816 * 1.05;

// 20·60·250일 변동성 혼합 — 폭은 그대로면서 구간 적중률이 더 높다
function blendedVol(rets){
  const vars = [20,60,250].map(n=>{
    const w = rets.slice(-Math.min(n, rets.length));
    return Math.pow(stdev(w), 2);
  });
  return Math.sqrt(vars.reduce((a,b)=>a+b,0)/vars.length);
}

function makeForecast(rows){
  const closes = rows.map(p=>p.c);
  const last = closes[closes.length-1];
  const rets=[]; for(let i=1;i<closes.length;i++) rets.push(Math.log(closes[i]/closes[i-1]));
  const vol = blendedVol(rets);
  const days = nextBusinessDays(rows[rows.length-1].d, FC_DAYS);
  const pts = days.map((ds,i)=>{
    const t=i+1;
    const band = FC_Z80*vol*Math.sqrt(t);
    // v는 중심값. 방향을 예측하지 않으므로 오늘 종가 그대로다.
    return { d:ds, v:last, lo:Math.round(last*Math.exp(-band)), hi:Math.round(last*Math.exp(band)) };
  });
  return { pts, vol };
}

(async ()=>{
  // 1) 시세 갱신
  const rows = await fetchPrices();
  const lastDate = rows[rows.length-1].d;
  fs.writeFileSync(path.join(DATA_DIR,'prices.json'), JSON.stringify({ updated: lastDate, rows }, null, 0));
  console.log('prices.json 갱신 완료:', rows.length, '일치, 최종', lastDate, rows[rows.length-1].c + '원');

  // 2) 예측 추가 (그날 예측이 없을 때만)
  const predPath = path.join(DATA_DIR,'predictions.json');
  let preds = {};
  try{ preds = JSON.parse(fs.readFileSync(predPath,'utf8')); }catch(e){}
  if(!preds[lastDate]){
    const { pts, vol } = makeForecast(rows);
    // m: 모델 버전. 1 = 방향 예측(폐기), 2 = 범위 + 임계값 확률.
    // vol을 남겨야 임계값 확률 예보를 나중에 그대로 재현해 채점할 수 있다.
    // 기존 기록은 절대 고치지 않는다.
    preds[lastDate] = { madeOn: new Date().toISOString().slice(0,10), base: rows[rows.length-1].c, m: 2, vol: +vol.toFixed(6), pts };
    fs.writeFileSync(predPath, JSON.stringify(preds, null, 1));
    const p5 = pts[4], p20 = pts[19];
    console.log('predictions.json에', lastDate, '범위 추가 | 1주', p5.lo+'~'+p5.hi, '| 1개월', p20.lo+'~'+p20.hi,
      '| 변동성 연', (vol*Math.sqrt(252)*100).toFixed(0)+'%');
  } else {
    console.log(lastDate, '예측은 이미 존재 — 건너뜀');
  }

  // 3) 수급 (실패해도 전체는 계속) — 최근 250거래일만 유지
  try{
    const flowPath = path.join(DATA_DIR,'flow.json');
    let prev = { rows: [] };
    try{ prev = JSON.parse(fs.readFileSync(flowPath,'utf8')); }catch(e){}
    const merged = {};
    (prev.rows||[]).forEach(r=>{ merged[r.d] = r; });
    (await fetchFlow()).forEach(r=>{ merged[r.d] = r; });
    const rows2 = Object.values(merged).sort((a,b)=>a.d.localeCompare(b.d)).slice(-250);
    fs.writeFileSync(flowPath, JSON.stringify({ updated: rows2[rows2.length-1].d, rows: rows2 }, null, 0));
    console.log('flow.json 갱신 완료:', rows2.length, '일치, 최종', rows2[rows2.length-1].d);
  }catch(e){ console.log('flow.json 갱신 실패(무시하고 계속):', e.message); }

  // 4) 시장 동조 지표 (실패해도 전체는 계속)
  try{
    const mk = await fetchMarket(rows);
    fs.writeFileSync(path.join(DATA_DIR,'market.json'), JSON.stringify({ updated: lastDate, ...mk }, null, 0));
    console.log('market.json 갱신 완료:', Object.entries(mk).map(([k,v])=>k+' 상관 '+v.corr60).join(', '));
  }catch(e){ console.log('market.json 갱신 실패(무시하고 계속):', e.message); }
})().catch(e=>{ console.error('실패:', e.message); process.exit(1); });

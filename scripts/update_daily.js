/**
 * update_daily.js — 매일 자동 실행되는 데이터 갱신 스크립트 (GitHub Actions용)
 *
 * 하는 일:
 *  1. 야후 파이낸스에서 삼성전자(005930.KS) 최근 1년 시세를 받아 data/prices.json 저장
 *  2. 앱과 동일한 예측 모델로 향후 5거래일을 계산해 data/predictions.json에 누적 저장
 *     (이미 그날 예측이 있으면 덮어쓰지 않음 → 예측-실제 비교의 공정성 유지)
 *
 * 주의: 이 파일의 예측 모델(가중치·상수)은 index.html의 makeForecast와 반드시 동일해야 합니다.
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
const FC_Z80  = 1.2816;

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
  return days.map((ds,i)=>{
    const t=i+1;
    const band = FC_Z80*vol*Math.sqrt(t);
    // v는 중심값. 방향을 예측하지 않으므로 오늘 종가 그대로다.
    return { d:ds, v:last, lo:Math.round(last*Math.exp(-band)), hi:Math.round(last*Math.exp(band)) };
  });
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
    const pts = makeForecast(rows);
    // m: 모델 버전. 1 = 방향 예측(폐기), 2 = 범위. 기존 기록은 절대 고치지 않는다.
    preds[lastDate] = { madeOn: new Date().toISOString().slice(0,10), base: rows[rows.length-1].c, m: 2, pts };
    fs.writeFileSync(predPath, JSON.stringify(preds, null, 1));
    const p5 = pts[4], p20 = pts[19];
    console.log('predictions.json에', lastDate, '범위 추가 | 1주', p5.lo+'~'+p5.hi, '| 1개월', p20.lo+'~'+p20.hi);
  } else {
    console.log(lastDate, '예측은 이미 존재 — 건너뜀');
  }
})().catch(e=>{ console.error('실패:', e.message); process.exit(1); });

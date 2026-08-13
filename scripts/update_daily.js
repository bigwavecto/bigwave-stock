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

// index.html의 makeForecast와 동일한 모델
function makeForecast(rows, targetPrice){
  const closes = rows.map(p=>p.c);
  const last = closes[closes.length-1];
  const rets=[]; for(let i=1;i<closes.length;i++) rets.push(Math.log(closes[i]/closes[i-1]));
  const alpha=2/11; let mom=0;
  rets.slice(-10).forEach(r=>{ mom = alpha*r + (1-alpha)*mom; });
  const s20 = sma(closes,20);
  const rev = s20 ? 0.06*Math.log(s20/last) : 0;
  const ana = Math.log(targetPrice/last)/252;
  let drift = 0.4*mom + 0.3*rev + 0.3*ana;
  drift = Math.max(-0.015, Math.min(0.015, drift));
  const vol = stdev(rets.slice(-20));
  const days = nextBusinessDays(rows[rows.length-1].d, 5);
  return days.map((ds,i)=>{
    const t=i+1;
    const band = 1.2816*vol*Math.sqrt(t);
    return { d:ds, v:Math.round(last*Math.exp(drift*t)), lo:Math.round(last*Math.exp(drift*t-band)), hi:Math.round(last*Math.exp(drift*t+band)) };
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
    const report = JSON.parse(fs.readFileSync(path.join(DATA_DIR,'report.json'),'utf8'));
    const pts = makeForecast(rows, report.consensus.target);
    preds[lastDate] = { madeOn: new Date().toISOString().slice(0,10), base: rows[rows.length-1].c, pts };
    fs.writeFileSync(predPath, JSON.stringify(preds, null, 1));
    console.log('predictions.json에', lastDate, '예측 추가:', pts.map(p=>p.d+'→'+p.v).join(', '));
  } else {
    console.log(lastDate, '예측은 이미 존재 — 건너뜀');
  }
})().catch(e=>{ console.error('실패:', e.message); process.exit(1); });

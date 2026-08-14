/**
 * 서비스 워커 — 오프라인에서도 앱이 열리게 한다.
 *
 * 전략
 *  - 껍데기(HTML·Chart.js·아이콘): 캐시 우선. 버전이 바뀌면 통째로 갈아끼운다.
 *  - 데이터(data/*.json): 네트워크 우선, 실패하면 캐시. 매일 바뀌는 값이라 항상 최신을 먼저 시도한다.
 *  - 앱이 데이터에 ?t=타임스탬프를 붙여 요청하므로, 캐시 키는 쿼리를 떼고 저장·조회한다.
 *    (안 그러면 오프라인일 때 캐시를 절대 못 찾는다)
 *
 * 화면 파일(index.html·report.html)을 고치면 CACHE 버전을 반드시 올릴 것.
 * 안 올리면 사용자가 옛 화면을 계속 본다.
 */
const CACHE = 'ssn-multi-v8';

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

const stripQuery = url => { const u = new URL(url); u.search = ''; return u.toString(); };
const isData = url => new URL(url).pathname.includes('/data/');

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 하나라도 실패하면 설치 전체가 실패하므로 개별로 담는다
    await Promise.all(SHELL.map(u => c.add(u).catch(err => console.warn('[sw] 캐시 실패', u, err))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 다른 도메인(야후·네이버 등) 요청은 건드리지 않는다 — 실패하면 앱이 알아서 폴백한다
  if (url.origin !== self.location.origin) return;

  // 데이터: 네트워크 우선
  if (isData(req.url)) {
    e.respondWith((async () => {
      const key = stripQuery(req.url);
      try {
        const res = await fetch(req);
        if (res && res.ok) (await caches.open(CACHE)).put(key, res.clone());
        return res;
      } catch (err) {
        const hit = await caches.match(key);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  // 화면(HTML): 네트워크 우선 — 매일 갱신되므로 최신을 먼저 본다.
  // 캐시 키는 **주소별로** 따로 잡는다. 예전에는 모든 화면을 './index.html' 한 자리에
  // 저장하고 오프라인에서도 항상 그것을 돌려줬다. 페이지가 하나일 때는 문제가 없었지만
  // 랜딩이 생기면서 서로를 덮어썼다 — 오프라인에서 /를 열면 리포트가 떴다.
  // 폴백 순서: 그 주소 → 랜딩 → 루트.
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

  // 나머지 정적 파일: 캐시 우선
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  })());
});

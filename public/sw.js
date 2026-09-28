// 離線快取：開過一次之後，沒有網路也能打開提詞機。
// 頁面本身採「網路優先」（有網路就拿最新版），打包後的 JS／CSS 檔名含 hash、內容不會變，採「快取優先」。
// 版本變更時會清掉舊快取（v1 曾把所有頁面都存在首頁的位置）
const CACHE = 'tai-v2'
const SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-180.png']
const NETWORK_TIMEOUT = 3000

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(SHELL)
      // 第一次開啟時 Service Worker 還沒接手，順便把頁面引用的 JS／CSS 存起來
      const html = await (await cache.match('./')).text()
      const assets = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) => m[1])
      await cache.addAll(assets)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req))
  } else {
    event.respondWith(cacheFirst(req))
  }
})

async function networkFirst(req) {
  const cache = await caches.open(CACHE)
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT)),
    ])
    // 每個頁面各存各的位置，避免隱私權頁蓋掉提詞機首頁
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) ?? (await cache.match('./')) ?? Response.error()
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req, { ignoreSearch: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) cache.put(req, res.clone())
  return res
}

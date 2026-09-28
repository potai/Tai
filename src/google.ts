// 從 Google 文件匯入腳本。
//
// 流程：Google 登入（OAuth 重新導向，iPhone「加入主畫面」模式下也能用）→ Google Picker 選文件
// → Drive API 匯出成文字。只申請 drive.file 權限：App 只能讀使用者在 Picker 裡親自選過的文件，
// 看不到雲端硬碟裡的其他檔案。
//
// 下面三個值由 Google Cloud 專案產生，本來就會出現在網頁原始碼中，不是密碼：
// API 金鑰已限制只能從本站網址使用，登入也只接受本站的重新導向網址。

export const GOOGLE_CONFIG = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? '',
  /** Google Cloud 專案編號（Picker 用來辨識是哪個 App） */
  appId: import.meta.env.VITE_GOOGLE_APP_ID ?? '',
}

export const googleEnabled = Boolean(GOOGLE_CONFIG.clientId && GOOGLE_CONFIG.apiKey && GOOGLE_CONFIG.appId)

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_KEY = 'tai.google.token'
const PENDING_KEY = 'tai.google.pending'

export type GoogleAction = { type: 'pick' } | { type: 'reload'; id: string }

export interface LinkedDoc {
  id: string
  name: string
  /** 上次讀取的時間（毫秒） */
  loadedAt: number
}

// ---------- 登入 ----------

function redirectUri(): string {
  return location.origin + location.pathname
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 目前還有效的 access token；沒有或快過期時回傳 null */
export function currentToken(): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null')
    if (saved && saved.expiresAt - 60_000 > Date.now()) return saved.token
  } catch {
    // 忽略
  }
  return null
}

/** 前往 Google 登入，回來之後由 consumeAuthRedirect() 繼續執行 action */
export function signIn(action: GoogleAction): void {
  const state = randomState()
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, action }))
  const params = new URLSearchParams({
    client_id: GOOGLE_CONFIG.clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
  })
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

/**
 * 處理 Google 登入後導回本站時網址上的 #access_token=...。
 * 回傳登入前想做的動作；不是登入回來的網址時回傳 null。
 */
export function consumeAuthRedirect(): { action: GoogleAction } | { error: string } | null {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))
  if (!params.has('access_token') && !params.has('error')) return null
  history.replaceState(null, '', location.pathname + location.search)

  let pending: { state: string; action: GoogleAction } | null = null
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null')
  } catch {
    // 忽略
  }
  sessionStorage.removeItem(PENDING_KEY)

  if (!pending || params.get('state') !== pending.state) return { error: '登入驗證失敗，請再試一次。' }
  if (params.has('error')) {
    return { error: params.get('error') === 'access_denied' ? '已取消 Google 登入。' : 'Google 登入失敗，請再試一次。' }
  }

  const expiresIn = Number(params.get('expires_in') ?? 3600)
  sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ token: params.get('access_token'), expiresAt: Date.now() + expiresIn * 1000 }),
  )
  return { action: pending.action }
}

// ---------- 選文件 ----------

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error('無法載入 Google 元件，請確認網路連線。'))
    document.head.appendChild(el)
  })
}

let pickerReady: Promise<void> | null = null
function loadPicker(): Promise<void> {
  pickerReady ??= loadScript('https://apis.google.com/js/api.js').then(
    () => new Promise<void>((resolve) => window.gapi.load('picker', () => resolve())),
  )
  return pickerReady
}

/** 開啟 Google Picker，回傳使用者選的文件；取消時回傳 null */
export async function pickDocument(token: string): Promise<{ id: string; name: string } | null> {
  await loadPicker()
  const picker = window.google.picker
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCUMENTS).setMode(picker.DocsViewMode.LIST)
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_CONFIG.apiKey)
      .setAppId(GOOGLE_CONFIG.appId)
      // 告訴 Picker 外層網頁的網址；API 金鑰設了「網站限制」時，Google 靠這個確認請求來自本站
      .setOrigin(location.origin)
      .setLocale('zh-TW')
      .setTitle('選擇腳本文件')
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          const doc = data.docs[0]
          resolve({ id: doc.id, name: doc.name })
        } else if (data.action === picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
      .setVisible(true)
  })
}

// ---------- 讀取內容 ----------

export class TokenExpiredError extends Error {}

/** 把 Google 文件匯出成文字；優先用 Markdown，保留標題結構 */
export async function fetchDocumentText(token: string, id: string): Promise<{ name: string; text: string }> {
  const api = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`
  const headers = { Authorization: `Bearer ${token}` }

  const meta = await fetch(`${api}?fields=name`, { headers })
  if (meta.status === 401) throw new TokenExpiredError()
  if (meta.status === 404) throw new Error('找不到這份文件，可能已被刪除，或需要重新從 Google 文件選擇。')
  if (!meta.ok) throw new Error(`讀取文件失敗（${meta.status}）`)
  const { name } = await meta.json()

  for (const mimeType of ['text/markdown', 'text/plain']) {
    const res = await fetch(`${api}/export?mimeType=${encodeURIComponent(mimeType)}`, { headers })
    if (res.status === 401) throw new TokenExpiredError()
    if (res.ok) return { name, text: await res.text() }
  }
  throw new Error('無法匯出這份文件，請確認它是 Google 文件格式。')
}

// 從 Google 文件匯入腳本。
//
// 流程：貼上 Google 文件連結 → Google 登入（OAuth 重新導向，iPhone「加入主畫面」模式下也能用）
// → 用 Google Docs API 讀取文件內容。
//
// 不使用 Google Picker：Picker 是嵌在頁面裡的 Google 視窗，iPhone 的瀏覽器預設會擋它的登入 Cookie，
// 會出現「無法存取你的 Google 帳戶」。
//
// 用戶端 ID 本來就會出現在網頁原始碼中，不是密碼；登入只接受本站的重新導向網址。

import type { GoogleDocument } from './gdoc'
import { documentToText } from './gdoc'

export const GOOGLE_CONFIG = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
}

export const googleEnabled = Boolean(GOOGLE_CONFIG.clientId)

// 唯讀：只能讀取 Google 文件，不能修改或刪除
const SCOPE = 'https://www.googleapis.com/auth/documents.readonly'
const TOKEN_KEY = 'tai.google.token'
const PENDING_KEY = 'tai.google.pending'

export type GoogleAction = { type: 'load'; id: string }

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
    if (saved && saved.scope === SCOPE && saved.expiresAt - 60_000 > Date.now()) return saved.token
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
  if (!(params.get('scope') ?? '').split(' ').includes(SCOPE)) {
    return { error: '需要允許「查看你的 Google 文件」才能匯入，請再試一次並勾選權限。' }
  }

  const expiresIn = Number(params.get('expires_in') ?? 3600)
  sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({ token: params.get('access_token'), scope: SCOPE, expiresAt: Date.now() + expiresIn * 1000 }),
  )
  return { action: pending.action }
}

// ---------- 讀取內容 ----------

export class TokenExpiredError extends Error {}

export async function fetchDocumentText(token: string, id: string): Promise<{ name: string; text: string }> {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new TokenExpiredError()
  if (res.status === 403) throw new Error('你的 Google 帳號沒有這份文件的檢視權限，請確認登入的帳號是否正確。')
  if (res.status === 404) throw new Error('找不到這份文件，請確認連結是否正確，或文件是否已被刪除。')
  if (!res.ok) throw new Error(`讀取文件失敗（${res.status}）`)
  const doc: GoogleDocument = await res.json()
  return { name: doc.title ?? '未命名文件', text: documentToText(doc) }
}

// 把腳本壓縮後放進網址的 hash（#s=...），hash 不會送到伺服器，腳本內容只存在連結本身。
// 格式：第一個字元是編碼方式，z = deflate-raw 壓縮，u = 未壓縮（瀏覽器不支援 CompressionStream 時）

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeScript(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  if (typeof CompressionStream === 'function') {
    return 'z' + toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))
  }
  return 'u' + toBase64Url(bytes)
}

export async function decodeScript(code: string): Promise<string> {
  const kind = code[0]
  const bytes = fromBase64Url(code.slice(1))
  if (kind === 'z') return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')))
  if (kind === 'u') return new TextDecoder().decode(bytes)
  throw new Error('無法辨識的分享連結')
}

/** 從網址 hash 取出分享的腳本代碼 */
export function readShareCode(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get('s')
}

export async function buildShareUrl(text: string, base: string): Promise<string> {
  const url = new URL(base)
  url.hash = 's=' + (await encodeScript(text))
  return url.toString()
}

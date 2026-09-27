import { describe, expect, it } from 'vitest'
import { buildShareUrl, decodeScript, encodeScript, readShareCode } from './share'
import { SAMPLE_SCRIPT } from './script'

describe('share links', () => {
  it('round-trips Chinese text through compression', async () => {
    const code = await encodeScript(SAMPLE_SCRIPT)
    expect(code[0]).toBe('z')
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await decodeScript(code)).toBe(SAMPLE_SCRIPT)
  })

  it('decodes the uncompressed fallback format', async () => {
    const bytes = new TextEncoder().encode('阿明：你好')
    const code = 'u' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(await decodeScript(code)).toBe('阿明：你好')
  })

  it('builds a URL whose hash can be read back', async () => {
    const url = await buildShareUrl('小美：嗨', 'https://potai.github.io/Tai/?x=1#old')
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/Tai/')
    expect(await decodeScript(readShareCode(parsed.hash)!)).toBe('小美：嗨')
  })

  it('rejects unknown formats and ignores hashes without a script', async () => {
    await expect(decodeScript('xabc')).rejects.toThrow()
    expect(readShareCode('#foo=1')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { inlineSegments, parseScript, visibleBlocks } from './script'

describe('parseScript', () => {
  it('parses speakers with full-width and half-width colons', () => {
    const { blocks, roles } = parseScript('阿明：你好\n小美: 嗨')
    expect(roles).toEqual(['阿明', '小美'])
    expect(blocks.map((b) => [b.speaker, b.text])).toEqual([
      ['阿明', '你好'],
      ['小美', '嗨'],
    ])
  })

  it('joins unprefixed lines to the previous speaker until a blank line', () => {
    const { blocks } = parseScript('阿明：第一句\n第二句\n\n旁白文字')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ kind: 'line', speaker: '阿明', text: '第一句\n第二句' })
    expect(blocks[1]).toMatchObject({ kind: 'note', speaker: null, text: '旁白文字' })
  })

  it('treats whole-line parentheses as stage cues', () => {
    const { blocks } = parseScript('（兩人坐定）\n阿明：開始')
    expect(blocks[0]).toMatchObject({ kind: 'cue', text: '（兩人坐定）' })
    expect(blocks[1]).toMatchObject({ kind: 'line', speaker: '阿明' })
  })

  it('does not mistake a sentence with a colon for a speaker', () => {
    const { blocks, roles } = parseScript('阿明：他跟我說，重點是：要自然')
    expect(roles).toEqual(['阿明'])
    expect(blocks[0].text).toBe('他跟我說，重點是：要自然')

    const narration = parseScript('他說，重點是：要自然')
    expect(narration.roles).toEqual([])
    expect(narration.blocks[0].kind).toBe('note')
  })
})

describe('visibleBlocks', () => {
  const { blocks } = parseScript('阿明：一\n小美：二\n（動作）\n阿明：三\n阿明：四')

  it('returns everything in dialogue mode', () => {
    expect(visibleBlocks(blocks, null)).toBe(blocks)
  })

  it('keeps only the chosen role and attaches the other speaker cue', () => {
    const out = visibleBlocks(blocks, '阿明', { showCue: true })
    expect(out.map((b) => b.text)).toEqual(['一', '三', '四'])
    expect(out[0].cueBefore).toBeUndefined()
    expect(out[1].cueBefore).toBe('小美：二')
    expect(out[2].cueBefore).toBeUndefined()
  })

  it('omits cues when disabled and truncates long cues', () => {
    expect(visibleBlocks(blocks, '阿明', { showCue: false })[1].cueBefore).toBeUndefined()
    const long = parseScript('小美：一二三四五六七八九十\n阿明：好')
    expect(visibleBlocks(long.blocks, '阿明', { showCue: true, cueLength: 4 })[0].cueBefore).toBe('小美：…七八九十')
  })
})

describe('inlineSegments', () => {
  it('splits emphasis and asides', () => {
    expect(inlineSegments('我**真的**覺得（笑）不錯')).toEqual([
      { type: 'text', text: '我' },
      { type: 'em', text: '真的' },
      { type: 'text', text: '覺得' },
      { type: 'aside', text: '（笑）' },
      { type: 'text', text: '不錯' },
    ])
  })
})

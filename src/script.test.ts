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

// 模擬從 Google 文件複製出來的「統一腳本格式」（Markdown 記號、製作資訊、分鏡表都在同一份文件）
const TEMPLATE_DOC = `# **測試短片**

# **A. 製作資訊**

影片名稱：測試短片

主題：禮貌

角色：同學A、同學B

# **D. 正式腳本**

## **第 1 場｜開場（約 30 秒）**

畫面：甲抱著書排隊；乙跑來。

小熊：借過借過，我很趕\\!

小兔：(皺眉)等一下，我的書掉了。

## **第 2 場｜收尾（約 20 秒）**

**兩人：同學們，我們下次見\\!**

# **E. 分鏡表**

| 鏡號 | 秒數 |
備註：這行不應該出現`

describe('template documents', () => {
  const { blocks, roles } = parseScript(TEMPLATE_DOC)

  it('reads only the script section and ignores metadata labels', () => {
    expect(roles).toEqual(['小熊', '小兔'])
    expect(blocks.map((b) => b.kind)).toEqual(['scene', 'cue', 'line', 'line', 'scene', 'line'])
    expect(blocks.some((b) => b.text.includes('這行不應該出現'))).toBe(false)
  })

  it('cleans markdown and treats 畫面 as a stage cue', () => {
    expect(blocks[0].text).toBe('第 1 場｜開場（約 30 秒）')
    expect(blocks[1]).toMatchObject({ kind: 'cue', speaker: null, text: '甲抱著書排隊；乙跑來。' })
    expect(blocks[2].text).toBe('借過借過，我很趕!')
  })

  it('marks 兩人 lines as ensemble and shows them in every single-role view', () => {
    expect(blocks[5]).toMatchObject({ speaker: '兩人', ensemble: true, text: '同學們，我們下次見!' })
    const bear = visibleBlocks(blocks, '小熊', { showCue: true })
    expect(bear.map((b) => b.kind)).toEqual(['scene', 'line', 'scene', 'line'])
    expect(bear[3].speaker).toBe('兩人')
    expect(bear[3].cueBefore).toBe('小兔：(皺眉)等一下，我的書掉了。')
  })

  it('still parses plain scripts without sections', () => {
    expect(parseScript('阿明：你好').roles).toEqual(['阿明'])
  })
})

import { describe, expect, it } from 'vitest'
import type { GoogleDocument } from './gdoc'
import { documentToText, parseDocId, shouldConfirmOverwrite, textFingerprint } from './gdoc'
import { parseScript } from './script'

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd'

describe('parseDocId', () => {
  it('accepts the common Google Docs link shapes', () => {
    expect(parseDocId(`https://docs.google.com/document/d/${ID}/edit?usp=drivesdk`)).toBe(ID)
    expect(parseDocId(`https://docs.google.com/document/u/1/d/${ID}/edit#heading=h.x`)).toBe(ID)
    expect(parseDocId(`  https://docs.google.com/document/d/${ID}  `)).toBe(ID)
    expect(parseDocId(`https://drive.google.com/open?id=${ID}`)).toBe(ID)
    expect(parseDocId(ID)).toBe(ID)
  })

  it('rejects things that are not document links', () => {
    expect(parseDocId('https://example.com/abc')).toBeNull()
    expect(parseDocId('阿明：你好')).toBeNull()
    expect(parseDocId('')).toBeNull()
  })
})

const para = (text: string, style = 'NORMAL_TEXT') => ({
  paragraph: { elements: [{ textRun: { content: text + '\n' } }], paragraphStyle: { namedStyleType: style } },
})

describe('documentToText', () => {
  const doc: GoogleDocument = {
    title: '測試腳本',
    body: {
      content: [
        para('A. 製作資訊', 'HEADING_1'),
        para('影片名稱：測試'),
        para('D. 正式腳本', 'HEADING_1'),
        para('第 1 場｜開場', 'HEADING_2'),
        para('畫面：兩人坐定。'),
        { paragraph: { elements: [{ textRun: { content: '小熊：第一句' } }, { textRun: { content: '\v接著說\n' } }] } },
        para(''),
        para('兩人：再見！'),
        para('E. 分鏡表', 'HEADING_1'),
        {
          table: {
            tableRows: [{ tableCells: [{ content: [para('1')] }, { content: [para('小兔：不該出現')] }] }],
          },
        },
      ],
    },
  }

  it('keeps headings as markdown and soft line breaks as newlines', () => {
    const text = documentToText(doc)
    expect(text).toContain('# D. 正式腳本')
    expect(text).toContain('## 第 1 場｜開場')
    expect(text).toContain('小熊：第一句\n接著說')
    expect(text).toContain('| 1 | 小兔：不該出現 |')
  })

  it('produces text the script parser understands', () => {
    const { blocks, roles } = parseScript(documentToText(doc))
    expect(roles).toEqual(['小熊'])
    expect(blocks.map((b) => [b.kind, b.speaker, b.text])).toEqual([
      ['scene', null, '第 1 場｜開場'],
      ['cue', null, '兩人坐定。'],
      ['line', '小熊', '第一句\n接著說'],
      ['line', '兩人', '再見！'],
    ])
  })
})

describe('shouldConfirmOverwrite', () => {
  const sample = '範例'
  const loaded = '阿明：第一版'
  const fp = textFingerprint(loaded)

  it('does not ask when the script is untouched since the last Google load', () => {
    expect(shouldConfirmOverwrite({ current: loaded, incoming: '阿明：第二版', loadedFingerprint: fp, sample })).toBe(false)
  })

  it('asks when the script was edited on the device', () => {
    expect(shouldConfirmOverwrite({ current: '阿明：現場改過', incoming: '阿明：第二版', loadedFingerprint: fp, sample })).toBe(true)
  })

  it('asks when replacing a pasted script that never came from Google', () => {
    expect(shouldConfirmOverwrite({ current: '小美：手動貼的', incoming: loaded, sample })).toBe(true)
  })

  it('never asks for empty, sample, or identical content', () => {
    expect(shouldConfirmOverwrite({ current: '', incoming: loaded, sample })).toBe(false)
    expect(shouldConfirmOverwrite({ current: sample, incoming: loaded, sample })).toBe(false)
    expect(shouldConfirmOverwrite({ current: '阿明：現場改過', incoming: '阿明：現場改過', loadedFingerprint: fp, sample })).toBe(false)
  })

  it('fingerprints differ for different text', () => {
    expect(textFingerprint('阿明：一')).not.toBe(textFingerprint('阿明：二'))
    expect(textFingerprint(loaded)).toBe(fp)
  })
})

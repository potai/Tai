// Google 文件的純資料處理：從網址取出文件 ID、把 Docs API 回傳的結構轉成腳本文字

/** 從 Google 文件網址（或直接貼上的 ID）取出文件 ID；看不懂時回傳 null */
export function parseDocId(input: string): string | null {
  const text = input.trim()
  const fromUrl = /\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/.exec(text)
  if (fromUrl) return fromUrl[1]
  const fromQuery = /[?&]id=([A-Za-z0-9_-]{20,})/.exec(text)
  if (fromQuery) return fromQuery[1]
  return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : null
}

// Docs API（documents.get）回傳格式中本專案用到的部分
interface TextRun {
  content?: string
}
interface Paragraph {
  elements?: { textRun?: TextRun }[]
  paragraphStyle?: { namedStyleType?: string }
  bullet?: unknown
}
interface StructuralElement {
  paragraph?: Paragraph
  table?: { tableRows?: { tableCells?: { content?: StructuralElement[] }[] }[] }
}
export interface GoogleDocument {
  title?: string
  body?: { content?: StructuralElement[] }
}

const HEADING_PREFIX: Record<string, string> = {
  TITLE: '# ',
  HEADING_1: '# ',
  HEADING_2: '## ',
  HEADING_3: '### ',
  HEADING_4: '#### ',
  HEADING_5: '##### ',
  HEADING_6: '###### ',
}

function paragraphText(p: Paragraph): string {
  const raw = (p.elements ?? []).map((e) => e.textRun?.content ?? '').join('')
  // 文件中的換行（Shift+Enter）是 \v，段落結尾是 \n
  return raw.replace(/\n$/, '').replace(/\v/g, '\n')
}

function elementsToLines(content: StructuralElement[], out: string[]): void {
  for (const el of content) {
    if (el.paragraph) {
      const text = paragraphText(el.paragraph)
      const style = el.paragraph.paragraphStyle?.namedStyleType ?? ''
      const prefix = HEADING_PREFIX[style] ?? (el.paragraph.bullet ? '- ' : '')
      out.push(text ? prefix + text : '')
    } else if (el.table) {
      // 表格（例如分鏡表）轉成一列一行，讓它不會被當成台詞
      for (const row of el.table.tableRows ?? []) {
        const cells = (row.tableCells ?? []).map((cell) => {
          const lines: string[] = []
          elementsToLines(cell.content ?? [], lines)
          return lines.join(' ').trim()
        })
        out.push(`| ${cells.join(' | ')} |`)
      }
      out.push('')
    }
  }
}

/** 把 Docs API 的文件結構轉成和「複製貼上」差不多的文字（標題保留 Markdown 的 #） */
export function documentToText(doc: GoogleDocument): string {
  const lines: string[] = []
  elementsToLines(doc.body?.content ?? [], lines)
  return lines.join('\n')
}

/** 簡單的內容指紋，用來判斷腳本讀進來之後有沒有被改過（不需要加密強度） */
export function textFingerprint(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return `${h.toString(36)}:${text.length}`
}

/**
 * 用 Google 文件內容覆蓋目前腳本前，是否需要先問使用者。
 * 目前的腳本跟上次從 Google 讀進來的版本不同（在手機上改過，或是別處貼上的腳本），
 * 而且新內容又不一樣時，才需要確認。
 */
export function shouldConfirmOverwrite(opts: {
  current: string
  incoming: string
  /** 上次從 Google 讀進來時的指紋；沒有讀過就是 undefined */
  loadedFingerprint?: string
  /** 內建範例腳本，覆蓋它不用問 */
  sample: string
}): boolean {
  const { current, incoming, loadedFingerprint, sample } = opts
  if (current === incoming || current.trim() === '' || current === sample) return false
  return loadedFingerprint === undefined || textFingerprint(current) !== loadedFingerprint
}

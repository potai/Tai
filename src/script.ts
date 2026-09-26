// 腳本格式：
//   阿明：今天我們來聊聊提詞機。
//   小美: 好啊！（笑）
//   （兩人看向鏡頭）          ← 整行括號 = 舞台指示
//   接續上一位的台詞            ← 沒有角色前綴、緊接在台詞下面 = 同一人繼續說
//
// 空行會結束目前這位角色的段落，之後沒有前綴的文字視為旁白。

export type BlockKind = 'line' | 'cue' | 'note'

export interface Block {
  id: number
  kind: BlockKind
  /** 說話的角色；舞台指示與旁白為 null */
  speaker: string | null
  text: string
}

export interface ParsedScript {
  blocks: Block[]
  /** 依出場順序排列的角色 */
  roles: string[]
}

// 角色名稱：1–12 個字，不含空白與句中標點，避免把「他說：好」這類句子誤判成角色
const SPEAKER_RE = /^([^\s:：，,。.!！?？「」『』()（）[\]【】]{1,12})\s*[:：]\s*(.*)$/
const CUE_RE = /^[（(\[【].*[)）\]】]$/

export function parseScript(source: string): ParsedScript {
  const blocks: Block[] = []
  const roles: string[] = []
  let current: Block | null = null
  let id = 0

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()

    if (line === '') {
      current = null
      continue
    }

    if (CUE_RE.test(line)) {
      blocks.push({ id: id++, kind: 'cue', speaker: null, text: line })
      current = null
      continue
    }

    const m = SPEAKER_RE.exec(line)
    if (m) {
      const speaker = m[1]
      if (!roles.includes(speaker)) roles.push(speaker)
      current = { id: id++, kind: 'line', speaker, text: m[2] }
      blocks.push(current)
      continue
    }

    if (current) {
      current.text = current.text ? `${current.text}\n${line}` : line
      continue
    }

    current = { id: id++, kind: 'note', speaker: null, text: line }
    blocks.push(current)
  }

  return { blocks, roles }
}

export interface DisplayBlock extends Block {
  /** 單一角色模式下，前一位角色最後一句的結尾，用來提示「輪到你了」 */
  cueBefore?: string
}

/**
 * 依顯示模式過濾段落。
 * role 為 null = 對話模式（全部顯示）；否則只保留該角色的台詞。
 */
export function visibleBlocks(
  blocks: Block[],
  role: string | null,
  opts: { showCue: boolean; cueLength?: number } = { showCue: true },
): DisplayBlock[] {
  if (role === null) return blocks
  const cueLength = opts.cueLength ?? 16
  const out: DisplayBlock[] = []
  let lastOther: Block | null = null

  for (const b of blocks) {
    if (b.kind === 'line' && b.speaker === role) {
      const d: DisplayBlock = { ...b }
      if (opts.showCue && lastOther) {
        const flat = lastOther.text.replace(/\n/g, ' ')
        d.cueBefore = `${lastOther.speaker}：${flat.length > cueLength ? '…' + flat.slice(-cueLength) : flat}`
      }
      out.push(d)
      lastOther = null
    } else if (b.kind === 'line') {
      lastOther = b
    }
  }
  return out
}

export type Segment = { type: 'text' | 'em' | 'aside'; text: string }

/** 行內標記：**重音**、（動作／語氣） */
export function inlineSegments(text: string): Segment[] {
  const out: Segment[] = []
  const re = /\*\*(.+?)\*\*|([（(\[【][^）)\]】]*[）)\]】])/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    out.push(m[1] !== undefined ? { type: 'em', text: m[1] } : { type: 'aside', text: m[2] })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

export const SAMPLE_SCRIPT = `（開場，兩人坐定）
阿明：哈囉大家好，歡迎來到我們的頻道！
小美：今天要跟大家聊一個很多人問過的主題——**提詞機**。
阿明：對，其實我們拍片一直都在用，
只是很少人發現。（笑）
小美：因為它就藏在鏡頭前面啊。
阿明：那我們先從原理開始講好了。
小美：好，簡單來說，就是一片斜放的半反射玻璃，
手機螢幕的字會反射到玻璃上。
阿明：而鏡頭在玻璃後面，所以我們看字的時候，眼神剛好對著鏡頭。
小美：所以大家以為我們都是背稿，其實不是！
阿明：（看向小美）欸，不要拆穿啦。
（兩人笑）
小美：好啦，那今天的影片就到這邊，記得按讚訂閱！
阿明：我們下次見，掰掰～`

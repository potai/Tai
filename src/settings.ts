import { useEffect, useState } from 'react'

export interface Settings {
  fontSize: number
  lineHeight: number
  /** 左右邊距，佔畫面寬度的百分比 */
  margin: number
  /** 捲動速度等級 1–30 */
  speed: number
  mirrorX: boolean
  mirrorY: boolean
  /** 閱讀焦點線的位置，0 = 最上方，1 = 最下方 */
  focus: number
  /** null = 對話模式；否則只顯示該角色 */
  role: string | null
  /** 單一角色模式下，顯示對方最後一句當作提示 */
  showCue: boolean
  /** 對話模式下，在台詞前顯示角色名稱 */
  showNames: boolean
  /** 顯示舞台指示與旁白（僅對話模式） */
  showCues: boolean
  /** 非焦點段落變暗 */
  dimInactive: boolean
  /** 開始捲動前的倒數秒數 */
  countdown: number
  /** 角色名稱 → 顏色 */
  colors: Record<string, string>
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 40,
  lineHeight: 1.45,
  margin: 6,
  speed: 6,
  mirrorX: false,
  mirrorY: false,
  focus: 0.3,
  role: null,
  showCue: true,
  showNames: true,
  showCues: true,
  dimInactive: true,
  countdown: 3,
  colors: {},
}

export const ROLE_PALETTE = ['#FFD54A', '#5AD1FF', '#FF8A80', '#B9F6CA', '#E1BEE7', '#FFCC80']

export function roleColor(settings: Settings, roles: string[], role: string): string {
  return settings.colors[role] ?? ROLE_PALETTE[Math.max(0, roles.indexOf(role)) % ROLE_PALETTE.length]
}

/** 每秒捲動的像素，跟字級成正比，讓換字級後閱讀速度大致不變 */
export function speedToPxPerSec(speed: number, fontSize: number): number {
  return speed * 2.5 * (fontSize / 40)
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    return typeof fallback === 'object' && fallback !== null ? { ...fallback, ...parsed } : parsed
  } catch {
    return fallback
  }
}

export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load(key, fallback))
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // 私密瀏覽等情況下無法儲存，忽略即可
    }
  }, [key, value])
  return [value, setValue] as const
}

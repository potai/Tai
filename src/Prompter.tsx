import type { PointerEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Block } from './script'
import { inlineSegments, visibleBlocks } from './script'
import type { Settings } from './settings'
import { formatSpeed, roleColor, speedToPxPerSec, stepSpeed } from './settings'

interface Props {
  blocks: Block[]
  roles: string[]
  settings: Settings
  setSettings: (update: (s: Settings) => Settings) => void
  onExit: () => void
}

const TAP_SLOP = 8
const SIDE_ZONE = 0.25

export default function Prompter({ blocks, roles, settings, setSettings, onExit }: Props) {
  const { fontSize, lineHeight, margin, mirrorX, mirrorY, focus, role } = settings

  const display = useMemo(() => {
    const list = visibleBlocks(blocks, role, { showCue: settings.showCue })
    return role === null && !settings.showCues ? list.filter((b) => b.kind === 'line' || b.kind === 'scene') : list
  }, [blocks, role, settings.showCue, settings.showCues])

  const [playing, setPlaying] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })

  const contentRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const remainingRef = useRef<HTMLSpanElement>(null)
  const yRef = useRef(0)
  const maxYRef = useRef(0)
  const offsetsRef = useRef<number[]>([])
  const activeRef = useRef(-1)
  const measuredRoleRef = useRef(role)
  const draggingRef = useRef(false)
  const pxPerSec = speedToPxPerSec(settings.speed, fontSize)
  const pxPerSecRef = useRef(pxPerSec)
  pxPerSecRef.current = pxPerSec

  const focusY = viewport.h * focus

  // ---------- 畫面更新（直接操作 DOM，避免每一幀都重新 render） ----------
  const paint = useCallback(() => {
    const content = contentRef.current
    if (!content) return
    const y = yRef.current
    content.style.transform = `translate3d(0, ${-y}px, 0)`

    const offsets = offsetsRef.current
    const probe = y + focusY + fontSize * lineHeight * 0.5
    let active = -1
    for (let i = 0; i < offsets.length && offsets[i] <= probe; i++) active = i
    if (active !== activeRef.current) {
      const nodes = content.children
      nodes[activeRef.current]?.classList.remove('active')
      nodes[active]?.classList.add('active')
      activeRef.current = active
    }

    const max = maxYRef.current
    if (progressRef.current) progressRef.current.style.width = `${max > 0 ? (y / max) * 100 : 0}%`
    if (remainingRef.current) {
      const secs = Math.max(0, Math.round((max - y) / Math.max(1, pxPerSecRef.current)))
      remainingRef.current.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    }
  }, [focusY, fontSize, lineHeight])

  const setY = useCallback(
    (y: number) => {
      yRef.current = Math.min(Math.max(0, y), maxYRef.current)
      paint()
    },
    [paint],
  )

  // 版面改變時重新量測每個段落的位置
  const measure = useCallback(() => {
    const content = contentRef.current
    if (!content) return
    // 切換角色模式時回到開頭
    if (measuredRoleRef.current !== role) {
      measuredRoleRef.current = role
      offsetsRef.current = []
      yRef.current = 0
    }
    const prevActive = Math.max(0, activeRef.current)
    const prevOffset = offsetsRef.current[prevActive]
    const kids = Array.from(content.children) as HTMLElement[]
    offsetsRef.current = kids.map((el) => el.offsetTop)
    const last = kids[kids.length - 1]
    maxYRef.current = last ? Math.max(0, last.offsetTop + last.offsetHeight - focusY - fontSize * lineHeight) : 0
    // 換字級、換模式後，盡量停留在原本的段落
    if (prevOffset !== undefined && offsetsRef.current[prevActive] !== undefined) {
      yRef.current += offsetsRef.current[prevActive] - prevOffset
    }
    content.querySelectorAll('.active').forEach((el) => el.classList.remove('active'))
    activeRef.current = -1
    setY(yRef.current)
  }, [focusY, fontSize, lineHeight, role, setY])

  useLayoutEffect(measure, [measure, display, margin, settings.showNames, viewport])

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    document.fonts?.ready.then(() => measure())
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [measure])

  // ---------- 自動捲動 ----------
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      if (!draggingRef.current) {
        const next = yRef.current + pxPerSecRef.current * dt
        setY(next)
        if (next >= maxYRef.current) {
          setPlaying(false)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, setY])

  // ---------- 倒數 ----------
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => {
      if (countdown === 1) setPlaying(true)
      setCountdown(countdown - 1)
    }, 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const play = useCallback(() => {
    if (yRef.current >= maxYRef.current) setY(0)
    if (settings.countdown > 0) setCountdown(settings.countdown)
    else setPlaying(true)
  }, [settings.countdown, setY])

  const pause = useCallback(() => {
    setPlaying(false)
    setCountdown(0)
  }, [])

  const running = playing || countdown > 0
  const toggle = useCallback(() => (running ? pause() : play()), [running, pause, play])

  // ---------- 提示訊息 ----------
  const toastTimer = useRef<number>(undefined)
  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 900)
  }, [])

  const changeSpeed = useCallback(
    (dir: 1 | -1) => {
      const speed = stepSpeed(settings.speed, dir)
      setSettings((s) => ({ ...s, speed }))
      flash(`速度 ${formatSpeed(speed)}`)
    },
    [settings.speed, setSettings, flash],
  )

  const changeFont = (delta: number) =>
    setSettings((s) => ({ ...s, fontSize: Math.min(96, Math.max(20, s.fontSize + delta)) }))

  const jump = useCallback(
    (dir: -1 | 1) => {
      const offsets = offsetsRef.current
      if (!offsets.length) return
      const cur = Math.max(0, activeRef.current)
      // 往前：若已經捲過目前段落的開頭，先回到目前段落開頭
      const atStart = Math.abs(offsets[cur] - focusY - yRef.current) < 4
      const target = dir === 1 ? Math.min(offsets.length - 1, cur + 1) : atStart ? Math.max(0, cur - 1) : cur
      setY(offsets[target] - focusY)
    },
    [focusY, setY],
  )

  const scenes = useMemo(
    () => display.flatMap((b, i) => (b.kind === 'scene' ? [{ index: i, title: b.text }] : [])),
    [display],
  )
  const jumpTo = (index: number) => {
    const offset = offsetsRef.current[index]
    if (offset !== undefined) setY(offset - focusY)
  }

  const restart = () => {
    pause()
    setY(0)
  }

  // ---------- 螢幕常亮 ----------
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const request = async () => {
      try {
        if (document.visibilityState === 'visible' && 'wakeLock' in navigator) {
          lock = await navigator.wakeLock.request('screen')
        }
      } catch {
        // 不支援或被拒絕時忽略
      }
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      document.removeEventListener('visibilitychange', request)
      lock?.release().catch(() => {})
    }
  }, [])

  // ---------- 鍵盤 / 藍牙遙控器 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'Enter':
        case 'MediaPlayPause':
          toggle()
          break
        case 'ArrowUp':
        case 'PageUp':
          jump(-1)
          break
        case 'ArrowDown':
        case 'PageDown':
          jump(1)
          break
        case 'ArrowLeft':
        case '-':
          changeSpeed(-1)
          break
        case 'ArrowRight':
        case '+':
        case '=':
          changeSpeed(1)
          break
        case 'Home':
          restart()
          break
        case 'Escape':
          if (running) pause()
          else onExit()
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------- 觸控手勢 ----------
  // 點中間：播放／暫停；點左右兩側：減速／加速；上下拖曳：手動捲動
  const gesture = useRef({ x: 0, y: 0, startY: 0, id: -1 })
  const onPointerDown = (e: PointerEvent) => {
    gesture.current = { x: e.clientX, y: e.clientY, startY: yRef.current, id: e.pointerId }
    draggingRef.current = false
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current
    if (g.id !== e.pointerId) return
    const dy = e.clientY - g.y
    if (!draggingRef.current && Math.abs(dy) < TAP_SLOP) return
    draggingRef.current = true
    setY(g.startY - dy * (mirrorY ? -1 : 1))
  }
  const onPointerUp = (e: PointerEvent) => {
    const g = gesture.current
    if (g.id !== e.pointerId) return
    g.id = -1
    if (draggingRef.current) {
      draggingRef.current = false
      return
    }
    const zone = e.clientX / viewport.w
    if (zone < SIDE_ZONE) changeSpeed(-1)
    else if (zone > 1 - SIDE_ZONE) changeSpeed(1)
    else toggle()
  }

  // ---------- 全螢幕（Android / iPad；iPhone 請用「加入主畫面」） ----------
  const canFullscreen = typeof document.documentElement.requestFullscreen === 'function'
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else {
        await document.documentElement.requestFullscreen()
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')
      }
    } catch {
      // 忽略
    }
  }

  const mirrorTransform = `scale(${mirrorX ? -1 : 1}, ${mirrorY ? -1 : 1})`
  const portrait = viewport.h > viewport.w
  const modes: (string | null)[] = [null, ...roles]

  return (
    <div className="prompter">
      <div className="mirror" style={{ transform: mirrorTransform }}>
        <div
          ref={contentRef}
          className={`script ${settings.dimInactive ? 'dim' : ''}`}
          style={{
            fontSize,
            lineHeight,
            paddingTop: focusY,
            paddingBottom: viewport.h,
            paddingLeft: `max(${margin}vw, env(safe-area-inset-left))`,
            paddingRight: `max(${margin}vw, env(safe-area-inset-right))`,
          }}
        >
          {display.map((b) => {
            const color = b.ensemble ? '#ffffff' : b.speaker ? roleColor(settings, roles, b.speaker) : undefined
            return (
              <div key={b.id} className={`blk ${b.kind}`} style={{ color }}>
                {b.cueBefore && <div className="cue-before">{b.cueBefore}</div>}
                {b.kind === 'line' && role === null && settings.showNames && (
                  <span className="name" style={{ background: color }}>
                    {b.speaker}
                  </span>
                )}
                {inlineSegments(b.text).map((seg, i) =>
                  seg.type === 'text' ? seg.text : <span key={i} className={seg.type}>{seg.text}</span>,
                )}
              </div>
            )
          })}
          {display.length === 0 && <div className="blk note">（沒有可顯示的台詞）</div>}
        </div>
        <div className="focus-line" style={{ top: focusY + fontSize * lineHeight * 0.5 }} />
        {countdown > 0 && <div className="countdown">{countdown}</div>}
        {toast && <div className="toast">{toast}</div>}
      </div>

      <div
        className="touch"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture.current.id = -1
          draggingRef.current = false
        }}
      />

      <div className={`hud ${running ? 'hidden' : ''}`}>
        <div className="bar top">
          <button onClick={onExit}>‹ 編輯</button>
          <div className="seg">
            {modes.map((m) => (
              <button
                key={m ?? '__all'}
                className={role === m ? 'on' : ''}
                style={m && role === m ? { background: roleColor(settings, roles, m), color: '#000' } : undefined}
                onClick={() => setSettings((s) => ({ ...s, role: m }))}
              >
                {m ?? '對話'}
              </button>
            ))}
          </div>
          <div className="group">
            <button className={mirrorX ? 'on' : ''} onClick={() => setSettings((s) => ({ ...s, mirrorX: !s.mirrorX }))}>
              ⇆ 鏡像
            </button>
            <button className={mirrorY ? 'on' : ''} onClick={() => setSettings((s) => ({ ...s, mirrorY: !s.mirrorY }))}>
              ⇅ 翻轉
            </button>
            {canFullscreen && <button onClick={toggleFullscreen}>⛶</button>}
          </div>
        </div>

        <div className="hint" key={String(running)}>
          {portrait ? '建議橫放手機・' : ''}點中間播放／暫停・點左右調速度・上下拖曳捲動
        </div>

        <div className="bar bottom">
          <div className="group">
            <button onClick={restart} aria-label="從頭開始">⏮</button>
            <button onClick={() => jump(-1)} aria-label="上一段">◀︎</button>
            <button className="play" onClick={play} aria-label="播放">▶︎</button>
            <button onClick={() => jump(1)} aria-label="下一段">▶︎▏</button>
            {scenes.length > 0 && (
              <select
                className="scene-select"
                value=""
                onChange={(e) => jumpTo(Number(e.target.value))}
                aria-label="跳到場次"
              >
                <option value="" disabled>
                  場次
                </option>
                {scenes.map((sc) => (
                  <option key={sc.index} value={sc.index}>
                    {sc.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="group">
            <span className="label">速度</span>
            <button onClick={() => changeSpeed(-1)}>−</button>
            <span className="val">{formatSpeed(settings.speed)}</span>
            <button onClick={() => changeSpeed(1)}>＋</button>
          </div>
          <div className="group">
            <span className="label">字級</span>
            <button onClick={() => changeFont(-4)}>−</button>
            <span className="val">{fontSize}</span>
            <button onClick={() => changeFont(4)}>＋</button>
          </div>
          <span className="label">剩餘 <span ref={remainingRef} className="val">0:00</span></span>
        </div>
        <div className="progress">
          <div ref={progressRef} />
        </div>
      </div>
    </div>
  )
}

import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { SAMPLE_SCRIPT } from './script'
import type { Settings } from './settings'
import { roleColor } from './settings'
import type { LinkedDoc } from './google'
import { googleEnabled } from './google'
import { parseDocId } from './gdoc'
import { buildShareUrl } from './share'

interface Props {
  source: string
  setSource: (s: string) => void
  roles: string[]
  lineCount: number
  settings: Settings
  setSettings: (update: (s: Settings) => Settings) => void
  onStart: () => void
  linkedDoc: LinkedDoc | null
  googleStatus: string
  onGoogleLoad: (id: string) => void
}

const isStandalone =
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.matchMedia?.('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)

export default function Editor({
  source,
  setSource,
  roles,
  lineCount,
  settings,
  setSettings,
  onStart,
  linkedDoc,
  googleStatus,
  onGoogleLoad,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }))

  const [docLink, setDocLink] = useState('')
  const [changingDoc, setChangingDoc] = useState(false)
  const [linkError, setLinkError] = useState('')
  const onImportLink = (e: FormEvent) => {
    e.preventDefault()
    const id = parseDocId(docLink)
    if (!id) {
      setLinkError('看不懂這個連結，請貼上 Google 文件的網址（docs.google.com/document/d/…）')
      return
    }
    setLinkError('')
    setChangingDoc(false)
    setDocLink('')
    onGoogleLoad(id)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSource(await file.text())
    e.target.value = ''
  }

  // 事先算好分享網址：iOS 的分享與剪貼簿必須在點擊當下同步呼叫，不能先等壓縮完成
  const [shareUrl, setShareUrl] = useState('')
  useEffect(() => {
    let cancelled = false
    buildShareUrl(source, location.href).then((url) => !cancelled && setShareUrl(url))
    return () => {
      cancelled = true
    }
  }, [source])

  const [shareStatus, setShareStatus] = useState('')
  const onShare = async () => {
    const url = shareUrl
    try {
      if (navigator.share) {
        await navigator.share({ title: '提詞機腳本', url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShareStatus('已複製連結')
    } catch (err) {
      // 使用者取消分享時不用提示
      if ((err as Error).name === 'AbortError') return
      prompt('複製這個連結傳給對方：', url)
    }
    setTimeout(() => setShareStatus(''), 2500)
  }

  return (
    <div className="editor">
      <header>
        <h1>對話提詞機</h1>
        <button className="start" onClick={onStart} disabled={lineCount === 0}>
          開始 ▶︎
        </button>
      </header>

      {isIOS && !isStandalone && (
        <p className="tip">
          小提示：用 Safari「分享 → 加入主畫面」開啟，可以隱藏網址列，得到全螢幕的提詞畫面。
        </p>
      )}

      <div className="columns">
        <section className="script-pane">
          {googleEnabled && (
            <div className="gdoc">
              {linkedDoc && !changingDoc ? (
                <>
                  <span className="gdoc-name">
                    📄 {linkedDoc.name}
                    <span className="muted">
                      {' '}· 讀取於 {new Date(linkedDoc.loadedAt).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </span>
                  <button className="primary" onClick={() => onGoogleLoad(linkedDoc.id)}>重新讀取</button>
                  <button onClick={() => setChangingDoc(true)}>換一份</button>
                </>
              ) : (
                <form className="gdoc-form" onSubmit={onImportLink}>
                  <input
                    type="url"
                    inputMode="url"
                    value={docLink}
                    onChange={(e) => setDocLink(e.target.value)}
                    placeholder="貼上 Google 文件連結"
                    aria-label="Google 文件連結"
                  />
                  <button className="primary" type="submit" disabled={docLink.trim() === ''}>
                    匯入
                  </button>
                  {linkedDoc && (
                    <button type="button" onClick={() => setChangingDoc(false)}>
                      取消
                    </button>
                  )}
                </form>
              )}
              {(linkError || googleStatus) && <span className="muted status">{linkError || googleStatus}</span>}
            </div>
          )}
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={'阿明：第一句台詞\n小美：第二句台詞'}
            spellCheck={false}
          />
          <div className="row">
            <button onClick={() => fileRef.current?.click()}>匯入 .txt</button>
            <input ref={fileRef} type="file" accept=".txt,text/plain" hidden onChange={onFile} />
            <button onClick={() => setSource(SAMPLE_SCRIPT)}>載入範例</button>
            <button onClick={() => confirm('確定清空腳本？') && setSource('')}>清空</button>
            <button onClick={onShare} disabled={source.trim() === '' || !shareUrl}>分享腳本連結</button>
            {shareStatus && <span className="muted status">{shareStatus}</span>}
          </div>
          <details>
            <summary>腳本格式說明</summary>
            <ul>
              <li><code>角色：台詞</code>（全形或半形冒號都可以）</li>
              <li>沒有前綴的下一行，會接在上一位角色的台詞後面</li>
              <li>空一行代表段落結束；之後沒有前綴的文字視為旁白</li>
              <li>整行用括號包起來，例如 <code>（兩人看向鏡頭）</code>，是舞台指示</li>
              <li>在上方貼上 Google 文件連結（文件的「分享 → 複製連結」）就能直接匯入整份腳本；文件改過之後按「重新讀取」就會載入最新版</li>
              <li>「分享腳本連結」會把腳本放進網址裡，對方點開就能載入同一份腳本（不會上傳到任何伺服器）</li>
              <li>台詞中的 <code>（笑）</code> 會變淡顯示，<code>**重音**</code> 會加底線強調</li>
            </ul>
          </details>
        </section>

        <section className="settings-pane">
          <h2>顯示模式</h2>
          <div className="modes">
            <label className={settings.role === null ? 'on' : ''}>
              <input type="radio" checked={settings.role === null} onChange={() => set('role', null)} />
              對話模式
            </label>
            {roles.map((r) => (
              <label key={r} className={settings.role === r ? 'on' : ''}>
                <input type="radio" checked={settings.role === r} onChange={() => set('role', r)} />
                <input
                  type="color"
                  value={roleColor(settings, roles, r)}
                  onChange={(e) => set('colors', { ...settings.colors, [r]: e.target.value })}
                  aria-label={`${r} 的顏色`}
                />
                只看「{r}」
              </label>
            ))}
          </div>
          {roles.length === 0 && <p className="muted">還沒偵測到角色，請用「角色：台詞」的格式。</p>}

          <h2>文字</h2>
          <Slider label="字級" value={settings.fontSize} min={20} max={96} step={2} onChange={(v) => set('fontSize', v)} />
          <Slider label="行距" value={settings.lineHeight} min={1.1} max={2.2} step={0.05} onChange={(v) => set('lineHeight', v)} />
          <Slider label="左右邊距 %" value={settings.margin} min={0} max={30} step={1} onChange={(v) => set('margin', v)} />
          <Slider label="速度" value={settings.speed} min={1} max={30} step={1} onChange={(v) => set('speed', v)} />
          <Slider label="焦點線位置" value={settings.focus} min={0.1} max={0.6} step={0.05} onChange={(v) => set('focus', v)} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="開始前倒數（秒）" value={settings.countdown} min={0} max={10} step={1} onChange={(v) => set('countdown', v)} />

          <h2>選項</h2>
          <Toggle checked={settings.mirrorX} onChange={(v) => set('mirrorX', v)}>水平鏡像（搭配提詞機玻璃）</Toggle>
          <Toggle checked={settings.mirrorY} onChange={(v) => set('mirrorY', v)}>上下翻轉</Toggle>
          <Toggle checked={settings.showNames} onChange={(v) => set('showNames', v)}>對話模式顯示角色名稱</Toggle>
          <Toggle checked={settings.showCues} onChange={(v) => set('showCues', v)}>對話模式顯示舞台指示與旁白</Toggle>
          <Toggle checked={settings.showCue} onChange={(v) => set('showCue', v)}>單一角色模式顯示對方的最後一句</Toggle>
          <Toggle checked={settings.dimInactive} onChange={(v) => set('dimInactive', v)}>焦點以外的段落變暗</Toggle>
        </section>
      </div>

      <footer className="site-footer">
        <a href="./privacy.html">隱私權政策</a>
      </footer>
    </div>
  )
}

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <label className="slider">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output>{props.format ? props.format(props.value) : props.value}</output>
    </label>
  )
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

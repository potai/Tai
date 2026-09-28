import { useEffect, useMemo, useState } from 'react'
import Editor from './Editor'
import Prompter from './Prompter'
import { parseScript, SAMPLE_SCRIPT } from './script'
import { DEFAULT_SETTINGS, usePersistentState } from './settings'
import type { GoogleAction, LinkedDoc } from './google'
import { consumeAuthRedirect, currentToken, fetchDocumentText, signIn, TokenExpiredError } from './google'
import { shouldConfirmOverwrite, textFingerprint } from './gdoc'
import { decodeScript, readShareCode } from './share'

export default function App() {
  const [source, setSource] = usePersistentState('tai.script', SAMPLE_SCRIPT)
  const [settings, setSettings] = usePersistentState('tai.settings', DEFAULT_SETTINGS)
  const [screen, setScreen] = useState<'edit' | 'prompt'>('edit')
  const [linkedDoc, setLinkedDoc] = usePersistentState<LinkedDoc | null>('tai.gdoc', null)
  const [googleStatus, setGoogleStatus] = useState('')

  // 從 Google 文件讀取；還沒登入（或登入過期）時先去 Google 登入，回來後自動繼續
  const runGoogle = async (action: GoogleAction) => {
    const token = currentToken()
    if (!token) return signIn(action)
    try {
      setGoogleStatus('讀取中…')
      const doc = await fetchDocumentText(token, action.id)
      const sameDoc = linkedDoc?.id === action.id
      const ask = shouldConfirmOverwrite({
        current: source,
        incoming: doc.text,
        loadedFingerprint: linkedDoc?.fingerprint,
        sample: SAMPLE_SCRIPT,
      })
      const message = sameDoc
        ? '目前的腳本在這裡改過，重新讀取會蓋掉這些修改。\n要用 Google 文件的最新內容取代嗎？'
        : `目前的腳本在這裡改過（或是手動貼上的）。\n要用「${doc.name}」取代嗎？目前的內容會被覆蓋。`
      if (ask && !confirm(message)) {
        setGoogleStatus('已取消，保留目前的腳本')
      } else {
        setSource(doc.text)
        setLinkedDoc({ id: action.id, name: doc.name, loadedAt: Date.now(), fingerprint: textFingerprint(doc.text) })
        setGoogleStatus('已載入最新內容')
      }
    } catch (err) {
      if (err instanceof TokenExpiredError) return signIn(action)
      setGoogleStatus((err as Error).message)
    }
    setTimeout(() => setGoogleStatus(''), 4000)
  }

  // Google 登入後導回本站：繼續登入前要做的動作
  useEffect(() => {
    const result = consumeAuthRedirect()
    if (!result) return
    if ('error' in result) setGoogleStatus(result.error)
    else runGoogle(result.action)
  }, [])

  // 從分享連結（#s=...）載入腳本，只在開啟時執行一次
  useEffect(() => {
    const code = readShareCode(location.hash)
    if (!code) return
    history.replaceState(null, '', location.pathname + location.search)
    decodeScript(code)
      .then((shared) => {
        if (shared === source) return
        const unchanged = source.trim() === '' || source === SAMPLE_SCRIPT
        if (unchanged || confirm('要用分享連結裡的腳本，取代你目前的腳本嗎？')) setSource(shared)
      })
      .catch(() => alert('這個分享連結無法讀取，可能是複製時不完整。'))
  }, [])

  const { blocks, roles } = useMemo(() => parseScript(source), [source])
  const lineCount = blocks.filter((b) => b.kind === 'line').length

  // 腳本改名後，原本選的角色可能不存在了
  const effective = settings.role && !roles.includes(settings.role) ? { ...settings, role: null } : settings

  if (screen === 'prompt') {
    return (
      <Prompter
        blocks={blocks}
        roles={roles}
        settings={effective}
        setSettings={setSettings}
        onExit={() => setScreen('edit')}
      />
    )
  }

  return (
    <Editor
      source={source}
      setSource={setSource}
      roles={roles}
      lineCount={lineCount}
      settings={effective}
      setSettings={setSettings}
      onStart={() => setScreen('prompt')}
      linkedDoc={linkedDoc}
      googleStatus={googleStatus}
      onGoogleLoad={(id) => runGoogle({ type: 'load', id })}
    />
  )
}

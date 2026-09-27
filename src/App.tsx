import { useEffect, useMemo, useState } from 'react'
import Editor from './Editor'
import Prompter from './Prompter'
import { parseScript, SAMPLE_SCRIPT } from './script'
import { DEFAULT_SETTINGS, usePersistentState } from './settings'
import { decodeScript, readShareCode } from './share'

export default function App() {
  const [source, setSource] = usePersistentState('tai.script', SAMPLE_SCRIPT)
  const [settings, setSettings] = usePersistentState('tai.settings', DEFAULT_SETTINGS)
  const [screen, setScreen] = useState<'edit' | 'prompt'>('edit')

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
    />
  )
}

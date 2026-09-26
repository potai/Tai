import { useMemo, useState } from 'react'
import Editor from './Editor'
import Prompter from './Prompter'
import { parseScript, SAMPLE_SCRIPT } from './script'
import { DEFAULT_SETTINGS, usePersistentState } from './settings'

export default function App() {
  const [source, setSource] = usePersistentState('tai.script', SAMPLE_SCRIPT)
  const [settings, setSettings] = usePersistentState('tai.settings', DEFAULT_SETTINGS)
  const [screen, setScreen] = useState<'edit' | 'prompt'>('edit')

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

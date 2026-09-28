// Google API 載入後掛在 window 上的物件，只宣告本專案用到的部分

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_API_KEY?: string
  readonly VITE_GOOGLE_APP_ID?: string
}

declare namespace GooglePicker {
  interface PickerDoc {
    id: string
    name: string
  }
  interface PickerResponse {
    action: string
    docs: PickerDoc[]
  }
  class DocsView {
    constructor(viewId?: string)
    setMode(mode: string): DocsView
  }
  class PickerBuilder {
    addView(view: DocsView): PickerBuilder
    setOAuthToken(token: string): PickerBuilder
    setDeveloperKey(key: string): PickerBuilder
    setAppId(appId: string): PickerBuilder
    setLocale(locale: string): PickerBuilder
    setTitle(title: string): PickerBuilder
    setCallback(cb: (data: PickerResponse) => void): PickerBuilder
    build(): { setVisible(visible: boolean): void }
  }
}

interface Window {
  gapi: { load(api: string, callback: () => void): void }
  google: {
    picker: {
      DocsView: typeof GooglePicker.DocsView
      PickerBuilder: typeof GooglePicker.PickerBuilder
      ViewId: { DOCUMENTS: string }
      DocsViewMode: { LIST: string }
      Action: { PICKED: string; CANCEL: string }
    }
  }
}

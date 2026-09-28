# 對話提詞機

給兩人對話類影片使用的網頁提詞機，以 iPhone Pro Max **橫放**、搭配小型提詞機玻璃為主要使用情境。

## 功能

- **對話模式**：所有台詞依角色上色，並顯示角色名稱標籤
- **單一角色模式**：只顯示某一位角色的台詞，並在上方用小字提示對方的最後一句，方便抓接話時機
- 自動捲動、閱讀焦點線、焦點以外的段落變暗
- 水平鏡像、上下翻轉（搭配提詞機玻璃）
- 播放時完全隱藏操作介面，暫停時才出現
- 開始前倒數、剩餘時間估算、螢幕常亮（Wake Lock）
- 腳本與設定自動存在手機上（localStorage）
- **分享腳本連結**：腳本壓縮後放進網址，對方點開就載入同一份腳本，不經過任何伺服器
- **從 Google 文件匯入**：用 Google 帳號登入後選一份文件，之後文件改版按「重新讀取」即可（只能讀取使用者自己選的文件）
- **離線使用**：打開過一次後，沒有網路也能使用（Service Worker）

## 操作方式

| 動作 | 效果 |
|---|---|
| 點畫面中間 | 播放／暫停（暫停時才會顯示操作列） |
| 點畫面左側 ¼／右側 ¼ | 減速／加速 |
| 上下拖曳 | 手動捲動 |
| 空白鍵、Enter | 播放／暫停 |
| ↑ ↓、PageUp／PageDown | 上一段／下一段（大多數藍牙翻頁筆適用） |
| ← →、− ＋ | 減速／加速 |
| Home | 回到開頭 |
| Esc | 暫停；已暫停時回到編輯 |

## 腳本格式

```
（開場，兩人坐定）
阿明：哈囉大家好！
小美：今天要聊的是**提詞機**。（笑）
阿明：沒有前綴的下一行，
會接在同一位角色後面。
```

- `角色：台詞`，全形或半形冒號都可以
- 空一行代表段落結束，之後沒有前綴的文字視為旁白
- 整行用括號包起來的是舞台指示
- `**文字**` 會加底線強調；台詞中的 `（笑）` 會淡化顯示

## 兩個人一起用

1. 其中一人在編輯畫面按「分享腳本連結」，用 LINE、訊息等方式傳給對方
2. 對方點開連結就會載入同一份腳本（如果對方手機裡已經有自己改過的腳本，會先詢問是否取代）
3. 兩人各自在提詞畫面上方選自己的角色（單一角色模式）

## 在 iPhone 上使用

iPhone 的 Safari 不支援網頁全螢幕 API。要隱藏網址列，請用 Safari 開啟後按「分享 → 加入主畫面」，再從主畫面的圖示開啟。

## Google 文件匯入的設定

需要一個 Google Cloud 專案（免費），並把三個值放進 `.env.production`：

```
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIza...
VITE_GOOGLE_APP_ID=123456789012   # 專案編號
```

這三個值本來就會出現在網頁原始碼中，不是密碼；API 金鑰要限制只能從 `https://potai.github.io/*` 使用。
沒有設定時，「從 Google 文件匯入」按鈕不會出現。

Google Cloud 需要的設定：

- 啟用 **Google Drive API** 與 **Google Picker API**
- OAuth 同意畫面：外部使用者、範圍只要 `drive.file`，狀態設為「正式版」
- OAuth 用戶端（網頁應用程式）：
  - 已授權的 JavaScript 來源：`https://potai.github.io`
  - 已授權的重新導向 URI：`https://potai.github.io/Tai/`
- API 金鑰：網站限制 `https://potai.github.io/*`，API 限制 Google Picker API

## 開發

```bash
npm install
npm run dev      # 會同時開放區網存取，可以直接用手機連 http://<電腦IP>:5173
npm test
npm run build
```

推到 `main` 後，GitHub Actions 會自動部署到 GitHub Pages。第一次使用需要到 repo 的 **Settings → Pages**，把 Source 設為 **GitHub Actions**。

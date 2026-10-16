# ✨ ScreenEdit AI

**Edit any website just by sharing your screen.** No URL typing, no browser extensions, no plugins. Share → AI detects the site → you sign in (if needed) → AI edits it live.

![concept](https://img.shields.io/badge/works_with-Chrome%20%7C%20Edge%20%7C%20Brave%20%7C%20Safari-indigo) ![powered](https://img.shields.io/badge/powered_by-Google%20Gemini-purple) ![license](https://img.shields.io/badge/license-MIT-emerald)

---

## 🚀 How it works (the 3-click flow)

1. **Click "Share your screen"** and pick the browser tab showing the website you want to change.
2. **The AI scans your screen**, identifies the website (URL, title, page contents), and shows you what it found.
3. **Tell it what to change** in plain English, e.g. *"Change the headline to something catchier and make the button pink"*.
   - If the site needs signing in, the AI opens its own visible Chromium window and asks you to sign in there. Your credentials never leave your computer.
   - The AI then drives that browser to perform your edits live — clicking Edit, replacing text, pressing Save/Publish, etc.
4. **Watch the edits happen live** in the viewport. Step-by-step progress and an animated timeline show what the AI is doing.

That's it. No URL bar, no dev tools, no manual browser setup.

---

## 🎯 Features

| | |
|---|---|
| 🖥️ **Zero-URL workflow** | Share your screen; the AI reads the address bar & page visually. |
| 🤖 **Live AI editing** | AI drives a real Chromium browser (Playwright) to perform clicks, typing, scrolling, saving. |
| 🔐 **Safe sign-in handoff** | When a login wall appears, the AI pauses and asks you to sign in inside its own visible browser window. Credentials never touch any server. |
| 📝 **Smart edit mode** | Understands CMS editors (WordPress, Shopify, Notion, Squarespace, Webflow, GitHub, Google Docs, Canva, admin dashboards, etc.) — finds the Edit button, selects text, types the new version, clicks Save/Publish. |
| 🎨 **Beautiful new UI** | Gradient hero, animated progress timeline, step-by-step agent log, glowing action targets, voice input & readout. |
| ✍️ **Annotations** | Draw pen/highlighter marks on the screen to point the AI at specific elements. |
| ✂️ **Crop** | Ask the AI about a specific region of the screen. |
| 🎙️ **Voice** | Talk to it with continuous voice, hear responses spoken aloud. |
| 🧠 **Smart model fallback** | Automatically tries the fastest Gemini model first, falls back gracefully when models are busy. |
| 🔒 **Private** | Your Gemini API key lives in `localStorage` only. The local server only drives the browser — it never sees your key. |

---

## 📦 Quick start

```bash
# 1. Install
npm install
npm run install-browser   # downloads Chromium for Playwright (one-time, ~150MB)

# 2. Run
npm start

# 3. Open
#    Visit http://localhost:3000
```

Then:

1. Click **Set API Key** and paste a free Gemini key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Click **Share your screen** → pick the browser tab you want to edit.
3. Wait a moment for the AI to detect the site, then tell it what to change.

> 💡 The AI browser window is **visible by default** (so you can watch edits happen and sign in when asked). Set `HEADLESS=true npm start` to hide it.

### Already have Chrome/Chromium installed?

Skip the download and point to it directly:

```bash
CHROME_PATH=/path/to/your/chrome npm start
```

### Running on a server / container with no display?

```bash
HEADLESS=true NO_SANDBOX=1 npm start
```
(You won't be able to sign in interactively in this mode — use it only for public pages or sites with saved sessions.)

---

## 🧭 How the editing agent works

After you share your screen and describe an edit, ScreenEdit AI:

1. **Detects** the website visually from your shared screen (address bar + logos + content).
2. **Opens** that URL in its own Chromium window (running through Playwright on your machine).
3. **Scans** the page, looking for cookie banners, login walls, edit controls, text fields, and action buttons.
4. **Pauses for sign-in** if it hits an auth wall — you sign in directly in the AI's browser window, then click *"I'm signed in"*.
5. **Performs** your requested edit step-by-step: click Edit → select existing text → type new text → click Save/Publish.
6. **Confirms** the change by showing you the live result in the app.

Each action the AI takes is shown in the chat panel with ✔ success / ✖ error logs, and a glowing target ring shows you where it clicked.

---

## 🛠️ Configuration

All variables are optional.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Network interface to bind to |
| `HEADLESS` | *(unset → visible window)* | `true` to hide the Chromium window |
| `CHROME_PATH` | *(Playwright's bundled Chromium)* | Path to an existing Chrome/Chromium/Edge executable |
| `NO_SANDBOX` | *(unset)* | `1` to pass `--no-sandbox` (needed in some Docker/root setups) |
| `ALLOWED_ORIGINS` | `https://socks275.github.io` | Comma-separated list of web origins allowed to drive the browser. Use `none` to disallow all cross-origin access. |

---

## 🧱 Built with

- **Frontend:** Vanilla HTML/JS/CSS + Tailwind CDN + Font Awesome
- **AI:** Google Gemini multimodal vision models (`gemini-2.0-flash`, with automatic fallback)
- **Capture:** WebRTC `getDisplayMedia` screen share + Canvas API
- **Voice:** Web Speech API (`SpeechRecognition` + `SpeechSynthesis`)
- **Browser automation:** Node.js + Playwright (Chromium)

---

## ⚠️ Safety notes

- The AI is instructed **never** to enter passwords, payment details, or personal data — it calls `request_login` and hands control to you for any authentication.
- It will not buy, delete, send money, or publish anything unless your prompt explicitly asks it to.
- You can click **Stop** at any time to halt the agent instantly.
- The local server has no authentication by design — it only listens on the interface you specify. Use `HOST=127.0.0.1` to keep it loopback-only.

## 📄 License

MIT — do what you want, have fun.

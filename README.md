🖥️ ScreenHelp AI

ScreenHelp AI is an interactive, browser-based visual assistant powered by Google Gemini multimodal models. It allows users to capture live screens, paste screenshots, draw annotations, crop regions, and ask questions about their display with visual feedback and voice support.

✨ Features

🎥 Flexible Viewport Inputs:

Share Screen: Live screen capture via WebRTC Screen Share.

Upload & Clipboard: Drag & drop image files or press Ctrl + V (Cmd + V) to paste screenshots directly from your clipboard.

Demo Screenshot Generator: Built-in sample dashboard generator to quickly test functionality without sharing sensitive screens.

✍️ Interactive Canvas Tools:

Freehand Drawing: Draw directly on top of screen captures using Pen and Highlighter tools with custom color picking.

Area Crop Tool: Select and crop specific screen areas for focused AI analysis, with quick one-click crop resetting.

🎯 Visual Target & Coordinate Detection:

Click Target Overlays: Automatically highlights and animates click targets on top of your screen when asking "Where to click?".

Bounding Box Overlay: Renders normalized element bounding boxes directly on top of the rendered image.

🎙️ Voice & Audio Experience:

Continuous Voice Listening: Hands-free continuous speech recognition using Web Speech API.

Text-to-Speech Readout: Instant voice readouts for AI responses with simple toggle controls.

⚡ Smart Model Fallback Chain:

Tries the fastest model first (gemini-3.5-flash-lite), then falls back through gemini-3.1-flash-lite, gemini-3.8-flash, gemini-3.5-flash and the legacy 2.5 models. If every model is busy ("This model is currently experiencing high demand") or rate limited, it waits a few seconds and tries again (up to 3 passes, honouring Google's retry hints). Models your key cannot use are skipped for the rest of the session, and an invalid API key is reported straight away.

🔒 Privacy-First Design:

Gemini is called directly from your browser. API keys are stored locally in localStorage and are never sent to the local server or any other backend. The optional local server only drives the browser for the Browser Agent; it does not receive or store your key.

🚀 Getting Started

Prerequisites

All you need is a modern web browser (Google Chrome, Microsoft Edge, Brave, or Safari) and a Google Gemini API Key.

Get a free API key from Google AI Studio.

Installation

No complex build setup or npm installations are required.

Clone or download the repository:

git clone https://github.com/your-username/screenhelp-ai.git


Open index.html directly in any web browser for the screen-assistant features, or run the local server (required for the Browser Agent, see below):

npm install
npm run install-browser   # downloads Chromium for Playwright (one time)
npm start                 # then open http://localhost:3000

Using a Chrome you already have? Skip the download step and start with CHROME_PATH=/path/to/chrome npm start.


🕹️ How to Use

Configure API Key: Click the Set API Key button in the top right header and paste your Gemini API key.

Load Screen Content:

Click Share Screen to select a monitor or window.

Click Upload or paste (Ctrl+V) an image file.

Ask the AI Assistant:

Use quick action buttons (e.g., "Do you like this design?", "Where to click?", "Find Errors").

Type any prompt in the chat box or use the microphone button for voice input.

Use Visual Tools:

Click Draw to mark areas with the Pen or Highlighter before sending questions.

Click Crop Area to click and drag over a specific UI element you want analyzed.

🤖 Browser Agent (Gemini controls a browser)

The Browser Agent opens a real Chromium window controlled by the local server (server.js) and lets Gemini drive it toward a goal you type, for example "Find the population of Derby on Wikipedia".

1. Run npm start and open http://localhost:3000, then set your API key.
2. Enter a Start URL and your goal in the Browser Agent bar and click Start Agent (or press Enter).
3. Each step, Gemini looks at the browser screenshot and calls one of: navigate, click_at, type_text, key_press, scroll, go_back, wait, or finish. The server performs the action and returns a new screenshot.
4. The step log appears in the chat, and the viewport shows what the browser sees. Click Stop at any time.
5. You can also click directly on the browser view to take over manually (for example to dismiss a login prompt).

Coordinates are normalized to 0–1000 on each axis, measured from the top-left of the page.

Using the hosted page (GitHub Pages)?
GitHub Pages only serves static files, so it cannot run the browser server. On the hosted page, Start Agent answers your goal with Gemini + Google Search instead (with source links). To let Gemini control a real browser from the hosted page:
1. Run npm start on your computer.
2. Click the gear in the Browser Agent bar and enter http://localhost:3000, then Save.
3. If Chrome asks to allow access to devices on your local network, click Allow.
The server only accepts the hosted page's origin (https://socks275.github.io by default). Change it with ALLOWED_ORIGINS, for example ALLOWED_ORIGINS=https://you.github.io npm start, or ALLOWED_ORIGINS=none to turn this off. Safari blocks https pages from calling http://localhost, so use Chrome, Edge or Firefox, or just open http://localhost:3000 directly.

Safety notes:
- The agent only opens http and https pages. Dialogs (alert/confirm) are dismissed automatically.
- The system prompt tells the agent not to enter passwords or payment details, or to buy, send, delete or publish anything unless your goal asks for it. Still, watch the run and use Stop if needed.
- The server has no login. It only listens on the address you run it on; use HOST=127.0.0.1 npm start to keep it on your own machine only.

Environment variables for npm start: PORT (default 3000), HOST (default 0.0.0.0), HEADLESS=false (show the Chromium window on your machine), CHROME_PATH (use an installed Chrome), NO_SANDBOX=1 (needed when running as root in some containers), ALLOWED_ORIGINS (hosted pages allowed to use the browser server; default https://socks275.github.io).

🛠️ Built With

Frontend: HTML5, Vanilla JavaScript (ES6+), CSS3

Styling: Tailwind CSS

Icons: Font Awesome 6

AI API: Google Gemini API (Multimodal Vision & Language)

Browser APIs: WebRTC getDisplayMedia, Web Speech API (SpeechRecognition & SpeechSynthesis), Canvas API

Browser automation: Node.js, Playwright (Chromium)

📄 License

Distributed under the MIT License. See LICENSE for more information.

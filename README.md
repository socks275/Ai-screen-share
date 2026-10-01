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

Utilizes gemini-3.8-flash as primary, automatically falling back through gemini-3.5-flash, gemini-3.5-flash-lite, and gemini-3.1-flash-lite to ensure maximum uptime.

🔒 Privacy-First Design:

Runs completely client-side in your browser. API keys are stored locally in localStorage and never sent to external server backends.

🚀 Getting Started

Prerequisites

All you need is a modern web browser (Google Chrome, Microsoft Edge, Brave, or Safari) and a Google Gemini API Key.

Get a free API key from Google AI Studio.

Installation

No complex build setup or npm installations are required.

Clone or download the repository:

git clone https://github.com/your-username/screenhelp-ai.git


Open index.html directly in any web browser, or serve it using a local static web server:

npx serve .


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

🛠️ Built With

Frontend: HTML5, Vanilla JavaScript (ES6+), CSS3

Styling: Tailwind CSS

Icons: Font Awesome 6

AI API: Google Gemini API (Multimodal Vision & Language)

Browser APIs: WebRTC getDisplayMedia, Web Speech API (SpeechRecognition & SpeechSynthesis), Canvas API

📄 License

Distributed under the MIT License. See LICENSE for more information.

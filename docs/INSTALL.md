# Installation Guide

## Quick Install (End Users)

### From Chrome Web Store
1. Visit the Chrome Web Store listing
2. Click "Add to Chrome"
3. Click "Add extension" in the confirmation dialog
4. Configure your API in the Settings page

### From Release Package
1. Download the latest `.zip` from Releases
2. Extract to a folder
3. Open `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Select the extracted folder

---

## Developer Install

### Prerequisites
- Node.js 18+ 
- npm 9+
- Chrome/Chromium browser

### Setup

```bash
# Clone repository
git clone <repository-url>
cd SurfSafe

# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Production build
npm run build
```

### Load Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist` folder

### Configure API

1. Click SurfSafe icon → Settings
2. Enter API details:
   - **Endpoint**: Your API URL
   - **API Key**: Your key
   - **Model**: Model name
3. Click "Test Connection"
4. Click "Save"

---

## API Setup Options

### OpenAI
```
Endpoint: https://api.openai.com/v1/chat/completions
Model: gpt-4o-mini
```

### Local Ollama
```bash
# Start Ollama
ollama serve

# Endpoint
Endpoint: http://localhost:11434/v1/chat/completions
Model: llama2
```

### OpenRouter
```
Endpoint: https://openrouter.ai/api/v1/chat/completions
Model: openai/gpt-3.5-turbo
```

---

## Troubleshooting

### Extension won't load
- Run `npm run build` first
- Check for errors in `chrome://extensions/`

### API connection fails
- Verify endpoint URL is correct
- Check API key is valid
- Ensure model name is correct

### No analysis appears
- Wait 2 seconds after page load
- Check browser console for errors
- Verify domain isn't whitelisted

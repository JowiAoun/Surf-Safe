# SurfSafe - Quick Start Guide

This guide will help you get SurfSafe up and running in 5 minutes.

## Prerequisites

- Chrome/Chromium browser
- OpenAI API key (or compatible LLM API)

## Installation Steps

### 1. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Navigate to and select the `dist` folder in this project
5. You should see the SurfSafe extension with a shield icon

### 2. Configure API

The extension will automatically open the settings page on first install:

1. **API Endpoint URL**: Enter your LLM API endpoint
   - For OpenAI: `https://api.openai.com/v1/chat/completions`
   - For local Ollama: `http://localhost:11434/v1/chat/completions`

2. **API Key**: Enter your API key
   - Get one from https://platform.openai.com/api-keys
   - Or leave blank if using local Ollama without auth

3. **Model**: Enter the model name
   - For OpenAI: `gpt-4o-mini` (recommended, cheap)
   - For Ollama: `llama2`, `mistral`, etc.

4. Click **"Test Connection"** to verify your settings

5. Click **"Save Configuration"**

### 3. Test It Out

1. Navigate to any website (try a test scam site or normal site)
2. Wait 2-3 seconds for analysis
3. Click the SurfSafe extension icon in your toolbar
4. View the risk assessment results

## Understanding Results

### Risk Levels
- 🟢 **SAFE**: No scam indicators detected
- 🟡 **LOW**: Minor concerns, likely safe
- 🟠 **MEDIUM**: Some red flags, be cautious
- 🔴 **HIGH**: Multiple scam indicators, be very careful
- ⛔ **CRITICAL**: Strong scam indicators, avoid!

### Threat Indicators

When threats are found, you'll see tags like:
- **URGENCY**: "Act now!" pressure
- **TOO_GOOD_TO_BE_TRUE**: Unrealistic promises
- **SUSPICIOUS_LINK**: Misleading URLs
- **IMPERSONATION**: Fake brands
- And more...

## Tips

1. **First Visit Takes Longer**: Initial analysis may take 3-5 seconds
2. **Results Are Cached**: Revisiting a page uses cached results (1 hour)
3. **Re-analyze**: Click "Re-analyze" button to force fresh analysis
4. **Check Confidence**: Higher confidence = more reliable assessment
5. **Use Cheaper Models**: `gpt-4o-mini` is 10x cheaper than `gpt-4` and works great

## Troubleshooting

### "No analysis available"
- Wait a few more seconds, analysis is in progress
- Check browser console for errors (F12)

### "API configuration not found"
- Go to extension settings and configure your API

### "Failed to analyze"
- Verify your API key is correct
- Check you have API credits remaining
- Test connection in settings

### Extension not appearing
- Make sure you loaded the `dist` folder, not the root folder
- Check that the extension is enabled in `chrome://extensions/`

## Cost Considerations

Each page analysis costs approximately:
- **gpt-4o-mini**: ~$0.0001-0.0003 per page
- **gpt-3.5-turbo**: ~$0.0005-0.001 per page
- **Local Ollama**: Free!

Cached results help minimize costs. A typical browsing session:
- 50 unique pages/day × $0.0002 = **~$0.01/day**
- **~$3/year** with aggressive browsing

## Next Steps

1. Browse normally and check results when needed
2. Adjust model based on cost/quality preferences
3. Report any issues on GitHub
4. Customize as needed (Phase 2+)

## Need Help?

- Check the full README.md for detailed documentation
- Open an issue on GitHub
- Review console logs for technical errors

---

Happy safe browsing!

# SurfSafe - AI-Powered Scam Detection Extension

SurfSafe is a Chrome extension that uses AI to analyze websites in real-time and detect potential scam indicators. It leverages OpenAI-compatible LLM APIs to provide intelligent threat assessment.

## Features

- **Real-time Analysis**: Automatically analyzes every page you visit
- **AI-Powered Detection**: Uses LLM to identify 9 different threat categories
- **Privacy-Focused**: All analysis happens through your configured API
- **Flexible API Support**: Works with any OpenAI-compatible endpoint
- **Smart Caching**: Stores analysis results to minimize API calls
- **User-Friendly UI**: Clear risk indicators and detailed explanations

## Threat Detection Categories

SurfSafe detects the following scam indicators:

| Threat Label | Description |
|--------------|-------------|
| `URGENCY` | Time-pressure tactics (e.g., "Act now!", "Limited time!") |
| `PRESSURE` | Coercive language and psychological manipulation |
| `TOO_GOOD_TO_BE_TRUE` | Unrealistic promises and offers |
| `POOR_GRAMMAR` | Language quality issues often found in scams |
| `SENSITIVE_DATA_REQ` | Unusual or suspicious data requests |
| `FAKE_TRUST_SIGNALS` | False authority badges and certifications |
| `SUSPICIOUS_LINK` | Malformed or misleading URLs |
| `IMPERSONATION` | Brand or entity mimicry |
| `SUSPICIOUS_DOMAIN` | Domain age and reputation issues |

## Installation

### Prerequisites

- Node.js 18+ and npm
- Chrome/Chromium browser
- OpenAI-compatible API key (OpenAI, local Ollama, etc.)

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SurfSafe
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

5. **Configure API**
   - Click the SurfSafe icon in your toolbar
   - Click "Settings" or wait for the options page to open automatically
   - Enter your API configuration:
     - **API Endpoint**: Full URL to chat completions endpoint
     - **API Key**: Your API key
     - **Model**: Model name (e.g., `gpt-4o-mini`)
   - Click "Test Connection" to verify
   - Click "Save Configuration"

## Usage

### Automatic Analysis

Once configured, SurfSafe automatically analyzes every page you visit:

1. Navigate to any website
2. Wait 2 seconds for analysis to complete
3. Click the SurfSafe icon to view results

### Reading Results

The popup displays:
- **Risk Level**: SAFE, LOW, MEDIUM, HIGH, or CRITICAL
- **Confidence**: AI's confidence in the assessment (0-100%)
- **Threat Indicators**: Specific scam patterns detected
- **Explanation**: Detailed reasoning for the assessment
- **Timestamp**: When the analysis was performed

### Re-analyzing

To re-analyze a page:
- Click "Re-analyze" in the popup
- This will reload the page and perform a fresh analysis

## Development

### Scripts

```bash
# Development mode with hot reload
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check

# Run tests
npm run test
```

### Project Structure

```
SurfSafe/
├── src/
│   ├── background/       # Service worker
│   │   └── index.ts      # Background script entry point
│   ├── content/          # Content scripts
│   │   └── index.ts      # Injected into web pages
│   ├── popup/            # Extension popup
│   │   ├── index.html    # Popup UI
│   │   ├── index.ts      # Popup logic
│   │   └── styles.css    # Popup styles
│   ├── options/          # Settings page
│   │   ├── index.html    # Options UI
│   │   ├── index.ts      # Options logic
│   │   └── styles.css    # Options styles
│   ├── utils/            # Shared utilities
│   │   ├── api.ts        # LLM API client
│   │   ├── storage.ts    # Chrome storage helpers
│   │   └── messaging.ts  # Message passing utilities
│   └── types/            # TypeScript types
│       └── index.ts      # Shared type definitions
├── assets/
│   └── icons/            # Extension icons
├── public/
│   └── manifest.json     # Chrome extension manifest
├── tests/                # Unit tests
├── scripts/              # Build scripts
└── dist/                 # Build output (generated)
```

### Architecture

**Communication Flow:**
```
Web Page → Content Script → Background Service Worker → LLM API
                ↓                       ↓
            Popup ← ← ← ← ← ← ← ← ← ← ←
```

1. **Content Script** extracts page data (URL, text, links, forms)
2. **Background Worker** handles API communication
3. **LLM API** analyzes the data and returns threat assessment
4. **Results** are cached and stored per-tab
5. **Popup** displays results to the user

### API Configuration

SurfSafe supports any OpenAI-compatible API:

#### OpenAI
```
Endpoint: https://api.openai.com/v1/chat/completions
Model: gpt-4o-mini, gpt-3.5-turbo
```

#### Local Ollama
```
Endpoint: http://localhost:11434/v1/chat/completions
Model: llama2, mistral, phi, etc.
```

#### OpenRouter
```
Endpoint: https://openrouter.ai/api/v1/chat/completions
Model: Various models available
```

#### Custom/Self-hosted
Any endpoint implementing the OpenAI Chat Completions API format.

## Configuration

### Environment Variables

Create a `.env` file (see `.env.example`):

```env
VITE_API_ENDPOINT=https://api.openai.com/v1/chat/completions
VITE_API_KEY=your-api-key-here
VITE_MODEL=gpt-4o-mini
```

**Note**: These are only used for development. In production, users configure their API in the extension settings.

### Extension Settings

All settings are stored in `chrome.storage.sync`:
- API Endpoint URL
- API Key (stored securely)
- Model name

### Cache Settings

Analysis results are cached for 1 hour to reduce API costs. Cache is stored in `chrome.storage.local`.

## Security & Privacy

- **No External Servers**: All data flows directly between your browser and your configured API
- **Secure Storage**: API keys are stored in Chrome's secure storage
- **No Tracking**: No analytics or tracking of any kind
- **Open Source**: All code is transparent and auditable
- **User Control**: You control which API is used and what data is sent

## Limitations

- **API Costs**: Each page analysis consumes API tokens
- **Rate Limits**: Subject to your API provider's rate limits
- **Analysis Time**: May take 1-5 seconds per page
- **Accuracy**: AI detection is not 100% accurate
- **Language**: Best results with English content

## Troubleshooting

### Extension Not Loading

1. Check that `dist/` folder exists (run `npm run build`)
2. Verify manifest.json is valid
3. Check Chrome console for errors

### No Analysis Results

1. Verify API configuration in Settings
2. Click "Test Connection" to diagnose
3. Check browser console for errors
4. Ensure API key has sufficient credits

### High API Costs

1. Analysis results are cached for 1 hour
2. Consider using cheaper models (gpt-3.5-turbo, local Ollama)
3. Disable auto-analysis (future feature)

### CORS Errors

- Content scripts cannot call external APIs due to CORS
- All API calls must go through the background service worker
- This is by design and working correctly

## Roadmap

- [ ] Manual analysis mode (on-demand instead of automatic)
- [ ] Whitelist/blacklist for domains
- [ ] Configurable cache duration
- [ ] Export analysis history
- [ ] Multiple language support
- [ ] Local-only detection (no API) for basic checks
- [ ] Browser action badge with risk indicator

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[Your chosen license]

## Disclaimer

SurfSafe is an AI-assisted tool and may produce false positives or miss actual scams. It should be used as one tool among many for online safety. Always exercise caution when sharing sensitive information online.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Built with**
- TypeScript
- Vite
- Chrome Extension Manifest V3
- OpenAI-compatible LLM APIs

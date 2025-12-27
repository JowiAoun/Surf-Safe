# Privacy Policy

**Last Updated: December 2024**

## Overview

SurfSafe is designed with privacy as a core principle. This policy explains what data we handle and how.

## Data We Handle

### Page Content Analysis
- SurfSafe extracts page text, URLs, and form fields for analysis
- This data is sent to YOUR configured LLM API endpoint
- We do not have access to this data - it goes directly to your API

### API Credentials
- Your API key is stored locally in Chrome's secure storage
- Keys are never transmitted to us or any third party
- Keys are masked in the UI and redacted from logs

### Analysis Results
- Results are cached locally in your browser (24 hours)
- Feedback you provide is stored locally only
- No data is sent to external servers other than your configured API

## Data We Do NOT Collect

- ❌ Browsing history
- ❌ Personal information
- ❌ Analytics or telemetry
- ❌ Cookies or tracking
- ❌ User accounts

## Third-Party Services

SurfSafe connects to the LLM API endpoint YOU configure:
- You control which API service is used
- Review that service's privacy policy
- We recommend trusted providers (OpenAI, local Ollama, etc.)

## Data Storage

| Data | Location | Duration |
|------|----------|----------|
| API Config | Chrome sync storage | Until deleted |
| Analysis Cache | Chrome local storage | 24 hours |
| User Feedback | Chrome local storage | Until cleared |
| Settings | Chrome sync storage | Until deleted |

## Your Rights

You can at any time:
- **View** your stored data via Chrome DevTools
- **Delete** all data by uninstalling the extension
- **Clear cache** via the extension settings
- **Export** analysis reports from the popup

## Security

- All API calls use HTTPS
- API keys stored in Chrome's secure storage
- Content Security Policy prevents XSS
- Input sanitization prevents injection attacks

## Children's Privacy

SurfSafe is not directed at children under 13 and does not knowingly collect data from children.

## Changes to This Policy

We may update this policy. Changes will be noted in the extension's changelog.

## Contact

For privacy concerns, open an issue on our GitHub repository.

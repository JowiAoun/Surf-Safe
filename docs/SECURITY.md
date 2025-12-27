# SurfSafe Security Documentation

## Security Practices

### Content Security Policy (CSP)

The extension uses a strict CSP to prevent XSS attacks:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'"
}
```

- **script-src 'self'**: Only allows scripts from the extension itself
- **object-src 'self'**: Restricts plugins/embeds
- **style-src 'self' 'unsafe-inline'**: Allows extension styles (inline needed for dynamic theming)

### Input Sanitization

All user input is sanitized before use:

| Function | Purpose |
|----------|---------|
| `stripHtmlTags()` | Remove all HTML tags |
| `escapeHtml()` | Escape special characters |
| `sanitizeDomain()` | Validate domain format |
| `sanitizeUrl()` | Validate URL (http/https only) |
| `sanitizeUserInput()` | General text sanitization |

### API Key Security

1. **Storage**: Keys stored in `chrome.storage.sync` (encrypted by Chrome)
2. **Transmission**: Keys sent only to trusted LLM API endpoints over HTTPS
3. **Display**: Keys masked in UI (`sk-****...****`)
4. **Logging**: Keys redacted from error messages

```typescript
// API keys are never logged
export function redactApiKeys(message: string): string {
  return message.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-****REDACTED****');
}
```

### Rate Limiting

- **Default**: 10 requests per minute
- **Purpose**: Prevent API quota exhaustion
- **Recovery**: Automatic cooldown when limit reached

### Permissions

Minimal required permissions:

| Permission | Justification |
|------------|---------------|
| `activeTab` | Access current tab for analysis |
| `storage` | Store settings and cache |
| `scripting` | Inject content scripts |

### Data Handling

1. **Local Only**: Analysis data stored locally, never transmitted
2. **No Telemetry**: No automatic data collection
3. **User Control**: All feedback submission is opt-in

---

## Security Audit Checklist

### XSS Prevention
- [x] CSP blocks inline scripts
- [x] HTML input escaped before display
- [x] DOM manipulation uses safe methods
- [x] No `eval()` or `new Function()` usage

### Injection Prevention
- [x] User input sanitized
- [x] URL validation for all links
- [x] Domain whitelist validated

### API Security
- [x] HTTPS-only API calls
- [x] API keys never logged
- [x] Keys masked in UI
- [x] Rate limiting prevents abuse

### Storage Security
- [x] Sensitive data in `chrome.storage.sync`
- [x] Cache data in local storage (non-sensitive)
- [x] No plain-text password storage

### Privacy
- [x] No automatic telemetry
- [x] User feedback is opt-in
- [x] Page content not stored long-term

---

## Threat Model

### Threats Addressed

| Threat | Mitigation |
|--------|------------|
| XSS Attack | CSP + input sanitization |
| API Key Theft | Secure storage + masking |
| Data Exfiltration | Local-only storage |
| API Abuse | Rate limiting |
| Malicious Domains | Domain validation |

### Risk Assessment

| Risk | Severity | Status |
|------|----------|--------|
| XSS in popup | High | ✅ Mitigated |
| API key exposure | High | ✅ Mitigated |
| Request flooding | Medium | ✅ Mitigated |
| Invalid input | Low | ✅ Mitigated |

---

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. Do not disclose publicly
2. Contact the maintainers directly
3. Provide detailed reproduction steps
4. Allow reasonable time for fix

---

*Last Updated: 2024-12-26*

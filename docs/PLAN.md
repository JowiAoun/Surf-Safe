# Surf Safe Chrome Extension - AI Agent Development Plan

## Project Overview
**Extension Name:** Surf Safe  
**Purpose:** Real-time website reliability assessment using LLM-based analysis to detect scam indicators  
**Target:** AI coding agent development with minimal human intervention  
**Technology Stack:** Chrome Extension (Manifest V3), OpenAI-compatible LLM API

---

## Development Phases

### **Phase 1: Project Setup & Architecture**

**Objective:** Establish foundational structure with proper manifest and build configuration

**Steps:**
1. Initialize project with `manifest.json` (Manifest V3)
2. Create folder structure:
   - `/src` (background, content, popup scripts)
   - `/assets` (icons, styles)
   - `/tests` (unit and integration tests)
   - `/config` (API configuration templates)
3. Set up TypeScript configuration
4. Configure build system (webpack/vite) for extension bundling
5. Create `.env.example` for API key configuration

**Deliverables:**
- Valid `manifest.json` with permissions (activeTab, storage, scripting)
- TypeScript compilation working
- Build process generates `/dist` folder
- Extension loads in Chrome developer mode (displays icon)

**Tests:**
- ✅ Verify manifest schema validation
- ✅ Confirm extension loads without errors in chrome://extensions
- ✅ Test build process produces correct output structure
- ✅ Verify TypeScript compilation succeeds

**Working State:** Extension appears in Chrome toolbar but has no functionality yet

---

### **Phase 2: Core Content Script & DOM Analysis**

**Objective:** Extract and prepare website content for LLM analysis

**Steps:**
1. Create content script that injects into all pages
2. Implement DOM text extraction (visible text only, excluding scripts/styles)
3. Extract metadata (title, description, domain, links)
4. Implement link analysis (href extraction, external link detection)
5. Create data sanitization layer (length limits, content filtering)
6. Implement message passing to background script

**Deliverables:**
- Content script extracts page text (<10,000 chars recommended)
- Captures domain, title, meta tags
- Identifies suspicious URL patterns (excessive hyphens, unicode abuse)
- Sends structured data object to background worker

**Tests:**
- ✅ Load test pages (normal, scam examples) and verify text extraction
- ✅ Confirm invisible elements (hidden divs, scripts) are excluded
- ✅ Test link extraction captures href attributes correctly
- ✅ Verify message passing between content and background scripts
- ✅ Test content length limiting works (prevents oversized payloads)

**Working State:** Content script successfully extracts and forwards page data (visible in console logs)

---

### **Phase 3: Background Service Worker & API Integration**

**Objective:** Implement LLM API communication with retry logic and error handling

**Steps:**
1. Create background service worker
2. Implement secure API key storage (chrome.storage.sync)
3. Build LLM API client with OpenAI-compatible endpoint
4. Design prompt engineering system for scam detection
5. Implement retry logic with exponential backoff
6. Create response parser for structured label output
7. Add error handling (network failures, rate limits, invalid responses)

**Deliverables:**
- Background worker receives content from content script
- API client sends formatted prompts to LLM
- Parses JSON response into ThreatLabel array with confidence scores
- Handles errors gracefully with user-friendly messages

**Prompt Template Example:**
```
Analyze this website content for scam indicators. Return JSON with detected threats:
- Page: {title} | Domain: {domain}
- Content: {text_sample}
- Links: {suspicious_links}

Output format: {"threats": [{"label": "URGENCY", "confidence": 0.85, "evidence": "..."}]}
```

**Tests:**
- ✅ Mock API responses and verify parsing logic
- ✅ Test API key retrieval from storage
- ✅ Simulate network failures and confirm retry attempts
- ✅ Test rate limit handling (429 responses)
- ✅ Verify structured JSON parsing with various LLM response formats
- ✅ Test timeout handling (slow API responses)

**Working State:** Background worker successfully communicates with LLM API and returns parsed threat labels (testable via manual triggers)

---

### **Phase 4: Popup UI & Results Display**

**Objective:** Create intuitive user interface to display threat assessment

**Steps:**
1. Design popup HTML structure (320x500px recommended)
2. Implement threat severity visualization (color-coded system)
3. Create threat detail cards (expandable explanations)
4. Add overall safety score calculation
5. Implement loading states and error displays
6. Add settings button to configure API key
7. Style with responsive CSS (support dark/light themes)

**Deliverables:**
- Popup displays when extension icon is clicked
- Shows overall safety rating (Safe/Caution/Danger)
- Lists detected threats with confidence levels
- Expandable sections show evidence snippets
- Loading spinner during analysis
- Clear error messages for API/configuration issues

**UI Components:**
- Safety gauge (0-100 score)
- Threat badge list with icons per label type
- "Why is this flagged?" expandable sections
- Settings gear icon → API configuration page

**Tests:**
- ✅ Test popup rendering with various threat combinations
- ✅ Verify score calculation logic (weighted by confidence)
- ✅ Test UI states: loading, success, error, no threats
- ✅ Confirm responsive layout at different sizes
- ✅ Test dark/light theme switching
- ✅ Verify settings page opens correctly

**Working State:** Clicking extension icon shows analysis results for current page with visual threat indicators

---

### **Phase 5: Settings & Configuration Page**

**Objective:** Allow users to configure API settings and sensitivity preferences

**Steps:**
1. Create settings.html page (options UI)
2. Implement API key input with validation
3. Add API endpoint configuration (custom base URLs)
4. Create sensitivity slider (adjust confidence thresholds)
5. Implement whitelist/blacklist domain management
6. Add "Test Connection" button
7. Persist settings to chrome.storage.sync

**Deliverables:**
- Settings page accessible from popup and right-click menu
- Secure API key storage (never exposed in content scripts)
- Endpoint configuration for different OpenAI-compatible providers
- Sensitivity adjustment (Low/Medium/High detection modes)
- Domain whitelist to skip trusted sites
- Connection test provides immediate feedback

**Tests:**
- ✅ Test API key validation (format checking)
- ✅ Verify settings persistence across browser restarts
- ✅ Test "Test Connection" with valid/invalid credentials
- ✅ Confirm whitelist prevents scanning on specified domains
- ✅ Test sensitivity adjustments affect threat detection
- ✅ Verify secure storage (keys not readable by content scripts)

**Working State:** Users can configure extension settings, test API connection, and customize detection sensitivity

---

### **Phase 6: Caching & Performance Optimization**

**Objective:** Reduce API calls and improve response times

**Steps:**
1. Implement result caching (store analyses for 24h)
2. Create cache key system (domain + content hash)
3. Add cache invalidation logic (time-based + manual)
4. Implement debouncing for rapid page navigation
5. Add background analysis queueing
6. Optimize content extraction (exclude irrelevant sections)
7. Implement progressive analysis (analyze above-the-fold first)

**Deliverables:**
- Cache system stores previous analyses
- Reduces redundant API calls for revisited sites
- Quick results for cached pages (<100ms)
- Handles navigation without excessive requests
- Queue system prevents API spam

**Tests:**
- ✅ Verify cache hit/miss logic works correctly
- ✅ Test cache expiration after 24 hours
- ✅ Confirm cache invalidation on manual refresh
- ✅ Test debouncing prevents rapid-fire analyses
- ✅ Verify queue system handles burst traffic
- ✅ Measure performance improvement (cache vs. fresh analysis)

**Working State:** Extension responds instantly for cached sites, queues requests intelligently for new sites

---

### **Phase 7: Enhanced Detection Features**

**Objective:** Implement advanced scam detection capabilities

**Steps:**
1. Add URL reputation checking (domain age, WHOIS data via APIs)
2. Implement screenshot capture for visual analysis
3. Create SSL certificate validation checking
4. Add favicon/logo analysis (brand impersonation detection)
5. Implement form field analysis (excessive sensitive data requests)
6. Add external threat database integration (optional)
7. Create heuristic pre-filters (quick local checks before LLM)

**Deliverables:**
- Multi-layer detection combining LLM + heuristics
- Domain reputation score from external APIs
- Visual impersonation detection
- Form analysis identifies PII requests
- Heuristic filters catch obvious scams without API call

**Tests:**
- ✅ Test domain reputation API integration
- ✅ Verify screenshot capture works on various page layouts
- ✅ Test SSL validation with valid/expired/self-signed certificates
- ✅ Confirm form field detection identifies sensitive inputs
- ✅ Test heuristic filters catch common patterns (e.g., "Act now!")
- ✅ Verify combined scoring logic weights multiple factors

**Working State:** Extension provides comprehensive threat assessment using multiple detection methods

---

### **Phase 8: User Feedback & Reporting System**

**Objective:** Enable users to report false positives/negatives and improve detection

**Steps:**
1. Add "Report Issue" button in popup
2. Create feedback form (false positive/negative, missed threat)
3. Implement anonymized telemetry (optional, with consent)
4. Add user voting on threat accuracy
5. Create local learning system (user corrections stored)
6. Implement export functionality (share threat reports)

**Deliverables:**
- Feedback mechanism in popup UI
- Users can flag incorrect assessments
- Optional telemetry sends anonymized data for improvement
- User corrections influence future local analyses
- Export button generates shareable report

**Tests:**
- ✅ Test feedback submission flow
- ✅ Verify anonymization of telemetry data
- ✅ Test local learning adjusts future predictions
- ✅ Confirm export generates valid report format
- ✅ Test opt-in/opt-out for telemetry

**Working State:** Users can provide feedback, improving detection accuracy over time

---

### **Phase 9: Security Hardening & Privacy**

**Objective:** Ensure extension meets security best practices

**Steps:**
1. Implement Content Security Policy (CSP)
2. Add input sanitization for all user-provided data
3. Implement rate limiting on API calls (prevent abuse)
4. Add permission validation (minimal necessary permissions)
5. Implement secure API key transmission (never log/expose)
6. Add privacy policy generation
7. Conduct security audit checklist

**Deliverables:**
- CSP headers prevent XSS attacks
- All inputs validated and sanitized
- Rate limiting prevents API quota exhaustion
- API keys never exposed in logs or error messages
- Privacy policy clearly states data handling
- Security audit checklist completed

**Tests:**
- ✅ Test XSS prevention with malicious input attempts
- ✅ Verify rate limiting blocks excessive requests
- ✅ Confirm API keys are not visible in network logs
- ✅ Test CSP blocks unauthorized script execution
- ✅ Verify minimal permissions (no unnecessary access)
- ✅ Security audit: check for common vulnerabilities

**Working State:** Extension passes security audit with no critical vulnerabilities

---

### **Phase 10: Cross-Browser Compatibility & Distribution Prep**

**Objective:** Prepare extension for publication on Chrome Web Store

**Steps:**
1. Test on multiple Chrome versions (latest stable, beta)
2. Validate Manifest V3 compliance
3. Create store listing assets (screenshots, descriptions)
4. Prepare promotional materials (demo video, 1280x800 tile)
5. Write user documentation (README, usage guide)
6. Create privacy policy and terms of service
7. Package extension for submission (.zip with proper structure)
8. Set up update manifest for auto-updates

**Deliverables:**
- Extension works on Chrome 88+ (Manifest V3 minimum)
- Store listing materials prepared (5 screenshots, 128x128 icon)
- Documentation complete (installation, configuration, usage)
- Privacy policy published (required for store)
- Packaged .zip ready for upload
- Update manifest hosted (for future updates)

**Tests:**
- ✅ Test on Chrome stable, beta, dev channels
- ✅ Verify manifest validation passes (Chrome's official tool)
- ✅ Test installation from .crx file
- ✅ Confirm auto-update mechanism works
- ✅ Validate store listing meets all requirements
- ✅ End-to-end user flow test (fresh install → configuration → usage)

**Working State:** Extension fully functional, documented, and ready for Chrome Web Store submission

---

## Testing Strategy Overview

### **Unit Tests**
- Individual function testing (content extraction, API parsing, scoring)
- Mock external dependencies (API, storage, DOM)
- Target: 80%+ code coverage

### **Integration Tests**
- Component interaction testing (content script ↔ background ↔ popup)
- Real API testing with test endpoints
- Cache and storage integration

### **End-to-End Tests**
- Full user workflow automation (Puppeteer/Playwright)
- Test on known scam websites (with permission/test environments)
- Performance benchmarking (analysis time, memory usage)

### **Manual Testing Checklist**
- Test on 20+ real websites (legitimate + known scams)
- Various page types (e-commerce, banking, news, social)
- Edge cases (single-page apps, heavy JavaScript sites)
- Internationalization (non-English sites)

---

## Success Criteria

**Phase Completion Requirements:**
- All tests passing (unit, integration, E2E)
- No critical bugs or security vulnerabilities
- Performance metrics met (analysis <5s, memory <50MB)
- User documentation complete
- Code review passed (if applicable)

**Launch Readiness Checklist:**
- ✅ Manifest V3 validated
- ✅ Security audit complete
- ✅ Privacy policy published
- ✅ Chrome Web Store guidelines met
- ✅ Demo video prepared
- ✅ User testing feedback incorporated
- ✅ Analytics/crash reporting implemented (optional)

---

## Risk Mitigation

**Potential Risks:**
1. **LLM API costs** → Implement aggressive caching, rate limiting
2. **False positives** → User feedback system, adjustable sensitivity
3. **Performance issues** → Background analysis, progressive loading
4. **API key exposure** → Secure storage, no logging, CSP enforcement
5. **Chrome policy violations** → Regular manifest validation, minimal permissions

---

## Post-Launch Maintenance Plan

1. **Monitor user feedback** → Address false positives/negatives
2. **Update threat patterns** → Refine prompts based on new scam types
3. **Performance optimization** → Analyze telemetry, reduce latency
4. **Feature enhancements** → Add requested capabilities
5. **Security updates** → Patch vulnerabilities, dependency updates

---

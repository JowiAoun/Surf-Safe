# Suspicious Text Highlighting

Highlight suspicious text directly on webpages, providing immediate visual feedback on which content triggered threat detection labels.

## Overview

This feature enhances SurfSafe's threat visualization by highlighting the exact text passages on a webpage that the AI identified as suspicious. Instead of just seeing a summary in the popup, users can visually see which parts of a page contributed to the risk assessment.

## User Experience

### Visual Indicators
- Suspicious text is highlighted with a subtle, semi-transparent background color
- The highlight color intensity corresponds to threat severity:
  - **Low**: Light yellow highlight
  - **Medium**: Light orange highlight  
  - **High/Critical**: Light red highlight
- Highlights do not affect page layout, text flow, or other page functionality

### Hover Tooltip
When hovering over highlighted text, a tooltip appears showing:
- The threat label(s) triggered (e.g., `URGENCY`, `PRESSURE`, `TOO_GOOD_TO_BE_TRUE`)
- Brief description of why this text is suspicious
- Confidence level for the detection

**Tooltip Example:**
```
⚠️ URGENCY
"Act now!" language creates artificial time pressure
Confidence: 85%
```

### Settings Toggle
Users can enable/disable highlighting from the Settings page:
- **Toggle Switch**: "Highlight Suspicious Text"
- **Default State**: Enabled
- **Persistence**: Stored in `chrome.storage.sync`

## Technical Requirements

### Content Script Updates

#### New Module: `src/content/highlighter.ts`

```typescript
interface HighlightData {
  text: string;
  labels: ThreatLabel[];
  confidence: number;
  evidence?: string;
}

interface HighlightConfig {
  enabled: boolean;
}
```

**Key Functions:**
- `highlightSuspiciousText(highlights: HighlightData[]): void` - Apply highlights to page
- `clearHighlights(): void` - Remove all highlights from page
- `createTooltip(data: HighlightData): HTMLElement` - Generate tooltip element

#### Highlighting Approach
1. Use `TreeWalker` to traverse text nodes
2. Wrap suspicious text in `<mark>` elements with custom `data-surfsafe-*` attributes
3. Apply CSS classes for styling, not inline styles
4. Use CSS `pointer-events` to ensure highlights don't intercept page interactions

#### CSS Classes
```css
.surfsafe-highlight {
  background-color: var(--highlight-color);
  border-radius: 2px;
  cursor: help;
  /* Ensure no layout impact */
  display: inline;
  margin: 0;
  padding: 0;
}

.surfsafe-highlight--low { --highlight-color: rgba(255, 235, 59, 0.3); }
.surfsafe-highlight--medium { --highlight-color: rgba(255, 152, 0, 0.3); }
.surfsafe-highlight--high { --highlight-color: rgba(244, 67, 54, 0.3); }

.surfsafe-tooltip {
  position: absolute;
  z-index: 999999;
  background: #1a1a1a;
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  max-width: 280px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  pointer-events: none;
}
```

### Types Updates

#### `src/types/index.ts`

```typescript
export interface TextHighlight {
  text: string;
  startOffset: number;
  endOffset: number;
  labels: ThreatLabel[];
  confidence: number;
  evidence?: string;
}

export interface ExtensionSettings {
  // ... existing fields
  highlightSuspiciousText: boolean; // NEW
}
```

### API Response Updates

The LLM prompt should be updated to request text passages that triggered each threat label. The response should include:

```typescript
interface EnhancedAnalysisResult {
  // ... existing fields
  suspiciousPassages?: Array<{
    text: string;
    labels: ThreatLabel[];
    confidence: number;
    reason: string;
  }>;
}
```

### Settings Page Updates

#### `src/options/index.html`
Add a new toggle in the settings UI:

```html
<div class="setting-row">
  <label for="highlight-toggle">Highlight Suspicious Text</label>
  <p class="setting-description">
    Visually highlight suspicious phrases directly on webpages
  </p>
  <input type="checkbox" id="highlight-toggle" />
</div>
```

#### `src/options/index.ts`
- Load and save the `highlightSuspiciousText` setting
- Sync with existing extension settings management

### Message Passing

New message type for toggling highlights:

```typescript
export enum MessageType {
  // ... existing types
  TOGGLE_HIGHLIGHTS = 'TOGGLE_HIGHLIGHTS',
  UPDATE_HIGHLIGHTS = 'UPDATE_HIGHLIGHTS',
}
```

## Constraints

### Page Compatibility
- Must not break page JavaScript or CSS
- Must not interfere with form submissions or link clicks
- Must handle dynamic content (SPA page changes)
- Must properly clean up when navigating away

### Performance
- Lazy load highlighting only when enabled
- Limit number of highlights per page (max ~50)
- Debounce highlight updates on dynamic pages
- Use CSS for animations, not JavaScript

### Accessibility
- Highlights must maintain sufficient contrast
- Tooltips should be accessible via keyboard (Tab focus)
- Include `aria-describedby` linking to tooltip content

## Files to Modify

| File | Changes |
|------|---------|
| `src/content/highlighter.ts` | [NEW] Core highlighting module |
| `src/content/styles.css` | [NEW] Highlight and tooltip styles |
| `src/content/index.ts` | Import and integrate highlighter |
| `src/types/index.ts` | Add `TextHighlight` type and update `ExtensionSettings` |
| `src/options/index.html` | Add highlight toggle UI |
| `src/options/index.ts` | Handle highlight toggle setting |
| `src/background/index.ts` | Handle highlight-related messages |
| `src/utils/api.ts` | Update prompt to request suspicious passages |

## Future Considerations

- **Custom highlight colors**: Let users choose their own highlight palette
- **Highlight intensity setting**: Adjust opacity/visibility of highlights
- **Export highlights**: Allow users to copy/export all highlighted text
- **Highlight history**: Show which text was highlighted on previous visits

# Kalshi Intelligence Layer

A Chrome Extension (Manifest V3) that transforms Kalshi market pages into a customizable intelligence workspace.

## Public Links

- Website: https://kalshi-intelligence-site.vercel.app/
- Privacy Policy: https://kalshi-intelligence-site.vercel.app/privacy.html
- Source / Issues: https://github.com/anirudhpareek/kalshi-edge-os

## Features

- **Intelligence Block**: Live probability, bid/ask spread, volume, open interest, and a sparkline chart that builds over time via 30-second polling.
- **Context Block**: Relevant news headlines from Google News RSS, with optional AI-powered 4-bullet summary (bring your own Anthropic API key).
- **Thesis Block**: Personal notes per market. Fields: My Probability, My Thesis, What Would Change My Mind. Autosaves to local storage.
- **Related Markets Block**: Finds related markets from the same event, series, or keyword overlap.
- **Alerts Block**: Set probability threshold alerts (above/below/moves-by). Chrome notifications fire while the browser is open.
- Collapsible panel with hotkey `Ctrl+Shift+K` (or `Cmd+Shift+K`)
- Resizable panel width (drag the left edge)
- Block drag-and-drop reordering
- Dark/Light/System theme
- All data stays local on the device (thesis, layout, alerts, caches)

## Requirements

- Node.js 18+
- npm 9+
- Google Chrome (or Chromium-based browser supporting MV3)

## Build Instructions

```bash
# 1. Navigate to the project directory
cd kalshi-edge-os

# 2. Install dependencies
npm install

# 3. Generate extension icons
node scripts/generate-icons.mjs

# 4. Build the extension
npm run build
```

The built extension will be in the `dist/` directory.

## Loading in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `dist/` folder inside the `kalshi-edge-os` directory
5. The extension icon should appear in your toolbar

## Testing on Kalshi Pages

1. Navigate to any market page on [kalshi.com](https://kalshi.com), for example:
   - `https://kalshi.com/markets/INXD-23DEC29-B5000`
   - Any URL matching `https://kalshi.com/markets/TICKER`
2. The intelligence panel should appear on the right side within 500ms
3. Market data loads automatically from the Kalshi public API

To collapse/expand the panel: press `Ctrl+Shift+K` (Windows/Linux) or `Cmd+Shift+K` (Mac), or click the arrow tab on the panel's left edge.

## How Alerts Work

1. Navigate to a market page and open the **Alerts** block
2. Choose a condition: "Yes price above X%", "Yes price below X%", or "Moves by X% in N minutes"
3. Enter the threshold value and click **Add Alert**
4. The background service worker polls the Kalshi API every 30 seconds
5. When a condition triggers, a Chrome notification appears
6. Alerts have a 10-minute cooldown to prevent repeated notifications
7. Alerts persist across browser sessions (stored in `chrome.storage.local`)

Note: Alerts only fire while Chrome is running. The service worker is active as long as Chrome is open.

## How to Enable AI Summaries (Optional)

1. Open `chrome://extensions`, find the extension card, and open the extension's options page
2. Enable "AI summaries" toggle
3. Enter your Anthropic API key (starts with `sk-ant-`)
4. The Context block will now show a 4-bullet AI summary of headlines

**Privacy note**: Your thesis notes are never sent to any AI. Only the news headlines (which are already public) are sent to the Anthropic API when the feature is enabled.

## Development

```bash
# Watch mode (rebuilds on changes)
npm run dev
```

After changes, reload the extension in `chrome://extensions` by clicking the refresh icon on the extension card.

## Architecture

```
src/
  background/
    serviceWorker.ts   # MV3 service worker: API fetching, alert polling, notifications
  contentScript/
    index.tsx          # Injects panel into Kalshi pages via Shadow DOM
  ui/
    App.tsx            # Main React app
    components/
      Panel.tsx        # Collapsible, resizable panel container
      BlockWrapper.tsx # Drag-and-drop block container
      blocks/
        IntelligenceBlock.tsx  # Market data + sparkline
        ContextBlock.tsx       # News + LLM summary
        ThesisBlock.tsx        # Personal notes
        RelatedMarketsBlock.tsx
        AlertsBlock.tsx
    hooks/
      useStorage.ts      # chrome.storage wrappers as React hooks
      useMarketData.ts   # Market data fetching hooks
      useKeyboardShortcut.ts
    styles/
      app.css            # All styles (injected into Shadow DOM)
  lib/
    types.ts           # TypeScript types
    storage.ts         # Typed chrome.storage wrappers
    kalshiClient.ts    # Kalshi Trade API v2 client
    alerts.ts          # Alert evaluation logic
    newsClient.ts      # Google News RSS fetcher + LLM summarizer
  options/
    Options.tsx        # Settings page React component
    options.html       # Options page HTML
    index.tsx          # Options page entry point
```

## Manifest Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save prefs, thesis, alerts, and caches |
| `notifications` | Show alert notifications |
| `alarms` | Periodic polling (MV3 service workers require alarms for persistence) |
| Host: `kalshi.com/*` | Content script injection |
| Host: `api.elections.kalshi.com/*` | Kalshi public API calls |
| Host: `news.google.com/*` | Google News RSS fetching |
| Host: `api.anthropic.com/*` | Optional AI summaries |

## Data Sources

- **Market data**: Kalshi Trade API v2 (`https://api.elections.kalshi.com/trade-api/v2`) - public endpoints, no authentication required
- **News**: Google News RSS search (`https://news.google.com/rss/search?q=QUERY`)
- **Price history**: Local cache only (polled every 30s, stored in `chrome.storage.local`)

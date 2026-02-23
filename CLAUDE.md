# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Kalshi Intelligence Layer — a Chrome Extension (Manifest V3) that injects a React-based intelligence panel into Kalshi market pages via Shadow DOM. Uses React 18, TypeScript (strict), and Vite.

## Commands

```bash
npm run build              # Production build (two-phase Vite: service worker + content script IIFE)
npm run dev                # Watch mode with auto-rebuild
npm run typecheck          # tsc --noEmit
npm run generate-icons     # Generate PNG icons (16/48/128px)
```

No test runner or linter is configured yet.

**Loading in Chrome**: Load `dist/` as unpacked extension at `chrome://extensions` (Developer mode). Toggle panel with `Cmd+Shift+K` / `Ctrl+Shift+K`.

## Architecture

Three-process Chrome extension model:

- **Service Worker** (`src/background/serviceWorker.ts`) — Handles all API calls (Kalshi, Google News, Anthropic), alert polling via `chrome.alarms` (30s interval), and Chrome notifications. Content script communicates with it via `chrome.runtime.sendMessage`.
- **Content Script** (`src/contentScript/index.tsx`) — Injects React app into Kalshi pages inside a Shadow DOM for CSS isolation. Uses MutationObserver to detect SPA navigation and reinitialize.
- **Options Page** (`src/options/`) — Settings UI for theme, layout, and optional Anthropic API key.

### Build System

`scripts/build.mjs` runs two sequential Vite builds:
1. **Main build** (ES modules): service worker + options page
2. **Content script build** (IIFE): all dependencies inlined, no code splitting — required for content script injection

### Data Flow

Content script hooks → `chrome.runtime.sendMessage` → service worker → Kalshi/News APIs → `chrome.storage` → React re-renders via storage listeners.

### Storage

- **`chrome.storage.sync`**: User preferences (theme, layout, panel width, API keys)
- **`chrome.storage.local`**: Market caches, thesis notes, price history (max 120 points), alerts, news caches (15min TTL)

Typed wrappers in `src/lib/storage.ts`; React hooks in `src/ui/hooks/useStorage.ts`.

### Key Modules

- `src/lib/types.ts` — All TypeScript interfaces and message type discriminated unions
- `src/lib/kalshiClient.ts` — Kalshi Trade API v2 client (public endpoints, no auth, prices in cents 0-100)
- `src/lib/newsClient.ts` — Google News RSS parser + optional Claude summary (uses `claude-haiku-4-5`)
- `src/lib/alerts.ts` — Alert evaluation logic (above/below/move-by-% conditions, 10min notification cooldown)
- `src/ui/components/blocks/` — Feature blocks: Intelligence, Context, Thesis, RelatedMarkets, Alerts

## Conventions

- Conventional commits (`feat:`, `fix:`, etc.)
- CSS class prefix: `kil-` for all component-specific classes
- All styles in `src/ui/styles/app.css` (injected into Shadow DOM)
- Theme classes: `.theme-light`, `.theme-dark`
- Message types between processes use discriminated union pattern in `types.ts`
- Response format from service worker: `{ ok: boolean, data?: T, error?: string }`

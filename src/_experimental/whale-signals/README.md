# Whale Signals Feature (Experimental)

**Status:** Not shipped - Kalshi markets don't have enough large trade volume to make this useful.

## What it does
- Tracks large trades ($1k+ "large", $10k+ "whale") in real-time
- Shows recent trades with tier indicators (whale/shark emoji)
- Displays 24h volume and average whale entry price
- Whale bias bar showing YES vs NO sentiment
- "Unusual activity" alert when volume spikes above baseline

## Why it was shelved
Kalshi doesn't expose trader identities (unlike Polymarket's on-chain wallets), so we can only detect trade *size*, not *who* made the trade. Most markets don't have enough large trades to provide useful signals.

## Files
- `whaleClient.ts` - Signal processing logic
- `WhaleSignalsBlock.tsx` - UI component
- `types.ts` - Type definitions
- `styles.css` - CSS styles

## To re-enable
1. Copy types from `types.ts` to `src/lib/types.ts`
2. Add `'whales'` to `BlockType` and `DEFAULT_BLOCKS`
3. Add `'FETCH_WHALE_SIGNALS'` to `MessageType`
4. Copy `whaleClient.ts` to `src/lib/`
5. Add fetchTrades to `kalshiClient.ts` (see types.ts for KalshiRawTrade)
6. Copy `WhaleSignalsBlock.tsx` to `src/ui/components/blocks/`
7. Add CSS from `styles.css` to `app.css`
8. Wire up in `App.tsx` and `serviceWorker.ts`

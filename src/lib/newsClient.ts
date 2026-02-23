/**
 * News client: fetches headlines from Google News RSS.
 * All fetches run in the background service worker (no CORS issues).
 * Results are cached in chrome.storage.local.
 */
import type { NewsItem } from './types';
import { getCachedNews, setCachedNews } from './storage';

const RATE_LIMIT_MS = 5000; // minimum gap between fetches for same query
const lastFetchTime: Record<string, number> = {};

/**
 * Build a Google News RSS URL for a search query.
 */
function buildRSSUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * Parse a simple RSS/Atom feed XML string into NewsItems.
 */
function parseRSSXML(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  // Extract <item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const source = extractAttr(block, 'source', 'url') || extractTag(block, 'source');

    if (title && link) {
      items.push({
        title: decodeHTMLEntities(stripCDATA(title)),
        url: stripCDATA(link).trim(),
        source: decodeHTMLEntities(stripCDATA(source)),
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }

    if (items.length >= 15) break;
  }

  return items;
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return re.exec(xml)?.[1]?.trim() ?? '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*>`, 'i');
  return re.exec(xml)?.[1]?.trim() ?? '';
}

function stripCDATA(s: string): string {
  return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function decodeHTMLEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Fetch news for a query. Returns cached results if fresh.
 * Call this from the background service worker only.
 */
export async function fetchNews(query: string): Promise<NewsItem[]> {
  // Return cached if available
  const cached = await getCachedNews(query);
  if (cached) return cached;

  // Rate limit
  const now = Date.now();
  const lastFetch = lastFetchTime[query] ?? 0;
  if (now - lastFetch < RATE_LIMIT_MS) {
    return [];
  }
  lastFetchTime[query] = now;

  try {
    const url = buildRSSUrl(query);
    const res = await fetch(url, {
      headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' },
    });

    if (!res.ok) {
      throw new Error(`News fetch HTTP ${res.status}`);
    }

    const xml = await res.text();
    const items = parseRSSXML(xml);

    if (items.length > 0) {
      await setCachedNews(query, items);
    }

    return items;
  } catch (err) {
    console.warn('[newsClient] fetchNews error:', err);
    return [];
  }
}

/**
 * Summarize headlines using Claude API.
 * Only called when user has provided their own API key and enabled the feature.
 */
export async function summarizeWithLLM(
  headlines: NewsItem[],
  marketTitle: string,
  apiKey: string
): Promise<string[]> {
  const headlineText = headlines
    .slice(0, 10)
    .map((h, i) => `${i + 1}. ${h.title}`)
    .join('\n');

  const prompt = `You are an analyst. The market is: "${marketTitle}"

Recent headlines:
${headlineText}

Summarize the key information relevant to this market prediction in exactly 4 brief bullet points. Each bullet should be one sentence. Output only the bullets, no preamble.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json() as {
    content: Array<{ type: string; text: string }>;
  };
  const text = json.content.find((c) => c.type === 'text')?.text ?? '';
  return text
    .split('\n')
    .map((l) => l.replace(/^[-*\d.]+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

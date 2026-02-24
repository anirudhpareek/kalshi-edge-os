import React from 'react';
import type { NewsItem } from '../../../lib/types';

interface Props {
  news: NewsItem[];
  loading: boolean;
  error: string | null;
  bullets: string[];
  bulletsLoading: boolean;
  llmEnabled: boolean;
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return '';
  }
}

const INITIAL_NEWS_COUNT = 4;

export function ContextBlock({ news, loading, error, bullets, bulletsLoading, llmEnabled }: Props) {
  const [expanded, setExpanded] = React.useState(false);
  if (loading && news.length === 0) {
    return (
      <div className="kil-skeleton-group">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <div className="kil-skeleton" style={{ width: `${85 + (i % 2) * 10}%` }} />
            <div className="kil-skeleton" style={{ width: '40%', marginTop: 3 }} />
          </div>
        ))}
      </div>
    );
  }

  if (error && news.length === 0) {
    return <div className="kil-error">{error}</div>;
  }

  if (news.length === 0) {
    return <div className="kil-empty-state">No headlines found</div>;
  }

  return (
    <div>
      {/* LLM Bullets */}
      {llmEnabled && (
        <div className="kil-llm-bullets">
          <div className="kil-llm-label">AI Summary</div>
          {bulletsLoading ? (
            <div className="kil-skeleton-group">
              {[1, 2, 3, 4].map((i) => <div key={i} className="kil-skeleton" style={{ width: `${70 + i * 5}%` }} />)}
            </div>
          ) : bullets.length > 0 ? (
            <ul>
              {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          ) : (
            <div className="kil-empty-state" style={{ textAlign: 'left', paddingTop: 4 }}>
              Summary will appear here
            </div>
          )}
          <div className="kil-divider" />
        </div>
      )}

      {/* Headlines */}
      <ul className="kil-news-list">
        {news.slice(0, expanded ? 8 : INITIAL_NEWS_COUNT).map((item, i) => (
          <li key={i} className="kil-news-item">
            <a
              className="kil-news-link"
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              {item.title}
            </a>
            <div className="kil-news-meta">
              {item.source && (
                <span className="kil-news-source">{item.source}</span>
              )}
              {item.publishedAt && (
                <span>{timeAgo(item.publishedAt)}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {news.length > INITIAL_NEWS_COUNT && (
        <button
          className="kil-show-more"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `Show ${news.length - INITIAL_NEWS_COUNT} more`}
        </button>
      )}
    </div>
  );
}

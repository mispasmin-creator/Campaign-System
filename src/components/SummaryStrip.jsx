import React from 'react';

export default function SummaryStrip({ items = [] }) {
  // Outline icons for summary metrics
  const getIcon = (label, tone) => {
    const l = (label || '').toLowerCase();
    if (l.includes('open')) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 14 14" />
        </svg>
      );
    }
    if (l.includes('due') || l.includes('today')) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    }
    if (l.includes('delay') || tone === 'r' || tone === 'bad') {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    }
    if (l.includes('call')) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    }
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    );
  };

  return (
    <div className="summary-strip">
      {items.map((it, idx) => {
        let toneClass = '';
        if (it.tone === 'r' || it.tone === 'bad') toneClass = 'bad';
        else if (it.tone === 'w' || it.tone === 'warn') toneClass = 'warn';
        else if (it.tone === 'g' || it.tone === 'good') toneClass = 'good';

        return (
          <div key={idx} className={`metric-tile ${toneClass}`}>
            <div className="metric-icon-box">
              {getIcon(it.label, it.tone)}
            </div>
            <div className="metric-content">
              <span className="metric-val">{it.value}</span>
              <span className="metric-lbl">{it.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

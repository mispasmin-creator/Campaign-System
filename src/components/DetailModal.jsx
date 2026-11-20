import React from 'react';

function getDriveFileId(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  // The Shutdown Inspection sheet may contain a raw Drive file ID rather
  // than a full URL, depending on how the value was written to the cell.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return '';
}

/**
 * Converts a Google Drive link or ID into a clean image preview/thumbnail URL
 */
export function getDriveImagePreview(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:')) return url;
  const fileId = getDriveFileId(url);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }
  return url;
}

/** Returns a full-size image URL for a Drive file (or the original URL). */
export function getDriveImageFullUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:')) return url;
  const fileId = getDriveFileId(url);
  if (fileId) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }
  return url;
}

/**
 * Universal Mobile & Desktop Record Detail Modal
 * Displays comprehensive key-value information, status, readings, and photos
 * inspired by modern mobile app card UI.
 */
export default function DetailModal({
  isOpen,
  onClose,
  title = 'Record Details',
  subtitle,
  badge,
  hideBadge = false,
  badgeTone = 'good',
  items = [],
  readings = null, // e.g. { title: '9-Zone Readings', unit: 'mm', values: [200, 195, ...] }
  photoUrl = null,
  photoUrls = null,
  hiddenItemLabels = [],
  onEdit = null,
  editLabel = 'Edit Record'
}) {
  if (!isOpen) return null;

  const photos = Array.isArray(photoUrls)
    ? photoUrls.filter(Boolean)
    : (photoUrl ? [photoUrl] : []);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14px'
      }}
    >
      <div
        className="modal-card detail-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '88vh',
          overflowY: 'auto',
          borderRadius: '24px',
          boxSizing: 'border-box'
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '16px',
            paddingBottom: '14px',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {title}
              </h3>
              {badge && !hideBadge && (
                <span className={`pill ${badgeTone}`} style={{ fontSize: '11px', padding: '3px 8px' }}>
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close detail popup"
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              fontSize: '16px'
            }}
          >
            ✕
          </button>
        </div>

        {/* KEY-VALUE DETAILS GRID */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px 14px',
            marginBottom: '18px'
          }}
        >
          {items.filter((it) => !hiddenItemLabels.includes(it.label)).map((it, idx) => {
            const isFull = it.fullWidth || (it.value && String(it.value).length > 30);
            return (
              <div
                key={idx}
                style={{
                  gridColumn: isFull ? '1 / -1' : 'span 1',
                  background: 'var(--surface-inset)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '9px 12px'
                }}
              >
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--text-muted)',
                    marginBottom: '3px'
                  }}
                >
                  {it.label}
                </div>
                <div
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    fontFamily: it.mono ? 'var(--f-mono)' : 'inherit',
                    wordBreak: 'break-word',
                    lineHeight: 1.35
                  }}
                >
                  {it.value !== undefined && it.value !== null && it.value !== '' ? it.value : '—'}
                </div>
              </div>
            );
          })}
        </div>

        {/* OPTIONAL ZONE READINGS MATRIX */}
        {readings && readings.values && readings.values.length > 0 && (
          <div
            style={{
              marginBottom: '18px',
              background: 'var(--surface-inset)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '14px',
              padding: '12px 14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                {readings.title || 'Zone Readings'}
              </span>
              {readings.unit && (
                <span className="pill" style={{ fontSize: '10.5px' }}>
                  Unit: {readings.unit}
                </span>
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px'
              }}
            >
              {readings.values.map((val, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '6px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Z{i + 1}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'var(--f-mono)', color: 'var(--primary)' }}>
                    {val !== undefined && val !== null && String(val).trim() !== '' && !isNaN(Number(val)) ? val : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OPTIONAL PHOTO PREVIEW */}
        {photos.length > 0 && (
          <div
            style={{
              marginBottom: '18px',
              borderRadius: '14px',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-inset)',
              textAlign: 'center'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              <span>Inspection Photo</span>
              {typeof photoUrl === 'string' && photoUrl.startsWith('http') && (
                <a
                  href={photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--primary)', textTransform: 'none', fontWeight: 600, fontSize: '12px' }}
                >
                  Open in Google Drive ↗
                </a>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: photos.length > 1 ? 'repeat(3, 1fr)' : '1fr', gap: '10px', padding: '10px' }}>
              {photos.map((photo, index) => (
                <div key={`${photo}-${index}`} style={{ minWidth: 0, textAlign: 'center' }}>
                  <a href={getDriveImageFullUrl(photo)} target="_blank" rel="noreferrer" title={`Open Zone ${index + 1} full image`} style={{ display: 'block', cursor: 'zoom-in' }}>
                    <img
                      src={getDriveImagePreview(photo)}
                      alt={`Zone ${index + 1}`}
                      style={{ width: '100%', height: photos.length > 1 ? '130px' : '260px', objectFit: 'contain', display: 'block', borderRadius: '8px', background: 'rgba(0,0,0,0.05)' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </a>
                  <a href={getDriveImageFullUrl(photo)} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'inline-block', marginTop: '5px', fontSize: '11px', fontWeight: 600 }}>
                    Open Zone {index + 1} image ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIONS FOOTER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)'
          }}
        >
          <button type="button" className="btn" onClick={onClose} style={{ minWidth: '90px' }}>
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                onClose();
                onEdit();
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: '120px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {editLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

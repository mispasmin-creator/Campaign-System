import React from 'react';

/**
 * Reusable Pagination Component with Rows-Per-Page Selector
 * Matches App Theme (Light / Dark), accessible and reactive.
 */
export default function Pagination({
  totalItems = 0,
  page = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50, 100],
  className = '',
  style = {}
}) {
  if (totalItems <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with ellipsis for large page counts
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const handlePrev = () => {
    if (currentPage > 1 && onPageChange) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages && onPageChange) {
      onPageChange(currentPage + 1);
    }
  };

  return (
    <div
      className={`pagination-container ${className}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 14px',
        borderTop: '1px solid var(--border)',
        marginTop: '8px',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        ...style
      }}
    >
      {/* Left: Rows Per Page & Item Count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const newSize = Number(e.target.value);
              if (onPageSizeChange) onPageSizeChange(newSize);
              if (onPageChange) onPageChange(1); // Reset to page 1 on size change
            }}
            className="input-text"
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              fontWeight: 600,
              width: 'auto',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div>
          Showing <b>{startItem}</b>–<b>{endItem}</b> of <b>{totalItems}</b> records
        </div>
      </div>

      {/* Right: Navigation Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {/* Previous Button */}
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentPage <= 1}
          className="btn small"
          style={{
            padding: '4px 10px',
            opacity: currentPage <= 1 ? 0.45 : 1,
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
          }}
          title="Previous Page"
        >
          &lt; Prev
        </button>

        {/* Page Buttons */}
        {getPageNumbers().map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`dots-${idx}`} style={{ padding: '0 4px', color: 'var(--text-muted)' }}>
                ...
              </span>
            );
          }
          const isActive = p === currentPage;
          return (
            <button
              key={`page-${p}`}
              type="button"
              onClick={() => onPageChange && onPageChange(p)}
              className={`btn small ${isActive ? 'primary' : ''}`}
              style={{
                minWidth: '32px',
                padding: '4px 8px',
                fontWeight: isActive ? 700 : 500,
                background: isActive ? 'var(--primary)' : 'var(--surface-subtle)',
                color: isActive ? '#fff' : 'var(--text)'
              }}
            >
              {p}
            </button>
          );
        })}

        {/* Next Button */}
        <button
          type="button"
          onClick={handleNext}
          disabled={currentPage >= totalPages}
          className="btn small"
          style={{
            padding: '4px 10px',
            opacity: currentPage >= totalPages ? 0.45 : 1,
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer'
          }}
          title="Next Page"
        >
          Next &gt;
        </button>
      </div>
    </div>
  );
}

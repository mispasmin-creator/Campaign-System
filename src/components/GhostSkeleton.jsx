import React from 'react';

/**
 * Ghost Skeleton Loader Screen
 * Renders an animated shimmering skeleton layout simulating the Campaign Life workspace
 */
export default function GhostSkeleton({ message = 'Loading workspace...' }) {
  return (
    <div className="ghost-skeleton-shell">
      {/* SIDEBAR SKELETON */}
      <aside className="ghost-sidebar">
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
          <span className="ghost-shimmer" style={{ width: '38px', height: '38px', borderRadius: '10px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span className="ghost-shimmer" style={{ width: '100px', height: '14px' }} />
            <span className="ghost-shimmer" style={{ width: '70px', height: '10px' }} />
          </div>
        </div>

        {/* Navigation Items (8 rows) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px', borderRadius: '8px' }}>
              <span className="ghost-shimmer" style={{ width: '18px', height: '18px', borderRadius: '4px' }} />
              <span className="ghost-shimmer" style={{ width: `${80 + (i % 4) * 20}px`, height: '12px' }} />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
          <span className="ghost-shimmer" style={{ width: '100%', height: '32px', borderRadius: '8px' }} />
        </div>
      </aside>

      {/* MAIN VIEW SKELETON */}
      <div className="ghost-main">
        {/* HEADER SKELETON */}
        <header className="ghost-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="ghost-shimmer" style={{ width: '160px', height: '18px' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="ghost-shimmer" style={{ width: '70px', height: '30px', borderRadius: '8px' }} />
            <span className="ghost-shimmer" style={{ width: '60px', height: '24px', borderRadius: '12px' }} />
            <span className="ghost-shimmer" style={{ width: '120px', height: '32px', borderRadius: '8px' }} />
          </div>
        </header>

        {/* WORKSPACE SKELETON */}
        <main className="ghost-content">
          {/* Top Info Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="ghost-shimmer" style={{ width: '220px', height: '22px' }} />
              <span className="ghost-shimmer" style={{ width: '380px', height: '13px' }} />
            </div>
            <span className="ghost-shimmer" style={{ width: '130px', height: '34px', borderRadius: '8px' }} />
          </div>

          {/* 4 KPI Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-card, #ffffff)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '12px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <span className="ghost-shimmer" style={{ width: '80px', height: '11px' }} />
                <span className="ghost-shimmer" style={{ width: '60px', height: '24px' }} />
                <span className="ghost-shimmer" style={{ width: '110px', height: '10px' }} />
              </div>
            ))}
          </div>

          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: '10px',
              padding: '12px 16px'
            }}
          >
            <span className="ghost-shimmer" style={{ width: '280px', height: '34px', borderRadius: '6px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="ghost-shimmer" style={{ width: '80px', height: '34px', borderRadius: '6px' }} />
              <span className="ghost-shimmer" style={{ width: '80px', height: '34px', borderRadius: '6px' }} />
            </div>
          </div>

          {/* Table Skeleton */}
          <div
            style={{
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}
          >
            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr', gap: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <span className="ghost-shimmer" style={{ width: '90px', height: '12px' }} />
              <span className="ghost-shimmer" style={{ width: '60px', height: '12px' }} />
              <span className="ghost-shimmer" style={{ width: '50px', height: '12px' }} />
              <span className="ghost-shimmer" style={{ width: '120px', height: '12px' }} />
              <span className="ghost-shimmer" style={{ width: '70px', height: '12px', justifySelf: 'end' }} />
            </div>

            {/* Table Rows (5 rows) */}
            {[...Array(5)].map((_, r) => (
              <div
                key={r}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr',
                  gap: '16px',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: r < 4 ? '1px solid var(--border-color, #f1f5f9)' : 'none'
                }}
              >
                {/* User / Row Info with avatar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="ghost-shimmer" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="ghost-shimmer" style={{ width: '120px', height: '13px' }} />
                    <span className="ghost-shimmer" style={{ width: '70px', height: '10px' }} />
                  </div>
                </div>

                {/* Role Pill */}
                <span className="ghost-shimmer" style={{ width: '70px', height: '22px', borderRadius: '6px' }} />

                {/* Status Pill */}
                <span className="ghost-shimmer" style={{ width: '55px', height: '18px', borderRadius: '10px' }} />

                {/* Permissions Pills */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span className="ghost-shimmer" style={{ width: '50px', height: '18px', borderRadius: '4px' }} />
                  <span className="ghost-shimmer" style={{ width: '60px', height: '18px', borderRadius: '4px' }} />
                  <span className="ghost-shimmer" style={{ width: '55px', height: '18px', borderRadius: '4px' }} />
                </div>

                {/* Action button */}
                <span className="ghost-shimmer" style={{ width: '80px', height: '28px', borderRadius: '6px', justifySelf: 'end' }} />
              </div>
            ))}
          </div>

          {/* Loading Indicator Toast */}
          <div
            style={{
              alignSelf: 'center',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-color, #cbd5e1)',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--text-secondary, #64748b)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--primary, #116B60)',
                boxShadow: '0 0 0 2px rgba(17, 107, 96, 0.25)',
                animation: 'pulse 1s ease infinite'
              }}
            />
            {message}
          </div>
        </main>
      </div>
    </div>
  );
}

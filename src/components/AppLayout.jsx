import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser, logoutUser, hasPageAccess } from '../services/auth';

export default function AppLayout({ children, theme, toggleTheme, onSync, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, [location.pathname]);

  const handleLogout = () => {
    logoutUser();
    if (onLogout) {
      onLogout();
    } else {
      navigate('/login');
    }
  };

  const allNavItems = [
    {
      id: 'dashboard',
      to: '/dashboard',
      label: 'Campaign Dashboard',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
          <path d="M15 3v18" />
        </svg>
      )
    },
    {
      id: 'visit',
      to: '/visit',
      label: 'Company Visit',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
      )
    },
    {
      id: 'running',
      to: '/running',
      label: 'Running Inspection',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      )
    },
    {
      id: 'take-shutdown-date',
      to: '/take-shutdown-date',
      label: 'Take Shut Down Date',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      )
    },
    {
      id: 'take-shutdown-date',
      to: '/followup-shutdown',
      label: 'Followup for Shutdown',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )
    },
    {
      id: 'shutdown-inspection',
      to: '/shutdown-inspection',
      label: 'Shutdown Inspection',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )
    },
    {
      id: 'restart-process',
      to: '/restart-process',
      label: 'Restart The Process',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
          <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
        </svg>
      )
    },
    {
      id: 'masters',
      to: '/masters',
      label: 'Masters',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 20h20" />
          <path d="M5 20V8l5 3V4l9 5v11" />
          <path d="M9 14h2" />
          <path d="M14 14h2" />
        </svg>
      )
    },
    {
      id: 'access',
      to: '/access',
      label: 'User & Access',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    }
  ];

  // Filter navigation items based on user's authorized pages
  const visibleNavItems = allNavItems.filter((item) => hasPageAccess(currentUser, item.id));

  // Primary navigation items for Mobile Floating Bottom Navigation Bar (up to 4 items + More)
  const mobileNavPriority = ['dashboard', 'visit', 'running', 'take-shutdown-date', 'masters'];
  const mobilePrimaryItems = allNavItems
    .filter((item) => mobileNavPriority.includes(item.id) && hasPageAccess(currentUser, item.id))
    .slice(0, 4);

  // Determine current screen title
  const currentNav = allNavItems.find((n) => n.to === location.pathname) || { label: 'Campaign Life FMS' };

  return (
    <div className="app-shell">
      {/* MOBILE DRAWER BACKDROP */}
      {mobileOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu overlay"
        />
      )}

      {/* SIDEBAR */}
      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div
            className="brand-badge"
            onClick={() => collapsed && setCollapsed(false)}
            style={collapsed ? { cursor: 'pointer' } : undefined}
            title={collapsed ? 'Click to expand sidebar' : ''}
          >
            <div className="brand-icon">
              <img src="/logo.png" alt="Campaign Life Logo" className="brand-logo-img" />
            </div>
            {!collapsed && (
              <div className="brand-text">
                <span className="brand-title">Campaign Life</span>
                <span className="brand-sub">Refractory FMS</span>
              </div>
            )}
          </div>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar collapse"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            )}
          </button>
          <button
            className="sidebar-mobile-close-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
            style={{ display: 'none' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.to || (item.to === '/dashboard' && location.pathname === '/');
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : ''}
              >
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {currentUser && !collapsed && (
            <div
              style={{
                padding: '10px 12px',
                marginBottom: '8px',
                borderRadius: '8px',
                background: 'var(--bg-surface, rgba(255,255,255,0.06))',
                fontSize: '0.78rem'
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {currentUser.role}
              </div>
            </div>
          )}

          <button className="theme-pill-btn" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === 'light' ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                {!collapsed && <span>Dark Mode</span>}
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                {!collapsed && <span>Light Mode</span>}
              </>
            )}
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="app-main">
        {/* HEADER */}
        <header className="app-header">
          <div className="header-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Open navigation menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="header-title-box">
              <h1 className="header-title">{currentNav.label}</h1>
              <span className="header-sub"> </span>
            </div>
          </div>

          <div className="header-right">
            {onSync && (
              <button
                type="button"
                className="btn small header-sync-btn"
                onClick={onSync}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                title="Refresh & synchronize latest data"
                aria-label="Refresh & synchronize latest data"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
                <span className="header-btn-label">Sync</span>
              </button>
            )}

            <span className="live-badge">
              <span className="live-dot" /> Live
            </span>

            {/* + New Visit button only if authorized for visit */}
            {hasPageAccess(currentUser, 'visit') && location.pathname !== '/visit' && (
              <button
                className="btn small primary header-action-btn"
                onClick={() => navigate('/visit?new=1')}
                title="Create New Company Visit"
              >
                <span className="header-btn-label">+ New Visit</span>
                <span className="header-btn-label-mobile">+ Visit</span>
              </button>
            )}

            {/* Active User Badge */}
            {currentUser && (
              <div
                className="header-user-badge"
                onClick={() => hasPageAccess(currentUser, 'access') && navigate('/access')}
                title={hasPageAccess(currentUser, 'access') ? 'Manage User Access & Permissions' : `Logged in as ${currentUser.name}`}
              >
                <div className="header-user-avatar">
                  {(currentUser.name || 'U').charAt(0).toUpperCase()}
                </div>
                <span className="header-user-name">{currentUser.name}</span>
                <span className="header-user-role">({currentUser.role})</span>
              </div>
            )}

            {/* Logout Button */}
            <button
              type="button"
              className="btn small header-logout-btn"
              onClick={handleLogout}
              title="Log out of Campaign Life FMS"
              aria-label="Log out"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.8rem',
                color: theme === 'dark' ? '#FB7185' : '#dc2626',
                borderColor: theme === 'dark' ? 'rgba(251, 113, 133, 0.35)' : '#fca5a5',
                background: theme === 'dark' ? 'rgba(251, 113, 133, 0.12)' : '#fef2f2'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="header-btn-label">Logout</span>
            </button>
          </div>
        </header>

        {/* WORKSPACE */}
        <div className="workspace">
          {children}
        </div>
      </div>

      {/* FLOATING MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        {mobilePrimaryItems.map((item) => {
          const isActive = location.pathname === item.to || (item.to === '/dashboard' && location.pathname === '/');
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
              title={item.label}
              aria-label={item.label}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
            </NavLink>
          );
        })}

        {/* More button toggles the slide-over drawer */}
        <button
          type="button"
          className={`mobile-nav-item ${mobileOpen ? 'active' : ''}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="All Modules & Options"
          title="All Modules"
        >
          <span className="mobile-nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
              <circle cx="5" cy="12" r="1.5" />
            </svg>
          </span>
        </button>
      </nav>
    </div>
  );
}

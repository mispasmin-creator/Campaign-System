import React, { useEffect, useState, Component } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import './style.css';
import AppLayout from './components/AppLayout';
import GhostSkeleton from './components/GhostSkeleton';
import LoginPage from './pages/LoginPage';
import UserAccessPage from './pages/UserAccessPage';
import CompanyVisitPage from './pages/CompanyVisitPage';
import RunningInspectionPage from './pages/RunningInspectionPage';
import TakeShutdownDatePage from './pages/TakeShutdownDatePage';
import FollowupShutdownPage from './pages/FollowupShutdownPage';
import ShutdownInspectionPage from './pages/ShutdownInspectionPage';
import RestartProcessPage from './pages/RestartProcessPage';
import CampaignDashboard from './pages/CampaignDashboard';
import Masters from './pages/Masters';

import { useData } from './hooks/useData';
import { getCurrentUser, hasPageAccess, getFirstAllowedPath } from './services/auth';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Campaign Life FMS runtime error:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem('campaign-life-fms-v1');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            maxWidth: '600px',
            margin: '60px auto',
            padding: '24px',
            background: 'var(--surface-raised, #F8FAFE)',
            border: '1px solid var(--border-subtle, #D9E2EF)',
            borderRadius: '12px',
            textAlign: 'center',
            boxShadow: 'var(--shadow-md, 0 10px 30px rgba(82, 97, 125, 0.22))'
          }}
        >
          <h2 style={{ color: 'var(--error, #C93838)', marginBottom: '8px' }}>Application Notice</h2>
          <p style={{ color: 'var(--text-secondary, #52617D)', fontSize: '13px', marginBottom: '20px' }}>
            {this.state.error?.message || 'An unexpected error occurred while loading this view.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => window.location.reload()}>
              Reload Page
            </button>
            <button className="btn" onClick={this.handleReset}>
              Reset Demo Storage
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Route protection wrapper based on user page permissions
 */
function ProtectedRoute({ pageId, currentUser, children }) {
  const allowed = hasPageAccess(currentUser, pageId);
  if (!allowed) {
    const firstAllowed = getFirstAllowedPath(currentUser);
    return (
      <div
        style={{
          maxWidth: '540px',
          margin: '60px auto',
          padding: '36px 30px',
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '16px',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.06)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>
        <h3 style={{ margin: '0 0 8px', color: '#dc2626', fontSize: '1.25rem', fontWeight: 800 }}>
          Access Restricted
        </h3>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary, #64748b)', fontSize: '0.88rem', lineHeight: 1.5 }}>
          You do not have permission to view or update this page. Please contact your administrator.
        </p>
        <a
          href={firstAllowed}
          className="btn primary"
          style={{ textDecoration: 'none', display: 'inline-block' }}
        >
          Return to My Modules
        </a>
      </div>
    );
  }
  return children;
}

function App() {
  const { data, loading, error, toast, notify, refresh } = useData();
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [theme, setTheme] = useState(
    localStorage.getItem('campaign-theme') || 'light'
  );

  // Sync theme with DOM attribute
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('campaign-theme', theme);
  }, [theme]);

  // Listen for login/logout auth changes across components
  useEffect(() => {
    const onAuthChange = () => {
      setCurrentUser(getCurrentUser());
    };
    window.addEventListener('campaign_auth_changed', onAuthChange);
    return () => window.removeEventListener('campaign_auth_changed', onAuthChange);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleLoginSuccess = (user) => {
    setIsLoggingIn(true);
    setCurrentUser(user);
    setTimeout(() => {
      setIsLoggingIn(false);
    }, 750);
  };

  // 1. UN-AUTHENTICATED: Render dedicated, distraction-free Full-Screen Login Page
  if (!currentUser) {
    return (
      <LoginPage
        onLogin={handleLoginSuccess}
        notify={notify}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    );
  }

  // 2. GHOST SKELETON LOADING STATE (After login & during workspace fetch)
  if (isLoggingIn || (loading && !data)) {
    return (
      <GhostSkeleton
        message={isLoggingIn ? `Welcome, ${currentUser?.name || 'User'}! Setting up modules...` : "Loading Campaign Life workspace..."}
      />
    );
  }

  // 3. STORAGE ERROR STATE
  if (error && !data) {
    return (
      <div className="loading-box" style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--error)' }}>
        <h2>Storage Error</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '10px 0 20px' }}>{error}</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  // 4. AUTHENTICATED: Render main application shell with access-protected routes
  const initialLanding = hasPageAccess(currentUser, 'dashboard')
    ? '/dashboard'
    : getFirstAllowedPath(currentUser);

  return (
    <AppLayout
      theme={theme}
      toggleTheme={toggleTheme}
      onSync={() => refresh(true)}
      onLogout={() => setCurrentUser(null)}
    >
      <Routes>
        <Route path="/" element={<Navigate to={initialLanding} replace />} />
        <Route path="/board" element={<Navigate to="/dashboard" replace />} />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute pageId="dashboard" currentUser={currentUser}>
              <CampaignDashboard data={data} refresh={refresh} notify={notify} />
            </ProtectedRoute>
          }
        />

        {/* Step 1: Company Visit */}
        <Route
          path="/visit"
          element={
            <ProtectedRoute pageId="visit" currentUser={currentUser}>
              <CompanyVisitPage data={data} refresh={refresh} notify={notify} />
            </ProtectedRoute>
          }
        />

        {/* Step 2: Running Kiln Inspection */}
        <Route
          path="/running"
          element={
            <ProtectedRoute pageId="running" currentUser={currentUser}>
              <RunningInspectionPage data={data} refresh={refresh} notify={notify} />
            </ProtectedRoute>
          }
        />

        {/* Step 3: Take Shutdown Date */}
        <Route
          path="/take-shutdown-date"
          element={
            <ProtectedRoute pageId="take-shutdown-date" currentUser={currentUser}>
              <TakeShutdownDatePage data={data} refresh={refresh} notify={notify} />
            </ProtectedRoute>
          }
        />

        {/* Step 3 Followup */}
        <Route
          path="/followup-shutdown"
          element={
            <ProtectedRoute pageId="take-shutdown-date" currentUser={currentUser}>
              <FollowupShutdownPage data={data} refresh={refresh} notify={notify} />
            </ProtectedRoute>
          }
        />

        {/* Step 4: Shutdown Inspection */}
        <Route
          path="/shutdown-inspection"
          element={
            <ProtectedRoute pageId="shutdown-inspection" currentUser={currentUser}>
              <ShutdownInspectionPage data={data} refresh={refresh} notify={notify} />
            </ProtectedRoute>
          }
        />

        {/* Step 5: Restart The Process */}
        <Route
          path="/restart-process"
          element={
            <ProtectedRoute pageId="restart-process" currentUser={currentUser}>
              <RestartProcessPage data={data} refresh={refresh} notify={notify} />
            </ProtectedRoute>
          }
        />

        {/* Masters Management */}
        <Route
          path="/masters"
          element={
            <ProtectedRoute pageId="masters" currentUser={currentUser}>
              <Masters data={data} refresh={refresh} notify={notify} />
            </ProtectedRoute>
          }
        />

        {/* User & Access Management */}
        <Route
          path="/access"
          element={
            <ProtectedRoute pageId="access" currentUser={currentUser}>
              <UserAccessPage notify={notify} refresh={refresh} />
            </ProtectedRoute>
          }
        />

        {/* Backwards compatibility aliases */}
        <Route path="/settings" element={<Navigate to="/access" replace />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/forms" element={<Navigate to="/visit" replace />} />
        <Route path="/calls" element={<Navigate to="/followup-shutdown" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Floating Toast Notification */}
      {toast && (
        <div className={`toast ${toast.tone || 'info'}`}>
          {toast.message}
        </div>
      )}
    </AppLayout>
  );
}

const mountApp = () => {
  const rootEl = document.getElementById('root') || document.getElementById('app');
  if (rootEl) {
    createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </React.StrictMode>
    );
  } else {
    console.error('Failed to locate #root or #app mounting element in DOM.');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp);
} else {
  mountApp();
}

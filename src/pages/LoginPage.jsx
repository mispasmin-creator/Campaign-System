import React, { useState, useEffect } from 'react';
import {
  fetchUsersFromGoogleSheet,
  recordUserLoginToGoogleSheet
} from '../services/googleSheets';
import {
  setCurrentUser,
  DEFAULT_USERS
} from '../services/auth';

export default function LoginPage({ onLogin, notify, theme, toggleTheme }) {
  const [usersList, setUsersList] = useState(DEFAULT_USERS);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [sheetStatus, setSheetStatus] = useState('checking'); // 'connected' | 'offline' | 'checking'

  const [loginInput, setLoginInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load registered users live from Google Sheet on mount
  useEffect(() => {
    let isMounted = true;
    const loadUsers = async () => {
      setIsLoadingUsers(true);
      setSheetStatus('checking');
      try {
        const sheetUsers = await fetchUsersFromGoogleSheet();
        if (!isMounted) return;
        if (Array.isArray(sheetUsers) && sheetUsers.length > 0) {
          setUsersList(sheetUsers);
          setSheetStatus('connected');
        } else {
          setUsersList(DEFAULT_USERS);
          setSheetStatus(sheetUsers ? 'connected' : 'offline');
        }
      } catch (err) {
        console.warn('[LoginPage] Error fetching users from sheet:', err);
        if (isMounted) {
          setSheetStatus('offline');
          setUsersList(DEFAULT_USERS);
        }
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    };

    loadUsers();
    return () => { isMounted = false; };
  }, []);

  // Handle Login submission
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const query = loginInput.trim().toLowerCase();
    const pass = password.trim();

    if (!query) {
      setErrorMsg('Please enter your User ID or Username');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Try to fetch the latest users from sheet for live verification
      let liveUsers = usersList;
      try {
        const fresh = await fetchUsersFromGoogleSheet();
        if (Array.isArray(fresh) && fresh.length > 0) {
          liveUsers = fresh;
          setUsersList(fresh);
        }
      } catch {
        // Use cached
      }

      // 2. Locate user by User ID or Username
      const matchedUser = liveUsers.find((u) => {
        const uId = String(u.userId || '').trim().toLowerCase();
        const uName = String(u.name || '').trim().toLowerCase();
        return uId === query || uName === query;
      });

      if (!matchedUser) {
        setErrorMsg('User not found. Please check your User ID / Username or contact Admin.');
        setIsSubmitting(false);
        return;
      }

      // 3. Verify status
      if (matchedUser.status && matchedUser.status.toLowerCase() === 'inactive') {
        setErrorMsg('This account is marked Inactive. Please contact Admin.');
        setIsSubmitting(false);
        return;
      }

      // 4. Verify password if configured
      if (matchedUser.password && matchedUser.password.trim() !== '') {
        if (pass !== matchedUser.password.trim()) {
          setErrorMsg('Incorrect password. Please try again.');
          setIsSubmitting(false);
          return;
        }
      }

      // 5. Update Last Login timestamp live in Google Sheet
      recordUserLoginToGoogleSheet(matchedUser.userId, matchedUser.name);

      // 6. Save session
      const sessionUser = setCurrentUser(matchedUser);

      if (notify) {
        notify(`Welcome back, ${matchedUser.name}!`, 'success');
      }

      if (onLogin) {
        onLogin(sessionUser || matchedUser);
      }
    } catch (err) {
      console.error('[LoginPage] Sign in failed:', err);
      setErrorMsg('An error occurred during sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme === 'dark'
          ? 'linear-gradient(135deg, #071512 0%, #091B16 50%, #0B1920 100%)'
          : 'linear-gradient(135deg, #D4E7E1 0%, #DEEEE8 35%, #E6F0F2 70%, #E8E2F2 100%)',
        padding: '24px',
        boxSizing: 'border-box',
        position: 'relative',
        fontFamily: 'inherit'
      }}
    >
      {/* Theme toggle in top right */}
      {toggleTheme && (
        <button
          onClick={toggleTheme}
          style={{
            position: 'absolute',
            top: '20px',
            right: '24px',
            background: theme === 'dark' ? '#0E221D' : 'var(--bg-card, #ffffff)',
            border: theme === 'dark' ? '1px solid rgba(45, 212, 191, 0.25)' : '1px solid var(--border-color, #cbd5e1)',
            padding: '6px 12px',
            borderRadius: '20px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            color: theme === 'dark' ? '#D6ECE5' : 'var(--text-secondary, #475569)',
            boxShadow: theme === 'dark' ? '0 2px 10px rgba(0,0,0,0.5)' : '0 1px 3px rgba(0,0,0,0.08)'
          }}
        >
          {theme === 'dark' ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              Light
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              Dark
            </>
          )}
        </button>
      )}

      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--bg-card, #ffffff)',
          borderRadius: '20px',
          border: '1px solid var(--border-color, #d3e5de)',
          boxShadow: theme === 'dark'
            ? '0 25px 65px -10px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.06), 0 0 30px rgba(45, 212, 191, 0.1)'
            : '0 16px 40px -8px rgba(15, 37, 31, 0.12)',
          padding: '36px 32px',
          boxSizing: 'border-box'
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: '#FFFFFF',
              border: '1px solid var(--border-color, #d3e5de)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: theme === 'dark' ? '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 16px rgba(45, 212, 191, 0.2)' : '0 4px 14px rgba(15, 37, 31, 0.08)',
              marginBottom: '14px',
              padding: '6px',
              boxSizing: 'border-box'
            }}
          >
            <img src="/logo.png" alt="Campaign Life Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <h1
            style={{
              margin: '0 0 4px',
              fontSize: '1.5rem',
              fontWeight: 800,
              color: 'var(--text-primary, #0e251f)',
              letterSpacing: '-0.025em'
            }}
          >
            Campaign Life
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '0.85rem',
              color: 'var(--text-secondary, #4d736a)',
              fontWeight: 500
            }}
          >
            Refractory Furnace Management System
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              background: theme === 'dark' ? 'rgba(251, 113, 133, 0.14)' : '#fef2f2',
              border: theme === 'dark' ? '1px solid rgba(251, 113, 133, 0.35)' : '1px solid #fecaca',
              color: theme === 'dark' ? '#FECDD3' : '#991b1b',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #475569)',
                marginBottom: '6px'
              }}
            >
              User ID / Username
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: theme === 'dark' ? '#5C8277' : '#94a3b8'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                type="text"
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                placeholder="Enter User ID or Username"
                autoFocus
                required
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #d3e5de)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  background: 'var(--bg-input, #ffffff)',
                  color: 'var(--text-primary, #0e251f)',
                  outline: 'none',
                  transition: 'border-color 0.15s ease'
                }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary, #4d736a)'
                }}
              >
                Password / PIN
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '0.75rem',
                  color: 'var(--primary, #116B60)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: theme === 'dark' ? '#5C8277' : '#94a3b8'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #d3e5de)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  background: 'var(--bg-input, #ffffff)',
                  color: 'var(--text-primary, #0e251f)',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--primary-gradient, linear-gradient(135deg, #0F6257 0%, #177A6D 100%))',
              color: '#ffffff',
              fontSize: '0.94rem',
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: theme === 'dark'
                ? '0 4px 18px rgba(45, 212, 191, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                : '0 4px 14px rgba(15, 98, 87, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            {isSubmitting ? (
              <>
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite'
                  }}
                />
                Verifying & Signing In...
              </>
            ) : (
              'Sign In to FMS'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

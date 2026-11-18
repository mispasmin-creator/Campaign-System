import React, { useState, useEffect } from 'react';
import {
  fetchUsersFromGoogleSheet,
  addUserToGoogleSheet,
  updateUserToGoogleSheet
} from '../services/googleSheets';
import {
  APP_PAGES,
  DEFAULT_USERS,
  getCurrentUser,
  hasPageAccess,
  formatAccessString
} from '../services/auth';
import DetailModal from '../components/DetailModal';

export default function UserAccessPage({ notify }) {
  const [currentUser, setCurrentUserState] = useState(getCurrentUser());
  const [usersList, setUsersList] = useState(DEFAULT_USERS);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // View Details Modal State
  const [viewingUser, setViewingUser] = useState(null);

  // Edit User Modal
  const [editingUser, setEditingUser] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('Inspector');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editStatus, setEditStatus] = useState('Active');
  const [selectedPages, setSelectedPages] = useState([]);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  // Add User Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('123');
  const [newRole, setNewRole] = useState('Inspector');
  const [newStatus, setNewStatus] = useState('Active');
  const [newPageAccess, setNewPageAccess] = useState([
    'dashboard',
    'running',
    'take-shutdown-date',
    'shutdown-inspection'
  ]);
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Load registered users live on mount
  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const liveUsers = await fetchUsersFromGoogleSheet();
      if (Array.isArray(liveUsers) && liveUsers.length > 0) {
        setUsersList(liveUsers);
      } else {
        setUsersList(DEFAULT_USERS);
      }
    } catch (err) {
      console.warn('[UserAccessPage] Error loading users:', err);
      setUsersList(DEFAULT_USERS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Open Edit User Modal
  const handleOpenEditAccess = (u) => {
    setEditingUser(u);
    setEditName(u.name || '');
    setEditRole(u.role || 'Inspector');
    setEditPassword(u.password || '');
    setShowEditPassword(false);
    setEditStatus(u.status || 'Active');
    const currentAllowed = APP_PAGES.filter((p) => hasPageAccess(u, p.id)).map((p) => p.id);
    setSelectedPages(currentAllowed);
  };

  // Toggle page selection in Edit Modal
  const handleTogglePage = (pageId) => {
    setSelectedPages((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  // Quick Presets
  const applyPreset = (presetType) => {
    if (presetType === 'all') {
      setSelectedPages(APP_PAGES.map((p) => p.id));
    } else if (presetType === 'inspector') {
      setSelectedPages(['dashboard', 'running', 'take-shutdown-date', 'shutdown-inspection']);
    } else if (presetType === 'coordinator') {
      setSelectedPages(['dashboard', 'visit', 'take-shutdown-date', 'restart-process', 'masters']);
    } else if (presetType === 'clear') {
      setSelectedPages([]);
    }
  };

  // Save updated user profile & access permissions
  const handleSaveAccess = async () => {
    if (!editingUser) return;
    if (!editName.trim()) {
      if (notify) notify('Full Name is required', 'error');
      return;
    }
    setIsSavingAccess(true);
    const accessStr = formatAccessString(selectedPages);

    const updatedUser = {
      userId: editingUser.userId,
      name: editName.trim(),
      role: editRole.trim(),
      password: editPassword.trim(),
      status: editStatus,
      access: accessStr
    };

    try {
      await updateUserToGoogleSheet(updatedUser);

      // Update local state immediately
      setUsersList((prev) =>
        prev.map((u) => {
          if (u.userId === editingUser.userId) {
            return {
              ...u,
              name: updatedUser.name,
              role: updatedUser.role,
              password: updatedUser.password,
              status: updatedUser.status,
              access: accessStr
            };
          }
          return u;
        })
      );

      // If updating currently logged in user, refresh session
      if (currentUser && currentUser.userId === editingUser.userId) {
        const updatedSelf = {
          ...currentUser,
          name: updatedUser.name,
          role: updatedUser.role,
          password: updatedUser.password,
          status: updatedUser.status,
          access: accessStr
        };
        localStorage.setItem('campaign_fms_current_user', JSON.stringify(updatedSelf));
        setCurrentUserState(updatedSelf);
      }

      if (notify) {
        notify(`User details & permissions updated for ${updatedUser.name}!`, 'success');
      }
      setEditingUser(null);
    } catch (err) {
      console.error('[UserAccessPage] Failed to save user changes:', err);
      if (notify) notify('Failed to save user changes', 'error');
    } finally {
      setIsSavingAccess(false);
    }
  };

  // Add new user
  const handleAddUserSubmit = async (e) => {
    e.preventDefault();
    if (!newUserId.trim() || !newName.trim()) {
      if (notify) notify('User ID and Name are required', 'error');
      return;
    }

    setIsAddingUser(true);
    const accessStr = formatAccessString(newPageAccess);
    const userData = {
      userId: newUserId.trim().toLowerCase(),
      name: newName.trim(),
      password: newPassword.trim(),
      role: newRole.trim(),
      status: newStatus,
      access: accessStr
    };

    try {
      await addUserToGoogleSheet(userData);
      setUsersList((prev) => [...prev, userData]);
      setShowAddModal(false);
      setNewUserId('');
      setNewName('');
      setNewPassword('123');
      if (notify) {
        notify(`User ${userData.name} added successfully!`, 'success');
      }
      setTimeout(loadUsers, 1500);
    } catch (err) {
      console.error('Failed to add user:', err);
      if (notify) notify('Failed to add user', 'error');
    } finally {
      setIsAddingUser(false);
    }
  };

  // Filtered Users
  const filteredUsers = usersList.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.userId && u.userId.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Banner / Breadcrumb */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '24px'
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            User & Page Access Control
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Configure which user can view or update specific pages in Campaign Life FMS.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn small"
            onClick={loadUsers}
            disabled={isLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            {isLoading ? 'Syncing...' : 'Sync'}
          </button>

          <button
            type="button"
            className="btn small primary"
            onClick={() => setShowAddModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add New User
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', maxWidth: '420px', width: '100%', marginBottom: '16px' }}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users by name, user ID, or role..."
          style={{
            width: '100%',
            padding: '9px 14px 9px 36px',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #cbd5e1)',
            fontSize: '0.85rem',
            background: 'var(--bg-input, #ffffff)',
            color: 'var(--text-primary)',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Users Directory & Permission Matrix Table */}
      <div
        style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}
      >
        <div className="tablewrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-secondary)' }}>User Details</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-secondary)' }}>Role</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-secondary)' }}>Page Access & Permissions</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-secondary)' }}>Last Login</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No users matching "{searchQuery}"
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, idx) => {
                  const allowedList = APP_PAGES.filter((p) => hasPageAccess(u, p.id));
                  const isAll = allowedList.length === APP_PAGES.length || String(u.access).toLowerCase() === 'all';

                  return (
                    <tr
                      key={u.userId || idx}
                      onClick={() => setViewingUser(u)}
                      className="clickable-row"
                      style={{
                        borderBottom: '1px solid var(--border-color, #f1f5f9)',
                        background: idx % 2 === 0 ? 'transparent' : 'var(--surface-hover)',
                        cursor: 'pointer'
                      }}
                      title="Tap to view full user details & permissions"
                    >
                      {/* User Info */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'var(--primary, #116B60)',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.8rem'
                            }}
                          >
                            {(u.name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              ID: {u.userId}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background:
                              u.role?.toLowerCase() === 'admin'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : u.role?.toLowerCase().includes('coordinator')
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(56, 189, 248, 0.15)',
                            color:
                              u.role?.toLowerCase() === 'admin'
                                ? '#ef4444'
                                : u.role?.toLowerCase().includes('coordinator')
                                ? '#f59e0b'
                                : '#38bdf8'
                          }}
                        >
                          {u.role || 'Inspector'}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: u.status === 'Inactive' ? '#b91c1c' : '#15803d'
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: u.status === 'Inactive' ? '#ef4444' : '#22c55e'
                            }}
                          />
                          {u.status || 'Active'}
                        </span>
                      </td>

                      {/* Allowed Pages Badges */}
                      <td style={{ padding: '12px 16px' }}>
                        {isAll ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: 'var(--success-soft, #ecfdf5)',
                              color: 'var(--success-text, #065f46)',
                              border: '1px solid var(--success-border, rgba(52, 211, 153, 0.3))',
                              fontSize: '0.74rem',
                              fontWeight: 700
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              <path d="m9 12 2 2 4-4" />
                            </svg>
                            Full Access (All Pages)
                          </span>
                        ) : allowedList.length === 0 ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: 'var(--error-soft, #fef2f2)',
                              color: 'var(--error-text, #ef4444)',
                              border: '1px solid var(--error-border, rgba(239, 68, 68, 0.3))',
                              fontSize: '0.74rem',
                              fontWeight: 600
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                            No Pages Assigned
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '340px' }}>
                            {allowedList.map((p) => (
                              <span
                                key={p.id}
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'var(--bg-surface, #f1f5f9)',
                                  color: 'var(--text-secondary, #475569)',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  border: '1px solid var(--border-color, #e2e8f0)'
                                }}
                              >
                                {p.shortLabel}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Last Login */}
                      <td style={{ padding: '12px 16px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        {u.lastLogin || <span style={{ color: '#94a3b8' }}>Never</span>}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingUser(u);
                            }}
                            title="View User Details"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              padding: '4px 8px'
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            View
                          </button>
                          <button
                            type="button"
                            className="btn small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditAccess(u);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              padding: '4px 8px'
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT USER DETAILS & PAGE ACCESS MODAL */}
      {editingUser && (
        <div
          className="modal-backdrop"
          onClick={() => !isSavingAccess && setEditingUser(null)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: '580px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header" style={{ alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit User & Permissions
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  User ID: <strong style={{ color: 'var(--primary)' }}>{editingUser.userId}</strong>
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingUser(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Editable Profile Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-text"
                  placeholder="Full Name"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Role *
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="select-input"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                >
                  <option value="Admin">Admin</option>
                  <option value="Inspector">Inspector</option>
                  <option value="Sales Co-ordinator">Sales Co-ordinator</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Password / PIN
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="input-text"
                    placeholder="Enter password"
                    style={{ width: '100%', paddingRight: '56px', fontSize: '0.85rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary, #116B60)',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '2px 6px'
                    }}
                  >
                    {showEditPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="select-input"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '14px', marginBottom: '14px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                Page Access Presets:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => applyPreset('all')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    padding: '5px 10px',
                    color: 'var(--primary, #116B60)'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                  Full Access
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => applyPreset('inspector')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    padding: '5px 10px'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  Inspector Preset
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => applyPreset('coordinator')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    padding: '5px 10px'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  Coordinator Preset
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => applyPreset('clear')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    padding: '5px 10px',
                    color: '#b91c1c'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  Clear All
                </button>
              </div>
            </div>

            {/* Checklist of Pages */}
            <div
              style={{
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '10px',
                padding: '10px',
                maxHeight: '220px',
                overflowY: 'auto',
                marginBottom: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              {APP_PAGES.map((page) => {
                const isChecked = selectedPages.includes(page.id);
                return (
                  <label
                    key={page.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      background: isChecked ? 'var(--primary-soft)' : 'transparent',
                      border: isChecked ? '1px solid var(--primary)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleTogglePage(page.id)}
                      style={{ marginTop: '3px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {page.label}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {page.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setEditingUser(null)}
                disabled={isSavingAccess}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleSaveAccess}
                disabled={isSavingAccess}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {isSavingAccess ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddModal && (
        <div
          className="modal-backdrop"
          onClick={() => !isAddingUser && setShowAddModal(false)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Add New User
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Create a new authorized user account.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAddModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    User ID *
                  </label>
                  <input
                    type="text"
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                    placeholder="Enter User ID"
                    className="input-text"
                    required
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter Full Name"
                    className="input-text"
                    required
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Password / PIN *
                  </label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Default: 123"
                    className="input-text"
                    required
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Role *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="select-input"
                    style={{ width: '100%', fontSize: '0.85rem' }}
                  >
                    <option value="Inspector">Inspector</option>
                    <option value="Sales Co-ordinator">Sales Co-ordinator</option>
                    <option value="Coordinator">Coordinator</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="select-input"
                  style={{ width: '100%', fontSize: '0.85rem' }}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Initial Page Access */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Assign Page Access
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px' }}>
                  {APP_PAGES.map((p) => {
                    const checked = newPageAccess.includes(p.id);
                    return (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setNewPageAccess((prev) =>
                              prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                            )
                          }
                        />
                        <span>{p.shortLabel}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn" onClick={() => setShowAddModal(false)} disabled={isAddingUser}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={isAddingUser}>
                  {isAddingUser ? 'Saving User...' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW USER DETAILS & PERMISSIONS POPUP MODAL */}
      {viewingUser && (
        <DetailModal
          isOpen={!!viewingUser}
          onClose={() => setViewingUser(null)}
          title="User Profile & Access"
          subtitle={`User ID: ${viewingUser.userId}`}
          badge={viewingUser.role || 'Inspector'}
          badgeTone={
            viewingUser.role?.toLowerCase() === 'admin'
              ? 'bad'
              : viewingUser.role?.toLowerCase().includes('coordinator')
              ? 'warn'
              : 'info'
          }
          items={[
            { label: 'Full Name', value: viewingUser.name, fullWidth: true },
            { label: 'User ID / Username', value: viewingUser.userId, mono: true },
            { label: 'Account Role', value: viewingUser.role || 'Inspector' },
            {
              label: 'Account Status',
              value: viewingUser.status || 'Active'
            },
            {
              label: 'Last Login Activity',
              value: viewingUser.lastLogin || 'Never logged in yet'
            },
            {
              label: 'Authorized System Modules',
              value: APP_PAGES
                .filter((p) => hasPageAccess(viewingUser, p.id))
                .map((p) => `✓ ${p.label}`)
                .join('\n') || 'No module access assigned',
              fullWidth: true
            }
          ]}
          onEdit={() => handleOpenEditAccess(viewingUser)}
          editLabel="Edit Permissions"
        />
      )}
    </div>
  );
}

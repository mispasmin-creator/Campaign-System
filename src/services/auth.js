/**
 * Authentication & Access Control Service for Campaign Life FMS
 * Manages user sessions, credentials, and page-level update/view permissions
 */

const AUTH_USER_KEY = 'campaign_fms_current_user';

export function normalizeUserRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return value === 'admin' || value === 'administrator' ? 'Admin' : 'User';
}

export const APP_PAGES = [
  {
    id: 'dashboard',
    label: 'Campaign Dashboard',
    path: '/dashboard',
    shortLabel: 'Dashboard',
    description: 'Overview of all active campaigns, statuses, and performance'
  },
  {
    id: 'visit',
    label: 'Company Visit',
    path: '/visit',
    shortLabel: 'Company Visit',
    description: 'Record initial plant visit, campaign start date & details'
  },
  {
    id: 'running',
    label: 'Running Kiln Inspection',
    path: '/running',
    shortLabel: 'Running Kiln',
    description: 'Log temperature, refractory thickness readings & photos'
  },
  {
    id: 'take-shutdown-date',
    label: 'Take Shut Down Date',
    path: '/take-shutdown-date',
    shortLabel: 'Shut Down Date',
    description: 'Follow-up calls, shutdown confirmation & tracking'
  },
  {
    id: 'shutdown-inspection',
    label: 'Shutdown Inspection',
    path: '/shutdown-inspection',
    shortLabel: 'Shutdown Inspection',
    description: 'Post-campaign refractory wear inspection & 9-zone readings'
  },
  {
    id: 'restart-process',
    label: 'Restart The Process',
    path: '/restart-process',
    shortLabel: 'Restart Process',
    description: 'Final sign-off, next campaign setup & closure'
  },
  {
    id: 'masters',
    label: 'Masters (Plants & Kilns)',
    path: '/masters',
    shortLabel: 'Masters',
    description: 'Manage companies, plant locations, and kiln technical profiles'
  },
  {
    id: 'access',
    label: 'User & Access Control',
    path: '/access',
    shortLabel: 'User Access',
    description: 'Manage users, assign page-level permissions, and sync with Google Sheet'
  }
];

export const DEFAULT_USERS = [
  {
    userId: 'admin',
    name: 'Admin User',
    password: '123',
    role: 'Admin',
    status: 'Active',
    access: 'All',
    lastLogin: ''
  },
  {
    userId: 'sanjay',
    name: 'Sanjay Singh',
    password: '123',
    role: 'User',
    status: 'Active',
    access: 'dashboard, running, take-shutdown-date, shutdown-inspection',
    lastLogin: ''
  },
  {
    userId: 'ahitesh',
    name: 'Ahitesh',
    password: '123',
    role: 'User',
    status: 'Active',
    access: 'dashboard, visit, take-shutdown-date, restart-process, masters',
    lastLogin: ''
  }
];

/**
 * Check if a user has permission to access or update a specific page
 * @param {Object} user 
 * @param {string} pageIdOrPath 
 * @returns {boolean}
 */
export function hasPageAccess(user, pageIdOrPath) {
  if (!user) return false;

  const roleLower = String(user.role || '').toLowerCase();
  // Super Admin has full unrestricted access
  if (roleLower === 'admin' || roleLower === 'administrator') return true;

  const rawAccess = user.access;
  // Explicit 'All' or '*' gives access to everything
  if (rawAccess === '*' || String(rawAccess).trim().toLowerCase() === 'all') {
    return true;
  }

  // Find page definition
  let page = APP_PAGES.find(
    (p) => p.id === pageIdOrPath || p.path === pageIdOrPath
  );

  // Handle path aliases
  if (!page) {
    if (pageIdOrPath === '/' || pageIdOrPath === '/board') {
      page = APP_PAGES.find((p) => p.id === 'dashboard');
    } else if (pageIdOrPath === '/settings' || pageIdOrPath === '/users') {
      page = APP_PAGES.find((p) => p.id === 'access');
    }
  }

  const targetId = page ? page.id : String(pageIdOrPath || '').replace(/^\//, '').toLowerCase();

  // If user has specific comma-separated access permissions
  if (rawAccess) {
    const list = Array.isArray(rawAccess)
      ? rawAccess.map((s) => String(s).trim().toLowerCase())
      : String(rawAccess).split(',').map((s) => String(s).trim().toLowerCase());

    if (list.includes('all') || list.includes('*')) return true;

    if (page) {
      const match = list.some(
        (item) =>
          item === page.id.toLowerCase() ||
          item === page.shortLabel.toLowerCase() ||
          item === page.label.toLowerCase() ||
          item === page.path.toLowerCase()
      );
      if (match) return true;
    }

    if (list.includes(targetId)) return true;
  }

  // Fallback defaults based on Role if access field is not set
  if (!rawAccess) {
    if (roleLower.includes('inspector')) {
      return ['dashboard', 'running', 'take-shutdown-date', 'shutdown-inspection'].includes(targetId);
    }
    if (roleLower.includes('sales') || roleLower.includes('co-ordinator') || roleLower.includes('coordinator')) {
      return ['dashboard', 'visit', 'take-shutdown-date', 'restart-process', 'masters'].includes(targetId);
    }
    return targetId === 'dashboard';
  }

  return false;
}

/**
 * Returns the list of all pages the given user is authorized to access
 */
export function getUserAllowedPages(user) {
  if (!user) return [];
  return APP_PAGES.filter((p) => hasPageAccess(user, p.id));
}

/**
 * Determines the first landing path for the logged in user
 */
export function getFirstAllowedPath(user) {
  const allowed = getUserAllowedPages(user);
  if (allowed.length > 0) {
    return allowed[0].path;
  }
  return '/dashboard';
}

/**
 * Normalizes an array or string of page ids into a clean comma-separated string for Google Sheet
 */
export function formatAccessString(accessArrayOrString) {
  if (!accessArrayOrString) return 'All';
  if (Array.isArray(accessArrayOrString)) {
    if (accessArrayOrString.length === APP_PAGES.length) return 'All';
    return accessArrayOrString.join(', ');
  }
  return String(accessArrayOrString).trim();
}

/**
 * Retrieves currently logged in user session from storage
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return { ...user, role: normalizeUserRole(user.role) };
  } catch (err) {
    console.warn('[Auth] Failed to parse current user session:', err);
    return null;
  }
}

/**
 * Sets current user session
 */
export function setCurrentUser(user) {
  try {
    if (!user) {
      localStorage.removeItem(AUTH_USER_KEY);
      window.dispatchEvent(new Event('campaign_auth_changed'));
      return null;
    }
    const sessionUser = {
      ...user,
      role: normalizeUserRole(user.role),
      sessionStarted: new Date().toISOString()
    };
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(sessionUser));
    window.dispatchEvent(new Event('campaign_auth_changed'));
    return sessionUser;
  } catch (err) {
    console.warn('[Auth] Failed to save user session:', err);
    return null;
  }
}

/**
 * Logs out the active user
 */
export function logoutUser() {
  try {
    localStorage.removeItem(AUTH_USER_KEY);
    window.dispatchEvent(new Event('campaign_auth_changed'));
  } catch (err) {
    console.warn('[Auth] Logout error:', err);
  }
}

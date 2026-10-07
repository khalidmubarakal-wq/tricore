/**
 * Signed-in session state shared with the React bundle.
 *
 * The bundle reads the session through `window.Zl.session()` and, on first
 * render, from the `tc_session` localStorage entry written by
 * bootstrap/session-guard.js. `window._tcSession` is the in-memory copy used
 * by the DOM-level feature modules.
 */
import { STORAGE } from './config.js';
import { sb } from './supabase.js';

export const getSession = () => window._tcSession || null;

/** Point the bundle's Zl session accessors at `session` (or null). */
function bindZlSession(session) {
  if (!window.Zl) return;
  window.Zl.session     = () => session;
  window.Zl.getUserById = (id) => (session && session.userId === id ? session : null);
}

/** Show or hide the landing page to match the signed-in state. */
export function setLandingHidden(hidden) {
  document.documentElement.classList.toggle('tc-session-active', hidden);
  const lp = document.getElementById('tc-lp');
  if (!lp) return;
  lp.style.display       = hidden ? 'none' : '';
  lp.style.pointerEvents = hidden ? 'none' : '';
}

export function buildSession(user, profile) {
  return {
    userId:    user.id,
    name:      profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
    email:     user.email || profile?.email || '',
    role:      profile?.role || user.user_metadata?.role || 'pm',
    loginTime: Date.now(),
  };
}

/** Activate `session` in memory, for the bundle, and for this tab. */
export function setSession(session) {
  window._tcSession = session;
  bindZlSession(session);
  try { sessionStorage.setItem(STORAGE.tabActive, '1'); } catch (_) {}
  try { localStorage.setItem(STORAGE.session, JSON.stringify(session)); } catch (_) {}
}

export function clearSession() {
  window._tcSession = null;
  if (window.Zl) {
    window.Zl.session     = () => null;
    window.Zl.getUserById = () => null;
  }
  try { sessionStorage.removeItem(STORAGE.tabActive); } catch (_) {}
  try { localStorage.removeItem(STORAGE.session); } catch (_) {}
  // Let the landing page show again.
  document.documentElement.classList.remove('tc-session-active');
}

/**
 * Adopt the session the guard restored into `tc_session` (no network wait),
 * hiding the landing page. Returns the stored session, or null.
 */
export function adoptStoredSession() {
  let stored;
  try { stored = JSON.parse(localStorage.getItem(STORAGE.session) || 'null'); } catch (_) { return null; }
  if (!stored?.userId) return null;

  window._tcSession = stored;
  bindZlSession(stored);
  try { sessionStorage.setItem(STORAGE.tabActive, '1'); } catch (_) {}
  // Second layer behind the CSS class set by the guard.
  setLandingHidden(true);
  return stored;
}

// ── Profiles ─────────────────────────────────────────────────────────

const PROFILE_COLUMNS = 'id, full_name, email, role';

export async function loadProfile(userId) {
  if (!userId) return null;
  try {
    const { data } = await sb.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single();
    return data || null;
  } catch (_) { return null; }
}

/** The user's profile row, creating it from auth metadata when missing. */
export async function ensureProfile(authUser) {
  const existing = await loadProfile(authUser.id);
  if (existing) return existing;
  const candidate = profileRowFor(authUser);
  try {
    const { data } = await sb.from('profiles').insert(candidate).select(PROFILE_COLUMNS).single();
    return data || candidate;
  } catch (_) { return candidate; }
}

/** Default profile row derived from an auth user. */
export function profileRowFor(user, overrides = {}) {
  return {
    id:        user.id,
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
    email:     user.email || '',
    role:      user.user_metadata?.role || 'pm',
    ...overrides,
  };
}

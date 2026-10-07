/**
 * Adapter between the compiled React bundle and our Supabase-backed services.
 *
 * The bundle talks to a synchronous store exposed as `window.Zl`
 * (login/register/logout, session, get/saveUserData, …). Our auth calls are
 * async, so the auth forms are intercepted at `submit` (capture phase): the
 * real request starts immediately, and the bundle's synchronous
 * `Zl.login()/register()` calls report the result once it is available
 * ("Signing in…" until then). A successful sign-in reloads the page.
 */
import { dataCacheKey, emptyState, readCachedState } from './config.js';
import { sb } from './supabase.js';
import { trackDeletions, scheduleSync, isHydrated } from './data-sync.js';
import { setSession } from './session.js';
import { signIn, signUp, signOut, requestPasswordReset, setNewPassword } from './auth.js';
import { openOtpDialog } from './otp-dialog.js';
import { joinProject } from './team-api.js';

let trackedRole = 'pm';
let loginPending = null;     // { promise, result }
let registerPending = null;  // { promise, result }

/** Infer the role from the role card the user clicked on the register form. */
function roleFromCardText(text) {
  if (/analyst/i.test(text))             return 'analyst';
  if (/executive/i.test(text))           return 'executive';
  if (/team.?member|member/i.test(text)) return 'team_member';
  if (/manager|^pm$/i.test(text))        return 'pm';
  return null;
}

function onRoleCardClick(ev) {
  const card = ev.target.closest ? ev.target.closest('[class*="role-card"]') : null;
  if (!card) return;
  trackedRole = roleFromCardText(card.textContent || '') || trackedRole;
  // Mirror onto the DOM so the submit handler can read it reliably.
  document.querySelectorAll('[class*="role-card"]').forEach((c) => c.removeAttribute('data-selected'));
  card.setAttribute('data-selected', trackedRole);
}

// Password inputs switch to type="text" when "show password" is toggled, so
// match on autocomplete hints as well.
const PASSWORD_SELECTOR = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
  'input[data-field="password"]',
].join(',');

function startRegister(name, email, pass, role) {
  registerPending = { promise: null, result: null };
  registerPending.promise = signUp(name, email, pass, role).then((r) => {
    registerPending.result = r;
    // Email confirmation is on → ask for the emailed code right away.
    if (r.ok && r.needsVerification) openOtpDialog('signup', r.email);
  });
}

function onAuthFormSubmit(ev) {
  const form = ev.target;
  if (!form) return;
  const email = form.querySelector('input[type="email"]')?.value?.trim() || '';
  const pass  = form.querySelector(PASSWORD_SELECTOR)?.value || '';
  const name  = form.querySelector('input[autocomplete="name"]')?.value?.trim() || '';
  if (!email || !pass) return;

  if (name) {
    // Register form. Don't start a second sign-up while one is in flight.
    if (!registerPending?.promise) {
      const role = form.querySelector('[data-selected]')?.getAttribute('data-selected') || trackedRole || 'pm';
      startRegister(name, email, pass, role);
    }
  } else {
    // Login form. Success reloads the page; failure is reported via Zl.login().
    loginPending = { promise: null, result: null };
    loginPending.promise = signIn(email, pass).then((r) => {
      loginPending.result = r;
      // Account not verified yet → send a fresh code and ask for it.
      if (r.unconfirmed) openOtpDialog('signup', r.email, { resend: true });
    });
  }
}

/** Start intercepting the auth forms rendered by the bundle. */
export function installAuthFormCapture() {
  document.addEventListener('click', onRoleCardClick, true);
  document.addEventListener('submit', onAuthFormSubmit, true);
}

/** The `Zl` implementation handed to the bundle. */
export const zl = {
  // Only the error path reaches here — success reloads the page first.
  login(_email, _pass) {
    if (loginPending?.result) {
      const r = loginPending.result;
      loginPending = null;
      return r;
    }
    return { ok: false, err: 'Signing in…' };
  },

  register(name, email, pass, role) {
    if (registerPending?.result) {
      const r = registerPending.result;
      registerPending = null;
      // Email confirmation disabled → session is ready → reload into the dashboard.
      if (r.autoLogin) { window.location.reload(); return { ok: false, err: 'Redirecting…' }; }
      return r;
    }
    if (!registerPending?.promise) startRegister(name, email, pass, role || trackedRole || 'pm');
    return { ok: false, err: 'Creating account…' };
  },

  logout() { signOut().catch((e) => console.warn('[TriCore] logout:', e.message)); },

  session:      () => window._tcSession || null,
  getUserById:  (id) => (window._tcSession?.userId === id ? window._tcSession : null),
  users:        () => [],
  saveUsers:    () => [],
  dataKey:      (uid) => dataCacheKey(uid),
  defaultState: () => emptyState(),

  getUserData(userId) {
    if (!userId) return emptyState();
    const s = readCachedState(userId);
    if (!s) return emptyState();
    const d = emptyState();
    return { ...d, ...s, profile: { ...d.profile, ...(s.profile || {}) } };
  },

  saveUserData(userId, nextState) {
    if (!userId) return nextState;
    try {
      const tools = window.TriCoreProjectTools;
      const state = tools?.syncProjectArtifacts ? tools.syncProjectArtifacts(nextState) : nextState;
      try { trackDeletions(readCachedState(userId), state); } catch (_) {}
      localStorage.setItem(dataCacheKey(userId), JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('tricore:data-updated', { detail: { userId } }));
      if (isHydrated(userId)) scheduleSync(userId, state);
      return state;
    } catch (_) { return nextState; }
  },

  updateProfile(userId, payload) {
    if (!userId) return { ok: false, err: 'Not authenticated.' };
    const newName = payload?.name?.trim();
    if (!newName) return { ok: true, user: window._tcSession };
    const current = window._tcSession;
    if (current?.userId === userId) setSession({ ...current, name: newName });
    sb.from('profiles').update({ full_name: newName }).eq('id', userId)
      .then(({ error }) => { if (error) console.warn('[TriCore] profile update:', error.message); });
    return { ok: true, user: window._tcSession };
  },

  updatePassword(_userId, _old, newPass) {
    if (!newPass || newPass.length < 8) return { ok: false, err: 'New password must be at least 8 characters.' };
    sb.auth.updateUser({ password: newPass })
      .then(({ error }) => { if (error) console.warn('[TriCore] password update:', error.message); });
    return { ok: true };
  },

  // Used by the team UI (join modal / team-member welcome screen).
  joinProject:          (code) => joinProject(window._tcSession?.userId, code),
  // The reset email carries a code; collect it (with the new password) in our dialog.
  requestPasswordReset: (email) => requestPasswordReset(email).then((r) => {
    if (r.ok) openOtpDialog('recovery', email.trim().toLowerCase());
    return r;
  }),
  setNewPassword:       (token, pass) => setNewPassword(token, pass),
};

/**
 * Install `zl` as `window.Zl`, merging into the bundle's object when it
 * exists so that bundle-held references keep working.
 */
export function installZl() {
  if (window.Zl) Object.assign(window.Zl, zl);
  else window.Zl = zl;
  // From now on saveUserData calls reach our implementation directly.
  window.__zlProxyInstalled = true;
}

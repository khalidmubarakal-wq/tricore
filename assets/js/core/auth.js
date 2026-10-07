/**
 * Authentication flows: sign in/up/out, password reset, email confirmation
 * and session restore on page load.
 *
 * Successful sign-in (and email confirmation) reloads the page: the reload
 * keeps sessionStorage, so bootstrap/session-guard.js restores the session
 * synchronously before the React bundle renders — no race with the bundle.
 */
import { SB_URL, SB_KEY, dataCacheKey } from './config.js';
import { sb, saveToken, clearToken, currentToken, revokeSession, fetchAuthUser } from './supabase.js';
import { fetchFromDB, markHydrated, unmarkHydrated, drainPendingSyncsForUser } from './data-sync.js';
import {
  buildSession, setSession, clearSession, adoptStoredSession, setLandingHidden,
  loadProfile, ensureProfile, profileRowFor,
} from './session.js';

const SIGN_IN_TIMEOUT_MS = 15000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/** Map a raw sign-in error to something safe and friendly to show. */
function friendlySignInError(msg = '') {
  if (/invalid login|invalid credentials|user not found/i.test(msg)) return 'Invalid email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first.';
  if (/too many requests/i.test(msg)) return 'Too many attempts — please wait.';
  return (msg.length < 120 && !/supabase|postgres|sql|jwt/i.test(msg)) ? msg : 'Sign in failed.';
}

/**
 * Insert the profile row while we hold a fresh access token. Supabase may or
 * may not have a DB trigger for this; writing it explicitly always works.
 */
async function insertProfileRow(row, accessToken) {
  try {
    await fetch(`${SB_URL}/rest/v1/profiles`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SB_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer':        'resolution=ignore-duplicates',
      },
      body: JSON.stringify(row),
    });
  } catch (_) { /* non-fatal — the profile is created on first login */ }
}

const siteUrl = () => window.location.origin + window.location.pathname.replace(/\/+$/, '');

// ── Sign in / up / out ───────────────────────────────────────────────

export async function signIn(email, password) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out — please try again.')), SIGN_IN_TIMEOUT_MS));
  const { data, error } = await Promise.race([
    sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }),
    timeout,
  ]).catch((e) => ({ data: null, error: { message: e.message } }));
  if (error) {
    const unconfirmed = /email not confirmed/i.test(error.message || '');
    return { ok: false, err: friendlySignInError(error.message), unconfirmed, email: email.trim().toLowerCase() };
  }

  const [profile] = await Promise.all([
    ensureProfile(data.user),
    fetchFromDB(data.user.id).catch(() => null),
  ]);
  markHydrated(data.user.id); // saveUserData may now sync to the DB

  const session = buildSession(data.user, profile);
  setSession(session);
  window.location.reload();
  return { ok: true, session };
}

export async function signUp(fullName, email, password, role = 'pm') {
  const cleanName = fullName?.trim();
  const cleanMail = email?.trim().toLowerCase();
  if (!cleanName) return { ok: false, err: 'Full name is required.' };
  if (!cleanMail || !EMAIL_RE.test(cleanMail)) return { ok: false, err: 'Valid email address required.' };
  if (!password || password.length < MIN_PASSWORD) return { ok: false, err: 'Password must be at least 8 characters.' };

  const { data, error } = await sb.auth.signUp({
    email: cleanMail, password,
    options: { data: { full_name: cleanName, role: role || 'pm' }, emailRedirectTo: siteUrl() },
  });
  if (error) {
    const msg = error.message || '';
    return { ok: false, err: /already registered|already exists/i.test(msg) ? 'An account with this email already exists.' : msg || 'Registration failed.' };
  }
  if (!data?.user) return { ok: false, err: 'Registration failed — please try again.' };

  // A session is returned immediately when email confirmation is disabled.
  const accessToken = data.session?.access_token;
  if (accessToken) {
    await insertProfileRow({ id: data.user.id, full_name: cleanName, email: cleanMail, role: role || 'pm' }, accessToken);
    markHydrated(data.user.id);
    const profile = await ensureProfile(data.user);
    setSession(buildSession(data.user, profile));
    return { ok: true, autoLogin: true };
  }
  // Email confirmation is on: the user must enter the emailed code (or click the link).
  return { ok: true, needsVerification: true, email: cleanMail };
}

export async function signOut() {
  const userId = window._tcSession?.userId;
  const token = currentToken();
  // Clear local state FIRST and synchronously, so a refresh during logout
  // already shows the login screen.
  clearSession();
  sb._token = null;
  clearToken();
  if (userId) {
    try { localStorage.removeItem(dataCacheKey(userId)); } catch (_) {}
    unmarkHydrated(userId);
  }
  if (token) revokeSession(token); // best effort, non-blocking
}

// ── Password reset ───────────────────────────────────────────────────

export async function requestPasswordReset(email) {
  const cleanMail = email?.trim().toLowerCase();
  if (!cleanMail || !EMAIL_RE.test(cleanMail)) return { ok: false, err: 'Please enter a valid email address.' };
  const { error } = await sb.auth.resetPasswordForEmail(cleanMail);
  if (error) return { ok: false, err: error.message || 'Could not send reset email.' };
  return { ok: true };
}

export async function setNewPassword(token, password) {
  if (!password || password.length < MIN_PASSWORD) return { ok: false, err: 'Password must be at least 8 characters.' };
  const { error } = await sb.auth.updatePasswordWithToken(token, password);
  if (error) return { ok: false, err: error.message || 'Could not update password.' };
  return { ok: true };
}

/**
 * Finish signing in with a freshly issued session (email link, OTP code):
 * make sure the profile row exists, activate the session and reload, so the
 * session guard restores it before the bundle renders.
 */
async function completeSignIn(user, accessToken, { createProfile = false } = {}) {
  const profileRow = profileRowFor(user);
  if (createProfile) await insertProfileRow(profileRow, accessToken);
  markHydrated(user.id);
  const profile = await loadProfile(user.id).catch(() => null);
  setSession(buildSession(user, profile || profileRow));
  window.location.reload();
}

const OTP_RE = /^\d{6,10}$/;
const cleanCode = (code) => String(code || '').replace(/\D/g, '');

/** Map a raw OTP verification error to something friendly. */
function friendlyOtpError(error) {
  const msg = error?.message || '';
  if (/expired|invalid|not found|otp/i.test(msg) || error?.status === 403) return 'The code is invalid or has expired. Request a new one.';
  if (/rate|too many/i.test(msg) || error?.status === 429) return 'Too many attempts — please wait a minute and try again.';
  return msg || 'Verification failed.';
}

/** Confirm a new account with the code from the sign-up email, then sign in. */
export async function verifySignupCode(email, code) {
  const token = cleanCode(code);
  if (!OTP_RE.test(token)) return { ok: false, err: 'Enter the code from the email.' };
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'signup' });
  if (error) return { ok: false, err: friendlyOtpError(error) };
  await completeSignIn(data.user, data.session.access_token, { createProfile: true });
  return { ok: true };
}

/** Send a new sign-up confirmation code. */
export async function resendSignupCode(email) {
  const { error } = await sb.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
  if (error) return { ok: false, err: friendlyOtpError(error) };
  return { ok: true };
}

/** Reset the password with the code from the reset email, then sign in. */
export async function resetPasswordWithCode(email, code, password) {
  const token = cleanCode(code);
  if (!OTP_RE.test(token)) return { ok: false, err: 'Enter the code from the email.' };
  if (!password || password.length < MIN_PASSWORD) return { ok: false, err: 'Password must be at least 8 characters.' };
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'recovery' });
  if (error) return { ok: false, err: friendlyOtpError(error) };
  const { error: pwError } = await sb.auth.updatePasswordWithToken(data.session.access_token, password);
  if (pwError) return { ok: false, err: pwError.message || 'Could not update password.' };
  await completeSignIn(data.user, data.session.access_token);
  return { ok: true };
}

const hashParams = () => new URLSearchParams(window.location.hash.slice(1));

/** Access token from a `#type=recovery` password-reset link, if present. */
export function getRecoveryToken() {
  try {
    const params = hashParams();
    if (params.get('type') === 'recovery') return params.get('access_token') || null;
  } catch (_) {}
  return null;
}

// ── Email confirmation ───────────────────────────────────────────────

export const isEmailConfirmRedirect = () => window.location.hash.includes('type=signup');

/**
 * Handle the redirect from the confirmation email
 * (`#access_token=…&refresh_token=…&type=signup`): sign the user in and reload.
 */
export async function handleEmailConfirm() {
  try {
    const params = hashParams();
    if (params.get('type') !== 'signup') return;
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token') || '';
    if (!access_token) return;

    window.history.replaceState(null, '', window.location.pathname);

    sb._token = access_token;
    saveToken({ access_token, refresh_token, user: null });

    const user = await fetchAuthUser(access_token);
    if (!user?.id) return;
    saveToken({ access_token, refresh_token, user });

    // The profile could not be created at sign-up time (no session token yet).
    await completeSignIn(user, access_token, { createProfile: true });
  } catch (_) {}
}

// ── Restore on page load ─────────────────────────────────────────────

/**
 * Re-validate the session restored by the guard. The token is validated
 * (and refreshed) BEFORE fetching data, so an expired token can't produce
 * 401s that would overwrite a valid local cache with an empty state.
 */
export async function restoreSession() {
  const stored = adoptStoredSession();
  if (!stored) return;

  try {
    const { data } = await sb.auth.getSession();
    const user = data?.session?.user;
    if (user) {
      markHydrated(user.id);
      setSession(buildSession(user, {}));
      drainPendingSyncsForUser(user.id);
      fetchFromDB(user.id).catch(() => {});
    } else {
      // No valid token and no successful refresh.
      clearSession();
      setLandingHidden(false);
    }
  } catch (netErr) {
    // Offline: keep the cached session and stay hydrated so edits sync later.
    console.warn('[TriCore] getSession network error, keeping cached session:', netErr.message);
    markHydrated(stored.userId);
  }
}

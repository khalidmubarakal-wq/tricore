/**
 * Minimal Supabase client (Auth + PostgREST) built on fetch — no SDK.
 *
 * Exposes an `sb` object with a subset of the supabase-js API surface
 * (`sb.auth.*`, `sb.from(table)…`) plus token helpers shared by the other
 * core modules.
 */
import { SB_URL, SB_KEY, STORAGE } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Token storage ────────────────────────────────────────────────────

export function saveToken(s) { try { localStorage.setItem(STORAGE.authToken, JSON.stringify(s)); } catch (_) {} }
export function loadToken()  { try { return JSON.parse(localStorage.getItem(STORAGE.authToken) || 'null'); } catch (_) { return null; } }
export function clearToken() { try { localStorage.removeItem(STORAGE.authToken); } catch (_) {} }

/** Decoded JWT payload, or null when the token is malformed. */
function jwtPayload(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch (_) { return null; }
}

/** True when the JWT has an `exp` claim that falls within `marginSec` from now. */
function expiresWithin(payload, marginSec) {
  return !!payload.exp && (payload.exp - Date.now() / 1000) < marginSec;
}

/** Best token available right now, without any network call. */
export function currentToken() {
  return sb._token || loadToken()?.access_token;
}

/**
 * A valid (non-expired) access token, refreshing it when it expires within
 * 30s. Returns null when there is no session or the refresh fails.
 */
export async function getValidToken() {
  const stored = loadToken();
  if (!stored?.access_token) return null;

  const payload = jwtPayload(stored.access_token);
  if (payload && !expiresWithin(payload, 30)) {
    sb._token = stored.access_token;
    return stored.access_token;
  }

  if (stored.refresh_token) {
    const user = await sb.auth._refresh(stored.refresh_token);
    if (user) return sb._token;
  }
  return null;
}

/** getValidToken(), falling back to whatever token is cached. */
export async function freshToken() {
  return (await getValidToken()) || currentToken();
}

/** Headers for a REST/Storage call; anonymous calls authenticate with the anon key. */
export function restHeaders(token, extra = {}) {
  return { 'apikey': SB_KEY, 'Authorization': `Bearer ${token || SB_KEY}`, ...extra };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const errorMessage = (json, fallback) =>
  json.error_description || json.msg || json.error || json.message || fallback;

// ── Auth API ─────────────────────────────────────────────────────────

const auth = {
  async signUp({ email, password, options }) {
    // Retry with backoff — handles cold-start 500s and transient infra errors.
    const MAX_ATTEMPTS = 3;
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const signupBody = { email, password, data: options?.data || {} };
        // Supabase embeds redirect_to in the confirmation email link.
        if (options?.emailRedirectTo) signupBody.redirect_to = options.emailRedirectTo;

        const res = await fetch(`${SB_URL}/auth/v1/signup`, {
          method: 'POST',
          headers: { ...JSON_HEADERS, 'apikey': SB_KEY },
          body: JSON.stringify(signupBody),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok && res.status !== 422) console.warn('[TriCore] signup error:', res.status, JSON.stringify(json));

        if (res.status === 500) {
          lastErr = (json.message || json.error_description || json.msg || json.error || '')
            || `Server error (attempt ${attempt}/${MAX_ATTEMPTS})`;
          if (attempt < MAX_ATTEMPTS) { await sleep(attempt * 1500); continue; }
          const hint = 'If this persists, check your Supabase project is active and email settings are correct.';
          return { data: null, error: { message: (lastErr ? lastErr + '. ' : '') + hint } };
        }
        // 422 = validation error (weak password, invalid email, rate limit, …)
        if (res.status === 422) {
          const msg = json.message || json.error_description || json.msg || json.error || '';
          const friendly = /rate.?limit|email.?rate/i.test(msg)
            ? 'Too many sign-up attempts. Please wait a few minutes and try again.'
            : /password/i.test(msg)
            ? 'Password is too weak. Please use at least 8 characters with letters and numbers.'
            : /already.?registered|already.?exists/i.test(msg)
            ? 'An account with this email already exists.'
            : msg || 'Sign up failed — please check your details and try again.';
          return { data: null, error: { message: friendly } };
        }
        if (!res.ok) return { data: null, error: { message: errorMessage(json, 'Sign up failed') } };

        if (json.access_token) {
          sb._token = json.access_token;
          saveToken({ access_token: json.access_token, refresh_token: json.refresh_token, user: json.user || json });
        }
        const user = json.user || json;
        return { data: { user, session: json.access_token ? json : null }, error: null };
      } catch (netErr) {
        lastErr = netErr.message;
        if (attempt < MAX_ATTEMPTS) { await sleep(attempt * 1500); continue; }
        return { data: null, error: { message: 'Network error — check your connection.' } };
      }
    }
  },

  async signInWithPassword({ email, password }) {
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { ...JSON_HEADERS, 'apikey': SB_KEY },
          body: JSON.stringify({ email, password }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 500 && attempt < MAX_ATTEMPTS) { await sleep(2000); continue; }
        if (!res.ok) return { data: null, error: { message: errorMessage(json, 'Invalid credentials') } };
        sb._token = json.access_token;
        saveToken({ access_token: json.access_token, refresh_token: json.refresh_token, user: json.user });
        return { data: { user: json.user, session: json }, error: null };
      } catch (netErr) {
        if (attempt < MAX_ATTEMPTS) { await sleep(2000); continue; }
        return { data: null, error: { message: 'Network error — check your connection.' } };
      }
    }
    return { data: null, error: { message: 'Sign in failed.' } };
  },

  async signOut() {
    const token = currentToken();
    if (token) await revokeSession(token);
    sb._token = null;
    clearToken();
    return { error: null };
  },

  async getSession() {
    const stored = loadToken();
    if (!stored?.access_token) return { data: { session: null } };

    // Decode the JWT to check expiry without a network call.
    const payload = jwtPayload(stored.access_token);
    if (payload && !expiresWithin(payload, 60)) {
      sb._token = stored.access_token;
      return { data: { session: { user: { id: payload.sub, email: payload.email, user_metadata: payload.user_metadata || {} } } } };
    }

    // Expired or undecodable — try a refresh.
    if (stored.refresh_token) {
      const refreshed = await sb.auth._refresh(stored.refresh_token);
      if (refreshed) return { data: { session: { user: refreshed } } };
    }

    // Refresh failed — verify with a network call as last resort.
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${stored.access_token}` },
    }).catch(() => null);
    if (!res) return { data: { session: null } };
    if (!res.ok) { clearToken(); return { data: { session: null } }; }
    const user = await res.json();
    sb._token = stored.access_token;
    return { data: { session: { user } } };
  },

  /** Exchange a refresh token for a new session. Resolves to the user, or null. */
  async _refresh(refresh_token) {
    try {
      const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { ...JSON_HEADERS, 'apikey': SB_KEY },
        body: JSON.stringify({ refresh_token }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.access_token) return null;
      sb._token = json.access_token;
      saveToken({ access_token: json.access_token, refresh_token: json.refresh_token || refresh_token, user: json.user });
      return json.user;
    } catch (_) { return null; }
  },

  async updateUser({ password }) {
    const token = currentToken();
    if (!token) return { error: { message: 'Not authenticated' } };
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { ...JSON_HEADERS, 'apikey': SB_KEY, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) return { error: { message: json.error_description || json.msg || 'Update failed' } };
    return { data: json, error: null };
  },

  onAuthStateChange(_cb) { return { data: { subscription: { unsubscribe: () => {} } } }; },

  async resetPasswordForEmail(email) {
    const res = await fetch(`${SB_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, 'apikey': SB_KEY },
      body: JSON.stringify({ email, gotrue_meta_security: {} }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return { error: { message: e.error_description || e.msg || e.error || 'Reset failed' } };
    }
    return { error: null };
  },

  async updatePasswordWithToken(token, newPassword) {
    const res = await fetch(`${SB_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { ...JSON_HEADERS, 'apikey': SB_KEY, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ password: newPassword }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: { message: json.error_description || json.msg || 'Update failed' } };
    return { data: json, error: null };
  },
};

/** Fetch the auth user for an access token (null on any failure). */
export async function fetchAuthUser(accessToken) {
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/** Server-side session revocation (best effort, never throws). */
export function revokeSession(token) {
  return fetch(`${SB_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${token}` },
  }).catch(() => {});
}

// ── PostgREST query builder ──────────────────────────────────────────

class SBQuery {
  constructor(t) { this._t = t; this._f = []; this._s = '*'; this._one = false; }
  select(c)  { this._s = c; return this; }
  eq(c, v)   { this._f.push(`${c}=eq.${encodeURIComponent(v)}`); return this; }
  in(c, vs)  { this._f.push(`${c}=in.(${vs.map((v) => encodeURIComponent(v)).join(',')})`); return this; }
  single()   { this._one = true; return this; }

  _url(qs = '') {
    const base = `${SB_URL}/rest/v1/${this._t}?select=${encodeURIComponent(this._s)}`;
    const f = this._f.length ? '&' + this._f.join('&') : '';
    return base + f + (qs ? '&' + qs : '');
  }

  async _req(method, body) {
    const execute = (token) => fetch(this._url(), {
      method,
      headers: restHeaders(token, { ...JSON_HEADERS, 'Prefer': 'return=representation' }),
      body: body ? JSON.stringify(body) : undefined,
    });
    try {
      let res = await execute(await freshToken());

      // On 401, refresh once and retry.
      if (res.status === 401) {
        const stored = loadToken();
        if (stored?.refresh_token && await sb.auth._refresh(stored.refresh_token)) {
          res = await execute(sb._token);
        }
      }

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        return { data: null, error: { message: e.message || e.hint || `HTTP ${res.status}` } };
      }
      const txt = await res.text();
      const data = txt ? JSON.parse(txt) : [];
      if (this._one) {
        const item = Array.isArray(data) ? data[0] : data;
        if (!item) return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
        return { data: item, error: null };
      }
      return { data: Array.isArray(data) ? data : [data], error: null };
    } catch (e) { return { data: null, error: { message: e.message } }; }
  }

  then(r, j) { return this._req('GET').then(r, j); }
  catch(fn)  { return this._req('GET').catch(fn); }

  async insert(rows) { return this._req('POST', Array.isArray(rows) ? rows : [rows]); }

  async upsert(rows, opts = {}) {
    const body = Array.isArray(rows) ? rows : [rows];
    try {
      const res = await fetch(`${SB_URL}/rest/v1/${this._t}?on_conflict=${opts.onConflict || 'id'}`, {
        method: 'POST',
        headers: restHeaders(await freshToken(), { ...JSON_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); return { error: { message: e.message || `HTTP ${res.status}` } }; }
      return { error: null };
    } catch (e) { return { error: { message: e.message } }; }
  }

  async update(data) { return this._req('PATCH', data); }

  delete() {
    // Filters chain on the delete builder so awaiting it issues a DELETE
    // (the previous version returned the query itself, which awaited as a GET).
    const builder = {
      in: (col, vals) => { this.in(col, vals); return builder; },
      eq: (col, val) => { this.eq(col, val); return builder; },
      then: (r, j) => this._req('DELETE').then(r, j),
    };
    return builder;
  }
}

export const sb = {
  _url: SB_URL, _key: SB_KEY, _token: null,
  auth,
  from(table) { return new SBQuery(table); },
};

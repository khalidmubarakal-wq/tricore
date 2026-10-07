/**
 * Session guard — runs synchronously in <head>, before the landing page or the
 * React bundle are parsed.
 *
 * Login persistence model (sessionStorage is cleared when the tab closes):
 *   - Refresh in the same tab  → `tabActive` flag survives → session restored.
 *   - Close tab / browser      → flag is gone → user must sign in again.
 *
 * When a valid session exists this script:
 *   1. writes a fresh `tc_session` object, which the React bundle reads
 *      synchronously on its first render to decide between dashboard and login;
 *   2. adds `tc-session-active` to <html>, which hides the landing page via CSS
 *      before it is ever painted (see base.css).
 * Otherwise it clears `tc_session` so the bundle shows the auth screen.
 */
(function tcSessionGuard() {
  'use strict';

  var cfg = window.TC_CONFIG;
  var KEYS = cfg.storage;

  purgeLegacyStorage(cfg.legacyStorage);

  // Neutralise globals the bundle used for its old localStorage-only user store.
  window.Ug = function () { return null; };
  window.Al = { USERS: '__DISABLED__', SESSION: '__DISABLED__', DATA_PREFIX: KEYS.userDataPrefix };

  try {
    var user = readActiveUser();
    if (!user) {
      localStorage.removeItem(KEYS.session);
      return;
    }

    var meta = user.user_metadata || {};
    localStorage.setItem(KEYS.session, JSON.stringify({
      userId:    user.id,
      name:      meta.full_name || (user.email || '').split('@')[0] || 'User',
      email:     user.email || '',
      role:      meta.role || 'pm',
      loginTime: Date.now() // fresh timestamp so the bundle's 24h expiry check passes
    }));

    document.documentElement.classList.add('tc-session-active');
  } catch (_) {
    try { localStorage.removeItem(KEYS.session); } catch (_) {}
  }

  /** The Supabase user for this tab, or null when the tab has no live session. */
  function readActiveUser() {
    if (sessionStorage.getItem(KEYS.tabActive) !== '1') return null;
    var raw = localStorage.getItem(KEYS.authToken);
    if (!raw) return null;
    var stored = JSON.parse(raw);
    var user = stored && stored.user;
    return user && user.id ? user : null;
  }

  function purgeLegacyStorage(legacy) {
    try {
      var doomed = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        var isLegacy = legacy.exact.indexOf(k) !== -1 ||
          legacy.prefixes.some(function (p) { return k.indexOf(p) === 0; });
        if (isLegacy) doomed.push(k);
      }
      doomed.forEach(function (k) { localStorage.removeItem(k); });
    } catch (_) {}
  }
})();

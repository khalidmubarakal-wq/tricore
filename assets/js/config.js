/**
 * TriCore runtime configuration — the single source of truth for backend
 * endpoints and browser-storage keys.
 *
 * Loaded first as a classic script so that every other script (classic or
 * ES module) can read `window.TC_CONFIG`.
 *
 * NOTE: the compiled app bundle (assets/js/vendor/tricore-app.bundle.js) has
 * the storage keys below baked in. Changing a key here without rebuilding the
 * bundle will break the session handshake between the two.
 */
(function () {
  'use strict';

  var SUPABASE_PROJECT_REF = 'bfgnwnrxlljkwkzzucza';

  window.TC_CONFIG = Object.freeze({
    supabase: Object.freeze({
      url: 'https://' + SUPABASE_PROJECT_REF + '.supabase.co',
      // Public "anon" key — safe to ship to browsers; access is enforced by
      // Supabase Row Level Security policies on every table.
      anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZ253bnJ4bGxqa3drenp1Y3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTUxMzksImV4cCI6MjA4OTQ3MTEzOX0.EzX7JwANBE0be0QpwpZjH2Qsbkv4BVZTyhTuXBseYTc',
    }),

    storage: Object.freeze({
      /* localStorage */
      authToken: 'sb-' + SUPABASE_PROJECT_REF + '-auth-token', // Supabase session (access/refresh token + user)
      session: 'tc_session', // compat session object read synchronously by the app bundle
      userDataPrefix: 'tc_user_data_', // + userId → cached workspace state
      lang: 'tc_lang', // 'ar' | 'en'
      /* sessionStorage */
      tabActive: 'tc_active', // '1' while this tab has a signed-in session
      betaAccepted: 'tc_beta_accepted', // '1' once the beta warning was accepted
    }),

    // Keys from earlier prototypes that are purged on every load.
    legacyStorage: Object.freeze({
      exact: ['tc_users'],
      prefixes: ['tc_state_', 'tricore_modal_pos_'],
    }),

    // Email one-time codes. Must match Supabase → Authentication → Providers →
    // Email → "Email OTP Length" (default 6).
    auth: Object.freeze({ otpLength: 6, resendCooldownSec: 60 }),

    defaultLang: 'ar',
    logoUrl: 'assets/img/logo.png', // dark wordmark, for light backgrounds
    logoOnDarkUrl: 'assets/img/logo-on-dark.png', // white wordmark, for dark backgrounds
  });
})();

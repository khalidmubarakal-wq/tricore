/**
 * TriCore core — entry point (ES module, runs after the document is parsed
 * and after the React bundle has executed).
 *
 * Wires the Supabase-backed services into the compiled React bundle and
 * installs the DOM-level features that live outside it. Order matters:
 *   1. intercept auth forms and finish any email-confirmation redirect,
 *   2. install our `window.Zl` and drain saves queued before it existed,
 *   3. restore the session (validate token → hydrate from the DB),
 *   4. mount the DOM-injected features.
 *
 * Storage model:
 *   sessionStorage `tc_active`      — this tab is signed in (cleared on tab close)
 *   localStorage   `sb-…-auth-token` — Supabase tokens (persist across tabs)
 *   localStorage   `tc_user_data_*`  — workspace cache
 *   localStorage   `tc_session`      — session object read synchronously by the bundle
 */
import { sb } from './supabase.js';
import { fetchFromDB, syncToDB, scheduleSync, isHydrated, drainPendingSyncs, drainPendingSyncsForUser } from './data-sync.js';
import { clearSession } from './session.js';
import { getRecoveryToken, isEmailConfirmRedirect, handleEmailConfirm, restoreSession } from './auth.js';
import { joinProject, removeMember, toggleJoin } from './team-api.js';
import { installAuthFormCapture, installZl } from './zl-bridge.js';
import { installAnimationFix } from './animation-fix.js';
import { installTeamPanel } from './team-panel.js';
import { installClaimAttachments } from './claim-attachments.js';

// ── Services exposed for the bundle / other scripts ──────────────────
window.supabase = sb;
window._tcJoinProject = joinProject;
window._tcRemoveMember = removeMember;
window._tcToggleJoin = toggleJoin; // replaced by the team panel's UI handler below

// ── Auth ─────────────────────────────────────────────────────────────
installAuthFormCapture();
window.__tcRecoveryToken = getRecoveryToken(); // read by the bundle's reset-password screen
if (isEmailConfirmRedirect()) handleEmailConfirm().catch(() => {});

// ── Bundle bridge ────────────────────────────────────────────────────
installZl();
drainPendingSyncs();
restoreSession().catch(() => {});

// ── Debug API (browser console) ──────────────────────────────────────
window.tricoreCurrentUser = () => window._tcSession || null;
window.tricore = {
  fetchFromDB,
  syncToDB,
  scheduleSync,
  clearSession,
  isHydrated,
  drainPending: () => {
    const s = window._tcSession;
    if (s?.userId) drainPendingSyncsForUser(s.userId);
  },
  pendingQueue: () => (window.__pendingSyncs || []).length,
};

// ── DOM-level features ───────────────────────────────────────────────
installAnimationFix();
console.log('[TriCore] v5 ready');
installTeamPanel();
installClaimAttachments();

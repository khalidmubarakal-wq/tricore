/**
 * ES-module view of the runtime config defined by assets/js/config.js.
 */
const cfg = window.TC_CONFIG;

export const SB_URL = cfg.supabase.url;
export const SB_KEY = cfg.supabase.anonKey;
export const STORAGE = cfg.storage;

/** localStorage key holding the cached workspace state of a user. */
export const dataCacheKey = (userId) => `${STORAGE.userDataPrefix}${userId}`;

/** Shape of an empty workspace, as the app bundle expects it. */
export const emptyState = () => ({
  projects: [], wbs: [], baselines: [], claims: [],
  risks: [], changeRequests: [],
  profile: { name: 'User', email: '', role: 'pm', avatarMode: 'initial' },
});

/** Read and parse a user's cached workspace state (null when absent/corrupt). */
export function readCachedState(userId) {
  try { return JSON.parse(localStorage.getItem(dataCacheKey(userId)) || 'null'); } catch (_) { return null; }
}

/** Persist a user's workspace state to the local cache (best effort). */
export function writeCachedState(userId, state) {
  try { localStorage.setItem(dataCacheKey(userId), JSON.stringify(state)); } catch (_) {}
}

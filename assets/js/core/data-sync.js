/**
 * Workspace data sync between the local cache (localStorage) and Supabase.
 *
 *   - fetchFromDB()  pulls the user's own rows + rows of projects they joined.
 *   - scheduleSync() debounces syncToDB(), which upserts the user's OWN rows
 *     and replays tracked deletions.
 *
 * A user is "hydrated" once their data has been loaded from (or confirmed
 * against) the DB; only hydrated users are synced, so a stale or empty local
 * cache can never overwrite server data.
 */
import { SB_URL, emptyState, writeCachedState } from './config.js';
import { sb, freshToken, currentToken, getValidToken, restHeaders } from './supabase.js';
import { toDb, fromDb } from './mappers.js';

const SYNC_DEBOUNCE_MS = 2000;

/** Child tables synced per project: [state key, table, mapper key]. */
const CHILD_TABLES = [
  ['wbs',            'wbs_items',       'wbs'],
  ['baselines',      'baselines',       'baseline'],
  ['claims',         'claims',          'claim'],
  ['risks',          'risks',           'risk'],
  ['changeRequests', 'change_requests', 'cr'],
];

const hydrated = new Set();
const pendingDeletes = Object.fromEntries(CHILD_TABLES.map(([, table]) => [table, new Set()]));
const syncTimers = {};

export const markHydrated   = (userId) => hydrated.add(userId);
export const unmarkHydrated = (userId) => hydrated.delete(userId);
export const isHydrated     = (userId) => hydrated.has(userId);

/** Remember ids present in `prev` but missing from `next` so the next sync deletes them. */
export function trackDeletions(prev, next) {
  if (!prev) return;
  for (const [key, table] of CHILD_TABLES) {
    const p = prev[key], n = next[key];
    if (!Array.isArray(p) || !Array.isArray(n)) continue;
    const nextIds = new Set(n.map((i) => i.id));
    for (const item of p) { if (item.id && !nextIds.has(item.id)) pendingDeletes[table].add(item.id); }
  }
}

// ── Read ─────────────────────────────────────────────────────────────

/** GET a PostgREST path, resolving to [] on any failure. */
function restGetOrEmpty(path, headers) {
  return fetch(`${SB_URL}/rest/v1/${path}`, { headers })
    .then((x) => (x.ok ? x.json() : []))
    .catch(() => []);
}
const asArray = (x) => (Array.isArray(x) ? x : []);

export async function fetchFromDB(userId) {
  if (!userId) return null;
  try {
    const hdrs = restHeaders(await freshToken(), { 'Content-Type': 'application/json' });

    // Own data + membership list, in parallel.
    const [p, mp, w, b, c, r, cr, mem] = await Promise.all([
      sb.from('projects').select('*').eq('user_id', userId),
      sb.from('project_members').select('project_id,role').eq('user_id', userId),
      sb.from('wbs_items').select('*').eq('user_id', userId),
      sb.from('baselines').select('*').eq('user_id', userId),
      sb.from('claims').select('*').eq('user_id', userId),
      sb.from('risks').select('*').eq('user_id', userId),
      sb.from('change_requests').select('*').eq('user_id', userId),
      sb.from('project_members').select('*'),
    ]);
    if (p.error) { console.warn('[TriCore] DB error:', p.error.message); return null; }

    // Data of projects the user is a member of.
    const memberships = mp.data || [];
    let mProjs = [], mWbs = [], mClaims = [], mRisks = [], mCrs = [];
    if (memberships.length) {
      const ids = memberships.map((m) => encodeURIComponent(m.project_id)).join(',');
      const [rp, rw, rc, rr, rcr] = await Promise.all([
        restGetOrEmpty(`projects?select=*&id=in.(${ids})`, hdrs),
        restGetOrEmpty(`wbs_items?select=*&project_id=in.(${ids})`, hdrs),
        restGetOrEmpty(`claims?select=*&project_id=in.(${ids})`, hdrs),
        restGetOrEmpty(`risks?select=*&project_id=in.(${ids})`, hdrs),
        restGetOrEmpty(`change_requests?select=*&project_id=in.(${ids})`, hdrs),
      ]);
      mProjs  = asArray(rp).map((x) => ({
        ...fromDb.project(x),
        _isMember: true,
        _memberRole: memberships.find((m) => m.project_id === x.id)?.role || 'member',
      }));
      mWbs    = asArray(rw).map(fromDb.wbs);
      mClaims = asArray(rc).map(fromDb.claim);
      mRisks  = asArray(rr).map(fromDb.risk);
      mCrs    = asArray(rcr).map(fromDb.cr);
    }

    // Members of the user's own projects.
    const membersByProject = {};
    (mem.data || []).forEach((m) => { (membersByProject[m.project_id] ||= []).push(m); });
    const ownProjs = (p.data || []).map((x) => ({ ...fromDb.project(x), _isOwner: true, _members: membersByProject[x.id] || [] }));

    const state = {
      ...emptyState(),
      projects:       [...ownProjs, ...mProjs],
      wbs:            [...(w.data || []).map(fromDb.wbs),   ...mWbs],
      baselines:      (b.data || []).map(fromDb.baseline),
      claims:         [...(c.data || []).map(fromDb.claim), ...mClaims],
      risks:          [...(r.data || []).map(fromDb.risk),  ...mRisks],
      changeRequests: [...(cr.data || []).map(fromDb.cr),   ...mCrs],
      _memberRoles:   Object.fromEntries(memberships.map((m) => [m.project_id, m.role])),
    };
    writeCachedState(userId, state);
    hydrated.add(userId);
    return state;
  } catch (e) { console.warn('[TriCore] fetchFromDB:', e.message); return null; }
}

// ── Write ────────────────────────────────────────────────────────────

export function scheduleSync(userId, state) {
  clearTimeout(syncTimers[userId]);
  syncTimers[userId] = setTimeout(() => syncToDB(userId, state), SYNC_DEBOUNCE_MS);
}

export async function syncToDB(userId, state) {
  if (!userId || !state) return;
  await getValidToken().catch(() => {});
  try {
    // Only sync projects the user OWNS. `state.projects` also holds projects
    // the user joined (_isMember). Upserting those under our user_id violates
    // RLS (auth.uid() = user_id), and since PostgREST runs an upsert as one
    // transaction, a single bad row would make the whole batch fail.
    const ownProjects = (state.projects || []).filter((p) => !p._isMember);
    const ownPids     = ownProjects.map((p) => p.id);

    if (ownProjects.length) {
      const { error } = await sb.from('projects').upsert(ownProjects.map((p) => toDb.project(p, userId)), { onConflict: 'id' });
      if (error) console.warn('[TriCore] projects upsert:', error.message);
      else console.log(`[TriCore] Saved ${ownProjects.length} project(s) to DB ✓`);
    }

    for (const [key, table, mapper] of CHILD_TABLES) {
      // Same RLS rule: only artifacts of owned projects.
      const rows = (state[key] || []).filter((i) => i.id && ownPids.includes(i.pid)).map((i) => toDb[mapper](i, userId));
      if (rows.length) {
        const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
        if (error) console.warn(`[TriCore] ${table} upsert:`, error.message);
      }
      await flushDeletes(table, userId);
    }
  } catch (e) { console.warn('[TriCore] syncToDB:', e.message); }
}

async function flushDeletes(table, userId) {
  const ids = [...pendingDeletes[table]];
  if (!ids.length) return;
  const res = await fetch(`${SB_URL}/rest/v1/${table}?id=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})&user_id=eq.${userId}`, {
    method: 'DELETE', headers: restHeaders(currentToken()),
  }).catch(() => null);
  if (res?.ok) ids.forEach((id) => pendingDeletes[table].delete(id));
}

// ── Early-write queue (see bootstrap/zl-proxy.js) ────────────────────

/** Sync the latest queued state of every hydrated user, emptying the queue. */
export function drainPendingSyncs() {
  const pending = window.__pendingSyncs || [];
  if (!pending.length) return;
  window.__pendingSyncs = [];
  const latestByUser = {};
  for (const { userId, state } of pending) { if (userId) latestByUser[userId] = state; }
  for (const [userId, state] of Object.entries(latestByUser)) {
    if (hydrated.has(userId) && state) {
      console.log(`[TriCore] Draining ${pending.length} pending sync(s) for user ${userId.slice(0, 8)}...`);
      scheduleSync(userId, state);
    }
  }
}

/** Sync the latest queued state of one user (called once they are hydrated). */
export function drainPendingSyncsForUser(userId) {
  const queue = window.__pendingSyncs || [];
  const pending = queue.filter((p) => p.userId === userId);
  if (!pending.length) return;
  window.__pendingSyncs = queue.filter((p) => p.userId !== userId);
  const latest = pending[pending.length - 1];
  if (latest?.state) {
    console.log(`[TriCore] Post-hydration drain for ${userId.slice(0, 8)}...`);
    scheduleSync(userId, latest.state);
  }
}

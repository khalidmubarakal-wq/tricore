/**
 * Project-membership API: join by code, remove a member, toggle joining.
 */
import { SB_URL } from './config.js';
import { currentToken, restHeaders } from './supabase.js';

export async function joinProject(userId, code) {
  if (!userId || !code) return { ok: false, err: 'Invalid code.' };
  const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length < 4) return { ok: false, err: 'Code too short.' };
  const hdrs = restHeaders(currentToken(), { 'Content-Type': 'application/json' });

  const res = await fetch(`${SB_URL}/rest/v1/projects?select=id,name,join_enabled,join_code&join_code=eq.${encodeURIComponent(cleanCode)}`, { headers: hdrs }).catch(() => null);
  if (!res?.ok) return { ok: false, err: 'Connection error.' };
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return { ok: false, err: 'Project not found. Check the code and try again.' };
  const proj = rows[0];
  if (!proj.join_enabled) return { ok: false, err: 'Joining is disabled for this project.' };

  const jr = await fetch(`${SB_URL}/rest/v1/project_members`, {
    method: 'POST',
    headers: { ...hdrs, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ project_id: proj.id, user_id: userId, role: 'member' }),
  }).catch(() => null);
  if (!jr) return { ok: false, err: 'Connection error.' };
  if (jr.status === 409) return { ok: false, err: 'You are already a member of this project.' };
  if (!jr.ok) { const e = await jr.json().catch(() => ({})); return { ok: false, err: e.message || 'Failed to join.' }; }
  return { ok: true, projectName: proj.name };
}

export async function removeMember(memberId) {
  const res = await fetch(`${SB_URL}/rest/v1/project_members?id=eq.${encodeURIComponent(memberId)}`, {
    method: 'DELETE', headers: restHeaders(currentToken()),
  }).catch(() => null);
  return res?.ok ? { ok: true } : { ok: false, err: 'Failed to remove.' };
}

export async function toggleJoin(projectId, enabled) {
  const res = await fetch(`${SB_URL}/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: restHeaders(currentToken(), { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
    body: JSON.stringify({ join_enabled: enabled }),
  }).catch(() => null);
  return res?.ok ? { ok: true } : { ok: false };
}

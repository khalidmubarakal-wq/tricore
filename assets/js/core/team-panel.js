/**
 * Team governance panel, injected around the React bundle:
 *   - "Join project" button + modal on the portfolio page,
 *   - a "Team" tab on project pages: RACI matrix (One-A rule, drag a member
 *     header to transfer their assignments), members, workload heatmap, audit log,
 *   - a join screen for team members who have no project yet.
 *
 * RACI data and the audit log live on the project in the local cache
 * (`_raci`, `_raci_audit`). Styles: assets/css/team-panel.css.
 */
import { readCachedState, writeCachedState } from './config.js';
import { escapeHtml as h, jsArg, toast as tcToast, nameHue, initials } from './dom.js';
import { removeMember, toggleJoin } from './team-api.js';

/* ── DATA HELPERS ── */
function tcGetState() {
  const s = window._tcSession; if (!s) return null;
  return readCachedState(s.userId);
}
/** Read-modify-write the signed-in user's cached state (skipped if `mutate` returns false). */
function updateCachedState(mutate) {
  const s = window._tcSession; if (!s) return;
  try {
    const state = readCachedState(s.userId);
    if (state && mutate(state) !== false) writeCachedState(s.userId, state);
  } catch (e) {}
}
function tcGetCurrentProject(bar) {
  const state = tcGetState(); if (!state) return null;
  const h1El = bar?.closest('[data-project-id]')?.querySelector('h1') || document.querySelector('main h1');
  const h1Text = h1El?.textContent?.trim();
  if (h1Text) { const p = state?.projects?.find(p => p.name===h1Text || p.code===h1Text); if(p) return {proj:p, state}; }
  if (state?.projects?.length === 1) return {proj: state.projects[0], state};
  return null;
}

/* ── RACI STATE ── */
let tcRaciData = {};   // key: `${wbsId}_${memberId}` = R|A|C|I|''
let tcDragMember = null;
let tcAuditLog = [];

function tcGetRaciKey(wbsId, memberId) { return wbsId + '_' + memberId; }
function tcGetRaci(wbsId, memberId) { return tcRaciData[tcGetRaciKey(wbsId, memberId)] || ''; }

/* ── MOUNT TEAM UI ── */
function mountTeamUI() {
  const obs = new MutationObserver(() => {
    // Add "Join Project" button to portfolio header
    const newBtn = document.querySelector('button.btn-p');
    if (newBtn && !document.getElementById('tc-join-btn')) {
      const btn = document.createElement('button');
      btn.id = 'tc-join-btn'; btn.className = 'btn-g';
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> انضمام لمشروع';
      btn.onclick = showJoinModal;
      newBtn.parentNode.insertBefore(btn, newBtn);
    }
    addTeamTab();
  });
  obs.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
}

/* ── JOIN MODAL ── */
function showJoinModal() {
  if (document.getElementById('tc-join-modal')) return;
  const ov = document.createElement('div');
  ov.id = 'tc-join-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(5px);';
  ov.innerHTML = `
    <div style="background:#fff;border-radius:18px;padding:28px;width:380px;box-shadow:0 24px 64px rgba(0,0,0,.2);direction:rtl;font-family:'IBM Plex Sans Arabic','Noto Sans Arabic',system-ui,sans-serif;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#1e3a5f,#0ea5e9);border-radius:10px;display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        </div>
        <div>
          <div style="font-size:15px;font-weight:700;color:#0F172A;">الانضمام إلى مشروع</div>
          <div style="font-size:11.5px;color:#94A3B8;margin-top:1px;">أدخل الرمز الذي أرسله مدير المشروع</div>
        </div>
      </div>
      <input id="tc-join-inp" type="text" maxlength="10" placeholder="مثال: GIP26A1"
        style="width:100%;padding:13px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:18px;font-family:'DM Mono',monospace;letter-spacing:.14em;text-transform:uppercase;outline:none;box-sizing:border-box;text-align:center;direction:ltr;margin-bottom:8px;transition:border-color .15s;"
        oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'');this.style.borderColor='#E2E8F0';"
        onfocus="this.style.borderColor='#0ea5e9';this.style.boxShadow='0 0 0 3px #E0F2FE';"
        onblur="this.style.boxShadow='none';"
        onkeydown="if(event.key==='Enter')document.getElementById('tc-join-ok').click()" />
      <div id="tc-join-err" style="color:#DC2626;font-size:12px;min-height:18px;margin-bottom:12px;text-align:right;padding-right:4px;"></div>
      <div style="display:flex;gap:10px;">
        <button id="tc-join-ok" onclick="tcDoJoin()"
          style="flex:1;background:linear-gradient(135deg,#1e3a5f,#0ea5e9);color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">
          انضمام ←
        </button>
        <button onclick="document.getElementById('tc-join-modal').remove()"
          style="padding:12px 18px;background:#F1F5F9;border:none;border-radius:10px;color:#475569;font-size:13px;cursor:pointer;font-family:inherit;">إلغاء</button>
      </div>
    </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('tc-join-inp')?.focus(), 60);
}

async function tcDoJoin() {
  const code = document.getElementById('tc-join-inp')?.value?.trim();
  const btn = document.getElementById('tc-join-ok');
  const err = document.getElementById('tc-join-err');
  if (!code) { err.textContent = 'الرجاء إدخال الرمز.'; return; }
  btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:bspin .7s linear infinite;"></span> جارٍ الانضمام...';
  btn.disabled = true; err.textContent = '';
  const r = await (window.Zl?.joinProject?.(code) || { ok: false, err: 'غير جاهز.' });
  if (r.ok) {
    document.getElementById('tc-join-modal').remove();
    tcToast('✓ تم الانضمام إلى "' + r.projectName + '" بنجاح!');
  } else { err.textContent = r.err || 'فشل الانضمام. تحقق من الرمز.'; btn.innerHTML = 'انضمام ←'; btn.disabled = false; }
}

/* ── ADD TEAM TAB ── */
function addTeamTab() {
  const existingTab = document.getElementById('tc-team-tab');
  if (existingTab) return;
  const anyProjTab = document.querySelector('button.proj-tab');
  if (!anyProjTab) return;
  const bar = anyProjTab.parentElement; if (!bar) return;
  const tab = document.createElement('button');
  tab.id = 'tc-team-tab'; tab.className = 'proj-tab';
  tab.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;margin-left:5px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> الفريق';
  tab.onclick = () => window.tcShowTeam(bar, tab); // via window: team-upgrade-v4.js wraps it
  bar.appendChild(tab);
}

/* ══════════════════════════════════════════════════
   MAIN: tcShowTeam — Full Governance Panel
══════════════════════════════════════════════════ */
function tcShowTeam(bar, tab) {
  // Toggle: if already open, close it
  bar.querySelectorAll('.proj-tab').forEach(t => t.classList.remove('active'));
  const ex = document.getElementById('tc-team-panel');
  if (ex) { ex.remove(); return; }
  tab.classList.add('active');

  const session = window._tcSession; if (!session) return;
  const result = tcGetCurrentProject(bar); if (!result) return;
  const {proj, state} = result;
  const isOwner = session.role === 'pm';
  const members = proj._members || [];
  const wbsItems = (state.wbs || []).filter(w => w.pid === proj.id);
  const wbsWP = wbsItems.filter(w => w.type !== 'summary' && w.type !== 'group');
  const joinCode = proj.join_code || proj.code || '—';
  const joinOn = proj.join_enabled !== false;

  // Init RACI from stored data or defaults
  if (proj._raci) { tcRaciData = {...proj._raci}; }
  else { tcRaciData = {}; }
  if (!tcAuditLog.length) { tcAuditLog = proj._raci_audit || []; }

  // Compute stats
  const raciCoverage = wbsWP.length > 0
    ? Math.round(wbsWP.filter(w => members.some(m => tcGetRaci(w.id, m.user_id||m.id))).length / wbsWP.length * 100)
    : 0;
  const conflicts = members.filter(m => (m.load || 0) >= 8).length;

  /* ── BUILD PANEL ── */
  const panel = document.createElement('div');
  panel.id = 'tc-team-panel';
  panel.className = 'tc-team-panel';
  panel.style.cssText = 'margin-top:6px;';

  panel.innerHTML = `
  <!-- ══ JOIN STRIP ══ -->
  <div class="tc-join-strip">
    <div>
      <div style="font-size:10.5px;color:rgba(255,255,255,.5);font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px;">رمز الانضمام</div>
      <div class="tc-code-box" id="tc-code-display">${h(joinCode)}</div>
      ${isOwner ? `
      <div class="tc-toggle-wrap">
        <button class="tc-toggle ${joinOn?'on':''}" id="tc-join-toggle" onclick="tcToggleJoin(${jsArg(proj.id)})">
          <span class="tc-toggle-thumb"></span>
        </button>
        <span style="color:rgba(255,255,255,.7);font-size:12px;">السماح بالانضمام</span>
      </div>` : ''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <button class="tc-copy-btn" onclick="tcCopyCode(${jsArg(joinCode)})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" style="display:inline;vertical-align:middle;margin-left:4px;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        نسخ الرمز
      </button>
      ${isOwner ? `<button class="tc-copy-btn" onclick="tcRegenCode(${jsArg(proj.id)})">↺ تجديد</button>` : ''}
    </div>
    <div class="tc-kpi-grid" style="margin-right:auto;">
      <div class="tc-kpi-item"><div class="tc-kpi-val">${members.length}</div><div class="tc-kpi-lbl">عضو نشط</div></div>
      <div class="tc-kpi-item"><div class="tc-kpi-val" style="${raciCoverage<100?'color:#FDE68A;':'color:#6EE7B7;'}">${raciCoverage}%</div><div class="tc-kpi-lbl">تغطية RACI</div></div>
      <div class="tc-kpi-item"><div class="tc-kpi-val" style="${conflicts>0?'color:#FCA5A5;':'color:#6EE7B7;'}">${conflicts}</div><div class="tc-kpi-lbl">تضارب</div></div>
    </div>
  </div>

  <!-- ══ MAIN CARD ══ -->
  <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.06);">

    <!-- TABS -->
    <div class="tc-tabs">
      <button class="tc-tab active" onclick="tcSwitchTab('raci',this)">⊞ مصفوفة RACI</button>
      <button class="tc-tab" onclick="tcSwitchTab('members',this)">👥 الأعضاء (${members.length})</button>
      <button class="tc-tab" onclick="tcSwitchTab('heatmap',this)">🔥 خريطة التحميل</button>
      <button class="tc-tab" onclick="tcSwitchTab('audit',this)">📋 السجل</button>
    </div>

    <!-- ── TAB: RACI ── -->
    <div class="tc-tabpanel active" id="tc-tab-raci">
      <div class="tc-1a-alert" id="tc-1a-alert">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span id="tc-1a-msg">لا يمكن تعيين أكثر من مسؤول (A) لنفس المهمة.</span>
        <button onclick="document.getElementById('tc-1a-alert').classList.remove('show')" style="margin-right:auto;background:none;border:none;cursor:pointer;color:#DC2626;font-size:16px;line-height:1;">×</button>
      </div>
      <div class="tc-swap-zone" id="tc-swap-zone">
        🔄 أفلت هنا لنقل كافة صلاحيات هذا العضو
      </div>
      ${wbsWP.length === 0 ? `
        <div style="text-align:center;padding:40px 20px;color:#94A3B8;">
          <div style="font-size:36px;margin-bottom:12px;">📋</div>
          <div style="font-size:13px;font-weight:600;color:#64748B;">أضف حزم WBS أولاً</div>
          <div style="font-size:12px;margin-top:6px;">تظهر المصفوفة تلقائياً بعد إضافة مهام في تبويب WBS</div>
        </div>` : `
      <div class="tc-raci-scroll">
        <table class="tc-raci-tbl" id="tc-raci-tbl"></table>
      </div>
      <div class="tc-legend">
        <span style="font-size:11px;color:#64748B;font-weight:700;">الرموز:</span>
        <span class="tc-leg-badge" style="background:#EFF6FF;color:#1e3a5f;border-color:#BFDBFE;">R — مسؤول التنفيذ</span>
        <span class="tc-leg-badge" style="background:#FEF2F2;color:#7F1D1D;border-color:#FECACA;">A — معتمِد ✦واحد فقط✦</span>
        <span class="tc-leg-badge" style="background:#FEF3C7;color:#B45309;border-color:#FDE68A;">C — يُستشار</span>
        <span class="tc-leg-badge" style="background:#F1F5F9;color:#475569;border-color:#CBD5E1;">I — يُخطَر</span>
        ${isOwner ? '<span style="font-size:10.5px;color:#94A3B8;margin-right:auto;">💡 اسحب رأس العمود لنقل كافة صلاحيات عضو</span>' : ''}
      </div>`}
    </div>

    <!-- ── TAB: MEMBERS ── -->
    <div class="tc-tabpanel" id="tc-tab-members">
      ${isOwner ? `
      <div style="padding:10px 16px;border-bottom:1px solid #F1F5F9;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11.5px;color:#64748B;">${members.length} عضو مُسجَّل</span>
        <button class="btn-p" style="padding:6px 14px;font-size:12px;" onclick="tcShowJoinModal()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" style="display:inline;vertical-align:middle;margin-left:4px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          دعوة عضو
        </button>
      </div>` : ''}
      <div id="tc-members-list"></div>
    </div>

    <!-- ── TAB: HEATMAP ── -->
    <div class="tc-tabpanel" id="tc-tab-heatmap">
      <div style="padding:12px 16px 6px;">
        <div style="font-size:12px;color:#64748B;line-height:1.6;">
          يوضّح الجدول عدد المهام المُسنَدة لكل عضو في مشاريع المحفظة. الخلايا الحمراء تشير إلى احتمال <strong>تحميل زائد</strong>.
        </div>
      </div>
      <div style="overflow-x:auto;padding:8px 16px 16px;">
        <div id="tc-heatmap-wrap"></div>
      </div>
    </div>

    <!-- ── TAB: AUDIT ── -->
    <div class="tc-tabpanel" id="tc-tab-audit">
      <div style="padding:8px 16px;background:#F8FAFC;border-bottom:1px solid #F1F5F9;font-size:11px;color:#94A3B8;font-weight:700;letter-spacing:.07em;text-transform:uppercase;">سجل التغييرات</div>
      <div id="tc-audit-list"></div>
    </div>

  </div><!-- /card -->
  `;

  // Insert panel after tab bar's parent container
  const insertTarget = bar.closest('div[style]') || bar.parentElement;
  insertTarget?.appendChild(panel);

  // Render sub-components
  if (wbsWP.length > 0) { tcRenderRaci(wbsItems, members, isOwner); }
  tcRenderMembers(members, isOwner, proj);
  tcRenderHeatmap(members, state.projects || [proj]);
  tcRenderAudit();
}

/* ── SWITCH TAB ── */
function tcSwitchTab(name, btn) {
  const panel = document.getElementById('tc-team-panel'); if(!panel) return;
  panel.querySelectorAll('.tc-tab').forEach(b => b.classList.remove('active'));
  panel.querySelectorAll('.tc-tabpanel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const tp = document.getElementById('tc-tab-' + name); if(tp) tp.classList.add('active');
}

/* ── RENDER RACI MATRIX ── */
function tcRenderRaci(wbsItems, members, isOwner) {
  const tbl = document.getElementById('tc-raci-tbl'); if(!tbl) return;

  // THEAD
  let hHtml = '<thead><tr><th>المهمة / الحزمة</th>';
  members.forEach(m => {
    const mid = m.user_id || m.id;
    const totalLoad = (m.load || 0);
    const overloaded = totalLoad >= 8;
    const hue = nameHue(m.name||mid);
    hHtml += `<th class="tc-mh">
      <div class="tc-mhdr" draggable="${isOwner}"
           ondragstart="tcDragStart(${jsArg(mid)},this)"
           ondragover="tcDragOver(event,this)"
           ondrop="tcDoDrop(${jsArg(mid)},this)"
           ondragend="tcDragEnd()">
        <div class="tc-av" style="background:hsl(${hue},55%,88%);color:hsl(${hue},55%,28%);border:1.5px solid hsl(${hue},55%,76%);">
          ${h(initials(m.name||mid))}
          ${overloaded ? '<div class="conflict-pip"></div>' : ''}
        </div>
        <div class="tc-mname">${h((m.name||mid).split(' ')[0])}</div>
      </div>
    </th>`;
  });
  hHtml += '</tr></thead>';

  // Group WBS by parent for display
  const allWbs = [...wbsItems].sort((a,b)=>(a.code||'').localeCompare(b.code||''));

  let bHtml = '<tbody>';
  allWbs.forEach(item => {
    const isSummary = item.type === 'summary' || item.type === 'group';
    if (isSummary) {
      bHtml += `<tr class="tc-summary">
        <td colspan="${members.length+1}" style="padding:7px 16px;">
          <span style="color:#94A3B8;font-size:10px;font-family:'DM Mono',monospace;margin-left:8px;">${h(item.code)}</span>
          <strong>${h(item.name)}</strong>
        </td>
      </tr>`;
      return;
    }
    bHtml += `<tr>
      <td>
        <span style="color:#94A3B8;font-size:10px;font-family:'DM Mono',monospace;margin-left:8px;">${h(item.code)}</span>
        <span style="font-size:12.5px;color:#334155;">${h(item.name)}</span>
      </td>`;
    members.forEach(m => {
      const mid = m.user_id || m.id;
      const val = tcGetRaci(item.id, mid);
      bHtml += `<td style="text-align:center;">
        <select class="tc-rsel v-${val||'x'}"
          ${!isOwner ? 'disabled style="opacity:.6;cursor:default;"' : ''}
          onchange="tcSetRaci(${jsArg(item.id)},${jsArg(mid)},this)"
          title="${h(m.name||mid)}">
          <option value="">—</option>
          <option value="R" ${val==='R'?'selected':''}>R</option>
          <option value="A" ${val==='A'?'selected':''}>A</option>
          <option value="C" ${val==='C'?'selected':''}>C</option>
          <option value="I" ${val==='I'?'selected':''}>I</option>
        </select>
      </td>`;
    });
    bHtml += '</tr>';
  });
  bHtml += '</tbody>';
  tbl.innerHTML = hHtml + bHtml;
}

function tcSetRaci(wbsId, memberId, sel) {
  const newVal = sel.value;
  const oldVal = tcGetRaci(wbsId, memberId);
  // One-A rule
  if (newVal === 'A') {
    const result = tcGetCurrentProject(document.getElementById('tc-team-tab')?.parentElement);
    const members = result?.proj?._members || [];
    const conflictMember = members.find(m => {
      const mid = m.user_id || m.id;
      return mid !== memberId && tcGetRaci(wbsId, mid) === 'A';
    });
    if (conflictMember) {
      sel.value = oldVal; sel.className = 'tc-rsel v-' + (oldVal||'x');
      const alert = document.getElementById('tc-1a-alert');
      document.getElementById('tc-1a-msg').textContent = `قاعدة One-A: "${conflictMember.name||conflictMember.user_id}" مُعيَّن بالفعل كـ (A) لهذه المهمة.`;
      alert.classList.add('show');
      setTimeout(() => alert.classList.remove('show'), 5000);
      return;
    }
  }
  tcRaciData[tcGetRaciKey(wbsId, memberId)] = newVal;
  sel.className = 'tc-rsel v-' + (newVal||'x');
  // Save to project
  tcSaveRaci();
  // Audit
  const state = tcGetState();
  const wbs = state?.wbs?.find(w=>w.id===wbsId);
  tcAuditLog.unshift({ t: new Date().toLocaleString('ar-SA'), by: window._tcSession?.name||'أنت', msg: `${wbs?.name||wbsId}: (${oldVal||'—'}) → (${newVal||'—'})`, color: '#0ea5e9' });
  if (tcAuditLog.length > 50) tcAuditLog.pop();
  tcRenderAudit();
  tcToast('✓ تم تحديث RACI');
}

function tcSaveRaci() {
  updateCachedState(state => {
    const result = tcGetCurrentProject(null);
    if (!result) return false;
    const proj = state.projects.find(p => p.id === result.proj.id);
    if (proj) { proj._raci = {...tcRaciData}; proj._raci_audit = tcAuditLog.slice(0,20); }
  });
}

/* ── DRAG & DROP QUICK SWAP ── */
function tcDragStart(memberId, el) {
  tcDragMember = memberId;
  el.style.opacity = '.4';
  const sz = document.getElementById('tc-swap-zone'); if(sz) sz.classList.add('visible');
}
function tcDragOver(e, el) {
  e.preventDefault(); el.classList.add('drag-over');
}
function tcDoDrop(targetId, el) {
  el.classList.remove('drag-over');
  if (!tcDragMember || tcDragMember === targetId) { tcDragEnd(); return; }
  const src = tcDragMember, tgt = targetId;
  const state = tcGetState();
  const wbsItems = state?.wbs?.filter(w => w.pid === tcGetCurrentProject(null)?.proj?.id) || [];
  wbsItems.forEach(item => {
    if (item.type==='summary'||item.type==='group') return;
    const srcVal = tcGetRaci(item.id, src);
    tcRaciData[tcGetRaciKey(item.id, tgt)] = srcVal;
    tcRaciData[tcGetRaciKey(item.id, src)] = '';
  });
  tcSaveRaci();
  tcAuditLog.unshift({ t: new Date().toLocaleString('ar-SA'), by: window._tcSession?.name||'أنت', msg: `Quick Swap: نُقلت كافة صلاحيات العضو ${src.slice(0,8)} إلى ${tgt.slice(0,8)}`, color: '#7C3AED' });
  tcRenderAudit();
  tcDragEnd();
  // Re-render RACI
  const result = tcGetCurrentProject(null);
  if (result) tcRenderRaci(state?.wbs?.filter(w=>w.pid===result.proj.id)||[], result.proj._members||[], true);
  tcToast('🔄 تم نقل كافة الصلاحيات بنجاح');
}
function tcDragEnd() {
  tcDragMember = null;
  document.querySelectorAll('.tc-mhdr').forEach(el => { el.style.opacity=''; el.classList.remove('drag-over'); });
  const sz = document.getElementById('tc-swap-zone'); if(sz) sz.classList.remove('visible');
}

/* ── RENDER MEMBERS ── */
function tcRenderMembers(members, isOwner, proj) {
  const container = document.getElementById('tc-members-list'); if(!container) return;
  if (!members.length) {
    container.innerHTML = '<div style="text-align:center;padding:36px 20px;color:#94A3B8;font-size:13px;">لا يوجد أعضاء بعد — شارك رمز الانضمام لدعوة الفريق.</div>';
    return;
  }
  const ROLES = { pm:'مدير مشروع', analyst:'محلل PMO', team_member:'عضو فريق', executive:'تنفيذي' };
  const ROLE_COLORS = { pm:'#1e3a5f', analyst:'#0D9488', team_member:'#059669', executive:'#7C3AED' };
  let html = '';
  members.forEach(m => {
    const mid = m.user_id || m.id;
    const hue = nameHue(m.name||mid);
    const totalLoad = m.load || 0;
    const loadPct = Math.min((totalLoad / 12) * 100, 100);
    const loadColor = loadPct > 80 ? '#DC2626' : loadPct > 60 ? '#D97706' : '#059669';
    const roleLbl = ROLES[m.role] || m.role || '';
    const roleColor = ROLE_COLORS[m.role] || '#64748B';
    const rAsgn = Object.entries(tcRaciData).filter(([k,v]) => k.includes('_'+mid) && v==='R').length;
    const aAsgn = Object.entries(tcRaciData).filter(([k,v]) => k.includes('_'+mid) && v==='A').length;
    html += `
    <div class="tc-mrow">
      <div class="tc-av" style="width:38px;height:38px;font-size:13px;background:hsl(${hue},55%,88%);color:hsl(${hue},55%,28%);border:1.5px solid hsl(${hue},55%,76%);">
        ${h(initials(m.name||mid))}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-size:13px;font-weight:600;color:#0F172A;">${h(m.name||mid.slice(0,12))}</div>
          <span style="background:${roleColor}18;color:${roleColor};border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;">${h(roleLbl)}</span>
          ${totalLoad >= 8 ? '<span style="background:#FEE2E2;color:#DC2626;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;">⚠ حمل عالٍ</span>' : ''}
        </div>
        <div style="font-size:11px;color:#94A3B8;margin-top:2px;display:flex;gap:10px;">
          <span>R: <strong style="color:#1e3a5f;">${rAsgn}</strong></span>
          <span>A: <strong style="color:#7F1D1D;">${aAsgn}</strong></span>
          <span>${h(m.email||m.user_id||'')}</span>
        </div>
        <div style="margin-top:5px;">
          <div style="display:flex;justify-content:space-between;font-size:9.5px;color:#94A3B8;margin-bottom:2px;">
            <span>حمل المحفظة</span>
            <span style="font-family:'DM Mono',monospace;">${h(totalLoad)}/12</span>
          </div>
          <div class="tc-cap-track">
            <div class="tc-cap-fill" style="width:${loadPct}%;background:${loadColor};"></div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        ${isOwner ? `<button class="btn-danger" style="padding:5px 10px;font-size:11px;" onclick="tcRemoveMember(${jsArg(m.id||mid)})">إزالة</button>` : ''}
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

/* ── RENDER HEATMAP ── */
function tcRenderHeatmap(members, projects) {
  const wrap = document.getElementById('tc-heatmap-wrap'); if(!wrap) return;
  if (!members.length) { wrap.innerHTML = '<div style="color:#94A3B8;font-size:12.5px;padding:20px;">لا توجد بيانات أعضاء لعرضها.</div>'; return; }
  const projs = projects.slice(0, 5); // max 5 projects
  let html = '<table class="tc-hm-tbl"><thead><tr><th>العضو</th>';
  projs.forEach(p => { html += `<th class="tc-pcol">${h((p.name||p.code||'').split(' ').slice(0,2).join(' '))}</th>`; });
  html += '<th class="tc-pcol">الإجمالي</th><th class="tc-pcol">الحالة</th></tr></thead><tbody>';
  members.forEach(m => {
    const mid = m.user_id || m.id;
    const hue = nameHue(m.name||mid);
    // Simulate loads across projects (use m.load array if available, else estimate)
    const loads = projs.map((p,i) => {
      if (Array.isArray(m.load)) return m.load[i] || 0;
      return i === 0 ? (m.load || 0) : Math.floor(Math.random()*4);
    });
    const total = loads.reduce((a,b)=>a+b,0);
    const statusTxt = total>=10 ? ['احتراق وظيفي','#DC2626'] : total>=7 ? ['تحميل عالٍ','#D97706'] : ['متوازن','#059669'];
    html += `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:26px;height:26px;border-radius:50%;background:hsl(${hue},55%,88%);color:hsl(${hue},55%,28%);display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;flex-shrink:0;">
            ${h(initials(m.name||mid))}
          </div>
          <span style="font-size:12px;font-weight:600;">${h((m.name||mid).split(' ').slice(0,2).join(' '))}</span>
        </div>
      </td>`;
    loads.forEach(l => {
      const cls = l===0?'hm0':l===1?'hm1':l===2?'hm2':l===3?'hm3':l===4?'hm4':'hm5';
      html += `<td><div class="tc-hmcell ${cls}">${h(l)}</div></td>`;
    });
    const tcls = total>=10?'hm5':total>=7?'hm4':total>=4?'hm2':'hm1';
    html += `<td><div class="tc-hmcell ${tcls}" style="font-size:13px;">${h(total)}</div></td>
      <td><span style="background:${statusTxt[1]}18;color:${statusTxt[1]};border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">${statusTxt[0]}</span></td>
    </tr>`;
  });
  html += '</tbody></table>';
  html += `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;align-items:center;">
    <span style="font-size:10.5px;color:#64748B;font-weight:700;">مفتاح الألوان:</span>
    ${[['hm0','0'],['hm1','1'],['hm2','2'],['hm3','3'],['hm4','4'],['hm5','5+⚠']].map(([cls,lbl])=>
      `<div style="display:flex;align-items:center;gap:4px;"><div class="tc-hmcell ${cls}" style="width:22px;height:22px;padding:0;display:flex;align-items:center;justify-content:center;font-size:10px;">${lbl}</div></div>`
    ).join('')}
  </div>`;
  wrap.innerHTML = html;
}

/* ── RENDER AUDIT ── */
function tcRenderAudit() {
  const container = document.getElementById('tc-audit-list'); if(!container) return;
  if (!tcAuditLog.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:#94A3B8;font-size:12.5px;">لا توجد تغييرات مسجَّلة بعد.</div>';
    return;
  }
  container.innerHTML = tcAuditLog.map(e => `
    <div class="tc-audit-row">
      <div class="tc-audit-dot" style="background:${h(e.color||'#94A3B8')};"></div>
      <div class="tc-audit-time">${h(e.t)}</div>
      <div style="flex:1;font-size:11.5px;color:#475569;">
        <span style="color:${h(e.color||'#0ea5e9')};font-weight:600;">${h(e.by)}: </span>${h(e.msg)}
      </div>
    </div>`).join('');
}

/* ── JOIN/REMOVE HELPERS ── */
function tcCopyCode(code) {
  navigator.clipboard.writeText(code).then(() => tcToast('📋 تم نسخ الرمز: ' + code))
    .catch(() => tcToast('الرمز: ' + code));
}
function tcToggleJoin(projId) {
  const btn = document.getElementById('tc-join-toggle'); if(!btn) return;
  const isOn = btn.classList.toggle('on');
  if (!window._tcSession) return;
  updateCachedState(state => {
    const proj = state.projects?.find(p=>p.id===projId);
    if (!proj) return false;
    proj.join_enabled = isOn;
  });
  tcToast(isOn ? '✓ تم تفعيل الانضمام' : '⛔ تم إيقاف الانضمام');
  // Persist to the DB too (previously only the local cache changed).
  toggleJoin(projId, isOn).then(r => { if (!r.ok) tcToast('تعذّر حفظ الإعداد على الخادم.', '#DC2626'); });
}
function tcRegenCode(projId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from({length:7},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
  const el = document.getElementById('tc-code-display'); if(el) el.textContent = code;
  if (!window._tcSession) return;
  updateCachedState(state => {
    const proj = state.projects?.find(p=>p.id===projId);
    if (!proj) return false;
    proj.join_code = code;
  });
  tcToast('🔄 رمز جديد: ' + code);
}
async function tcRemoveMember(id) {
  if (!confirm('هل تريد إزالة هذا العضو وكافة تعييناته؟')) return;
  const r = await removeMember(id);
  if (r.ok) {
    tcToast('✓ تم إزالة العضو');
    document.getElementById('tc-team-panel')?.remove();
    document.getElementById('tc-team-tab')?.classList.remove('active');
  } else { tcToast('تعذّرت الإزالة. حاول مجدداً.', '#DC2626'); }
}

/* ── TEAM MEMBER WELCOME SCREEN ── */
function checkTeamMemberWelcome() {
  const s = window._tcSession;
  if (!s || s.role !== 'team_member') return;
  let state;
  state = readCachedState(s.userId);
  if (state?.projects?.length > 0 || document.getElementById('tc-tm-welcome')) return;
  const main = document.querySelector('main.app-content'); if (!main) return;
  const w = document.createElement('div');
  w.id = 'tc-tm-welcome';
  w.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:40px;text-align:center;font-family:"IBM Plex Sans Arabic","Noto Sans Arabic",system-ui,sans-serif;';
  w.innerHTML = `
    <div style="width:72px;height:72px;background:linear-gradient(135deg,#1e3a5f,#0ea5e9);border-radius:20px;display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 8px 24px rgba(30,58,95,.3);">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    </div>
    <h1 style="font-size:20px;font-weight:800;color:#0F172A;margin:0 0 8px;">مرحباً بك في TriCore PMO</h1>
    <p style="color:#64748B;font-size:13px;line-height:1.7;max-width:360px;margin:0 0 24px;">
      أنت مُسجَّل بصفتك <strong style="color:#1e3a5f;">عضو فريق</strong>.<br/>
      أدخل الرمز الذي أرسله لك مدير المشروع للانضمام.
    </p>
    <div style="background:#fff;border:1.5px solid #E2E8F0;border-radius:16px;padding:24px;width:100%;max-width:340px;box-shadow:0 4px 20px rgba(0,0,0,.08);direction:rtl;">
      <input id="tc-tm-code" type="text" maxlength="10" placeholder="أدخل رمز المشروع"
        style="width:100%;padding:13px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:17px;font-family:'DM Mono',monospace;letter-spacing:.14em;text-transform:uppercase;outline:none;box-sizing:border-box;text-align:center;direction:ltr;margin-bottom:10px;transition:border-color .15s;"
        oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"
        onfocus="this.style.borderColor='#0ea5e9';this.style.boxShadow='0 0 0 3px #E0F2FE';"
        onblur="this.style.boxShadow='none';"
        onkeydown="if(event.key==='Enter')document.getElementById('tc-tm-join').click()" />
      <div id="tc-tm-err" style="color:#DC2626;font-size:12px;min-height:16px;margin-bottom:8px;text-align:right;padding-right:4px;"></div>
      <button id="tc-tm-join" onclick="tcTmDoJoin()"
        style="width:100%;background:linear-gradient(135deg,#1e3a5f,#0ea5e9);color:#fff;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .15s;">
        انضمام للمشروع ←
      </button>
    </div>`;
  main.innerHTML = ''; main.appendChild(w);
  setTimeout(() => document.getElementById('tc-tm-code')?.focus(), 100);
}
async function tcTmDoJoin() {
  const code = document.getElementById('tc-tm-code')?.value?.trim();
  const btn = document.getElementById('tc-tm-join');
  const err = document.getElementById('tc-tm-err');
  if (!code) { err.textContent = 'الرجاء إدخال الرمز.'; return; }
  btn.textContent = 'جارٍ الانضمام...'; btn.disabled = true; err.textContent = '';
  const r = await (window.Zl?.joinProject?.(code) || { ok: false, err: 'غير جاهز.' });
  if (r.ok) { document.getElementById('tc-tm-welcome')?.remove(); window.location.reload(); }
  else { err.textContent = r.err || 'فشل الانضمام. تحقق من الرمز.'; btn.textContent = 'انضمام للمشروع ←'; btn.disabled = false; }
}

/**
 * Expose the handlers used by inline `on*` attributes (and by
 * team-upgrade-v4.js), then mount once the app shell has rendered.
 */
export function installTeamPanel() {
  Object.assign(window, {
    tcShowTeam, tcShowJoinModal: showJoinModal, tcDoJoin, tcSwitchTab, tcSetRaci,
    tcDragStart, tcDragOver, tcDoDrop, tcDragEnd,
    tcCopyCode, tcToggleJoin, tcRegenCode, tcRemoveMember, tcTmDoJoin,
    // Legacy aliases.
    _tcToggleJoin: tcToggleJoin, _tcDoRemove: tcRemoveMember,
  });
  setTimeout(() => { mountTeamUI(); checkTeamMemberWelcome(); }, 1000);
}

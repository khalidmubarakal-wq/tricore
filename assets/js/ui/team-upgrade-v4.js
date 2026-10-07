/**
 * Team section upgrade v4 — layered on top of core/team-panel.js:
 *   - Team tab is exclusive (hides the other project tab panels),
 *   - softer EVM / project summary cards.
 *
 * NOTE: the coloured RACI badges and per-member popups (sections 2–3) hook
 * `window.tcRenderRaci`, `tcGetState`, `tcGetRaci` and `tcGetCurrentProject`,
 * which core/team-panel.js keeps module-private. Those upgrades are therefore
 * inactive until the panel exposes them; escape the user data they render
 * (see core/dom.js) before enabling them.
 */
/* global tcSetRaci, tcGetState, tcGetRaci, tcGetCurrentProject -- globals from core/team-panel.js (guarded by window.* checks) */
(function tcTeamUpgrade() {
  'use strict';

  /* ──────────────────────────────────────────────────────
     2. RACI — Colored badges instead of plain R/A/C/I text
  ────────────────────────────────────────────────────── */
  const RACI_BADGE_CFG = {
    R: { bg:'#fee2e2', color:'#dc2626', border:'#fecaca', label:'R', title:'مسؤول (Responsible)' },
    A: { bg:'#fef3c7', color:'#b45309', border:'#fde68a', label:'A', title:'محاسب (Accountable)' },
    C: { bg:'#dbeafe', color:'#1d4ed8', border:'#bfdbfe', label:'C', title:'مستشار (Consulted)' },
    I: { bg:'#f1f5f9', color:'#64748b', border:'#cbd5e1', label:'I', title:'مُبلَّغ (Informed)' },
    '': { bg:'transparent', color:'#cbd5e1', border:'#f1f5f9', label:'+', title:'تعيين دور' }
  };

  let _activeBadgeMenu = null;

  function closeBadgeMenu() {
    if (_activeBadgeMenu) { _activeBadgeMenu.remove(); _activeBadgeMenu = null; }
  }

  function openBadgeMenu(badge, wbsId, memberId, currentVal, isOwner) {
    if (!isOwner) return;
    closeBadgeMenu();
    const menu = document.createElement('div');
    menu.className = 'tc-badge-menu';
    const options = [
      { v:'R', bg:'#fee2e2', dot:'#dc2626', label:'R — مسؤول' },
      { v:'A', bg:'#fef3c7', dot:'#b45309', label:'A — محاسب' },
      { v:'C', bg:'#dbeafe', dot:'#1d4ed8', label:'C — مستشار' },
      { v:'I', bg:'#f1f5f9', dot:'#64748b', label:'I — مُبلَّغ' },
      { v:'',  bg:'#f8fafc', dot:'#cbd5e1', label:'— إزالة' }
    ];
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'tc-badge-menu-item';
      btn.innerHTML = `<span class="tc-badge-dot" style="background:${opt.dot}"></span>${opt.label}`;
      btn.onclick = (e) => {
        e.stopPropagation();
        closeBadgeMenu();
        // Update via existing tcSetRaci
        const fakeSelect = { value: opt.v, className: '' };
        if (window.tcSetRaci) {
          tcSetRaci(wbsId, memberId, fakeSelect);
        }
        // Re-render badge
        const cfg = RACI_BADGE_CFG[opt.v] || RACI_BADGE_CFG[''];
        badge.className = `tc-raci-badge rb-${opt.v||'x'}`;
        badge.textContent = cfg.label;
        badge.title = cfg.title;
        badge.dataset.val = opt.v;
      };
      menu.appendChild(btn);
    });
    badge.style.position = 'relative';
    badge.appendChild(menu);
    _activeBadgeMenu = menu;
    e => e.stopPropagation();
    setTimeout(() => {
      document.addEventListener('click', closeBadgeMenu, { once: true });
    }, 10);
  }

  /* Override tcRenderRaci to use colored badges */
  function upgradeRaciRender() {
    if (!window.tcRenderRaci || window.tcRenderRaci.__tcV4) return; // absent, or already wrapped
    const originalRender = window.tcRenderRaci;

    window.tcRenderRaci = function(wbsItems, members, isOwner) {
      // Call original first
      originalRender(wbsItems, members, isOwner);

      // Get EVM state for performance calculation
      const state = window.tcGetState ? tcGetState() : null;

      // Upgrade member headers with heatmap + click handler
      const tbl = document.getElementById('tc-raci-tbl');
      if (!tbl) return;

      // Compute workload: number of R assignments per member
      const memberLoads = {};
      members.forEach(m => {
        const mid = m.user_id || m.id;
        const wbsWP = wbsItems.filter(w => w.type !== 'summary');
        let rCount = 0;
        wbsWP.forEach(item => {
          const val = window.tcGetRaci ? tcGetRaci(item.id, mid) : '';
          if (val === 'R') rCount++;
        });
        memberLoads[mid] = rCount;
      });
      const maxLoad = Math.max(1, ...Object.values(memberLoads));

      // Upgrade member header cells with heatmap bars + click
      const headers = tbl.querySelectorAll('thead th.tc-mh');
      headers.forEach((th, idx) => {
        const m = members[idx];
        if (!m) return;
        const mid = m.user_id || m.id;
        const load = memberLoads[mid] || 0;
        const pct = Math.round((load / maxLoad) * 100);
        const heatColor = load === 0 ? '#e2e8f0' : load <= 2 ? '#93c5fd' : load <= 4 ? '#fcd34d' : '#fca5a5';

        // Add heatmap bar
        const mhdr = th.querySelector('.tc-mhdr');
        if (mhdr && !mhdr.querySelector('.tc-load-bar')) {
          const bar = document.createElement('div');
          bar.className = 'tc-load-bar';
          bar.innerHTML = `<div class="tc-load-fill" style="width:${pct}%;background:${heatColor};"></div>`;
          mhdr.appendChild(bar);

          // Add load count badge
          const loadLbl = document.createElement('div');
          loadLbl.style.cssText = `font-size:9px;font-weight:700;color:${load > 4 ? '#dc2626' : '#64748b'};margin-top:1px;`;
          loadLbl.textContent = load > 0 ? `${load} R` : '';
          mhdr.appendChild(loadLbl);
        }

        // Add click handler to show member popup
        th.style.cursor = 'pointer';
        th.title = `انقر لعرض مهام ${m.name || mid}`;
        th.onclick = (e) => {
          e.stopPropagation();
          showMemberPopup(m, mid, wbsItems, members, memberLoads[mid], state, e);
        };
      });

      // Replace selects with colored badges in tbody
      const selects = tbl.querySelectorAll('.tc-rsel');
      selects.forEach(sel => {
        const val = sel.value;
        const cfg = RACI_BADGE_CFG[val] || RACI_BADGE_CFG[''];

        // Extract IDs from onchange attr
        const onchg = sel.getAttribute('onchange') || '';
        const idMatch = onchg.match(/tcSetRaci\('([^']+)','([^']+)'/);
        if (!idMatch) return;
        const [, wbsId, memberId] = idMatch;

        const badge = document.createElement('span');
        badge.className = `tc-raci-badge rb-${val||'x'}`;
        badge.textContent = cfg.label;
        badge.title = cfg.title;
        badge.dataset.val = val;
        badge.dataset.wbsId = wbsId;
        badge.dataset.memberId = memberId;

        if (isOwner) {
          badge.onclick = (e) => {
            e.stopPropagation();
            openBadgeMenu(badge, wbsId, memberId, val, isOwner);
          };
        }

        sel.parentNode.replaceChild(badge, sel);
      });
    };
    window.tcRenderRaci.__tcV4 = true;
  }

  /* ──────────────────────────────────────────────────────
     3. MEMBER POPUP — WBS tasks + Individual EVM
  ────────────────────────────────────────────────────── */
  function showMemberPopup(member, memberId, wbsItems, allMembers, loadCount, state, evt) {
    // Remove existing
    const old = document.querySelector('.tc-member-popup');
    if (old) { old.remove(); return; }

    // Find work packages where member has any RACI
    const wbsWP = wbsItems.filter(w => w.type !== 'summary');
    const assignedR = wbsWP.filter(w => (window.tcGetRaci ? tcGetRaci(w.id, memberId) : '') === 'R');
    const assignedA = wbsWP.filter(w => (window.tcGetRaci ? tcGetRaci(w.id, memberId) : '') === 'A');
    const assignedC = wbsWP.filter(w => (window.tcGetRaci ? tcGetRaci(w.id, memberId) : '') === 'C');
    const assignedI = wbsWP.filter(w => (window.tcGetRaci ? tcGetRaci(w.id, memberId) : '') === 'I');
    const allAssigned = [...new Set([...assignedR, ...assignedA, ...assignedC, ...assignedI])];

    // Calculate individual EVM performance (R tasks only)
    let totalEV = 0, totalAC = 0;
    assignedR.forEach(w => {
      const pct = w.pct || 0;
      const bac = w.bac || 0;
      const ac = w.ac || 0;
      totalEV += (pct / 100) * bac;
      totalAC += ac;
    });
    const indvCPI = totalAC > 0 ? totalEV / totalAC : null;
    const cpiColor = indvCPI == null ? '#94a3b8' : indvCPI >= 1 ? '#059669' : indvCPI >= 0.9 ? '#d97706' : '#dc2626';
    const cpiLabel = indvCPI == null ? '—' : indvCPI.toFixed(2);

    // Build avatar
    const hue = [...(member.name || memberId)].reduce((h,c) => h+c.charCodeAt(0), 0) % 360;
    const initials = (member.name || memberId).split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();

    const popup = document.createElement('div');
    popup.className = 'tc-member-popup';

    const RACI_LABELS = {R:'مسؤول',A:'محاسب',C:'مستشار',I:'مُبلَّغ'};
    const RACI_BADGE_COLORS = {R:'#fee2e2;color:#dc2626',A:'#fef3c7;color:#b45309',C:'#dbeafe;color:#1d4ed8',I:'#f1f5f9;color:#64748b'};

    // Build task rows
    let taskRows = '';
    if (allAssigned.length === 0) {
      taskRows = `<div style="text-align:center;padding:24px 16px;color:#94a3b8;font-size:12.5px;">لا توجد مهام مُعيَّنة بعد</div>`;
    } else {
      ['R','A','C','I'].forEach(role => {
        const items = wbsWP.filter(w => (window.tcGetRaci ? tcGetRaci(w.id, memberId) : '') === role);
        if (!items.length) return;
        taskRows += `<div style="padding:6px 18px 2px;font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.06em;text-transform:uppercase;">${RACI_LABELS[role]} (${role})</div>`;
        items.forEach(w => {
          const pct = w.pct || 0;
          const pctColor = pct >= 80 ? '#059669' : pct >= 40 ? '#d97706' : '#64748b';
          taskRows += `
            <div class="tc-mp-row">
              <span class="tc-mp-code">${w.code||''}</span>
              <span class="tc-mp-name">${w.name}</span>
              <span style="background:${RACI_BADGE_COLORS[role].split(';')[0].replace('background:','')};color:${RACI_BADGE_COLORS[role].split('color:')[1]};padding:2px 6px;border-radius:5px;font-size:10px;font-weight:700;">${role}</span>
              <span class="tc-mp-pct" style="color:${pctColor}">${pct}%</span>
            </div>`;
        });
      });
    }

    popup.innerHTML = `
      <div class="tc-mp-header">
        <div style="width:36px;height:36px;border-radius:50%;background:hsl(${hue},55%,88%);color:hsl(${hue},55%,28%);border:1.5px solid hsl(${hue},55%,76%);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${initials}</div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;color:#1e293b;">${member.name || memberId}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:1px;">${loadCount} مهمة مسؤول · ${allAssigned.length} إجمالي</div>
        </div>
        <button class="tc-mp-close" onclick="this.closest('.tc-member-popup').remove()">✕</button>
      </div>
      <div class="tc-mp-kpi">
        <div class="tc-mp-kpi-item">
          <div class="tc-mp-kpi-val" style="color:${cpiColor};">${cpiLabel}</div>
          <div class="tc-mp-kpi-lbl">كفاءة فردية CPI</div>
        </div>
        <div class="tc-mp-kpi-item">
          <div class="tc-mp-kpi-val" style="color:#1d4ed8;">${assignedR.length}</div>
          <div class="tc-mp-kpi-lbl">حزم مسؤول</div>
        </div>
        <div class="tc-mp-kpi-item">
          <div class="tc-mp-kpi-val" style="color:#64748b;">${allAssigned.length}</div>
          <div class="tc-mp-kpi-lbl">إجمالي أدوار</div>
        </div>
      </div>
      <div class="tc-mp-body">${taskRows}</div>
    `;

    document.body.appendChild(popup);

    // Position near cursor
    const x = evt.clientX + 12;
    const y = evt.clientY - 20;
    const maxX = window.innerWidth - 440;
    const maxY = window.innerHeight - 540;
    popup.style.left = `${Math.min(x, maxX)}px`;
    popup.style.top = `${Math.max(10, Math.min(y, maxY))}px`;

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', (e) => {
        if (!popup.contains(e.target)) popup.remove();
      }, { once: true });
    }, 10);
  }

  /* ──────────────────────────────────────────────────────
     4. TEAM TAB — Make exclusive (close Studio & others)
  ────────────────────────────────────────────────────── */
  function patchTeamTabBehavior() {
    if (!window.tcShowTeam || window.tcShowTeam.__tcV4) return; // absent, or already wrapped
    const originalShowTeam = window.tcShowTeam;

    window.tcShowTeam = function(bar, tab) {
      // Deactivate all other proj-tabs
      if (bar) {
        bar.querySelectorAll('.proj-tab').forEach(t => {
          if (t !== tab) t.classList.remove('active');
        });
      }

      // Hide Studio panel if open
      const studioEl = document.querySelector('[data-panel="studio"], #tc-studio-panel');
      if (studioEl) studioEl.style.display = 'none';

      // Hide all other tab panels
      document.querySelectorAll('.tab-inner, [data-tab-panel]').forEach(p => {
        p.style.display = 'none';
      });

      // Call original
      originalShowTeam(bar, tab);
    };
    window.tcShowTeam.__tcV4 = true;
  }

  /* ──────────────────────────────────────────────────────
     5. SOFTER EVM / PROJECT SUMMARY CARDS (DOM injection)
  ────────────────────────────────────────────────────── */
  function softenSummaryCards() {
    const evmDivs = document.querySelectorAll('[style*="EVM SUMMARY"], [style*="evm summary"]');
    evmDivs.forEach(d => {
      d.style.background = '#f8fafc';
      d.style.border = '1px solid #e2e8f0';
      d.style.borderRadius = '12px';
    });
  }

  /* ──────────────────────────────────────────────────────
     6. INIT — Run all upgrades
  ────────────────────────────────────────────────────── */
  function runUpgrades() {
    upgradeRaciRender();
    patchTeamTabBehavior();
    softenSummaryCards();
  }

  // Run after initial render
  setTimeout(runUpgrades, 800);
  setTimeout(runUpgrades, 2000);

  // Watch for the Team panel mounting
  const obs = new MutationObserver(function(mutations) {
    for (const m of mutations) {
      if (m.addedNodes.length) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.id === 'tc-team-panel' || node.classList?.contains('tc-team-panel')) {
            // Team panel just rendered — re-upgrade RACI
            setTimeout(() => {
              upgradeRaciRender();
              if (window.tcRenderRaci) {
                const state = window.tcGetState ? tcGetState() : null;
                const result = window.tcGetCurrentProject ? tcGetCurrentProject(null) : null;
                if (result) {
                  const members = result.proj._members || [];
                  const wbs = state?.wbs?.filter(w => w.pid === result.proj.id) || [];
                  const isOwner = window._tcSession?.role === 'pm';
                  window.tcRenderRaci(wbs, members, isOwner);
                }
              }
            }, 100);
          }
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Also expose globally for manual calls
  window.tcTeamUpgradeV4 = { runUpgrades, showMemberPopup, upgradeRaciRender };

})();

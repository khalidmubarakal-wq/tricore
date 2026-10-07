/**
 * Logo click handlers + auth-screen logo patch.
 *   - Landing logo → scroll to top (or back to the landing page from the app).
 *   - App logo → Portfolio dashboard.
 *   - Auth screen → replace the bundle's SVG logo with the brand image.
 */
(function() {
'use strict';

/* ── Brand logo ─────────────────────────────────────────── */
var LOGO_SRC = window.TC_CONFIG.logoUrl;

/* ──────────────────────────────────────────────────────────
   1. Landing page logo → reload current page
   Called from lpn-logo onclick="tcLogoClick()"
─────────────────────────────────────────────────────────── */
window.tcLogoClick = function() {
  // If the landing page is visible, just scroll to top
  var lp = document.getElementById('tc-lp');
  if (lp && lp.style.display !== 'none') {
    lp.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  // If app is shown, navigate to landing (reload without redirect)
  window.location.replace(window.location.pathname + window.location.search);
};

/* ──────────────────────────────────────────────────────────
   2. App logo (sidebar/topbar) → go to Portfolio Dashboard
   React's state is accessed via the global nav event system.
   We trigger a custom event that the tcUIEnhance script can
   listen for, or simply click the Dashboard nav item.
─────────────────────────────────────────────────────────── */
window.tcAppLogoClick = function() {
  // Strategy 1: click the sidebar "Dashboard" or "Portfolio" nav item
  var navItems = document.querySelectorAll('.nav-item');
  var dashItem = null;
  navItems.forEach(function(el) {
    var txt = (el.textContent || '').toLowerCase().trim();
    if (txt === 'dashboard' || txt === 'لوحة القيادة' || txt === 'portfolio' || txt === 'المحفظة') {
      dashItem = el;
    }
  });
  if (dashItem) {
    dashItem.click();
    return;
  }
  // Strategy 2: find first nav item and click it (usually Dashboard)
  var first = document.querySelector('.nav-item');
  if (first) {
    first.click();
    return;
  }
  // Strategy 3: dispatch a custom event for React to pick up
  window.dispatchEvent(new CustomEvent('tc:nav-dashboard'));
};

/* ──────────────────────────────────────────────────────────
   3. Auth page logo patch — replace the SVG triangle with
   the brand image via MutationObserver
─────────────────────────────────────────────────────────── */
function patchAuthLogo() {
  // The auth page logo is inside a div with inline style
  // containing borderRadius:18, padding:13px 19px
  var authBg = document.querySelector('.auth-bg');
  if (!authBg) return;

  // Find the logo wrapper: contains the SVG triangle (As component)
  var logoWrap = authBg.querySelector('[style*="borderRadius:18"][style*="backdrop"]') ||
                 authBg.querySelector('[style*="border-radius:18"]');
  if (!logoWrap || logoWrap.dataset.tcLogoPatched) return;
  logoWrap.dataset.tcLogoPatched = '1';

  // Replace its content with the new logo image
  if (LOGO_SRC) {
    logoWrap.innerHTML = '';
    var img = document.createElement('img');
    img.src = LOGO_SRC;
    img.alt = 'TriCore';
    img.style.cssText = 'height:68px;width:auto;object-fit:contain;display:block;filter:brightness(0) invert(1);';
    logoWrap.appendChild(img);
  }
}

/* ──────────────────────────────────────────────────────────
   4. MutationObserver: watch for auth screen and patch logo
─────────────────────────────────────────────────────────── */
var authObserver = new MutationObserver(function() {
  patchAuthLogo();
  // Also make sidebar logo clickable after React re-renders
  var sidebarLogo = document.getElementById('tc-sidebar-logo');
  if (sidebarLogo && !sidebarLogo.dataset.clickable) {
    sidebarLogo.dataset.clickable = '1';
    sidebarLogo.onclick = window.tcAppLogoClick;
  }
  // FIX: Disconnect after the auth logo has been patched AND the sidebar logo wired.
  // Continuing to observe after login causes this callback to fire on every React
  // re-render (thousands of times). patchAuthLogo() is a no-op once .auth-bg is gone,
  // but the overhead accumulates and compounds with other observers.
  if (sidebarLogo && sidebarLogo.dataset.clickable) {
    authObserver.disconnect();
  }
});
// Safety timeout: disconnect authObserver after 30s regardless
// (prevents infinite subtree observation if sidebar never appears)
setTimeout(function() { authObserver.disconnect(); }, 30000);

authObserver.observe(document.getElementById('root') || document.body, {
  childList: true, subtree: true
});

// Run once immediately in case auth is already shown
setTimeout(patchAuthLogo, 500);
setTimeout(patchAuthLogo, 1500);

})();

/**
 * Logo click handlers.
 *   - Landing logo → scroll to top (or back to the landing page from the app).
 *   - App logos (sidebar / topbar) → Portfolio dashboard.
 */
(function() {
'use strict';

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
   3. App logos (sidebar header / mobile topbar) are rendered by the
   bundle, so wire their clicks with one delegated listener.
─────────────────────────────────────────────────────────── */
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('.tc-sidebar-logo, .tc-topbar-logo')) {
    window.tcAppLogoClick();
  }
});

})();

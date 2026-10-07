/**
 * App shell enhancements around the React bundle: language toggle in the
 * topbar (re-injected whenever React re-renders it) and the sidebar gradient.
 */
(function tcUIEnhance() {
  'use strict';

  // ── Inject lang button — survives React re-renders & navigation ──
  // React re-renders the topbar on every page change, which removes
  // injected DOM nodes. We use .isConnected to detect removal and
  // re-inject immediately. A 350ms polling interval acts as a safety net.
  function injectLangBtn() {
    var existing = document.getElementById('tc-app-lang-btn');
    // Button exists and is attached to the live DOM — nothing to do
    if (existing && existing.isConnected) return;

    var topbar = document.querySelector('.topbar');
    if (!topbar) return;

    var kids = Array.from(topbar.children);
    var rightDiv = kids.length >= 2 ? kids[kids.length - 1] : null;
    if (!rightDiv) return;

    // Remove any stale/detached remnant
    if (existing) { try { existing.parentNode.removeChild(existing); } catch(e){} }

    topbar.dataset.tcEnhanced = 'true';
    var langBtn = document.createElement('button');
    langBtn.className = 'tc-topbar-lang-btn';
    langBtn.id = 'tc-app-lang-btn';
    langBtn.setAttribute('onclick', "window.tcLangSwitch&&tcLangSwitch.toggle()");
    langBtn.title = 'تغيير اللغة / Change Language';
    langBtn.innerHTML = '🌐 <span id="tc-app-lang-label">EN</span>';
    rightDiv.insertBefore(langBtn, rightDiv.firstChild);

    // Sync label to the saved language. (This used to read a misspelled
    // 'tc-lang' key with an 'en' default, which forced the app into English
    // every time the topbar mounted.)
    if (window.tcLangSwitch && typeof window.tcLangSwitch.set === 'function') {
      try { window.tcLangSwitch.set(window.tcLangSwitch.current); } catch(e){}
    }
  }

  function enhance() {
    // ── Enhance Topbar ────────────────────────────────────────────
    injectLangBtn();

    // ── Enhance Sidebar Brand Area ──────────────────────
    var sidebar = document.querySelector('.sidebar');
    if (sidebar && !sidebar.dataset.tcBrand) {
      sidebar.dataset.tcBrand = 'true';

      // Subtle vertical gradient. The brand logo itself is the bundle's
      // sidebar header (img.tc-sidebar-logo, styled in team-upgrade.css).
      sidebar.style.background = 'linear-gradient(180deg, #0f1e35 0%, #0a1628 100%)';
    }
  }

  // ── MutationObserver: ONLY calls injectLangBtn (has isConnected guard)
  // NEVER call enhance() from the observer — enhance() modifies the DOM
  // (sidebar.style.background) which triggers the observer again = infinite loop = page freeze.
  var _obsDebounce = null;
  var obs = new MutationObserver(function() {
    // Debounce to max 1 call per 100ms — prevents rapid-fire on React re-renders
    if (_obsDebounce) return;
    _obsDebounce = setTimeout(function() {
      _obsDebounce = null;
      injectLangBtn();
    }, 100);
  });
  obs.observe(document.getElementById('root') || document.body, {
    childList: true, subtree: false  // subtree:false reduces mutation events significantly
  });

  // ── Polling: 400ms safety net for route changes ──────────────────
  // Limited poller — stops after 60s (no need to run forever)
  (function() {
    var _pollCount = 0;
    var _pollTimer = setInterval(function() {
      injectLangBtn();
      _pollCount++;
      if (_pollCount >= 150) clearInterval(_pollTimer); // 150 × 400ms = 60s
    }, 400);
  })();

  // Initial enhance calls (sidebar brand — one-time only)
  setTimeout(enhance, 600);
  setTimeout(enhance, 2000);

})();

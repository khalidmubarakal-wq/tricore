/**
 * Beta warning popup (#tc-beta-overlay): shown once per browser session to
 * signed-out visitors; the accept button is enabled by the checkbox.
 */
(function tcBetaPopup() {
  'use strict';

  var KEYS = window.TC_CONFIG.storage;
  var FADE_MS = 260;

  function overlay() { return document.getElementById('tc-beta-overlay'); }

  function show() {
    var el = overlay();
    if (el) el.style.display = 'flex';
  }

  function hide() {
    var el = overlay();
    if (!el) return;
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(function () { el.style.display = 'none'; }, FADE_MS);
  }

  function accepted() {
    try { return sessionStorage.getItem(KEYS.betaAccepted) === '1'; } catch (_) { return false; }
  }

  window.tcBetaAccept = function () {
    try { sessionStorage.setItem(KEYS.betaAccepted, '1'); } catch (_) {}
    hide();
  };

  function init() {
    try {
      if (accepted()) return;
      if (sessionStorage.getItem(KEYS.tabActive) === '1') return; // already signed in
      show();
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Re-show if the user is sent back to the auth screen without accepting.
  window.addEventListener('tc:show-auth', function () {
    if (!accepted()) show();
  });
})();

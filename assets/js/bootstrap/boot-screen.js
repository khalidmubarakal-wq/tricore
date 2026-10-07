/**
 * Boot splash — fades out #boot as soon as React mounts its first node into
 * #root, with a 2.5s fallback so the splash can never get stuck.
 */
(function tcBootScreen() {
  'use strict';

  var FALLBACK_MS = 2500;
  var FADE_MS = 450;
  var root = document.getElementById('root');
  var observer = new MutationObserver(function () {
    if (root.children.length > 0) hideBoot();
  });

  function hideBoot() {
    observer.disconnect();
    var boot = document.getElementById('boot');
    if (!boot) return;
    boot.classList.add('hide');
    setTimeout(function () {
      if (boot.parentNode) boot.parentNode.removeChild(boot);
    }, FADE_MS);
  }

  if (!root) return;
  if (root.children.length > 0) {
    hideBoot();
  } else {
    // Direct children of #root are enough to detect React's first commit.
    observer.observe(root, { childList: true, subtree: false });
  }
  setTimeout(hideBoot, FALLBACK_MS);
})();

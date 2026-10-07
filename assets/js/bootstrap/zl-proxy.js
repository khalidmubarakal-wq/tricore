/**
 * `window.Zl` early-write proxy — must run BEFORE the React bundle.
 *
 * `Zl` is the bundle's auth/data store. The bundle assigns `window.Zl`
 * synchronously when it loads, but our data-sync layer (core/main.js, an ES
 * module) only installs its own implementation once modules execute. Any
 * `saveUserData` call in that gap would write to localStorage but never reach
 * Supabase.
 *
 * This shim intercepts the first assignment of `window.Zl`, wraps
 * `saveUserData` so early calls are queued in `window.__pendingSyncs`, and then
 * turns `Zl` back into a plain property. core/main.js drains the queue once
 * it takes over (and sets `window.__zlProxyInstalled`).
 */
(function tcZlProxy() {
  'use strict';

  window.__pendingSyncs = [];
  window.__zlProxyInstalled = false;

  try {
    Object.defineProperty(window, 'Zl', {
      configurable: true,
      enumerable: true,
      get: function () { return undefined; },
      set: function (val) {
        if (val && typeof val === 'object') wrapSaveUserData(val);
        Object.defineProperty(window, 'Zl', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: val
        });
        window.__zlProxyReady = true;
      }
    });
  } catch (e) {
    console.warn('[TriCore] Zl proxy failed to install:', e.message);
  }

  function wrapSaveUserData(zl) {
    var origSave = zl.saveUserData;
    zl.saveUserData = function (userId, state) {
      var result = typeof origSave === 'function' ? origSave.call(this, userId, state) : state;
      if (!window.__zlProxyInstalled) {
        window.__pendingSyncs.push({ userId: userId, state: result || state, time: Date.now() });
      }
      return result;
    };
  }
})();

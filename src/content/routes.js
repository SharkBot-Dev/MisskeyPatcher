import { state } from './state.js';

export function onRouteChange(callback) {
  state.routeCallbacks.add(callback);
  return () => state.routeCallbacks.delete(callback);
}

function emitRouteChange() {
  if (state.lastUrl === location.href) return;
  state.lastUrl = location.href;
  for (const callback of state.routeCallbacks) {
    try {
      callback(location.href);
    } catch (error) {
      console.error('[Misskey Patcher] route callback failed', error);
    }
  }
}

export function installRouteHooks() {
  if (window.__misskeyPatcherRouteHooksInstalled) return;
  window.__misskeyPatcherRouteHooksInstalled = true;

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      queueMicrotask(emitRouteChange);
      return result;
    };
  }

  window.addEventListener('popstate', () => queueMicrotask(emitRouteChange));
  setInterval(emitRouteChange, 500);
}

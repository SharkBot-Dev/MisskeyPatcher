const DEFAULTS = {
  enabled: true,
  showBadge: true,
  allowedHosts: '',
  customCss: '',
  customJs: [
    '// Runs as a Manifest V3 user script after Misskey is detected.',
    '// Available globals: window, document, api',
    'api.markNotes();',
    'api.onRouteChange(() => api.markNotes());',
  ].join('\n'),
  customPlugins: [],
};

const INSTANCE_SETTINGS_KEY = 'instanceSettings';
const SCRIPT_ID_PREFIX = 'mkp-';

function legacySettings(items) {
  return {
    enabled: items.enabled ?? DEFAULTS.enabled,
    showBadge: items.showBadge ?? DEFAULTS.showBadge,
    allowedHosts: items.allowedHosts ?? DEFAULTS.allowedHosts,
    customCss: items.customCss ?? DEFAULTS.customCss,
    customJs: items.customJs ?? DEFAULTS.customJs,
    customPlugins: items.customPlugins ?? DEFAULTS.customPlugins,
  };
}

function makePluginId() {
  return `plugin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultPlugin(code = DEFAULTS.customJs) {
  return {
    id: makePluginId(),
    name: '基本プラグイン',
    enabled: true,
    code,
  };
}

function normalizePlugins(settings) {
  const plugins = Array.isArray(settings.customPlugins) ? settings.customPlugins : [];
  const normalized = plugins
    .map((plugin, index) => ({
      id: String(plugin?.id || `plugin-${index + 1}`),
      name: String(plugin?.name || `プラグイン ${index + 1}`),
      enabled: plugin?.enabled !== false,
      code: String(plugin?.code ?? ''),
    }))
    .filter((plugin) => plugin.code.trim());

  if (normalized.length > 0) return normalized;
  if (settings.customJs?.trim()) return [defaultPlugin(settings.customJs)];
  return [];
}

function parseHostPatterns(allowedHosts, fallbackHost) {
  const hosts = allowedHosts
    .split(/\r?\n|,/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return hosts.length > 0 ? hosts : [fallbackHost];
}

function hostPatternToMatches(hostPattern) {
  if (!hostPattern || hostPattern === '*') return ['<all_urls>'];
  if (hostPattern.startsWith('*.')) {
    const rootHost = hostPattern.slice(2);
    return [`*://${rootHost}/*`, `*://*.${rootHost}/*`];
  }
  return [`*://${hostPattern}/*`];
}

function unique(values) {
  return [...new Set(values)];
}

function scriptIdPart(value) {
  return [...String(value)].map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('').slice(0, 96);
}

function scriptIdForPlugin(host, plugin) {
  return `${SCRIPT_ID_PREFIX}${scriptIdPart(host) || 'global'}-${scriptIdPart(plugin.id) || 'plugin'}`;
}

function indentUserCode(userCode) {
  return userCode
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');
}

function buildUserScriptCode(userCode, pluginName, extensionVersion) {
  return `
(() => {
  'use strict';

  const pluginName = ${JSON.stringify(pluginName)};
  const extensionVersion = ${JSON.stringify(extensionVersion)};
  const state = {
    routeCallbacks: new Set(),
    lastUrl: location.href,
  };

  const ready = new Promise((resolve) => {
    if (document.documentElement) {
      resolve();
    } else {
      document.addEventListener('readystatechange', resolve, { once: true });
    }
  });

  function isMisskeyPage() {
    const appName = document.querySelector('meta[name="application-name" i]')?.getAttribute('content');
    if (appName?.toLowerCase() === 'misskey') return true;
    if (document.getElementById('misskey_meta')) return true;
    if (document.querySelector('script[src^="/vite/loader/boot.js"], script[src*="/vite/loader/boot.js"]')) return true;
    if (document.querySelector('link[href^="/vite/loader/style.css"], link[href*="/vite/loader/style.css"]')) return true;

    const html = document.documentElement?.innerHTML ?? '';
    return html.includes('Thank you for using Misskey!') || html.includes('const CLIENT_ENTRY =');
  }

  async function waitForMisskey(timeoutMs = 10000) {
    await ready;
    if (isMisskeyPage()) return true;

    return new Promise((resolve) => {
      const startedAt = Date.now();
      const observer = new MutationObserver(() => {
        if (isMisskeyPage()) {
          observer.disconnect();
          resolve(true);
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          observer.disconnect();
          resolve(false);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(isMisskeyPage());
      }, timeoutMs);
    });
  }

  function installStyle(cssText, id = 'mkp-user-script-style') {
    if (!cssText.trim()) return null;

    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      style.dataset.misskeyPatcherUserScript = 'true';
      (document.head || document.documentElement).append(style);
    }
    style.textContent = cssText;
    return style;
  }

  function removeStyle(id = 'mkp-user-script-style') {
    document.getElementById(id)?.remove();
  }

  function query(selector, root = document) {
    return root.querySelector(selector);
  }

  function queryAll(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  }

  async function waitForElement(selector, options = {}) {
    const root = options.root ?? document;
    const timeout = options.timeout ?? 10000;
    const existing = root.querySelector(selector);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      const observerRoot = root === document ? document.documentElement : root;
      const timer = timeout > 0 ? setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timed out waiting for selector: ' + selector));
      }, timeout) : null;

      const observer = new MutationObserver(() => {
        const found = root.querySelector(selector);
        if (!found) return;

        observer.disconnect();
        if (timer) clearTimeout(timer);
        resolve(found);
      });

      observer.observe(observerRoot, {
        childList: true,
        subtree: true,
      });
    });
  }

  function observe(selector, callback, options = {}) {
    const root = options.root ?? document;
    const observerRoot = root === document ? document.documentElement : root;
    const seen = new WeakSet();

    function visitExisting() {
      for (const node of root.querySelectorAll(selector)) {
        if (seen.has(node)) continue;
        seen.add(node);
        callback(node);
        if (options.once) return true;
      }
      return false;
    }

    if (options.existing !== false && visitExisting()) {
      return () => {};
    }

    const observer = new MutationObserver(() => {
      if (visitExisting() && options.once) observer.disconnect();
    });

    observer.observe(observerRoot, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }

  function on(selector, eventName, handler, options = {}) {
    const root = options.root ?? document;
    const listener = (event) => {
      const target = event.target instanceof Element ? event.target.closest(selector) : null;
      if (!target || !root.contains(target)) return;
      handler(event, target);
    };

    root.addEventListener(eventName, listener, options);
    return () => root.removeEventListener(eventName, listener, options);
  }

  function toast(message, options = {}) {
    const node = document.createElement('div');
    node.textContent = String(message);
    node.dataset.misskeyPatcherToast = 'true';
    Object.assign(node.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      maxWidth: 'min(360px, calc(100vw - 32px))',
      padding: '10px 12px',
      borderRadius: '8px',
      background: 'var(--MI_THEME-panel, #222)',
      color: 'var(--MI_THEME-fg, #fff)',
      boxShadow: '0 10px 32px rgb(0 0 0 / 28%)',
      font: '13px/1.45 system-ui, sans-serif',
      whiteSpace: 'pre-wrap',
    });
    (document.body || document.documentElement).append(node);
    setTimeout(() => node.remove(), options.timeout ?? 3000);
    return node;
  }

  async function misskeyApi(endpoint, body = {}, options = {}) {
    const path = String(endpoint).startsWith('/api/') ? String(endpoint) : '/api/' + String(endpoint).replace(/^\\/+/, '');
    const response = await fetch(path, {
      method: options.method ?? 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: options.method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });

    if (!response.ok) {
      throw new Error('Misskey API request failed: ' + response.status + ' ' + response.statusText);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  const store = Object.freeze({
    get(key, fallback = null) {
      const raw = localStorage.getItem('misskey-patcher:' + pluginName + ':' + key);
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    set(key, value) {
      localStorage.setItem('misskey-patcher:' + pluginName + ':' + key, JSON.stringify(value));
      return value;
    },
    remove(key) {
      localStorage.removeItem('misskey-patcher:' + pluginName + ':' + key);
    },
  });

  function markNotes() {
    const selectors = [
      'article',
      '[class*="note" i]',
      '[data-testid*="note" i]',
      'div:has(> [href*="/notes/"])',
    ];

    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach((node) => {
          if (node instanceof HTMLElement) {
            node.dataset.mkpNoteRoot = 'true';
          }
        });
      } catch {
      }
    }
  }

  function onRouteChange(callback) {
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
        console.error('[Misskey Patcher] user route callback failed', error);
      }
    }
  }

  function installRouteHooks() {
    if (window.__misskeyPatcherUserRouteHooksInstalled) return;
    window.__misskeyPatcherUserRouteHooksInstalled = true;

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

  async function main() {
    if (!(await waitForMisskey())) return;

    installRouteHooks();

    const api = Object.freeze({
      pluginName,
      extensionVersion,
      installStyle,
      removeStyle,
      query,
      queryAll,
      waitForElement,
      waitFor: waitForElement,
      observe,
      on,
      toast,
      misskeyApi,
      store,
      markNotes,
      onRouteChange,
      rerunSoon: (callback, delay = 300) => setTimeout(callback, delay),
      isMisskeyPage,
      get url() {
        return location.href;
      },
      get path() {
        return location.pathname;
      },
    });

    try {
      ((window, document, api) => {
${indentUserCode(userCode)}
      })(window, document, api);
    } catch (error) {
      console.error('[Misskey Patcher] user script failed:', pluginName, error);
    }
  }

  main();
})();
`;
}

function storageGet(defaults) {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, resolve);
  });
}

async function userScriptsAvailable() {
  if (!chrome.userScripts) return false;

  try {
    await chrome.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
}

async function unregisterManagedScripts() {
  const scripts = await chrome.userScripts.getScripts();
  const ids = scripts
    .map((script) => script.id)
    .filter((id) => id.startsWith(SCRIPT_ID_PREFIX));

  if (ids.length > 0) {
    await chrome.userScripts.unregister({ ids });
  }
}

async function syncUserScripts() {
  if (!(await userScriptsAvailable())) {
    return { ok: false, reason: 'userScripts API is not available. Enable Allow User Scripts or Developer mode for this extension.' };
  }

  const items = await storageGet({ ...DEFAULTS, [INSTANCE_SETTINGS_KEY]: {} });
  const legacy = legacySettings(items);
  const instances = items[INSTANCE_SETTINGS_KEY] ?? {};
  const extensionVersion = chrome.runtime.getManifest().version;
  const registrations = [];

  for (const [host, hostSettings] of Object.entries(instances)) {
    const settings = { ...DEFAULTS, ...legacy, ...hostSettings };
    if (!settings.enabled) continue;

    const matches = unique(parseHostPatterns(settings.allowedHosts, host).flatMap(hostPatternToMatches));
    const plugins = normalizePlugins(settings).filter((plugin) => plugin.enabled);
    for (const plugin of plugins) {
      registrations.push({
        id: scriptIdForPlugin(host, plugin),
        matches,
        js: [{ code: buildUserScriptCode(plugin.code, plugin.name, extensionVersion) }],
        runAt: 'document_idle',
        world: 'USER_SCRIPT',
      });
    }
  }

  await unregisterManagedScripts();
  const errors = [];
  for (const registration of registrations) {
    try {
      await chrome.userScripts.register([registration]);
    } catch (error) {
      errors.push({ id: registration.id, reason: error.message });
    }
  }

  return { ok: errors.length === 0, count: registrations.length - errors.length, errors };
}

chrome.runtime.onInstalled.addListener(() => {
  syncUserScripts().catch((error) => {
    console.error('[Misskey Patcher] failed to register user scripts on install', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  syncUserScripts().catch((error) => {
    console.error('[Misskey Patcher] failed to register user scripts on startup', error);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[INSTANCE_SETTINGS_KEY]) return;

  syncUserScripts().catch((error) => {
    console.error('[Misskey Patcher] failed to update user scripts', error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'mkp-sync-user-scripts') return false;

  syncUserScripts()
    .then(sendResponse)
    .catch((error) => {
      console.error('[Misskey Patcher] failed to sync user scripts', error);
      sendResponse({ ok: false, reason: error.message });
    });

  return true;
});

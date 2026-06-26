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
let userScriptsSyncQueue = Promise.resolve();

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

  const settingsItemCallbacks = new Map();
  const sidebarMoreItemCallbacks = new Map();

  function serializeBridgePayload(payload) {
    try {
      return JSON.stringify(payload);
    } catch {
      return JSON.stringify({ type: 'bridge-error', reason: 'Failed to serialize bridge payload' });
    }
  }

  function pluginItemId(value) {
    const raw = String(value || '').trim() || Math.random().toString(36).slice(2, 10);
    return pluginName + ':' + raw.replace(/\\s+/g, '-');
  }

  function emitSettingsCommand(command) {
    window.dispatchEvent(new CustomEvent('misskey-patcher:settings-command', {
      detail: serializeBridgePayload(command),
    }));
  }

  function emitSidebarMoreCommand(command) {
    window.dispatchEvent(new CustomEvent('misskey-patcher:sidebar-more-command', {
      detail: serializeBridgePayload(command),
    }));
  }

  function registerSettingsItem(definition, callback) {
    const itemDefinition = typeof definition === 'string' ? { name: definition } : { ...(definition ?? {}) };
    const id = pluginItemId(itemDefinition.id ?? itemDefinition.name ?? itemDefinition.label);
    const name = String(itemDefinition.name ?? itemDefinition.label ?? '').trim();
    if (!name) {
      throw new Error('Settings item name is required');
    }

    const item = {
      id,
      name,
      icon: String(itemDefinition.icon ?? 'ti ti-plug ti-fw'),
      order: Number.isFinite(Number(itemDefinition.order)) ? Number(itemDefinition.order) : 100,
      pluginName,
    };

    if (typeof callback === 'function') {
      settingsItemCallbacks.set(id, callback);
    }

    emitSettingsCommand({ type: 'register', item });
    return () => {
      settingsItemCallbacks.delete(id);
      emitSettingsCommand({ type: 'unregister', id });
    };
  }

  function registerSidebarMoreItem(definition, callback) {
    const itemDefinition = typeof definition === 'string' ? { name: definition } : { ...(definition ?? {}) };
    const id = pluginItemId(itemDefinition.id ?? itemDefinition.name ?? itemDefinition.label);
    const name = String(itemDefinition.name ?? itemDefinition.label ?? '').trim();
    if (!name) {
      throw new Error('Sidebar more item name is required');
    }

    const item = {
      id,
      name,
      icon: String(itemDefinition.icon ?? 'ti ti-plug ti-fw'),
      order: Number.isFinite(Number(itemDefinition.order)) ? Number(itemDefinition.order) : 100,
      pluginName,
    };

    if (typeof callback === 'function') {
      sidebarMoreItemCallbacks.set(id, callback);
    }

    emitSidebarMoreCommand({ type: 'register', item });
    return () => {
      sidebarMoreItemCallbacks.delete(id);
      emitSidebarMoreCommand({ type: 'unregister', id });
    };
  }

  window.addEventListener('misskey-patcher:settings-event', (event) => {
    const message = parseBridgeDetail(event.detail);
    if (!message || message.type !== 'click') return;

    const callback = settingsItemCallbacks.get(String(message.id ?? ''));
    if (!callback) return;

    try {
      callback(Object.freeze({
        id: message.id,
        pluginName: message.pluginName,
      }));
    } catch (error) {
      console.error('[Misskey Patcher] settings item callback failed:', pluginName, error);
    }
  });

  window.addEventListener('misskey-patcher:sidebar-more-event', (event) => {
    const message = parseBridgeDetail(event.detail);
    if (!message || message.type !== 'click') return;

    const callback = sidebarMoreItemCallbacks.get(String(message.id ?? ''));
    if (!callback) return;

    try {
      callback(Object.freeze({
        id: message.id,
        pluginName: message.pluginName,
      }));
    } catch (error) {
      console.error('[Misskey Patcher] sidebar more item callback failed:', pluginName, error);
    }
  });

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

  function misskeyWebSocketUrl(path = '/streaming', params = {}) {
    const url = new URL(path, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }

  function parseSocketMessage(event) {
    if (typeof event.data !== 'string') return event.data;

    try {
      return JSON.parse(event.data);
    } catch {
      return event.data;
    }
  }

  function openWebSocket(path = '/streaming', options = {}) {
    const params = { ...(options.params ?? {}) };
    if (options.token && !params.i) params.i = options.token;

    const socket = new WebSocket(misskeyWebSocketUrl(path, params), options.protocols);
    const pendingSends = [];

    socket.addEventListener('open', () => {
      while (pendingSends.length > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(pendingSends.shift());
      }
    });

    function onOpen(callback) {
      socket.addEventListener('open', callback);
      return () => socket.removeEventListener('open', callback);
    }

    function onClose(callback) {
      socket.addEventListener('close', callback);
      return () => socket.removeEventListener('close', callback);
    }

    function onError(callback) {
      socket.addEventListener('error', callback);
      return () => socket.removeEventListener('error', callback);
    }

    function onMessage(callback) {
      const listener = (event) => callback(parseSocketMessage(event), event);
      socket.addEventListener('message', listener);
      return () => socket.removeEventListener('message', listener);
    }

    function sendRaw(data) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      if (socket.readyState === WebSocket.CONNECTING) {
        pendingSends.push(payload);
        return;
      }

      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket is not open');
      }

      socket.send(payload);
    }

    function send(type, body = {}) {
      sendRaw({ type, body });
    }

    return Object.freeze({
      socket,
      onOpen,
      onClose,
      onError,
      onMessage,
      send,
      sendRaw,
      close: (code, reason) => socket.close(code, reason),
      get readyState() {
        return socket.readyState;
      },
    });
  }

  function openMisskeyStream(options = {}) {
    const ws = openWebSocket('/streaming', {
      token: options.token,
      params: options.params,
      protocols: options.protocols,
    });
    const channelCallbacks = new Map();

    ws.onMessage((message, event) => {
      if (!message || typeof message !== 'object') return;
      if (message.type !== 'channel') return;

      const channelId = message.body?.id;
      const callbacks = channelCallbacks.get(channelId);
      if (!callbacks) return;

      for (const callback of callbacks) {
        callback(message.body?.body, message, event);
      }
    });

    function connect(channel, params = {}, id = channel + ':' + Math.random().toString(36).slice(2, 10)) {
      ws.send('connect', {
        channel,
        id,
        params,
      });
      return id;
    }

    function disconnect(id) {
      ws.send('disconnect', { id });
      channelCallbacks.delete(id);
    }

    function onChannelMessage(id, callback) {
      const callbacks = channelCallbacks.get(id) ?? new Set();
      callbacks.add(callback);
      channelCallbacks.set(id, callbacks);
      return () => {
        callbacks.delete(callback);
        if (callbacks.size === 0) channelCallbacks.delete(id);
      };
    }

    function channel(channel, params = {}, callback) {
      const id = connect(channel, params);
      const off = callback ? onChannelMessage(id, callback) : () => {};
      return Object.freeze({
        id,
        off,
        disconnect: () => {
          off();
          disconnect(id);
        },
      });
    }

    return Object.freeze({
      ...ws,
      connect,
      disconnect,
      onChannelMessage,
      channel,
    });
  }

  const pageSocketState = {
    sockets: new Map(),
    waiters: new Set(),
  };

  function parseBridgeDetail(detail) {
    if (typeof detail !== 'string') return null;
    try {
      return JSON.parse(detail);
    } catch {
      return null;
    }
  }

  function emitBridgeCommand(command) {
    window.dispatchEvent(new CustomEvent('misskey-patcher:ws-command', {
      detail: JSON.stringify(command),
    }));
  }

  function parseBridgeSocketMessage(data) {
    if (typeof data !== 'string') return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  function updateBridgeSocket(socket) {
    if (!socket?.id) return;
    pageSocketState.sockets.set(socket.id, socket);
    for (const waiter of pageSocketState.waiters) {
      waiter(socket);
    }
  }

  window.addEventListener('misskey-patcher:ws-bridge', (event) => {
    const message = parseBridgeDetail(event.detail);
    if (!message) return;

    if (message.type === 'socket-list') {
      for (const socket of message.sockets ?? []) {
        updateBridgeSocket(socket);
      }
      return;
    }

    if (message.type === 'socket-close' && message.socket?.id) {
      pageSocketState.sockets.delete(message.socket.id);
      return;
    }

    if (message.socket) {
      updateBridgeSocket(message.socket);
    }
  });

  function listReusableStreams() {
    emitBridgeCommand({ type: 'list' });
    return [...pageSocketState.sockets.values()]
      .filter((socket) => socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
  }

  function waitForReusableStream(options = {}) {
    const timeout = options.timeout ?? 5000;
    const existing = listReusableStreams()[0];
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = timeout > 0 ? setTimeout(() => {
        pageSocketState.waiters.delete(waiter);
        reject(new Error('Timed out waiting for Misskey page WebSocket'));
      }, timeout) : null;

      const waiter = (socket) => {
        if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) return;
        pageSocketState.waiters.delete(waiter);
        if (timer) clearTimeout(timer);
        resolve(socket);
      };

      pageSocketState.waiters.add(waiter);
      emitBridgeCommand({ type: 'list' });
    });
  }

  async function reuseMisskeyStream(options = {}) {
    let socket;
    try {
      socket = await waitForReusableStream(options);
    } catch (error) {
      if (options.fallbackNew === false) throw error;
      return openMisskeyStream(options);
    }

    const channelCallbacks = new Map();
    const messageCallbacks = new Set();

    const offBridge = (event) => {
      const bridgeMessage = parseBridgeDetail(event.detail);
      if (!bridgeMessage || bridgeMessage.socket?.id !== socket.id) return;

      if (bridgeMessage.type === 'socket-message') {
        const message = parseBridgeSocketMessage(bridgeMessage.data);
        for (const callback of messageCallbacks) {
          callback(message, bridgeMessage);
        }

        if (!message || typeof message !== 'object' || message.type !== 'channel') return;
        const channelId = message.body?.id;
        const callbacks = channelCallbacks.get(channelId);
        if (!callbacks) return;
        for (const callback of callbacks) {
          callback(message.body?.body, message, bridgeMessage);
        }
      }
    };

    window.addEventListener('misskey-patcher:ws-bridge', offBridge);

    function sendRaw(data) {
      emitBridgeCommand({
        type: 'send',
        id: socket.id,
        data: typeof data === 'string' ? data : JSON.stringify(data),
      });
    }

    function send(type, body = {}) {
      sendRaw({ type, body });
    }

    function connect(channel, params = {}, id = channel + ':' + Math.random().toString(36).slice(2, 10)) {
      send('connect', {
        channel,
        id,
        params,
      });
      return id;
    }

    function disconnect(id) {
      send('disconnect', { id });
      channelCallbacks.delete(id);
    }

    function onMessage(callback) {
      messageCallbacks.add(callback);
      return () => messageCallbacks.delete(callback);
    }

    function onChannelMessage(id, callback) {
      const callbacks = channelCallbacks.get(id) ?? new Set();
      callbacks.add(callback);
      channelCallbacks.set(id, callbacks);
      return () => {
        callbacks.delete(callback);
        if (callbacks.size === 0) channelCallbacks.delete(id);
      };
    }

    function channel(channel, params = {}, callback) {
      const id = connect(channel, params);
      const off = callback ? onChannelMessage(id, callback) : () => {};
      return Object.freeze({
        id,
        off,
        disconnect: () => {
          off();
          disconnect(id);
        },
      });
    }

    return Object.freeze({
      id: socket.id,
      url: socket.url,
      reused: true,
      connect,
      disconnect,
      onMessage,
      onChannelMessage,
      channel,
      send,
      sendRaw,
      closeBridge: () => window.removeEventListener('misskey-patcher:ws-bridge', offBridge),
      get readyState() {
        return pageSocketState.sockets.get(socket.id)?.readyState ?? WebSocket.CLOSED;
      },
    });
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
      registerSettingsItem,
      addSettingsItem: registerSettingsItem,
      registerSidebarMoreItem,
      addSidebarMoreItem: registerSidebarMoreItem,
      misskeyApi,
      misskeyWebSocketUrl,
      openWebSocket,
      openMisskeyStream,
      stream: openMisskeyStream,
      reuseMisskeyStream,
      pageStream: reuseMisskeyStream,
      listReusableStreams,
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
      await (async (window, document, api) => {
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

function isNonexistentUserScriptError(error) {
  return /\bNonexistent script ID\b/.test(String(error?.message ?? error));
}

async function unregisterManagedScripts() {
  const scripts = await chrome.userScripts.getScripts();
  const ids = scripts
    .map((script) => script.id)
    .filter((id) => id?.startsWith(SCRIPT_ID_PREFIX));

  for (const id of ids) {
    try {
      await chrome.userScripts.unregister({ ids: [id] });
    } catch (error) {
      if (!isNonexistentUserScriptError(error)) throw error;
    }
  }
}

async function runUserScriptsSync() {
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

function syncUserScripts() {
  const sync = userScriptsSyncQueue.catch(() => {}).then(runUserScriptsSync);
  userScriptsSyncQueue = sync;
  return sync;
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

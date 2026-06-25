(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    showBadge: true,
    allowedHosts: '',
    customCss: [
      '/* Example: make built Misskey pages feel slightly denser. */',
      ':root[data-misskey-patcher-active="true"] {',
      '  --mkp-patched-at: "extension";',
      '}',
      '',
      '[data-mkp-note-root] {',
      '  scroll-margin-top: 72px;',
      '}',
    ].join('\n'),
  };

  const INSTANCE_SETTINGS_KEY = 'instanceSettings';

  const state = {
    active: false,
    observer: null,
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

  function currentInstanceHost() {
    return location.hostname.toLowerCase();
  }

  function legacySettings(items) {
    return {
      enabled: items.enabled ?? DEFAULTS.enabled,
      showBadge: items.showBadge ?? DEFAULTS.showBadge,
      allowedHosts: items.allowedHosts ?? DEFAULTS.allowedHosts,
      customCss: items.customCss ?? DEFAULTS.customCss,
    };
  }

  function settingsForHost(items, host = currentInstanceHost()) {
    const instances = items[INSTANCE_SETTINGS_KEY] ?? {};
    return {
      ...DEFAULTS,
      ...legacySettings(items),
      ...(instances[host] ?? {}),
    };
  }

  function getChromeStorage() {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.storage?.local) {
        resolve({ ...DEFAULTS });
        return;
      }

      chrome.storage.local.get({ ...DEFAULTS, [INSTANCE_SETTINGS_KEY]: {} }, (items) => {
        resolve(settingsForHost(items));
      });
    });
  }

  function setCurrentInstanceSettings(nextSettings, callback) {
    chrome.storage.local.get({ [INSTANCE_SETTINGS_KEY]: {} }, (items) => {
      const host = currentInstanceHost();
      const instances = items[INSTANCE_SETTINGS_KEY] ?? {};
      chrome.storage.local.set({
        [INSTANCE_SETTINGS_KEY]: {
          ...instances,
          [host]: {
            ...DEFAULTS,
            ...instances[host],
            ...nextSettings,
          },
        },
      }, callback);
    });
  }

  function hostIsAllowed(allowedHosts) {
    const patterns = allowedHosts
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (patterns.length === 0) return true;

    return patterns.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
        return location.hostname.endsWith(suffix);
      }
      return location.hostname === pattern;
    });
  }

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

  function installStyle(id, cssText) {
    if (!cssText.trim()) return;

    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      style.dataset.misskeyPatcher = 'true';
      (document.head || document.documentElement).append(style);
    }
    style.textContent = cssText;
  }

  const buttons = [
    {
      "name": "パッチ設定",
      "function": (event) => {
        event.preventDefault();
        event.stopPropagation();
        openInlineSettings();
      }
    }
  ]
  
  function createSettingsRow(dataVName) {
    let buttons_list = [];
    buttons.forEach((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = '_button item mkp-settings-menu-item';
      button.dataset.misskeyPatcherSettings = 'true';
      button.innerHTML = [
        `<span class="icon"><i class="ti ti-settings-2 ti-fw"></i></span>`,
        `<span class="text">${value.name}</span>`,
      ].join('');
      if (dataVName) {
        button.setAttribute(dataVName, "")
      }
      button.addEventListener('click', value.function);
      buttons_list.push(button)
    })
    return buttons_list;
  }

  function injectSettingsMenuItem() {
    if (!location.pathname.startsWith('/settings')) return;
    if (document.querySelector('[data-misskey-patcher-settings="true"]')) return;

    const superMenu = document.querySelector('.rrevdjwu');
    if (!superMenu) return;

    let dataVName;
    for (const attr of superMenu.firstElementChild.attributes) {
      if (attr.name.startsWith("data-v-")) {
        dataVName = attr.name
      }
    }

    const group = document.createElement('div');
    group.className = 'group';
    if (dataVName) {
      group.setAttribute(dataVName, "")
    }

    const items = document.createElement('div');
    items.className = 'items';
    if (dataVName) {
      items.setAttribute(dataVName, "")
    }
    createSettingsRow(dataVName).forEach((value) => {
      items.append(value);
    })
    group.append(items);

    superMenu.append(group);
  }

  function fieldValue(form, name) {
    return form.elements.namedItem(name)?.value ?? '';
  }

  async function openInlineSettings() {
    document.getElementById('mkp-inline-settings')?.remove();
    const settings = await getChromeStorage();

    const root = document.createElement('div');
    root.id = 'mkp-inline-settings';
    root.innerHTML = [
      '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
      '<section class="mkp-inline-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-inline-title">',
      '  <header class="mkp-inline-header">',
      '    <div>',
      '      <h2 id="mkp-inline-title">MisskeyPatcher設定</h2>',
      `      <p>${currentInstanceHost()}</p>`,
      '    </div>',
      '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
      '  </header>',
      '  <form class="mkp-inline-form">',
      '    <label class="mkp-check"><input name="enabled" type="checkbox"> <span>有効</span></label>',
      '    <label class="mkp-check"><input name="showBadge" type="checkbox"> <span>バッジを表示</span></label>',
      '    <label><span>対象ホスト</span><textarea name="allowedHosts" spellcheck="false" placeholder="空欄なら Misskey 判定された全ホスト"></textarea></label>',
      '    <label><span>追加 CSS</span><textarea name="customCss" class="mkp-code" spellcheck="false"></textarea></label>',
      '    <div class="mkp-inline-actions">',
      '      <button type="submit">保存</button>',
      '      <button type="button" data-mkp-reset="true">初期値に戻す</button>',
      '    </div>',
      '    <p class="mkp-inline-status" role="status"></p>',
      '  </form>',
      '</section>',
    ].join('');

    const form = root.querySelector('form');
    const status = root.querySelector('.mkp-inline-status');

    function render(values) {
      form.elements.namedItem('enabled').checked = values.enabled;
      form.elements.namedItem('showBadge').checked = values.showBadge;
      form.elements.namedItem('allowedHosts').value = values.allowedHosts;
      form.elements.namedItem('customCss').value = values.customCss;
    }

    function collect() {
      return {
        enabled: form.elements.namedItem('enabled').checked,
        showBadge: form.elements.namedItem('showBadge').checked,
        allowedHosts: fieldValue(form, 'allowedHosts'),
        customCss: fieldValue(form, 'customCss'),
      };
    }

    function close() {
      root.remove();
    }

    root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-mkp-close="true"]')) close();
      if (target?.closest('[data-mkp-reset="true"]')) {
        render(DEFAULTS);
        setCurrentInstanceSettings(DEFAULTS, () => {
          installStyle('mkp-custom-style', DEFAULTS.customCss);
          status.textContent = '初期値に戻しました。';
        });
      }
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const nextSettings = collect();
      setCurrentInstanceSettings(nextSettings, () => {
        installStyle('mkp-custom-style', nextSettings.customCss);
        document.getElementById('mkp-badge')?.toggleAttribute('hidden', !nextSettings.showBadge);
        status.textContent = '保存しました。現在のページにも反映しました。';
      });
    });

    render(settings);
    (document.body || document.documentElement).append(root);
    form.elements.namedItem('enabled').focus();
  }

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
        // Some Chromium versions may reject :has() in extension worlds.
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
        console.error('[Misskey Patcher] route callback failed', error);
      }
    }
  }

  function installRouteHooks() {
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

  function observeApp() {
    state.observer?.disconnect();
    state.observer = new MutationObserver(() => {
      markNotes();
      injectSettingsMenuItem();
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  async function main() {
    const settings = await getChromeStorage();
    if (!settings.enabled || !hostIsAllowed(settings.allowedHosts)) return;
    if (!(await waitForMisskey())) return;

    state.active = true;
    document.documentElement.dataset.misskeyPatcherActive = 'true';
    document.documentElement.dataset.misskeyPatcherVersion = chrome.runtime?.getManifest?.().version ?? 'dev';

    installStyle('mkp-custom-style', settings.customCss);
    installRouteHooks();
    observeApp();
    markNotes();
    injectSettingsMenuItem();
    onRouteChange(() => {
      markNotes();
      injectSettingsMenuItem();
    });
  }

  main();
})();

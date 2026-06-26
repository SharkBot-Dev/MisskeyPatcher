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
    customJs: [
      '// Runs as a Manifest V3 user script after Misskey is detected.',
      '// Available globals: window, document, api',
      'api.markNotes();',
      'api.onRouteChange(() => api.markNotes());',
    ].join('\n'),
    customPlugins: [],
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
      allowedHosts: items.allowedHosts ?? DEFAULTS.allowedHosts,
      customCss: items.customCss ?? DEFAULTS.customCss,
      customJs: items.customJs ?? DEFAULTS.customJs,
      customPlugins: items.customPlugins ?? DEFAULTS.customPlugins,
    };
  }

  function normalizePlugins(settings) {
    const plugins = Array.isArray(settings.customPlugins) ? settings.customPlugins : [];
    const normalized = plugins.map((plugin, index) => ({
      id: String(plugin?.id || `plugin-${index + 1}`),
      name: String(plugin?.name || `プラグイン ${index + 1}`),
      enabled: plugin?.enabled !== false,
      code: String(plugin?.code ?? ''),
    }));

    if (normalized.length > 0) return normalized;
    return [{
      id: `plugin-${Date.now().toString(36)}`,
      name: '基本プラグイン',
      enabled: true,
      code: settings.customJs ?? DEFAULTS.customJs,
    }];
  }

  function createPlugin(code = '') {
    return {
      id: `plugin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: '新しいプラグイン',
      enabled: true,
      code,
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
      "name": "基本設定",
      "function": (event) => {
        event.preventDefault();
        event.stopPropagation();
        openInlineSettings();
      }
    },
    {
      "name": "プラグイン設定",
      "function": (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPluginSettings();
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

  function syncUserScripts(callback) {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      callback?.({ ok: false, reason: 'runtime messaging is unavailable' });
      return;
    }

    chrome.runtime.sendMessage({ type: 'mkp-sync-user-scripts' }, (response) => {
      callback?.(response ?? { ok: false, reason: chrome.runtime.lastError?.message ?? 'No response' });
    });
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
      form.elements.namedItem('allowedHosts').value = values.allowedHosts;
      form.elements.namedItem('customCss').value = values.customCss;
    }

    function collect() {
      return {
        enabled: form.elements.namedItem('enabled').checked,
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
        const basicDefaults = {
          enabled: DEFAULTS.enabled,
          allowedHosts: DEFAULTS.allowedHosts,
          customCss: DEFAULTS.customCss,
        };
        render({ ...settings, ...basicDefaults });
        setCurrentInstanceSettings(basicDefaults, () => {
          installStyle('mkp-custom-style', basicDefaults.customCss);
          syncUserScripts();
          status.textContent = '基本設定を初期値に戻しました。';
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
        syncUserScripts((response) => {
          if (response?.ok) {
            status.textContent = `保存しました。CSS は反映済み、${response.count} 件の追加 JS はページ再読み込み後に反映されます。`;
            return;
          }

          if (response?.errors?.length) {
            status.textContent = `保存しました。${response.count} 件を登録し、${response.errors.length} 件は JS エラーで登録できませんでした。`;
            return;
          }

          status.textContent = `保存しました。追加 JS の登録には Chrome の Allow User Scripts または Developer mode が必要です。`;
        });
      });
    });

    render(settings);
    (document.body || document.documentElement).append(root);
    form.elements.namedItem('enabled').focus();
  }

  async function openPluginSettings() {
    document.getElementById('mkp-inline-settings')?.remove();
    const settings = await getChromeStorage();
    let plugins = normalizePlugins(settings);
    let selectedIndex = 0;

    const root = document.createElement('div');
    root.id = 'mkp-inline-settings';
    root.innerHTML = [
      '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
      '<section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">',
      '  <header class="mkp-inline-header">',
      '    <div>',
      '      <h2 id="mkp-plugin-title">MisskeyPatcherプラグイン設定</h2>',
      `      <p>${currentInstanceHost()}</p>`,
      '    </div>',
      '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
      '  </header>',
      '  <form class="mkp-inline-form mkp-plugin-form">',
      '    <div class="mkp-plugin-toolbar">',
      '      <button type="button" data-mkp-add-plugin="true">追加</button>',
      '      <button type="button" data-mkp-remove-plugin="true">削除</button>',
      '    </div>',
      '    <label><span>プラグイン一覧</span><select name="pluginList" size="6"></select></label>',
      '    <label class="mkp-check"><input name="pluginEnabled" type="checkbox"> <span>このプラグインを有効にする</span></label>',
      '    <label><span>プラグイン名</span><input name="pluginName" type="text" placeholder="タイムライン調整"></label>',
      '    <label><span>JavaScript</span><textarea name="pluginCode" class="mkp-code" spellcheck="false"></textarea></label>',
      '    <div class="mkp-inline-actions">',
      '      <button type="submit">保存</button>',
      '    </div>',
      '    <p class="mkp-inline-status" role="status"></p>',
      '  </form>',
      '</section>',
    ].join('');

    const form = root.querySelector('form');
    const status = root.querySelector('.mkp-inline-status');
    const removeButton = root.querySelector('[data-mkp-remove-plugin="true"]');

    function currentPlugin() {
      return plugins[selectedIndex] ?? null;
    }

    function persistCurrentPlugin() {
      const plugin = currentPlugin();
      if (!plugin) return;

      plugin.enabled = form.elements.namedItem('pluginEnabled').checked;
      plugin.name = fieldValue(form, 'pluginName').trim() || `プラグイン ${selectedIndex + 1}`;
      plugin.code = fieldValue(form, 'pluginCode');
    }

    function renderPluginList() {
      const list = form.elements.namedItem('pluginList');
      list.textContent = '';
      plugins.forEach((plugin, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${plugin.enabled ? '✓' : '×'} ${plugin.name || `プラグイン ${index + 1}`}`;
        list.append(option);
      });
      list.value = String(selectedIndex);
      removeButton.disabled = plugins.length <= 1;
    }

    function renderPluginEditor() {
      if (selectedIndex >= plugins.length) selectedIndex = Math.max(0, plugins.length - 1);
      renderPluginList();

      const plugin = currentPlugin();
      form.elements.namedItem('pluginEnabled').checked = plugin?.enabled ?? false;
      form.elements.namedItem('pluginName').value = plugin?.name ?? '';
      form.elements.namedItem('pluginCode').value = plugin?.code ?? '';
    }

    function close() {
      root.remove();
    }

    root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-mkp-close="true"]')) close();

      if (target?.closest('[data-mkp-add-plugin="true"]')) {
        persistCurrentPlugin();
        plugins.push(createPlugin());
        selectedIndex = plugins.length - 1;
        renderPluginEditor();
        form.elements.namedItem('pluginName').focus();
      }

      if (target?.closest('[data-mkp-remove-plugin="true"]')) {
        if (plugins.length <= 1) return;
        plugins.splice(selectedIndex, 1);
        selectedIndex = Math.max(0, selectedIndex - 1);
        renderPluginEditor();
      }
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    form.elements.namedItem('pluginList').addEventListener('change', () => {
      persistCurrentPlugin();
      selectedIndex = Number(form.elements.namedItem('pluginList').value) || 0;
      renderPluginEditor();
    });

    form.elements.namedItem('pluginEnabled').addEventListener('change', () => {
      persistCurrentPlugin();
      renderPluginList();
    });

    form.elements.namedItem('pluginName').addEventListener('input', () => {
      persistCurrentPlugin();
      renderPluginList();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      persistCurrentPlugin();
      setCurrentInstanceSettings({
        customJs: plugins[0]?.code ?? '',
        customPlugins: plugins.map((plugin) => ({ ...plugin })),
      }, () => {
        syncUserScripts((response) => {
          if (response?.ok) {
            status.textContent = `保存しました。${response.count} 件の追加 JS はページ再読み込み後に反映されます。`;
            return;
          }

          if (response?.errors?.length) {
            status.textContent = `保存しました。${response.count} 件を登録し、${response.errors.length} 件は JS エラーで登録できませんでした。`;
            return;
          }

          status.textContent = '保存しました。追加 JS の登録には Chrome の Allow User Scripts または Developer mode が必要です。';
        });
      });
    });

    renderPluginEditor();
    (document.body || document.documentElement).append(root);
    form.elements.namedItem('pluginList').focus();
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
    injectSettingsMenuItem();
    onRouteChange(() => {
      injectSettingsMenuItem();
    });
  }

  main();
})();

const DEFAULTS = {
  enabled: true,
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

const fields = {
  instanceHost: document.getElementById('instanceHost'),
  enabled: document.getElementById('enabled'),
  allowedHosts: document.getElementById('allowedHosts'),
  customCss: document.getElementById('customCss'),
  customJs: document.getElementById('customJs'),
  pluginList: document.getElementById('pluginList'),
  pluginEnabled: document.getElementById('pluginEnabled'),
  pluginName: document.getElementById('pluginName'),
};

const knownInstances = document.getElementById('knownInstances');
const status = document.getElementById('status');
let storageCache = { ...DEFAULTS, [INSTANCE_SETTINGS_KEY]: {} };
let pluginDrafts = [];
let selectedPluginIndex = 0;

function normalizeHost(value) {
  return value.trim().toLowerCase();
}

function hostFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
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

function createPlugin(code = DEFAULTS.customJs) {
  return {
    id: `plugin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: '新しいプラグイン',
    enabled: true,
    code,
  };
}

function normalizePlugins(items) {
  const plugins = Array.isArray(items.customPlugins) ? items.customPlugins : [];
  const normalized = plugins.map((plugin, index) => ({
    id: String(plugin?.id || `plugin-${index + 1}`),
    name: String(plugin?.name || `プラグイン ${index + 1}`),
    enabled: plugin?.enabled !== false,
    code: String(plugin?.code ?? ''),
  }));

  if (normalized.length > 0) return normalized;
  return [createPlugin(items.customJs ?? DEFAULTS.customJs)];
}

function settingsForHost(host) {
  const instances = storageCache[INSTANCE_SETTINGS_KEY] ?? {};
  return {
    ...DEFAULTS,
    ...legacySettings(storageCache),
    ...(instances[host] ?? {}),
  };
}

function renderKnownInstances() {
  const hosts = Object.keys(storageCache[INSTANCE_SETTINGS_KEY] ?? {}).sort();
  knownInstances.textContent = '';
  for (const host of hosts) {
    const option = document.createElement('option');
    option.value = host;
    knownInstances.append(option);
  }
}

function render(items) {
  persistSelectedPlugin();
  fields.instanceHost.value = items.instanceHost ?? fields.instanceHost.value;
  fields.enabled.checked = items.enabled;
  fields.allowedHosts.value = items.allowedHosts;
  fields.customCss.value = items.customCss;
  pluginDrafts = normalizePlugins(items);
  selectedPluginIndex = 0;
  renderPluginEditor();
}

function collect() {
  persistSelectedPlugin();
  return {
    enabled: fields.enabled.checked,
    allowedHosts: fields.allowedHosts.value,
    customCss: fields.customCss.value,
    customJs: pluginDrafts[0]?.code ?? '',
    customPlugins: pluginDrafts.map((plugin) => ({ ...plugin })),
  };
}

function currentPlugin() {
  return pluginDrafts[selectedPluginIndex] ?? null;
}

function persistSelectedPlugin() {
  const plugin = currentPlugin();
  if (!plugin || !fields.pluginName) return;

  plugin.enabled = fields.pluginEnabled.checked;
  plugin.name = fields.pluginName.value.trim() || `プラグイン ${selectedPluginIndex + 1}`;
  plugin.code = fields.customJs.value;
}

function renderPluginEditor() {
  fields.pluginList.textContent = '';
  pluginDrafts.forEach((plugin, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${plugin.enabled ? '✓' : '×'} ${plugin.name || `プラグイン ${index + 1}`}`;
    fields.pluginList.append(option);
  });

  if (selectedPluginIndex >= pluginDrafts.length) {
    selectedPluginIndex = Math.max(0, pluginDrafts.length - 1);
  }

  fields.pluginList.value = String(selectedPluginIndex);
  const plugin = currentPlugin();
  const disabled = !plugin;
  fields.pluginEnabled.disabled = disabled;
  fields.pluginName.disabled = disabled;
  fields.customJs.disabled = disabled;
  document.getElementById('removePlugin').disabled = pluginDrafts.length <= 1;

  fields.pluginEnabled.checked = plugin?.enabled ?? false;
  fields.pluginName.value = plugin?.name ?? '';
  fields.customJs.value = plugin?.code ?? '';
}

function currentHost() {
  return normalizeHost(fields.instanceHost.value);
}

function renderCurrentHost() {
  const host = currentHost();
  if (!host) return;
  render({ instanceHost: host, ...settingsForHost(host) });
  status.textContent = `${host} の設定を表示しています。`;
}

function saveCurrentHost(nextSettings, callback) {
  const host = currentHost();
  if (!host) {
    status.textContent = '設定対象インスタンスを入力してください。';
    return;
  }

  const instances = storageCache[INSTANCE_SETTINGS_KEY] ?? {};
  const nextInstances = {
    ...instances,
    [host]: {
      ...DEFAULTS,
      ...instances[host],
      ...nextSettings,
    },
  };

  chrome.storage.local.set({ [INSTANCE_SETTINGS_KEY]: nextInstances }, () => {
    storageCache = { ...storageCache, [INSTANCE_SETTINGS_KEY]: nextInstances };
    renderKnownInstances();
    callback?.(host);
  });
}

function detectActiveHost() {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.tabs?.query) {
      resolve('');
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(hostFromUrl(tabs[0]?.url ?? ''));
    });
  });
}

function syncUserScripts(callback) {
  chrome.runtime.sendMessage({ type: 'mkp-sync-user-scripts' }, (response) => {
    callback?.(response ?? { ok: false, reason: chrome.runtime.lastError?.message ?? 'No response' });
  });
}

async function init() {
  chrome.storage.local.get({ ...DEFAULTS, [INSTANCE_SETTINGS_KEY]: {} }, async (items) => {
    storageCache = items;
    renderKnownInstances();

    const activeHost = await detectActiveHost();
    const firstKnownHost = Object.keys(items[INSTANCE_SETTINGS_KEY] ?? {}).sort()[0] ?? '';
    const host = activeHost || firstKnownHost;

    if (host) {
      render({ instanceHost: host, ...settingsForHost(host) });
      status.textContent = `${host} の設定を表示しています。`;
    } else {
      render({ instanceHost: '', ...legacySettings(items) });
      status.textContent = '設定対象インスタンスを入力してください。';
    }
  });
}

document.getElementById('save').addEventListener('click', () => {
  saveCurrentHost(collect(), (host) => {
    syncUserScripts((response) => {
      if (response?.ok) {
        status.textContent = `${host} の設定を保存しました。${response.count} 件の追加 JS は対象ページの再読み込み後に反映されます。`;
        return;
      }

      if (response?.errors?.length) {
        status.textContent = `${host} の設定を保存しました。${response.count} 件を登録し、${response.errors.length} 件は JS エラーで登録できませんでした。`;
        return;
      }

      status.textContent = `${host} の設定を保存しました。追加 JS の登録には Chrome の Allow User Scripts または Developer mode が必要です。`;
    });
  });
});

document.getElementById('reset').addEventListener('click', () => {
  render(DEFAULTS);
  saveCurrentHost(DEFAULTS, (host) => {
    syncUserScripts();
    status.textContent = `${host} の設定を初期値に戻しました。追加 JS は対象ページの再読み込み後に反映されます。`;
  });
});

fields.instanceHost.addEventListener('change', renderCurrentHost);

fields.pluginList.addEventListener('change', () => {
  persistSelectedPlugin();
  selectedPluginIndex = Number(fields.pluginList.value) || 0;
  renderPluginEditor();
});

fields.pluginEnabled.addEventListener('change', () => {
  persistSelectedPlugin();
  renderPluginEditor();
});

fields.pluginName.addEventListener('input', () => {
  persistSelectedPlugin();
  const option = fields.pluginList.options[selectedPluginIndex];
  if (option) {
    const plugin = currentPlugin();
    option.textContent = `${plugin.enabled ? '✓' : '×'} ${plugin.name || `プラグイン ${selectedPluginIndex + 1}`}`;
  }
});

document.getElementById('addPlugin').addEventListener('click', () => {
  persistSelectedPlugin();
  pluginDrafts.push(createPlugin(''));
  selectedPluginIndex = pluginDrafts.length - 1;
  renderPluginEditor();
  fields.pluginName.focus();
});

document.getElementById('removePlugin').addEventListener('click', () => {
  if (pluginDrafts.length <= 1) return;

  pluginDrafts.splice(selectedPluginIndex, 1);
  selectedPluginIndex = Math.max(0, selectedPluginIndex - 1);
  renderPluginEditor();
});

init();

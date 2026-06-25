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
    '// Runs in the extension content-script world after Misskey is detected.',
    '// Available arguments: window, document, api',
    'api.markNotes();',
    'api.onRouteChange(() => api.markNotes());',
  ].join('\n'),
};

const INSTANCE_SETTINGS_KEY = 'instanceSettings';

const fields = {
  instanceHost: document.getElementById('instanceHost'),
  enabled: document.getElementById('enabled'),
  showBadge: document.getElementById('showBadge'),
  allowedHosts: document.getElementById('allowedHosts'),
  customCss: document.getElementById('customCss'),
  customJs: document.getElementById('customJs'),
};

const knownInstances = document.getElementById('knownInstances');
const status = document.getElementById('status');
let storageCache = { ...DEFAULTS, [INSTANCE_SETTINGS_KEY]: {} };

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
    showBadge: items.showBadge ?? DEFAULTS.showBadge,
    allowedHosts: items.allowedHosts ?? DEFAULTS.allowedHosts,
    customCss: items.customCss ?? DEFAULTS.customCss,
    customJs: items.customJs ?? DEFAULTS.customJs,
  };
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
  fields.instanceHost.value = items.instanceHost ?? fields.instanceHost.value;
  fields.enabled.checked = items.enabled;
  fields.showBadge.checked = items.showBadge;
  fields.allowedHosts.value = items.allowedHosts;
  fields.customCss.value = items.customCss;
  fields.customJs.value = items.customJs;
}

function collect() {
  return {
    enabled: fields.enabled.checked,
    showBadge: fields.showBadge.checked,
    allowedHosts: fields.allowedHosts.value,
    customCss: fields.customCss.value,
    customJs: fields.customJs.value,
  };
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
    status.textContent = `${host} の設定を保存しました。対象ページを再読み込みしてください。`;
  });
});

document.getElementById('reset').addEventListener('click', () => {
  render(DEFAULTS);
  saveCurrentHost(DEFAULTS, (host) => {
    status.textContent = `${host} の設定を初期値に戻しました。`;
  });
});

fields.instanceHost.addEventListener('change', renderCurrentHost);

init();

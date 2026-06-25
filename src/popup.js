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

const enabled = document.getElementById('enabled');
const showBadge = document.getElementById('showBadge');
const instanceHost = document.getElementById('instanceHost');
const status = document.getElementById('status');
let currentHost = '';
let storageCache = { ...DEFAULTS, [INSTANCE_SETTINGS_KEY]: {} };

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

function render(items) {
  enabled.checked = items.enabled;
  showBadge.checked = items.showBadge;
}

function detectActiveHost() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(hostFromUrl(tabs[0]?.url ?? ''));
    });
  });
}

async function init() {
  chrome.storage.local.get({ ...DEFAULTS, [INSTANCE_SETTINGS_KEY]: {} }, async (items) => {
    storageCache = items;
    currentHost = await detectActiveHost();

    if (!currentHost) {
      instanceHost.textContent = '対象タブを取得できませんでした。';
      enabled.disabled = true;
      showBadge.disabled = true;
      return;
    }

    instanceHost.textContent = currentHost;
    render(settingsForHost(currentHost));
  });
}

function save() {
  if (!currentHost) return;

  const instances = storageCache[INSTANCE_SETTINGS_KEY] ?? {};
  const nextInstances = {
    ...instances,
    [currentHost]: {
      ...DEFAULTS,
      ...instances[currentHost],
      enabled: enabled.checked,
      showBadge: showBadge.checked,
    },
  };

  chrome.storage.local.set({ [INSTANCE_SETTINGS_KEY]: nextInstances }, () => {
    storageCache = { ...storageCache, [INSTANCE_SETTINGS_KEY]: nextInstances };
    status.textContent = `${currentHost} に保存しました。ページを再読み込みすると反映されます。`;
  });
}

enabled.addEventListener('change', save);
showBadge.addEventListener('change', save);

document.getElementById('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

init();

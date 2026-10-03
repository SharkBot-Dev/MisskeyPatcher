import { DEFAULTS, INSTANCE_SETTINGS_KEY } from './defaults.js';

export function currentInstanceHost() {
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

function settingsForHost(items, host = currentInstanceHost()) {
  const instances = items[INSTANCE_SETTINGS_KEY] ?? {};
  return {
    ...DEFAULTS,
    ...legacySettings(items),
    ...(instances[host] ?? {}),
  };
}

export function getChromeStorage() {
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

export function setCurrentInstanceSettings(nextSettings, callback) {
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

export function hostIsAllowed(allowedHosts) {
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

import { startUpExecute } from "./patchs.js"

const DEFAULTS = {
    enabled: true,
    hiddenUserName: false,
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

function currentInstanceHost() {
    return location.hostname.toLowerCase();
}

function legacySettings(items) {
    return {
      enabled: items.enabled ?? DEFAULTS.enabled,
      hiddenUserName: items.hiddenUserName ?? DEFAULTS.hiddenUserName,
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

const replacements = new Map();
let observer;
let executionId = 0;
let registered = false;

async function execute() {
    const id = ++executionId;
    const settings = await getChromeStorage();
    if (id !== executionId) return;

    observer?.disconnect();
    // for (const [node, { original, replacement }] of replacements) {
    //     if (node.nodeValue === replacement) node.nodeValue = original;
    // }
    replacements.clear();
    if (!settings.enabled || !settings.addUserChan || !document.body) return;

    const options = { childList: true, characterData: true, subtree: true };
    function addChan() {
        observer.disconnect();

        const userNameSpan = document.querySelectorAll("a[href^='/@'] span")

        try {
            userNameSpan.forEach((userName) => {
                if (userName.textContent.endsWith("ちゃん")) return;
                userName.textContent += "ちゃん"
            })
        } finally {
            observer.observe(document.body, options);
        }
    }
    observer = new MutationObserver(addChan);
    addChan();
    observer.observe(document.body, options);
}

export default function register() {
    if (registered) return;
    registered = true;
    startUpExecute.push(execute);
    globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
        if (areaName === 'local' && (changes[INSTANCE_SETTINGS_KEY] || changes.addUserChan || changes.enabled)) {
            void execute();
        }
    });
    document.addEventListener('DOMContentLoaded', () => void execute(), { once: true });
}

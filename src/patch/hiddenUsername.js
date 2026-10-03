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

function replaceTextInPage(targetText, replacementText) {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function (node) {
                if (node.parentElement?.closest('script, style, noscript, textarea, [contenteditable]:not([contenteditable="false"])')) {
                return NodeFilter.FILTER_REJECT;
                }
                const matches = typeof targetText === 'string'
                ? node.nodeValue.includes(targetText)
                : targetText.test(node.nodeValue);

                return matches ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            }
        }
    );

    const nodesToReplace = [];
    while (walker.nextNode()) {
        nodesToReplace.push(walker.currentNode);
    }

    nodesToReplace.forEach(node => {
        const original = node.nodeValue;
        if (typeof targetText === 'string') {
            node.nodeValue = node.nodeValue.replaceAll(targetText, replacementText);
        } else {
            node.nodeValue = node.nodeValue.replace(targetText, replacementText);
        }
        replacements.set(node, { original, replacement: node.nodeValue });
    });
}

async function execute() {
    const id = ++executionId;
    const settings = await getChromeStorage();
    if (id !== executionId) return;

    observer?.disconnect();
    for (const [node, { original, replacement }] of replacements) {
        if (node.nodeValue === replacement) node.nodeValue = original;
    }
    replacements.clear();
    if (!settings.enabled || !settings.hiddenUserName || !document.body) return;

    const options = { childList: true, characterData: true, subtree: true };
    function hideUsername() {
        let account;
        try {
            account = JSON.parse(window.localStorage.getItem('account'));
        } catch {
            return;
        }
        if (typeof account?.username !== 'string' || !account.username || !account.name) return;

        observer.disconnect();
        try {
            for (const [node, record] of replacements) {
                if (!node.isConnected || node.nodeValue !== record.replacement) replacements.delete(node);
            }
            replaceTextInPage('@' + account.username, '非表示');
            replaceTextInPage(account.name, '非表示');
        } finally {
            observer.observe(document.body, options);
        }
    }
    observer = new MutationObserver(hideUsername);
    hideUsername();
    observer.observe(document.body, options);
}

export default function register() {
    if (registered) return;
    registered = true;
    startUpExecute.push(execute);
    globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
        if (areaName === 'local' && (changes[INSTANCE_SETTINGS_KEY] || changes.hiddenUserName || changes.enabled)) {
            void execute();
        }
    });
    document.addEventListener('DOMContentLoaded', () => void execute(), { once: true });
}

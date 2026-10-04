const patchs = [
    {
        patchName: "ユーザー名非表示 (ユーザー名を非表示にします。配信時などに！)",
        patchId: "hiddenUserName"
    }
];

const INSTANCE_SETTINGS_KEY = 'instanceSettings';

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

export async function openDefaultPrivacyPatchWindow() {
    document.getElementById('mkp-inline-settings')?.remove();
    const root = document.createElement('div');
    root.id = 'mkp-inline-settings';

    let patchSettingNode = []
    const setting = await getChromeStorage();
    // console.log(setting)
    patchs.forEach(async (patch) => {
        let checked = false;
        if (setting[patch.patchId]) {
            checked = true;
        }
        patchSettingNode.push(`<label class="mkp-check"><input name="enabled" type="checkbox" class="mkp-` + patch.patchId + `" ` + (checked ? "checked" : "") + `> <span>` + patch.patchName + `</span></label>`);
    })
    
    root.innerHTML = [
      '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
      '<section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">',
      '  <header class="mkp-inline-header">',
      '    <div>',
      '      <h2 id="mkp-plugin-title">プライバシー的なパッチ</h2>',
      `      <p>${currentInstanceHost()}</p>`,
      '    </div>',
      '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
      '  </header>',
      '  <div style="padding: 18px 20px 14px;" class="mkp-inline-form mkp-plugin-form">',
      patchSettingNode.join(` `),
      `<div class="mkp-inline-actions"><button mkp-saveDefaltPatch="true">保存</button></div>`,
      '  </div>',
      '</section>',
    ].join('');

    function close() {
      root.remove();
    }

    root.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-mkp-close="true"]')) close();

        if (target?.closest('[mkp-saveDefaltPatch="true"]')) {
            const saveData = {}

            patchs.forEach(async (patch) => {
                const className = `mkp-` + patch.patchId
                const element = document.getElementsByClassName(className)[0]
                saveData[patch.patchId] = element.checked
            });

            setCurrentInstanceSettings(saveData, (callback) => {
                console.log("保存しました。")
            })
        }
    });

    (document.body || document.documentElement).append(root);
    // form.elements.namedItem('pluginList').focus();
}
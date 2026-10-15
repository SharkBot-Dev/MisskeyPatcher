import { openReversiSettingWindow } from './reversiSetting.js';

const patchs = [];

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

export async function openDefaultFunPatchWindow() {
  document.getElementById('mkp-inline-settings')?.remove();

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

  const root = document.createElement('div');
  root.id = 'mkp-inline-settings';
  root.innerHTML = `<div class="mkp-inline-backdrop" data-mkp-close="true"></div>
    <section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-fun-title">
      <header class="mkp-inline-header"><div><h2 id="mkp-fun-title">楽しい機能設定</h2></div>
        <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>
      </header>
      <div class="mkp-inline-form mkp-plugin-form" style="padding:18px 20px">
        ${patchSettingNode.join(" ")}
        <div class="mkp-inline-actions"><button type="button" data-reversi-settings>自動リバーシ設定</button></div>
      </div>
    </section>`;

  root.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-mkp-close]')) root.remove();
    if (event.target.closest('[data-reversi-settings]')) void openReversiSettingWindow();

    root.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-mkp-close="true"]')) close();

        if (target?.closest('[mkp-changeFont="true"]')) {
            close();
            openFontReplacerWindow();
            return
        }

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

  });
  root.addEventListener('keydown', event => { if (event.key === 'Escape') root.remove(); });
  (document.body || document.documentElement).append(root);
  root.querySelector('[data-reversi-settings]').focus();
}

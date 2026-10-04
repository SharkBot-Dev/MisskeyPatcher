import { installStyle } from "./../content/styles.js";

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

export async function openFontReplacerWindow() {
    document.getElementById('mkp-inline-settings')?.remove();
    const root = document.createElement('div');
    root.id = 'mkp-inline-settings';

    const setting = await getChromeStorage();
    // console.log(setting)
    
    root.innerHTML = [
      '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
      '<section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">',
      '  <header class="mkp-inline-header">',
      '    <div>',
      '      <h2 id="mkp-plugin-title">フォントを変更</h2>',
      `      <p>${currentInstanceHost()}</p>`,
      '    </div>',
      '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
      '  </header>',
      '  <div style="padding: 18px 20px 14px;" class="mkp-inline-form mkp-plugin-form">',
      `    <label><span>フォント名</span><input name="fontName" type="text" placeholder="ゴシック" value="${setting.customFontName ? setting.customFontName : ""}"></label>`,
      `    <label><span>フォントCSS</span><textarea name="fontCss" class="mkp-code" spellcheck="false">${setting.customFontCss ? setting.customFontCss : ""}</textarea></label>`,
      `    <label><span>フォントRaw</span><textarea name="fontRaw" class="mkp-code" spellcheck="false">${setting.customFontRaw ? setting.customFontRaw : ""}</textarea></label>`,
      `    <div class="mkp-inline-actions"><button mkp-saveDefaltPatch="true">保存</button></div>`,
      '  </div>',
      '</section>',
    ].join('');

    // const fontRaw = document.getElementsByName("fontRaw")[0]
    // const fontName = document.getElementsByName("fontName")[0]
    // const fontCss = document.getElementsByName("fontCss")[0]

    function close() {
      root.remove();
    }

    const observer = new MutationObserver((mutations, obs) => {
        const fontRaw = document.getElementsByName("fontRaw")[0]
        const fontName = document.getElementsByName("fontName")[0]
        const fontCss = document.getElementsByName("fontCss")[0]

        if (fontName && fontCss && fontRaw) {
            obs.disconnect();

            fontName.addEventListener('change', (fontNameElement) => {
                fontRaw.value = `${fontCss.value}

body {
    font-family: "${fontNameElement.target.value}", sans-serif;
    font-style: normal;
}
`
            })

            fontCss.addEventListener('change', (fontCssElement) => {
                fontRaw.value = `${fontCssElement.target.value}

body {
    font-family: "${fontName.value}", sans-serif;
    font-style: normal;
}
`
            })
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    root.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-mkp-close="true"]')) close();

        if (target?.closest('[mkp-saveDefaltPatch="true"]')) {
            const saveData = {}

            const fontRaw = document.getElementsByName("fontRaw")[0]
            const fontName = document.getElementsByName("fontName")[0]
            const fontCss = document.getElementsByName("fontCss")[0]

            if (!fontName.value || !fontCss.value || !fontRaw.value) {
                alert("フォント名とCSSを入力する必要があります。")
                return
            }

            saveData["customFontRaw"] = fontRaw.value
            saveData["customFontName"] = fontName.value
            saveData["customFontCss"] = fontCss.value
            
            setCurrentInstanceSettings(saveData, (callback) => {
                console.log("保存しました。")
            })

            if (saveData.customFontRaw) {
                installStyle('mkp-custom-font', saveData.customFontRaw);
            }
        }
    });

    (document.body || document.documentElement).append(root);
    // form.elements.namedItem('pluginList').focus();
}
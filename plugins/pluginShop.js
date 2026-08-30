const PLUGINS_JSON_URL = "https://raw.githubusercontent.com/SharkBot-Dev/MisskeyPatcher-PluginsShop/refs/heads/main/plugins.json";

const downloadScript = document.createElement("script")
downloadScript.innerHTML = `
async function downloadPlugin(js_name, pluginUrl) {
    const blob = await (await fetch(pluginUrl)).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = js_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
`;
document.body.append()

async function openPluginsList() {
    document.getElementById('mkp-inline-settings')?.remove();

    const res = await fetch(PLUGINS_JSON_URL);
    const json = await res.json();

    const root = document.createElement('div');

    // href="${value.js_path}" download="${value.name}.js"

    const shops = json.plugins.map((value) => `<div>
<h3>${value.name} (by ${value.owner})</h3>
<label>${value.description}</label><br/>
<button onclick="
async function run() {
    const a = document.createElement('a');
    a.href = '${value.js_path}';
    a.download = '${value.name}.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

run()
" style="
  min-height: 34px;
  border: 0;
  border-radius: 6px;
  padding: 0 12px;
  background: var(--MI_THEME-buttonBg, rgb(128 128 128 / 18%));
  color: inherit;
  cursor: pointer;
  font-weight: 700;
">ダウンロード！</a>
<br/><br/>
</div>`)

    root.innerHTML = `
<div class="mkp-inline-backdrop" data-mkp-close="true"></div>
<section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">
  <header class="mkp-inline-header">
    <div>
      <h2 id="mkp-plugin-title">プラグインショップ</h2>
    </div>
    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>
  </header>

  <div style="padding: 18px 20px 14px;">
  ${shops.join(" ")}
  </div>
</section>
`

    function close() {
        root.remove();
    }

    root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-mkp-close="true"]')) close();
    });

    (document.body || document.documentElement).append(root);
}

api.registerSettingsItem({
  id: 'open-plugins-shop',
  name: 'プラグインショップ',
  icon: 'ti ti-adjustments ti-fw',
  order: 120,
}, () => {
  openPluginsList();
});
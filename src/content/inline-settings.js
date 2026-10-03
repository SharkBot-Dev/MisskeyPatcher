import { getChromeStorage, currentInstanceHost, setCurrentInstanceSettings } from './storage.js';
import { fieldValue, syncUserScripts } from './form-utils.js';
import { DEFAULTS } from './defaults.js';
import { installStyle } from './styles.js';

export async function openInlineSettings() {
  document.getElementById('mkp-inline-settings')?.remove();
  const settings = await getChromeStorage();

  const root = document.createElement('div');
  root.id = 'mkp-inline-settings';
  root.innerHTML = [
    '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
    '<section class="mkp-inline-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-inline-title">',
    '  <header class="mkp-inline-header">',
    '    <div>',
    '      <h2 id="mkp-inline-title">MisskeyTools設定</h2>',
    `      <p>${currentInstanceHost()}</p>`,
    '    </div>',
    '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
    '  </header>',
    '  <form class="mkp-inline-form">',
    '    <label class="mkp-check"><input name="enabled" type="checkbox"> <span>有効</span></label>',
    '    <label><span>対象ホスト</span><textarea name="allowedHosts" spellcheck="false" placeholder="空欄なら Misskey 判定された全ホスト"></textarea></label>',
    '    <label><span>追加 CSS</span><textarea name="customCss" class="mkp-code" spellcheck="false"></textarea></label>',
    '    <div class="mkp-inline-actions">',
    '      <button type="submit">保存</button>',
    '      <button type="button" data-mkp-reset="true">初期値に戻す</button>',
    '    </div>',
    '    <p class="mkp-inline-status" role="status"></p>',
    '  </form>',
    '</section>',
  ].join('');

  const form = root.querySelector('form');
  const status = root.querySelector('.mkp-inline-status');

  function render(values) {
    form.elements.namedItem('enabled').checked = values.enabled;
    form.elements.namedItem('allowedHosts').value = values.allowedHosts;
    form.elements.namedItem('customCss').value = values.customCss;
  }

  function collect() {
    return {
      enabled: form.elements.namedItem('enabled').checked,
      allowedHosts: fieldValue(form, 'allowedHosts'),
      customCss: fieldValue(form, 'customCss'),
    };
  }

  function close() {
    root.remove();
  }

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-mkp-close="true"]')) close();
    if (target?.closest('[data-mkp-reset="true"]')) {
      const basicDefaults = {
        enabled: DEFAULTS.enabled,
        allowedHosts: DEFAULTS.allowedHosts,
        customCss: DEFAULTS.customCss,
      };
      render({ ...settings, ...basicDefaults });
      setCurrentInstanceSettings(basicDefaults, () => {
        installStyle('mkp-custom-style', basicDefaults.customCss);
        syncUserScripts();
        status.textContent = '基本設定を初期値に戻しました。';
      });
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nextSettings = collect();

    setCurrentInstanceSettings(nextSettings, () => {
      installStyle('mkp-custom-style', nextSettings.customCss);
      syncUserScripts((response) => {
        if (response?.ok) {
          status.textContent = `保存しました。CSS は反映済み、${response.count} 件の追加`;
          return;
        }

        if (response?.errors?.length) {
          status.textContent = `保存しました。${response.count} 件を登録し、${response.errors.length} 件は JS エラーで登録できませんでした。`;
          return;
        }

        status.textContent = `保存しました。`;
      });
    });
  });

  render(settings);
  (document.body || document.documentElement).append(root);
  form.elements.namedItem('enabled').focus();
}

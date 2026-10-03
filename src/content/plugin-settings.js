import { getChromeStorage, currentInstanceHost, setCurrentInstanceSettings } from './storage.js';
import { normalizePlugins, createPlugin, readTextFile, pluginNameFromFileName } from './plugins.js';
import { fieldValue, syncUserScripts } from './form-utils.js';

export async function openPluginSettings() {
  document.getElementById('mkp-inline-settings')?.remove();
  const settings = await getChromeStorage();
  let plugins = normalizePlugins(settings);
  let selectedIndex = 0;

  const root = document.createElement('div');
  root.id = 'mkp-inline-settings';
  root.innerHTML = [
    '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
    '<section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">',
    '  <header class="mkp-inline-header">',
    '    <div>',
    '      <h2 id="mkp-plugin-title">MisskeyToolsプラグイン設定</h2>',
    `      <p>${currentInstanceHost()}</p>`,
    '    </div>',
    '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
    '  </header>',
    '  <form class="mkp-inline-form mkp-plugin-form">',
    '    <div class="mkp-plugin-toolbar">',
    '      <button type="button" data-mkp-add-plugin="true">追加</button>',
    '      <button type="button" data-mkp-upload-plugin="true">.jsを読み込み</button>',
    '      <button type="button" data-mkp-remove-plugin="true">削除</button>',
    '    </div>',
    '    <input class="mkp-visually-hidden" name="pluginFile" type="file" accept=".js,text/javascript,application/javascript">',
    '    <label><span>プラグイン一覧</span><select name="pluginList" size="6"></select></label>',
    '    <label class="mkp-check"><input name="pluginEnabled" type="checkbox"> <span>このプラグインを有効にする</span></label>',
    '    <label><span>プラグイン名</span><input name="pluginName" type="text" placeholder="タイムライン調整"></label>',
    '    <label><span>JavaScript</span><textarea name="pluginCode" class="mkp-code" spellcheck="false"></textarea></label>',
    '    <div class="mkp-inline-actions">',
    '      <button type="submit">保存</button>',
    '    </div>',
    '    <p class="mkp-inline-status" role="status">Chrome拡張機能の設定を開き、MisskeyToolsを開き、<br>「ユーザー スクリプトを許可する」を有効にしてください。</p>',
    '  </form>',
    '</section>',
  ].join('');

  const form = root.querySelector('form');
  const status = root.querySelector('.mkp-inline-status');
  const removeButton = root.querySelector('[data-mkp-remove-plugin="true"]');

  function currentPlugin() {
    return plugins[selectedIndex] ?? null;
  }

  function persistCurrentPlugin() {
    const plugin = currentPlugin();
    if (!plugin) return;

    plugin.enabled = form.elements.namedItem('pluginEnabled').checked;
    plugin.name = fieldValue(form, 'pluginName').trim() || `プラグイン ${selectedIndex + 1}`;
    plugin.code = fieldValue(form, 'pluginCode');
  }

  function renderPluginList() {
    const list = form.elements.namedItem('pluginList');
    list.textContent = '';
    plugins.forEach((plugin, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${plugin.enabled ? '✓' : '×'} ${plugin.name || `プラグイン ${index + 1}`}`;
      list.append(option);
    });
    list.value = String(selectedIndex);
    removeButton.disabled = plugins.length <= 1;
  }

  function renderPluginEditor() {
    if (selectedIndex >= plugins.length) selectedIndex = Math.max(0, plugins.length - 1);
    renderPluginList();

    const plugin = currentPlugin();
    form.elements.namedItem('pluginEnabled').checked = plugin?.enabled ?? false;
    form.elements.namedItem('pluginName').value = plugin?.name ?? '';
    form.elements.namedItem('pluginCode').value = plugin?.code ?? '';
  }

  function close() {
    root.remove();
  }

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-mkp-close="true"]')) close();

    if (target?.closest('[data-mkp-add-plugin="true"]')) {
      persistCurrentPlugin();
      plugins.push(createPlugin());
      selectedIndex = plugins.length - 1;
      renderPluginEditor();
      form.elements.namedItem('pluginName').focus();
    }

    if (target?.closest('[data-mkp-upload-plugin="true"]')) {
      form.elements.namedItem('pluginFile').click();
    }

    if (target?.closest('[data-mkp-remove-plugin="true"]')) {
      if (plugins.length <= 1) return;
      plugins.splice(selectedIndex, 1);
      selectedIndex = Math.max(0, selectedIndex - 1);
      renderPluginEditor();
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  form.elements.namedItem('pluginList').addEventListener('change', () => {
    persistCurrentPlugin();
    selectedIndex = Number(form.elements.namedItem('pluginList').value) || 0;
    renderPluginEditor();
  });

  form.elements.namedItem('pluginEnabled').addEventListener('change', () => {
    persistCurrentPlugin();
    renderPluginList();
  });

  form.elements.namedItem('pluginName').addEventListener('input', () => {
    persistCurrentPlugin();
    renderPluginList();
  });

  form.elements.namedItem('pluginFile').addEventListener('change', async () => {
    const input = form.elements.namedItem('pluginFile');
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!/\.js$/i.test(file.name)) {
      status.textContent = '.js ファイルを選択してください。';
      return;
    }

    try {
      const code = await readTextFile(file);
      persistCurrentPlugin();
      plugins.push(createPlugin(code, pluginNameFromFileName(file.name)));
      selectedIndex = plugins.length - 1;
      renderPluginEditor();
      status.textContent = `${file.name} をプラグインとして読み込みました。保存すると反映されます。`;
      form.elements.namedItem('pluginName').focus();
    } catch (error) {
      status.textContent = `ファイルを読み込めませんでした: ${error.message}`;
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    persistCurrentPlugin();
    setCurrentInstanceSettings({
      customJs: plugins[0]?.code ?? '',
      customPlugins: plugins.map((plugin) => ({ ...plugin })),
    }, () => {
      syncUserScripts((response) => {
        if (response?.ok) {
          status.textContent = `保存しました。${response.count} 件の追加 JS はページ再読み込み後に反映されます。`;
          return;
        }

        if (response?.errors?.length) {
          status.textContent = `保存しました。${response.count} 件を登録し、${response.errors.length} 件は JS エラーで登録できませんでした。`;
          return;
        }

        status.textContent = '保存しました。追加 JS の登録には Chrome の Allow User Scripts または Developer mode が必要です。';
      });
    });
  });

  renderPluginEditor();
  (document.body || document.documentElement).append(root);
  form.elements.namedItem('pluginList').focus();
}

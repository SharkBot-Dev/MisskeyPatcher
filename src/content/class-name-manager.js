import { classNames, metaData, setClassNameOverrides } from '../className/default.js';

const STORAGE_KEY = 'classNameOverrides';

function flatten(values, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(values)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result[path] = value;
    else if (value && typeof value === 'object') flatten(value, path, result);
  }
  return result;
}

function isAvailableForHost() {
  return !metaData.instance || metaData.instance === 'default'
    || location.hostname.toLowerCase() === metaData.instance.toLowerCase();
}

export function openClassNameManager() {
  if (!isAvailableForHost()) return;
  document.getElementById('mkp-class-name-manager')?.remove();

  chrome.storage.local.get({ [STORAGE_KEY]: {} }, (stored) => {
    const overrides = stored[STORAGE_KEY] || {};
    setClassNameOverrides(overrides);
    const root = document.createElement('div');
    root.id = 'mkp-class-name-manager';
    root.innerHTML = `
      <div class="mkp-inline-backdrop" data-mkp-close="true"></div>
      <section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">
        <header class="mkp-inline-header">
        <div>
          <h2 id="mkp-plugin-title">クラス名管理</h2>
          <p style="color: white;">Misskey画面で使うクラス名を編集します。空欄はデフォルト値を使います。</p>
        </div>
          <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button></header>
        <div class="mkp-class-name-list"></div>
        <footer class="mkp-inline-actions" style="padding: 10px;">
        <button type="button" data-mkp-reset>上書きを削除</button><button type="button" data-mkp-save>保存</button>
        <p class="mkp-inline-status" role="status" style="padding: 10px;"></p>
        </footer>
      </section>`;

    const list = root.querySelector('.mkp-class-name-list');
    const defaults = flatten(classNames);
    for (const [path, defaultValue] of Object.entries(defaults)) {
      const label = document.createElement('label');
      label.className = 'mkp-class-name-row';
      const title = document.createElement('span');
      title.textContent = path;
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.classPath = path;
      input.value = overrides[path] ?? defaultValue;
      input.placeholder = defaultValue;
      label.append(title, input);
      list.append(label);
    }

    const close = () => root.remove();
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-mkp-close="true"]')) close();
      if (event.target.closest('[data-mkp-reset]')) {
        chrome.storage.local.remove(STORAGE_KEY, () => {
          setClassNameOverrides({});
          root.querySelectorAll('input[data-class-path]').forEach((input) => { input.value = defaults[input.dataset.classPath]; });
          root.querySelector('.mkp-inline-status').textContent = '上書きを削除しました。';
        });
      }
      if (event.target.closest('[data-mkp-save]')) {
        const next = {};
        root.querySelectorAll('input[data-class-path]').forEach((input) => {
          const value = input.value.trim();
          if (value && value !== defaults[input.dataset.classPath]) next[input.dataset.classPath] = value;
        });
        chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
          setClassNameOverrides(next);
          root.querySelector('.mkp-inline-status').textContent = '保存しました。画面を再読み込みすると反映されます。';
        });
      }
    });
    (document.body || document.documentElement).append(root);
  });
}

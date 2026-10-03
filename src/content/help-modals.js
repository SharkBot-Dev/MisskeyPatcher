import { currentInstanceHost } from './storage.js';

export async function openReadyModal() {
  document.getElementById('mkp-inline-settings')?.remove();
  const root = document.createElement('div');
  root.id = 'mkp-inline-settings';
  root.innerHTML = [
    '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
    '<section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">',
    '  <header class="mkp-inline-header">',
    '    <div>',
    '      <h2 id="mkp-plugin-title">最初にお読みください</h2>',
    `      <p>${currentInstanceHost()}</p>`,
    '    </div>',
    '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
    '  </header>',
    '  <div style="padding: 18px 20px 14px;">',
    '    <h3>プラグインが正しく動作するために</h3>',
    '    Chrome拡張機能の設定を開き、MisskeyToolsを開き、<br>「ユーザー スクリプトを許可する」を有効にしてください。',
    '    <h3>どこでプラグインを入手すればいい？</h3>',
    '    <button data-mkp-get-plugin="true">このページから入手できます。</a>',
    '  </div>',
    '</section>',
  ].join('');

  function close() {
    root.remove();
  }

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-mkp-close="true"]')) close();

    if (target?.closest('[data-mkp-get-plugin="true"]')) {
      location.href = "https://github.com/SharkBot-Dev/MisskeyPatcher/tree/main/plugins"
    }
  });

  (document.body || document.documentElement).append(root);
  root.querySelector('button[data-mkp-close="true"]')?.focus();
}

export async function openDisabledUserScriptsModal() {
  document.getElementById('mkp-inline-settings')?.remove();
  const root = document.createElement('div');
  root.id = 'mkp-inline-settings';
  root.innerHTML = [
    '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
    '<section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">',
    '  <header class="mkp-inline-header">',
    '    <div>',
    '      <h2 id="mkp-plugin-title">注意！プラグインがうまく動作しない可能性があります！</h2>',
    `      <p>${currentInstanceHost()}</p>`,
    '    </div>',
    '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
    '  </header>',
    '  <div style="padding: 18px 20px 14px;">',
    '    <h3>プラグインが正しく動作するために</h3>',
    '    Chrome拡張機能の設定を開き、MisskeyToolsを開き、<br>「ユーザー スクリプトを許可する」を有効にしてください。<br>',
    '    <button data-mkp-move-setting="true">ここから有効化する</button><br><br>',
    '    ※有効後にページをリロードする必要があります。<br><br>',
    '    <button data-mkp-close="true">後で設定する（非推奨）</button><br>',
    '  </div>',
    '</section>',
  ].join('');

  function close() {
    root.remove();
  }

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-mkp-close="true"]')) close();

    if (target?.closest('[data-mkp-move-setting="true"]')) {
      chrome.runtime.sendMessage({ type: "move_setting_user_script" }, (response) => {
        console.log("設定を開く。")
      });
    }
  });

  (document.body || document.documentElement).append(root);
  root.querySelector('button[data-mkp-close="true"]')?.focus();
}

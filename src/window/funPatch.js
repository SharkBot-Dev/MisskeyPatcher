import { openReversiSettingWindow } from './reversiSetting.js';

export function openDefaultFunPatchWindow() {
  document.getElementById('mkp-inline-settings')?.remove();
  const root = document.createElement('div');
  root.id = 'mkp-inline-settings';
  root.innerHTML = `<div class="mkp-inline-backdrop" data-mkp-close="true"></div>
    <section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-fun-title">
      <header class="mkp-inline-header"><div><h2 id="mkp-fun-title">楽しい機能設定</h2></div>
        <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button></header>
      <div class="mkp-inline-form" style="padding:18px 20px">
        <div class="mkp-inline-actions"><button type="button" data-reversi-settings>自動リバーシ設定</button></div></div>
    </section>`;
  root.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-mkp-close]')) root.remove();
    if (event.target.closest('[data-reversi-settings]')) void openReversiSettingWindow();
  });
  root.addEventListener('keydown', event => { if (event.key === 'Escape') root.remove(); });
  (document.body || document.documentElement).append(root);
  root.querySelector('[data-reversi-settings]').focus();
}

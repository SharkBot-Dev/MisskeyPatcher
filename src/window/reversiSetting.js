import { getChromeStorage, setCurrentInstanceSettings } from '../content/storage.js';
import { normalizeReversiSettings } from '../patch/autoReversi.js';
import { openDefaultFunPatchWindow } from './funPatch.js';

export async function openReversiSettingWindow() {
  document.getElementById('mkp-inline-settings')?.remove();
  const root = document.createElement('div');
  root.id = 'mkp-inline-settings';
  root.innerHTML = `<div class="mkp-inline-backdrop" data-mkp-close="true"></div>
    <section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-reversi-title">
      <header class="mkp-inline-header"><div><h2 id="mkp-reversi-title">自動リバーシ設定</h2></div>
        <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button></header>
      <form class="mkp-inline-form" style="padding:18px 20px">
        <p>このインスタンスで、開いているリバーシの自分の手番に自動着手します。</p>
        <label class="mkp-check"><input name="enabled" type="checkbox">自動リバーシをOnにする</label>
        <label>着手方針<select name="strategy" class="mkp_reversi_strategy_select"><option value="position">位置を評価（辺と中央を優先）</option><option value="edge">辺を優先</option><option value="random">ランダム</option></select></label>
        <label>着手までの待機時間（ms）<input name="delayMs" type="number" min="100" max="10000" required></label>
        <label>待機時間に加えるランダム幅（ms）<input name="jitterMs" type="number" min="0" max="5000" required></label>
        <label>APIでの対戦状態の確認間隔（ms）<input name="pollMs" type="number" min="1000" max="30000" required></label>
        <label class="mkp-check"><input name="preferCorners" type="checkbox">角に置けるときは角を優先</label>
        <label class="mkp-check"><input name="avoidCornerNeighbors" type="checkbox">角の隣のマスを避ける</label>
        <p role="status" data-status></p>
        <div class="mkp-inline-actions"><button type="button" data-back>戻る</button><button type="submit">保存</button></div>
      </form>
    </section>`;
  (document.body || document.documentElement).append(root);
  const form = root.querySelector('form');
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  root.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-mkp-close]')) root.remove();
    if (event.target.closest('[data-back]')) openDefaultFunPatchWindow();
  });
  root.addEventListener('keydown', event => { if (event.key === 'Escape') root.remove(); });
  const settings = normalizeReversiSettings((await getChromeStorage()).autoReversi);
  if (!root.isConnected) return;
  for (const [key, value] of Object.entries(settings)) {
    const input = form.elements.namedItem(key);
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value;
  }
  submit.disabled = false;
  form.elements.namedItem('enabled').focus();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const next = {};
    for (const key of Object.keys(settings)) {
      const input = form.elements.namedItem(key);
      next[key] = input.type === 'checkbox' ? input.checked : input.value;
    }
    submit.disabled = true;
    setCurrentInstanceSettings({ autoReversi: normalizeReversiSettings(next) }, () => {
      const error = chrome.runtime.lastError;
      root.querySelector('[data-status]').textContent = error ? `保存できませんでした: ${error.message}` : '保存しました。設定はすぐに反映されます。';
      submit.disabled = false;
    });
  });
}


// Included in background.js by build.mjs; no separate WebView injection needed.
function toast(message) {
  const node = document.createElement('div');
  node.className = 'mkp-phone-toast';
  node.setAttribute('role', 'status');
  node.textContent = String(message);
  (document.body || document.documentElement).append(node);
  setTimeout(() => node.remove(), 5000);
}

function installPhoneControls(openSettings, openPlugins) {
  if (document.getElementById('mkp-phone-controls')) return;
  const root = document.createElement('div');
  root.id = 'mkp-phone-controls';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'MKP';
  toggle.setAttribute('aria-label', 'MisskeyPatcher メニュー');
  toggle.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.hidden = true;
  for (const [label, action] of [
    ['基本設定', openSettings],
    ['プラグイン設定', openPlugins],
    ['再読み込み', () => location.reload()],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      Promise.resolve().then(action).catch(error => toast(error.message));
    });
    panel.append(button);
  }
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });
  root.append(panel, toggle);
  (document.body || document.documentElement).append(root);
}

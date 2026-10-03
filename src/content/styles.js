export function installStyle(id, cssText) {
  if (!cssText.trim()) return;

  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    style.dataset.misskeyPatcher = 'true';
    (document.head || document.documentElement).append(style);
  }
  style.textContent = cssText;
}

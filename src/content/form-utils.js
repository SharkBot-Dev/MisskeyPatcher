export function fieldValue(form, name) {
  return form.elements.namedItem(name)?.value ?? '';
}

export function syncUserScripts(callback) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    callback?.({ ok: false, reason: 'runtime messaging is unavailable' });
    return;
  }

  chrome.runtime.sendMessage({ type: 'mkp-sync-user-scripts' }, (response) => {
    callback?.(response ?? { ok: false, reason: chrome.runtime.lastError?.message ?? 'No response' });
  });
}

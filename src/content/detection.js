const ready = new Promise((resolve) => {
  if (document.documentElement) {
    resolve();
  } else {
    document.addEventListener('readystatechange', resolve, { once: true });
  }
});

function isMisskeyPage() {
  const appName = document.querySelector('meta[name="application-name" i]')?.getAttribute('content');
  if (appName?.toLowerCase() === 'misskey') return true;

  if (document.getElementById('misskey_meta')) return true;
  if (document.querySelector('script[src^="/vite/loader/boot.js"], script[src*="/vite/loader/boot.js"]')) return true;
  if (document.querySelector('link[href^="/vite/loader/style.css"], link[href*="/vite/loader/style.css"]')) return true;

  const html = document.documentElement?.innerHTML ?? '';
  return html.includes('Thank you for using Misskey!') || html.includes('const CLIENT_ENTRY =');
}

export async function waitForMisskey(timeoutMs = 10000) {
  await ready;
  if (isMisskeyPage()) return true;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const observer = new MutationObserver(() => {
      if (isMisskeyPage()) {
        observer.disconnect();
        resolve(true);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        observer.disconnect();
        resolve(false);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(isMisskeyPage());
    }, timeoutMs);
  });
}

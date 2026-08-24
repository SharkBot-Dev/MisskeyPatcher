function openNoteLog() {
    const logs = api.store.get("logs")
    let logs_text = ""
    if (!logs) {
        logs_text = "まだNoteがありません。"
    } else {
        Array.from(JSON.parse(logs)).forEach(item => {
            logs_text += `${item.type} ${item.user?.username}: ${item.text}\n`
        });
    }

    const root = document.createElement('div');
    root.id = 'mkp-inline-settings';
    root.innerHTML = [
      '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
      '<section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">',
      '  <header class="mkp-inline-header">',
      '    <div>',
      '      <h2 id="mkp-plugin-title">Noteログ</h2>',
      '    </div>',
      '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
      '  </header>',
      '  <form class="mkp-inline-form mkp-plugin-form">',
      `    <textarea>${logs_text}</textarea>`,
      '  </form>',
      '</section>',
    ].join('');

    function close() {
      root.remove();
    }

    root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-mkp-close="true"]')) close();
    });

    (document.body || document.documentElement).append(root);
}

const stream = await api.reuseMisskeyStream();

stream.channel('localTimeline', {}, (message) => {
  if (!message.text) {
    return
  }

  const logs = api.store.get("logs")
  if (!logs) {
    api.store.set("logs", JSON.stringify([{type: "local", ...message }]))
  } else {
    const dict = JSON.parse(logs)
    dict.push({type: "local", ...message })
    api.store.set("logs", JSON.stringify(dict))
  }
});

const register = api.registerSettingsItem({
  id: 'logger',
  name: 'Noteログ',
  icon: 'ti ti-adjustments ti-fw',
  order: 120,
}, () => {
  openNoteLog();
});
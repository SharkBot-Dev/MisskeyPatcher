api.registerSlashCommand({
  id: 'template-greeting',
  command: 'hello',
  name: 'あいさつテンプレート',
  description: 'ノート本文に短いあいさつを挿入します',
  icon: 'ti ti-message-circle ti-fw',
  insert: 'こんにちは！',
  order: 10,
}, () => {
  api.toast('/hello を挿入しました');
});

api.registerSlashCommand({
  id: 'current-date',
  command: 'date',
  name: '今日の日付',
  description: '現在の日付を YYYY/MM/DD 形式で挿入します',
  icon: 'ti ti-calendar ti-fw',
  insert: new Date().toLocaleDateString('ja-JP'),
  order: 20,
});

api.registerSlashCommand({
  id: 'content-warning',
  command: 'cw',
  name: 'CW 下書き',
  description: '閲覧注意ノート用の見出しを挿入します',
  icon: 'ti ti-alert-triangle ti-fw',
  insert: '※閲覧注意\n',
  order: 30,
});

api.registerSettingsItem({
  id: 'update-button',
  name: 'アップデートを確認',
  icon: 'icon ti ti-mood-happy',
  order: 120,
}, () => {
  location.href = "https://github.com/SharkBot-Dev/MisskeyPatcher/releases";
});
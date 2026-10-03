export const state = {
  active: false,
  observer: null,
  routeCallbacks: new Set(),
  pluginSettingsItems: new Map(),
  pluginSidebarMoreItems: new Map(),
  pluginSlashCommands: new Map(),
  lastSidebarMoreClickAt: 0,
  lastUrl: location.href,
  activeSlashCommand: null,
};

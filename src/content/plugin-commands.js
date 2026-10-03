import { parseBridgeDetail, sanitizeSettingsItem, sanitizeSidebarMoreItem, sanitizeSlashCommand } from './bridge.js';
import { state } from './state.js';
import { refreshSettingsMenuItems } from './settings-menu.js';
import { injectSidebarMoreItems, refreshSidebarMoreItems } from './sidebar-menu.js';
import { updateSlashCommandMenu } from './slash-commands.js';

function handlePluginSettingsCommand(event) {
  const command = parseBridgeDetail(event.detail);
  if (!command || typeof command !== 'object') return;

  if (command.type === 'register') {
    const item = sanitizeSettingsItem(command.item);
    if (!item) return;
    state.pluginSettingsItems.set(item.id, item);
    refreshSettingsMenuItems();
    return;
  }

  if (command.type === 'unregister') {
    state.pluginSettingsItems.delete(String(command.id ?? ''));
    refreshSettingsMenuItems();
  }
}

function handlePluginSidebarMoreCommand(event) {
  const command = parseBridgeDetail(event.detail);
  if (!command || typeof command !== 'object') return;

  if (command.type === 'register') {
    const item = sanitizeSidebarMoreItem(command.item);
    if (!item) return;
    state.pluginSidebarMoreItems.set(item.id, item);
    injectSidebarMoreItems();
    return;
  }

  if (command.type === 'unregister') {
    state.pluginSidebarMoreItems.delete(String(command.id ?? ''));
    refreshSidebarMoreItems();
  }
}

function handlePluginSlashCommand(event) {
  const command = parseBridgeDetail(event.detail);
  if (!command || typeof command !== 'object') return;

  if (command.type === 'register') {
    const item = sanitizeSlashCommand(command.item);
    if (!item) return;
    state.pluginSlashCommands.set(item.id, item);
    updateSlashCommandMenu();
    return;
  }

  if (command.type === 'unregister') {
    state.pluginSlashCommands.delete(String(command.id ?? ''));
    updateSlashCommandMenu();
  }
}

export function installPluginCommandListeners() {
  window.addEventListener('misskey-patcher:settings-command', handlePluginSettingsCommand);

  window.addEventListener('misskey-patcher:sidebar-more-command', handlePluginSidebarMoreCommand);

  window.addEventListener('misskey-patcher:slash-command', handlePluginSlashCommand);
}

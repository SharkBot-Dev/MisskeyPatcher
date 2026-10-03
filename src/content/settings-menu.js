import { openInlineSettings } from './inline-settings.js';
import { openPluginSettings } from './plugin-settings.js';
import { openDefaultPatchWindow } from '../window/privacyPatch.js';
import { openReadyModal } from './help-modals.js';
import { state } from './state.js';
import { emitPluginSettingsEvent } from './bridge.js';

const buttons = [
  {
    name: '基本設定',
    icon: 'ti ti-settings-2 ti-fw',
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      openInlineSettings();
    },
  },
  {
    name: 'プラグイン設定',
    icon: 'ti ti-settings-2 ti-fw',
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPluginSettings();
    },
  },
  {
    name: 'プライバシー機能設定',
    icon: 'ti ti-settings-2 ti-fw',
    onClick: async (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDefaultPatchWindow();
    },
  },
  {
    name: '最初に見るところ',
    icon: 'ti ti-settings-2 ti-fw',
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      openReadyModal();
    },
  },
];

function settingsMenuButtons() {
  const pluginItems = [...state.pluginSettingsItems.values()]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((item) => ({
      name: item.name,
      icon: item.icon,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        emitPluginSettingsEvent({
          type: 'click',
          id: item.id,
          pluginName: item.pluginName,
        });
      },
    }));

  return [...buttons, ...pluginItems];
}

function createSettingsRow(dataVName) {
  let buttons_list = [];
  settingsMenuButtons().forEach((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = '_button item mkp-settings-menu-item';
    button.dataset.misskeyPatcherSettings = 'true';

    const icon = document.createElement('span');
    icon.className = 'icon';
    const iconGlyph = document.createElement('i');
    iconGlyph.className = value.icon;
    icon.append(iconGlyph);

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = value.name;

    button.append(icon, text);
    if (dataVName) {
      button.setAttribute(dataVName, "")
    }
    button.addEventListener('click', value.onClick);
    buttons_list.push(button)
  })
  return buttons_list;
}

export function refreshSettingsMenuItems() {
  document.querySelector('[data-misskey-patcher-settings-group="true"]')?.remove();
  injectSettingsMenuItem();
}

export function injectSettingsMenuItem() {
  if (!location.pathname.startsWith('/settings')) return;
  if (document.querySelector('[data-misskey-patcher-settings-group="true"]')) return;

  const superMenu = document.querySelector('.rrevdjwu');
  if (!superMenu) return;

  let dataVName;
  for (const attr of superMenu.firstElementChild?.attributes ?? []) {
    if (attr.name.startsWith("data-v-")) {
      dataVName = attr.name
    }
  }

  const group = document.createElement('div');
  group.className = 'group';
  group.dataset.misskeyPatcherSettingsGroup = 'true';
  if (dataVName) {
    group.setAttribute(dataVName, "")
  }

  const items = document.createElement('div');
  items.className = 'items';
  if (dataVName) {
    items.setAttribute(dataVName, "")
  }
  createSettingsRow(dataVName).forEach((value) => {
    items.append(value);
  })
  group.append(items);

  superMenu.append(group);
}

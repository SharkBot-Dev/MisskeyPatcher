import { openInlineSettings } from './inline-settings.js';
import { openPluginSettings } from './plugin-settings.js';
import { openReadyModal } from './help-modals.js';
import { state } from './state.js';
import { emitPluginSettingsEvent } from './bridge.js';

// 設定画面
import { openDefaultPrivacyPatchWindow } from '../window/privacyPatch.js';
import { openDefaultOtherPatchWindow } from '../window/otherPatch.js';

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
    type: "category_bar" // カテゴリごとのバー
  },
  {
    name: 'プライバシー機能',
    icon: 'ti ti-settings-2 ti-fw',
    onClick: async (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDefaultPrivacyPatchWindow();
    },
  },
  {
    name: 'その他の機能',
    icon: 'ti ti-settings-2 ti-fw',
    onClick: async (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDefaultOtherPatchWindow();
    },
  },
  {
    type: "category_bar" // カテゴリごとのバー
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
  const categories = [[]];
  settingsMenuButtons().forEach((value) => {
    if (value.type === 'category_bar') {
      if (categories[categories.length - 1].length > 0) {
        categories.push([]);
      }
      return;
    }

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
    categories[categories.length - 1].push(button);
  })
  return categories.filter((category) => category.length > 0);
}

export function refreshSettingsMenuItems() {
  document.querySelectorAll('[data-misskey-patcher-settings-group="true"]')
    .forEach((group) => group.remove());
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

  createSettingsRow(dataVName).forEach((category) => {
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
    items.append(...category);
    group.append(items);

    superMenu.append(group);
  });
}

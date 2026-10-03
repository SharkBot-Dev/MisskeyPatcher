import { state } from './state.js';
import { emitPluginSidebarMoreEvent } from './bridge.js';

function sortedSidebarMoreItems() {
  return [...state.pluginSidebarMoreItems.values()]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function createMenuButton(item, eventName, dataVName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = '_button item mkp-sidebar-more-menu-item';
  button.dataset.misskeyPatcherSidebarMore = 'true';

  const icon = document.createElement('span');
  icon.className = 'icon';
  const iconGlyph = document.createElement('i');
  iconGlyph.className = item.icon;
  icon.append(iconGlyph);

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = item.name;

  button.append(icon, text);
  if (dataVName) button.setAttribute(dataVName, '');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    eventName({
      type: 'click',
      id: item.id,
      pluginName: item.pluginName,
    });
  });
  return button;
}

function removeSidebarMoreInjectedItems() {
  document.querySelectorAll([
    '[data-misskey-patcher-sidebar-more-group="true"]',
    '[data-misskey-patcher-sidebar-more="true"]',
  ].join(',')).forEach((node) => node.remove());
}

export function refreshSidebarMoreItems() {
  removeSidebarMoreInjectedItems();
  injectSidebarMoreItems();
}

function textContentForTrigger(element) {
  return [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
  ].filter(Boolean).join(' ').trim();
}

function isSidebarMoreTrigger(element) {
  const trigger = element.closest?.('button, a, [role="button"], [role="menuitem"]');
  if (!trigger) return false;

  const text = textContentForTrigger(trigger).toLowerCase();
  return text.includes('もっと') || text.includes('more');
}

function isVisibleElement(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 80
    && rect.height > 32
    && rect.width < Math.min(520, window.innerWidth)
    && rect.height < Math.min(720, window.innerHeight)
    && style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity || 1) > 0;
}

function dataVNameFrom(element) {
  const source = element.querySelector('button, a, [role="menuitem"], .item') ?? element.firstElementChild;
  for (const attr of source?.attributes ?? []) {
    if (attr.name.startsWith('data-v-')) return attr.name;
  }
  return '';
}

function sidebarMoreMenuScore(element) {
  if (!isVisibleElement(element)) return -1;
  if (element.closest('#mkp-inline-settings')) return -1;
  if (element.querySelector('[data-misskey-patcher-sidebar-more-group="true"]')) return -1;
  if (element.querySelector('[data-misskey-patcher-sidebar-more="true"]')) return -1;
  if (!looksLikeSidebarMoreMenu(element)) return -1;

  const clickables = element.querySelectorAll('button, a, [role="menuitem"], .item');
  if (clickables.length < 2 || clickables.length > 80) return -1;

  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  let score = 0;
  if (element.matches('[role="menu"], [role="listbox"], [popover]')) score += 8;
  if (/menu|popup|popover|dropdown|context/i.test(element.className)) score += 4;
  if (style.position === 'fixed' || style.position === 'absolute') score += 3;
  if (rect.left < 360 || rect.right > window.innerWidth - 360) score += 2;
  score += Math.max(0, 5 - Math.floor((rect.width * rect.height) / 30000));
  return score;
}

function looksLikeSidebarMoreMenu(element) {
  const text = element.textContent ?? '';
  const labels = [
    '照会',
    '二次元コード',
    'リスト',
    'アンテナ',
    'お気に入り',
    'ページ',
    'Play',
    'ギャラリー',
    '実績',
    'Misskey Games',
    '情報',
    'ツール',
    'リロード',
    'プロフィール',
    'キャッシュをクリア',
    'Lookup',
    'QR code',
    'Lists',
    'Antennas',
    'Favorites',
    'Pages',
    'Gallery',
    'Achievements',
    'About',
    'Tools',
    'Reload',
    'Profile',
    'Clear cache',
  ];
  const matches = labels.filter((label) => text.includes(label)).length;
  return matches >= 4;
}

function findSidebarMoreMenu() {
  const candidates = [
    ...document.querySelectorAll('[role="menu"], [role="listbox"], [popover], [class*="menu" i], [class*="popup" i], [class*="popover" i], [class*="dropdown" i], body div, body section, body nav, body aside, body ul'),
  ];

  return candidates
    .map((element) => ({ element, score: sidebarMoreMenuScore(element) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.element ?? null;
}

function directMenuItemCount(element) {
  return [...element.children].filter((child) => {
    if (!(child instanceof Element)) return false;
    return child.matches('button, a, [role="menuitem"], .item')
      || child.querySelector(':scope > button, :scope > a, :scope > [role="menuitem"], :scope > .item');
  }).length;
}

function gridInsertionScore(element) {
  if (!isVisibleElement(element)) return -1;
  if (element.querySelector('[data-misskey-patcher-sidebar-more="true"]')) return -1;

  const directItems = directMenuItemCount(element);
  if (directItems < 8) return -1;

  const style = getComputedStyle(element);
  let score = directItems;
  if (style.display.includes('grid')) score += 100;
  if (style.gridTemplateColumns && style.gridTemplateColumns !== 'none') score += 20;
  if (style.display.includes('flex') && style.flexWrap !== 'nowrap') score += 8;
  return score;
}

function findSidebarMoreGridTarget(menu) {
  const candidates = [
    menu,
    ...menu.querySelectorAll('div, section, nav, ul'),
  ];

  return candidates
    .map((element) => ({ element, score: gridInsertionScore(element) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.element ?? null;
}

export function injectSidebarMoreItems() {
  if (state.pluginSidebarMoreItems.size === 0) return;
  if (Date.now() - state.lastSidebarMoreClickAt > 3000) return;
  if (document.querySelector('[data-misskey-patcher-sidebar-more="true"], [data-misskey-patcher-sidebar-more-group="true"]')) return;

  const menu = findSidebarMoreMenu();
  if (!menu) return;

  const gridTarget = findSidebarMoreGridTarget(menu);
  if (gridTarget) {
    const dataVName = dataVNameFrom(gridTarget);
    for (const item of sortedSidebarMoreItems()) {
      gridTarget.append(createMenuButton(item, emitPluginSidebarMoreEvent, dataVName));
    }
    return;
  }

  const dataVName = dataVNameFrom(menu);
  const group = document.createElement('div');
  group.className = 'mkp-sidebar-more-menu-group';
  group.dataset.misskeyPatcherSidebarMoreGroup = 'true';
  if (dataVName) group.setAttribute(dataVName, '');

  for (const item of sortedSidebarMoreItems()) {
    group.append(createMenuButton(item, emitPluginSidebarMoreEvent, dataVName));
  }

  menu.append(group);
}

export function installSidebarMenuListeners() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isSidebarMoreTrigger(target)) return;

    state.lastSidebarMoreClickAt = Date.now();
    removeSidebarMoreInjectedItems();
    setTimeout(injectSidebarMoreItems, 80);
    setTimeout(injectSidebarMoreItems, 300);
  }, true);
}

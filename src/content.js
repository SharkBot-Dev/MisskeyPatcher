(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    showBadge: true,
    allowedHosts: '',
    customCss: [
      '/* Example: make built Misskey pages feel slightly denser. */',
      ':root[data-misskey-patcher-active="true"] {',
      '  --mkp-patched-at: "extension";',
      '}',
      '',
      '[data-mkp-note-root] {',
      '  scroll-margin-top: 72px;',
      '}',
    ].join('\n'),
    customJs: [
      '// Runs as a Manifest V3 user script after Misskey is detected.',
      '// Available globals: window, document, api',
      'api.markNotes();',
      'api.onRouteChange(() => api.markNotes());',
    ].join('\n'),
    customPlugins: [],
  };

  const INSTANCE_SETTINGS_KEY = 'instanceSettings';

  const state = {
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

  const ready = new Promise((resolve) => {
    if (document.documentElement) {
      resolve();
    } else {
      document.addEventListener('readystatechange', resolve, { once: true });
    }
  });

  function currentInstanceHost() {
    return location.hostname.toLowerCase();
  }

  function legacySettings(items) {
    return {
      enabled: items.enabled ?? DEFAULTS.enabled,
      allowedHosts: items.allowedHosts ?? DEFAULTS.allowedHosts,
      customCss: items.customCss ?? DEFAULTS.customCss,
      customJs: items.customJs ?? DEFAULTS.customJs,
      customPlugins: items.customPlugins ?? DEFAULTS.customPlugins,
    };
  }

  function normalizePlugins(settings) {
    const plugins = Array.isArray(settings.customPlugins) ? settings.customPlugins : [];
    const normalized = plugins.map((plugin, index) => ({
      id: String(plugin?.id || `plugin-${index + 1}`),
      name: String(plugin?.name || `プラグイン ${index + 1}`),
      enabled: plugin?.enabled !== false,
      code: String(plugin?.code ?? ''),
    }));

    if (normalized.length > 0) return normalized;
    return [{
      id: `plugin-${Date.now().toString(36)}`,
      name: '基本プラグイン',
      enabled: true,
      code: settings.customJs ?? DEFAULTS.customJs,
    }];
  }

  function createPlugin(code = '') {
    return {
      id: `plugin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: '新しいプラグイン',
      enabled: true,
      code,
    };
  }

  function settingsForHost(items, host = currentInstanceHost()) {
    const instances = items[INSTANCE_SETTINGS_KEY] ?? {};
    return {
      ...DEFAULTS,
      ...legacySettings(items),
      ...(instances[host] ?? {}),
    };
  }

  function getChromeStorage() {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.storage?.local) {
        resolve({ ...DEFAULTS });
        return;
      }

      chrome.storage.local.get({ ...DEFAULTS, [INSTANCE_SETTINGS_KEY]: {} }, (items) => {
        resolve(settingsForHost(items));
      });
    });
  }

  function setCurrentInstanceSettings(nextSettings, callback) {
    chrome.storage.local.get({ [INSTANCE_SETTINGS_KEY]: {} }, (items) => {
      const host = currentInstanceHost();
      const instances = items[INSTANCE_SETTINGS_KEY] ?? {};
      chrome.storage.local.set({
        [INSTANCE_SETTINGS_KEY]: {
          ...instances,
          [host]: {
            ...DEFAULTS,
            ...instances[host],
            ...nextSettings,
          },
        },
      }, callback);
    });
  }

  function hostIsAllowed(allowedHosts) {
    const patterns = allowedHosts
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (patterns.length === 0) return true;

    return patterns.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
        return location.hostname.endsWith(suffix);
      }
      return location.hostname === pattern;
    });
  }

  function isMisskeyPage() {
    const appName = document.querySelector('meta[name="application-name" i]')?.getAttribute('content');
    if (appName?.toLowerCase() === 'misskey') return true;

    if (document.getElementById('misskey_meta')) return true;
    if (document.querySelector('script[src^="/vite/loader/boot.js"], script[src*="/vite/loader/boot.js"]')) return true;
    if (document.querySelector('link[href^="/vite/loader/style.css"], link[href*="/vite/loader/style.css"]')) return true;

    const html = document.documentElement?.innerHTML ?? '';
    return html.includes('Thank you for using Misskey!') || html.includes('const CLIENT_ENTRY =');
  }

  async function waitForMisskey(timeoutMs = 10000) {
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

  function installStyle(id, cssText) {
    if (!cssText.trim()) return;

    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      style.dataset.misskeyPatcher = 'true';
      (document.head || document.documentElement).append(style);
    }
    style.textContent = cssText;
  }

  function parseBridgeDetail(detail) {
    if (typeof detail !== 'string') return null;
    try {
      return JSON.parse(detail);
    } catch {
      return null;
    }
  }

  function serializeBridgePayload(payload) {
    try {
      return JSON.stringify(payload);
    } catch {
      return JSON.stringify({ type: 'bridge-error', reason: 'Failed to serialize payload' });
    }
  }

  function sanitizeSettingsItem(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null;

    const id = String(rawItem.id ?? '').trim();
    const name = String(rawItem.name ?? rawItem.label ?? '').trim();
    if (!id || !name) return null;

    const icon = String(rawItem.icon ?? 'ti ti-plug ti-fw').trim();
    const order = Number.isFinite(Number(rawItem.order)) ? Number(rawItem.order) : 100;
    return {
      id,
      name,
      icon: icon || 'ti ti-plug ti-fw',
      order,
      pluginName: String(rawItem.pluginName ?? ''),
    };
  }

  function sanitizeSidebarMoreItem(rawItem) {
    const item = sanitizeSettingsItem(rawItem);
    if (!item) return null;
    return {
      ...item,
      icon: item.icon || 'ti ti-plug ti-fw',
    };
  }

  function sanitizeSlashCommand(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null;

    const id = String(rawItem.id ?? '').trim();
    const name = String(rawItem.name ?? rawItem.label ?? '').trim();
    if (!id || !name) return null;

    const command = String(rawItem.command ?? rawItem.slash ?? name).replace(/^\/+/, '').trim();
    if (!command) return null;

    return {
      id,
      name,
      command,
      description: String(rawItem.description ?? '').trim(),
      icon: String(rawItem.icon ?? 'ti ti-slash ti-fw').trim() || 'ti ti-slash ti-fw',
      insert: typeof rawItem.insert === 'string' ? rawItem.insert : null,
      order: Number.isFinite(Number(rawItem.order)) ? Number(rawItem.order) : 100,
      pluginName: String(rawItem.pluginName ?? ''),
    };
  }

  function emitPluginSettingsEvent(payload) {
    window.dispatchEvent(new CustomEvent('misskey-patcher:settings-event', {
      detail: serializeBridgePayload(payload),
    }));
  }

  function emitPluginSidebarMoreEvent(payload) {
    window.dispatchEvent(new CustomEvent('misskey-patcher:sidebar-more-event', {
      detail: serializeBridgePayload(payload),
    }));
  }

  function emitPluginSlashCommandEvent(payload) {
    window.dispatchEvent(new CustomEvent('misskey-patcher:slash-command-event', {
      detail: serializeBridgePayload(payload),
    }));
  }

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

  window.addEventListener('misskey-patcher:settings-command', handlePluginSettingsCommand);

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

  window.addEventListener('misskey-patcher:sidebar-more-command', handlePluginSidebarMoreCommand);

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

  window.addEventListener('misskey-patcher:slash-command', handlePluginSlashCommand);

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

  function refreshSettingsMenuItems() {
    document.querySelector('[data-misskey-patcher-settings-group="true"]')?.remove();
    injectSettingsMenuItem();
  }

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

  function refreshSidebarMoreItems() {
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

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isSidebarMoreTrigger(target)) return;

    state.lastSidebarMoreClickAt = Date.now();
    removeSidebarMoreInjectedItems();
    setTimeout(injectSidebarMoreItems, 80);
    setTimeout(injectSidebarMoreItems, 300);
  }, true);

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

  function injectSidebarMoreItems() {
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

  function injectSettingsMenuItem() {
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

  function editableText(element) {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return element.value;
    }
    return element.textContent ?? '';
  }

  function editableCaretOffset(element) {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return element.selectionStart ?? element.value.length;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !element.contains(selection.anchorNode)) {
      return editableText(element).length;
    }

    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(element);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  }

  function replaceEditableRange(element, start, end, nextText) {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const before = element.value.slice(0, start);
      const after = element.value.slice(end);
      element.value = before + nextText + after;
      const caret = before.length + nextText.length;
      element.setSelectionRange(caret, caret);
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertReplacementText',
        data: nextText,
      }));
      return;
    }

    element.focus();
    const selection = window.getSelection();
    if (!selection) return;
    selection.selectAllChildren(element);
    selection.collapse(element, 0);

    let remainingStart = start;
    let remainingEnd = end;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;
    let node;

    while ((node = walker.nextNode())) {
      const length = node.textContent.length;
      if (!startNode && remainingStart <= length) {
        startNode = node;
        startOffset = remainingStart;
      }
      if (!endNode && remainingEnd <= length) {
        endNode = node;
        endOffset = remainingEnd;
        break;
      }
      remainingStart -= length;
      remainingEnd -= length;
    }

    const range = document.createRange();
    range.setStart(startNode ?? element, startNode ? startOffset : element.childNodes.length);
    range.setEnd(endNode ?? element, endNode ? endOffset : element.childNodes.length);
    range.deleteContents();
    const textNode = document.createTextNode(nextText);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertReplacementText',
      data: nextText,
    }));
  }

  function isEditableElement(element) {
    if (!element) return false;
    if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
    if (element instanceof HTMLInputElement) return false;
    return element instanceof HTMLElement && element.isContentEditable;
  }

  function isLikelyNoteComposer(element) {
    if (!isEditableElement(element)) return false;
    if (element.closest('#mkp-inline-settings, [data-misskey-patcher-slash-menu="true"]')) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 180 || rect.height < 32) return false;

    const context = element.closest('[role="dialog"], form, section, article, main, div') ?? element;
    const text = [
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      context.textContent,
    ].filter(Boolean).join(' ');

    if (/検索|search|フィルタ|filter|password|email/i.test(text)) return false;
    return /ノート|note|投稿|post|つぶや|compose/i.test(text) || element instanceof HTMLTextAreaElement || element.isContentEditable;
  }

  function slashTokenFor(element) {
    const text = editableText(element);
    const caret = editableCaretOffset(element);
    const beforeCaret = text.slice(0, caret);
    const match = beforeCaret.match(/(?:^|[\s\n])\/([^\s\n/]*)$/);
    if (!match) return null;

    const token = '/' + match[1];
    return {
      query: match[1].toLowerCase(),
      start: caret - token.length,
      end: caret,
    };
  }

  function sortedSlashCommands(query) {
    return [...state.pluginSlashCommands.values()]
      .filter((command) => {
        if (!query) return true;
        return command.command.toLowerCase().startsWith(query)
          || command.name.toLowerCase().includes(query)
          || command.description.toLowerCase().includes(query);
      })
      .sort((a, b) => a.order - b.order || a.command.localeCompare(b.command))
      .slice(0, 8);
  }

  function closeSlashCommandMenu() {
    state.activeSlashCommand = null;
    document.querySelector('[data-misskey-patcher-slash-menu="true"]')?.remove();
  }

  function chooseSlashCommand(command) {
    const active = state.activeSlashCommand;
    if (!active?.target?.isConnected) {
      closeSlashCommandMenu();
      return;
    }

    const insertedText = command.insert ?? '';
    if (insertedText) {
      replaceEditableRange(active.target, active.start, active.end, insertedText);
    }

    emitPluginSlashCommandEvent({
      type: 'execute',
      id: command.id,
      command: command.command,
      name: command.name,
      query: active.query,
      insertedText,
      pluginName: command.pluginName,
    });
    closeSlashCommandMenu();
  }

  function renderSlashCommandMenu(active, commands) {
    let menu = document.querySelector('[data-misskey-patcher-slash-menu="true"]');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'mkp-slash-command-menu';
      menu.dataset.misskeyPatcherSlashMenu = 'true';
      menu.setAttribute('role', 'listbox');
      (document.body || document.documentElement).append(menu);
    }

    menu.textContent = '';
    for (const [index, command] of commands.entries()) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mkp-slash-command-item';
      item.dataset.commandId = command.id;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', index === 0 ? 'true' : 'false');

      const icon = document.createElement('i');
      icon.className = command.icon;

      const body = document.createElement('span');
      body.className = 'mkp-slash-command-body';

      const title = document.createElement('span');
      title.className = 'mkp-slash-command-title';
      title.textContent = `/${command.command} ${command.name}`;

      const description = document.createElement('span');
      description.className = 'mkp-slash-command-description';
      description.textContent = command.description || command.pluginName;

      body.append(title, description);
      item.append(icon, body);
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        chooseSlashCommand(command);
      });
      menu.append(item);
    }

    const rect = active.target.getBoundingClientRect();
    const maxWidth = Math.min(420, Math.max(260, rect.width));
    menu.style.width = `${maxWidth}px`;
    menu.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - maxWidth - 8)}px`;
    menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - menu.offsetHeight - 8)}px`;
  }

  function updateSlashCommandMenu() {
    const target = document.activeElement;
    if (!isLikelyNoteComposer(target)) {
      closeSlashCommandMenu();
      return;
    }

    const token = slashTokenFor(target);
    if (!token || state.pluginSlashCommands.size === 0) {
      closeSlashCommandMenu();
      return;
    }

    const commands = sortedSlashCommands(token.query);
    if (commands.length === 0) {
      closeSlashCommandMenu();
      return;
    }

    state.activeSlashCommand = {
      target,
      query: token.query,
      start: token.start,
      end: token.end,
      commands,
      selectedIndex: 0,
    };
    renderSlashCommandMenu(state.activeSlashCommand, commands);
  }

  document.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !isEditableElement(target)) return;
    queueMicrotask(updateSlashCommandMenu);
  }, true);

  document.addEventListener('selectionchange', () => {
    if (state.activeSlashCommand) updateSlashCommandMenu();
  });

  document.addEventListener('focusin', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target && isEditableElement(target)) setTimeout(updateSlashCommandMenu, 0);
  }, true);

  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!document.activeElement?.closest?.('[data-misskey-patcher-slash-menu="true"]')) {
        closeSlashCommandMenu();
      }
    }, 120);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!state.activeSlashCommand) return;
    const menu = document.querySelector('[data-misskey-patcher-slash-menu="true"]');
    if (!menu) return;

    const active = state.activeSlashCommand;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSlashCommandMenu();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      active.selectedIndex = (active.selectedIndex + direction + active.commands.length) % active.commands.length;
      menu.querySelectorAll('[role="option"]').forEach((item, index) => {
        item.setAttribute('aria-selected', index === active.selectedIndex ? 'true' : 'false');
      });
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      chooseSlashCommand(active.commands[active.selectedIndex] ?? active.commands[0]);
    }
  }, true);

  function fieldValue(form, name) {
    return form.elements.namedItem(name)?.value ?? '';
  }

  function syncUserScripts(callback) {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      callback?.({ ok: false, reason: 'runtime messaging is unavailable' });
      return;
    }

    chrome.runtime.sendMessage({ type: 'mkp-sync-user-scripts' }, (response) => {
      callback?.(response ?? { ok: false, reason: chrome.runtime.lastError?.message ?? 'No response' });
    });
  }

  async function openInlineSettings() {
    document.getElementById('mkp-inline-settings')?.remove();
    const settings = await getChromeStorage();

    const root = document.createElement('div');
    root.id = 'mkp-inline-settings';
    root.innerHTML = [
      '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
      '<section class="mkp-inline-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-inline-title">',
      '  <header class="mkp-inline-header">',
      '    <div>',
      '      <h2 id="mkp-inline-title">MisskeyPatcher設定</h2>',
      `      <p>${currentInstanceHost()}</p>`,
      '    </div>',
      '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
      '  </header>',
      '  <form class="mkp-inline-form">',
      '    <label class="mkp-check"><input name="enabled" type="checkbox"> <span>有効</span></label>',
      '    <label><span>対象ホスト</span><textarea name="allowedHosts" spellcheck="false" placeholder="空欄なら Misskey 判定された全ホスト"></textarea></label>',
      '    <label><span>追加 CSS</span><textarea name="customCss" class="mkp-code" spellcheck="false"></textarea></label>',
      '    <div class="mkp-inline-actions">',
      '      <button type="submit">保存</button>',
      '      <button type="button" data-mkp-reset="true">初期値に戻す</button>',
      '    </div>',
      '    <p class="mkp-inline-status" role="status"></p>',
      '  </form>',
      '</section>',
    ].join('');

    const form = root.querySelector('form');
    const status = root.querySelector('.mkp-inline-status');

    function render(values) {
      form.elements.namedItem('enabled').checked = values.enabled;
      form.elements.namedItem('allowedHosts').value = values.allowedHosts;
      form.elements.namedItem('customCss').value = values.customCss;
    }

    function collect() {
      return {
        enabled: form.elements.namedItem('enabled').checked,
        allowedHosts: fieldValue(form, 'allowedHosts'),
        customCss: fieldValue(form, 'customCss'),
      };
    }

    function close() {
      root.remove();
    }

    root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-mkp-close="true"]')) close();
      if (target?.closest('[data-mkp-reset="true"]')) {
        const basicDefaults = {
          enabled: DEFAULTS.enabled,
          allowedHosts: DEFAULTS.allowedHosts,
          customCss: DEFAULTS.customCss,
        };
        render({ ...settings, ...basicDefaults });
        setCurrentInstanceSettings(basicDefaults, () => {
          installStyle('mkp-custom-style', basicDefaults.customCss);
          syncUserScripts();
          status.textContent = '基本設定を初期値に戻しました。';
        });
      }
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const nextSettings = collect();

      setCurrentInstanceSettings(nextSettings, () => {
        installStyle('mkp-custom-style', nextSettings.customCss);
        syncUserScripts((response) => {
          if (response?.ok) {
            status.textContent = `保存しました。CSS は反映済み、${response.count} 件の追加 JS はページ再読み込み後に反映されます。`;
            return;
          }

          if (response?.errors?.length) {
            status.textContent = `保存しました。${response.count} 件を登録し、${response.errors.length} 件は JS エラーで登録できませんでした。`;
            return;
          }

          status.textContent = `保存しました。追加 JS の登録には Chrome の Allow User Scripts または Developer mode が必要です。`;
        });
      });
    });

    render(settings);
    (document.body || document.documentElement).append(root);
    form.elements.namedItem('enabled').focus();
  }

  async function openPluginSettings() {
    document.getElementById('mkp-inline-settings')?.remove();
    const settings = await getChromeStorage();
    let plugins = normalizePlugins(settings);
    let selectedIndex = 0;

    const root = document.createElement('div');
    root.id = 'mkp-inline-settings';
    root.innerHTML = [
      '<div class="mkp-inline-backdrop" data-mkp-close="true"></div>',
      '<section class="mkp-inline-dialog mkp-plugin-dialog" role="dialog" aria-modal="true" aria-labelledby="mkp-plugin-title">',
      '  <header class="mkp-inline-header">',
      '    <div>',
      '      <h2 id="mkp-plugin-title">MisskeyPatcherプラグイン設定</h2>',
      `      <p>${currentInstanceHost()}</p>`,
      '    </div>',
      '    <button class="mkp-icon-button" type="button" data-mkp-close="true" aria-label="閉じる">×</button>',
      '  </header>',
      '  <form class="mkp-inline-form mkp-plugin-form">',
      '    <div class="mkp-plugin-toolbar">',
      '      <button type="button" data-mkp-add-plugin="true">追加</button>',
      '      <button type="button" data-mkp-remove-plugin="true">削除</button>',
      '    </div>',
      '    <label><span>プラグイン一覧</span><select name="pluginList" size="6"></select></label>',
      '    <label class="mkp-check"><input name="pluginEnabled" type="checkbox"> <span>このプラグインを有効にする</span></label>',
      '    <label><span>プラグイン名</span><input name="pluginName" type="text" placeholder="タイムライン調整"></label>',
      '    <label><span>JavaScript</span><textarea name="pluginCode" class="mkp-code" spellcheck="false"></textarea></label>',
      '    <div class="mkp-inline-actions">',
      '      <button type="submit">保存</button>',
      '    </div>',
      '    <p class="mkp-inline-status" role="status"></p>',
      '  </form>',
      '</section>',
    ].join('');

    const form = root.querySelector('form');
    const status = root.querySelector('.mkp-inline-status');
    const removeButton = root.querySelector('[data-mkp-remove-plugin="true"]');

    function currentPlugin() {
      return plugins[selectedIndex] ?? null;
    }

    function persistCurrentPlugin() {
      const plugin = currentPlugin();
      if (!plugin) return;

      plugin.enabled = form.elements.namedItem('pluginEnabled').checked;
      plugin.name = fieldValue(form, 'pluginName').trim() || `プラグイン ${selectedIndex + 1}`;
      plugin.code = fieldValue(form, 'pluginCode');
    }

    function renderPluginList() {
      const list = form.elements.namedItem('pluginList');
      list.textContent = '';
      plugins.forEach((plugin, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${plugin.enabled ? '✓' : '×'} ${plugin.name || `プラグイン ${index + 1}`}`;
        list.append(option);
      });
      list.value = String(selectedIndex);
      removeButton.disabled = plugins.length <= 1;
    }

    function renderPluginEditor() {
      if (selectedIndex >= plugins.length) selectedIndex = Math.max(0, plugins.length - 1);
      renderPluginList();

      const plugin = currentPlugin();
      form.elements.namedItem('pluginEnabled').checked = plugin?.enabled ?? false;
      form.elements.namedItem('pluginName').value = plugin?.name ?? '';
      form.elements.namedItem('pluginCode').value = plugin?.code ?? '';
    }

    function close() {
      root.remove();
    }

    root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-mkp-close="true"]')) close();

      if (target?.closest('[data-mkp-add-plugin="true"]')) {
        persistCurrentPlugin();
        plugins.push(createPlugin());
        selectedIndex = plugins.length - 1;
        renderPluginEditor();
        form.elements.namedItem('pluginName').focus();
      }

      if (target?.closest('[data-mkp-remove-plugin="true"]')) {
        if (plugins.length <= 1) return;
        plugins.splice(selectedIndex, 1);
        selectedIndex = Math.max(0, selectedIndex - 1);
        renderPluginEditor();
      }
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    form.elements.namedItem('pluginList').addEventListener('change', () => {
      persistCurrentPlugin();
      selectedIndex = Number(form.elements.namedItem('pluginList').value) || 0;
      renderPluginEditor();
    });

    form.elements.namedItem('pluginEnabled').addEventListener('change', () => {
      persistCurrentPlugin();
      renderPluginList();
    });

    form.elements.namedItem('pluginName').addEventListener('input', () => {
      persistCurrentPlugin();
      renderPluginList();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      persistCurrentPlugin();
      setCurrentInstanceSettings({
        customJs: plugins[0]?.code ?? '',
        customPlugins: plugins.map((plugin) => ({ ...plugin })),
      }, () => {
        syncUserScripts((response) => {
          if (response?.ok) {
            status.textContent = `保存しました。${response.count} 件の追加 JS はページ再読み込み後に反映されます。`;
            return;
          }

          if (response?.errors?.length) {
            status.textContent = `保存しました。${response.count} 件を登録し、${response.errors.length} 件は JS エラーで登録できませんでした。`;
            return;
          }

          status.textContent = '保存しました。追加 JS の登録には Chrome の Allow User Scripts または Developer mode が必要です。';
        });
      });
    });

    renderPluginEditor();
    (document.body || document.documentElement).append(root);
    form.elements.namedItem('pluginList').focus();
  }

  function onRouteChange(callback) {
    state.routeCallbacks.add(callback);
    return () => state.routeCallbacks.delete(callback);
  }

  function emitRouteChange() {
    if (state.lastUrl === location.href) return;
    state.lastUrl = location.href;
    for (const callback of state.routeCallbacks) {
      try {
        callback(location.href);
      } catch (error) {
        console.error('[Misskey Patcher] route callback failed', error);
      }
    }
  }

  function installRouteHooks() {
    if (window.__misskeyPatcherRouteHooksInstalled) return;
    window.__misskeyPatcherRouteHooksInstalled = true;

    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        queueMicrotask(emitRouteChange);
        return result;
      };
    }

    window.addEventListener('popstate', () => queueMicrotask(emitRouteChange));
    setInterval(emitRouteChange, 500);
  }

  function observeApp() {
    state.observer?.disconnect();
    state.observer = new MutationObserver(() => {
      injectSettingsMenuItem();
      injectSidebarMoreItems();
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  async function main() {
    const settings = await getChromeStorage();
    if (!settings.enabled || !hostIsAllowed(settings.allowedHosts)) return;
    if (!(await waitForMisskey())) return;

    state.active = true;
    document.documentElement.dataset.misskeyPatcherActive = 'true';
    document.documentElement.dataset.misskeyPatcherVersion = chrome.runtime?.getManifest?.().version ?? 'dev';

    installStyle('mkp-custom-style', settings.customCss);
    installRouteHooks();
    observeApp();
    injectSettingsMenuItem();
    injectSidebarMoreItems();
    onRouteChange(() => {
      injectSettingsMenuItem();
      injectSidebarMoreItems();
    });
  }

  main();
})();

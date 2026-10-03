import { state } from './state.js';
import { emitPluginSlashCommandEvent } from './bridge.js';

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

export function updateSlashCommandMenu() {
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

export function installSlashCommandListeners() {
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
}

// Misskey の noteUpdated/deleted を監視し、削除されたノートを赤く残す。
// MisskeyPatcher の user-script API 上で実行されることを前提とする。

const DELETED_NOTE_ATTRIBUTE = 'data-mkp-logger-deleted';
const NOTE_ID_ATTRIBUTE = 'data-mkp-logger-note-id';
const deletedNoteIds = new Set();
const knownNoteElements = new Map();
const deletedNotePositions = new Map();
let positionUpdateQueued = false;

api.installStyle(`
  [${DELETED_NOTE_ATTRIBUTE}="true"] {
    color: #ff3b4f !important;
    border: 2px solid #ff3b4f !important;
    background: color-mix(in srgb, #ff3b4f 9%, var(--MI_THEME-panel, transparent)) !important;
    opacity: 1 !important;
  }

  [${DELETED_NOTE_ATTRIBUTE}="true"] *,
  [${DELETED_NOTE_ATTRIBUTE}="true"] a {
    color: #ff3b4f !important;
  }

  [${DELETED_NOTE_ATTRIBUTE}="true"] button,
  [${DELETED_NOTE_ATTRIBUTE}="true"] a {
    pointer-events: none !important;
  }

  .mkp-logger-deleted-label {
    padding: 8px 12px;
    color: #fff !important;
    background: #ff3b4f;
    font-weight: 700;
    line-height: 1.4;
  }
`, 'logger-deleted-note');

function noteIdFromHref(href) {
  if (!href) return null;
  try {
    const match = new URL(href, location.origin).pathname.match(/^\/notes\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function findNoteRoot(anchor) {
  const scrollAnchor = anchor.closest('[data-scroll-anchor]');
  if (scrollAnchor) return scrollAnchor;

  const article = anchor.closest('article');
  if (!article) return null;
  return article.parentElement?.matches('[tabindex="0"]') ? article.parentElement : article;
}

function indexNotes(scope = document) {
  const anchors = scope.querySelectorAll?.('a[href*="/notes/"]') ?? [];
  for (const anchor of anchors) {
    const id = noteIdFromHref(anchor.getAttribute('href'));
    const root = id && findNoteRoot(anchor);
    if (!id || !root) continue;

    // 引用ノートのリンクではなく、最も外側に描画されたノートを優先する。
    const currentId = root.getAttribute(NOTE_ID_ATTRIBUTE);
    if (!currentId || root.getAttribute('data-scroll-anchor') === id) {
      root.setAttribute(NOTE_ID_ATTRIBUTE, id);
      knownNoteElements.set(id, root);
    }

    if (deletedNoteIds.has(id)) renderDeletedNote(id, root);
  }
}

function makeDeletedSnapshot(root, id) {
  const snapshot = root.cloneNode(true);
  snapshot.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  snapshot.setAttribute(NOTE_ID_ATTRIBUTE, id);
  snapshot.setAttribute(DELETED_NOTE_ATTRIBUTE, 'true');
  snapshot.setAttribute('aria-label', '削除されたノート');

  return snapshot;
}

function restoreDeletedNotePositions() {
  positionUpdateQueued = false;

  for (const [id, position] of deletedNotePositions) {
    const { snapshot, parent, olderSibling } = position;
    if (!parent.isConnected || !snapshot.isConnected) {
      deletedNotePositions.delete(id);
      continue;
    }

    // 「削除時に一つ下にあった要素」の直前を維持する。
    // 新着ノートはこの位置より前へ追加されるので、時系列が崩れない。
    if (olderSibling?.parentNode === parent) {
      if (snapshot.nextSibling !== olderSibling) parent.insertBefore(snapshot, olderSibling);
    } else if (parent.lastChild !== snapshot) {
      parent.append(snapshot);
    }
  }
}

function queueDeletedNotePositionUpdate() {
  if (positionUpdateQueued) return;
  positionUpdateQueued = true;
  queueMicrotask(restoreDeletedNotePositions);
}

function renderDeletedNote(id, root = knownNoteElements.get(id)) {
  if (!root || root.getAttribute(DELETED_NOTE_ATTRIBUTE) === 'true') return;

  const parent = root.parentNode;
  if (!parent) return;

  const olderSibling = root.nextElementSibling;
  const snapshot = makeDeletedSnapshot(root, id);
  root.setAttribute(DELETED_NOTE_ATTRIBUTE, 'true');

  // Misskey は削除通知を受けると paginator から元要素を除去するため、
  // その更新より先に静的スナップショットを元ノートの直前へ置く。
  // Vue は自分が管理する root だけを除去するため、コピーは同じ位置に残る。
  parent.insertBefore(snapshot, root);
  root.setAttribute('aria-hidden', 'true');
  root.style.display = 'none';
  knownNoteElements.set(id, snapshot);
  deletedNotePositions.set(id, { snapshot, parent, olderSibling });

  // 既存の削除済みノートがこの root を位置アンカーにしていた場合は、
  // root の代わりに今作ったスナップショットを追跡させる。
  for (const position of deletedNotePositions.values()) {
    if (position !== deletedNotePositions.get(id) && position.olderSibling === root) {
      position.olderSibling = snapshot;
    }
  }
}

function handleDeletedEvent(message) {
  if (!message || typeof message !== 'object') return;

  // Streaming の broadcast: { type: 'noteUpdated', body: { id, type: 'deleted' } }
  // main channel:              { type: 'deleted', body: { id } }
  let id = null;
  if (message.type === 'noteUpdated' && message.body?.type === 'deleted') {
    id = message.body.id;
  } else if (message.type === 'deleted') {
    id = message.body?.id ?? message.id;
  }
  if (typeof id !== 'string' || !id) return;

  deletedNoteIds.add(id);
  indexNotes();
  renderDeletedNote(id);
}

indexNotes();
api.observe('a[href*="/notes/"]', (anchor) => indexNotes(anchor.closest('article') ?? document), {
  existing: true,
});
api.onRouteChange(() => api.rerunSoon(() => {
  indexNotes();
  queueDeletedNotePositionUpdate();
}, 100));

// Vue が新着ノートや過去ノートを挿入した後、管理外の削除済みコピーを
// 保存した時系列位置へ戻す。
const timelineObserver = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0)) {
    queueDeletedNotePositionUpdate();
  }
});
timelineObserver.observe(document.documentElement, { childList: true, subtree: true });

const stream = await api.reuseMisskeyStream();
stream.onMessage(handleDeletedEvent);

// 自分のノート削除は main channel にも流れるため、broadcast と併せて監視する。
stream.channel('main', {}, handleDeletedEvent);

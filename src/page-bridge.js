(() => {
  'use strict';

  if (window.__misskeyPatcherWsBridgeInstalled) return;
  window.__misskeyPatcherWsBridgeInstalled = true;

  const NativeWebSocket = window.WebSocket;
  const sockets = new Map();
  let nextSocketId = 1;

  function serialize(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify({ type: 'bridge-error', reason: 'Failed to serialize bridge payload' });
    }
  }

  function emit(payload) {
    window.dispatchEvent(new CustomEvent('misskey-patcher:ws-bridge', {
      detail: serialize(payload),
    }));
  }

  function parseDetail(detail) {
    if (typeof detail !== 'string') return null;
    try {
      return JSON.parse(detail);
    } catch {
      return null;
    }
  }

  function isMisskeyStreamingUrl(url) {
    try {
      const parsed = new URL(String(url), location.href);
      return parsed.pathname.includes('/streaming');
    } catch {
      return String(url).includes('/streaming');
    }
  }

  function snapshot(socket, id) {
    return {
      id,
      url: socket.url,
      readyState: socket.readyState,
    };
  }

  function trackSocket(socket, requestedUrl) {
    if (!isMisskeyStreamingUrl(requestedUrl)) return;

    const id = `ws-${nextSocketId++}`;
    sockets.set(id, socket);

    try {
      Object.defineProperty(socket, '__misskeyPatcherWsId', {
        value: id,
        configurable: true,
      });
    } catch {
    }

    emit({ type: 'socket-created', socket: snapshot(socket, id) });

    socket.addEventListener('open', () => {
      emit({ type: 'socket-open', socket: snapshot(socket, id) });
    });

    socket.addEventListener('close', (event) => {
      emit({
        type: 'socket-close',
        socket: snapshot(socket, id),
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      sockets.delete(id);
    });

    socket.addEventListener('error', () => {
      emit({ type: 'socket-error', socket: snapshot(socket, id) });
    });

    socket.addEventListener('message', (event) => {
      emit({
        type: 'socket-message',
        socket: snapshot(socket, id),
        data: typeof event.data === 'string' ? event.data : null,
      });
    });
  }

  function PatchedWebSocket(url, protocols) {
    const socket = protocols === undefined
      ? new NativeWebSocket(url)
      : new NativeWebSocket(url, protocols);
    trackSocket(socket, url);
    return socket;
  }

  PatchedWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(PatchedWebSocket, NativeWebSocket);
  for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
    Object.defineProperty(PatchedWebSocket, key, {
      value: NativeWebSocket[key],
      enumerable: true,
    });
  }

  window.WebSocket = PatchedWebSocket;

  window.addEventListener('misskey-patcher:ws-command', (event) => {
    const command = parseDetail(event.detail);
    if (!command) return;

    if (command.type === 'list') {
      emit({
        type: 'socket-list',
        sockets: [...sockets.entries()].map(([id, socket]) => snapshot(socket, id)),
      });
      return;
    }

    const socket = sockets.get(command.id);
    if (!socket) {
      emit({ type: 'command-error', id: command.id, reason: 'Socket not found' });
      return;
    }

    if (command.type === 'send') {
      socket.send(typeof command.data === 'string' ? command.data : serialize(command.data));
      return;
    }

    if (command.type === 'close') {
      socket.close(command.code, command.reason);
    }
  });

  emit({ type: 'bridge-ready' });
})();

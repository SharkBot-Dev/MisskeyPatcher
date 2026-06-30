(() => {
  'use strict';

  if (window.__misskeyPatcherWsBridgeInstalled) return;
  window.__misskeyPatcherWsBridgeInstalled = true;

  const NativeWebSocket = window.WebSocket;
  const sockets = new Map();
  const pendingSends = new Map();
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

  function cloneForBridge(value) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }

  function parsePropertyPath(path) {
    if (Array.isArray(path)) return path.map((part) => String(part)).filter(Boolean);
    return String(path ?? '')
      .replace(/\[(?:"([^"]+)"|'([^']+)'|([^\]]+))\]/g, (_match, doubleQuoted, singleQuoted, bare) => {
        const key = doubleQuoted ?? singleQuoted ?? String(bare ?? '').trim();
        return '.' + key;
      })
      .split('.')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function assertSafePropertyPath(parts) {
    if (parts.length === 0) throw new Error('Variable path is required');
    if (parts.some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) {
      throw new Error('Unsafe variable path');
    }
  }

  function resolvePropertyPath(path, options = {}) {
    const parts = parsePropertyPath(path);
    assertSafePropertyPath(parts);

    const parentParts = options.parent ? parts.slice(0, -1) : parts;
    let target = window;
    for (const part of parentParts) {
      if (target == null) throw new Error('Variable path not found: ' + parts.join('.'));
      target = target[part];
    }

    return {
      parts,
      target,
      key: parts[parts.length - 1],
    };
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
    pendingSends.set(id, []);

    try {
      Object.defineProperty(socket, '__misskeyPatcherWsId', {
        value: id,
        configurable: true,
      });
    } catch {
    }

    emit({ type: 'socket-created', socket: snapshot(socket, id) });

    socket.addEventListener('open', () => {
      const pending = pendingSends.get(id) ?? [];
      pendingSends.set(id, []);
      for (const data of pending) {
        try {
          socket.send(data);
        } catch (error) {
          emit({ type: 'command-error', id, reason: error.message });
        }
      }
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
      pendingSends.delete(id);
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
      const data = typeof command.data === 'string' ? command.data : serialize(command.data);
      if (socket.readyState === NativeWebSocket.CONNECTING) {
        pendingSends.get(command.id)?.push(data);
        return;
      }

      if (socket.readyState !== NativeWebSocket.OPEN) {
        emit({ type: 'command-error', id: command.id, reason: 'Socket is not open' });
        return;
      }

      socket.send(data);
      return;
    }

    if (command.type === 'close') {
      socket.close(command.code, command.reason);
    }
  });

  window.addEventListener('misskey-patcher:client-command', (event) => {
    const command = parseDetail(event.detail);
    if (!command?.id) return;

    try {
      if (command.type === 'get') {
        const { target } = resolvePropertyPath(command.path);
        emit({ type: 'client-response', id: command.id, ok: true, value: cloneForBridge(target) });
        return;
      }

      if (command.type === 'set') {
        const { target, key } = resolvePropertyPath(command.path, { parent: true });
        if (target == null) throw new Error('Variable path not found');
        target[key] = command.value;
        emit({ type: 'client-response', id: command.id, ok: true, value: cloneForBridge(target[key]) });
        return;
      }

      if (command.type === 'has') {
        const { target, key } = resolvePropertyPath(command.path, { parent: true });
        emit({ type: 'client-response', id: command.id, ok: true, value: !!target && key in target });
        return;
      }

      if (command.type === 'keys') {
        const { target } = resolvePropertyPath(command.path || 'window');
        emit({ type: 'client-response', id: command.id, ok: true, value: Object.keys(Object(target)) });
        return;
      }

      if (command.type === 'call') {
        const { target, key } = resolvePropertyPath(command.path, { parent: true });
        const fn = target?.[key];
        if (typeof fn !== 'function') throw new Error('Variable is not callable: ' + command.path);
        const value = fn.apply(target, Array.isArray(command.args) ? command.args : []);
        if (value && typeof value.then === 'function') {
          value
            .then((resolved) => emit({ type: 'client-response', id: command.id, ok: true, value: cloneForBridge(resolved) }))
            .catch((error) => emit({ type: 'client-response', id: command.id, ok: false, error: error.message }));
          return;
        }
        emit({ type: 'client-response', id: command.id, ok: true, value: cloneForBridge(value) });
        return;
      }

      throw new Error('Unknown client command: ' + command.type);
    } catch (error) {
      emit({ type: 'client-response', id: command.id, ok: false, error: error.message });
    }
  });

  emit({ type: 'bridge-ready' });
})();

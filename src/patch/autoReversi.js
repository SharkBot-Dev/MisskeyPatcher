import { getChromeStorage, hostIsAllowed } from '../content/storage.js';
import { INSTANCE_SETTINGS_KEY } from '../content/defaults.js';
import { startUpExecute, routeChangeExecute } from './patchs.js';
import { restoreReversi } from './reversiEngine.js';

export const REVERSI_DEFAULTS = Object.freeze({
  enabled: false, strategy: 'position', delayMs: 800, jitterMs: 300,
  pollMs: 3000, preferCorners: true, avoidCornerNeighbors: true,
});

export function normalizeReversiSettings(value = {}) {
  const options = { ...REVERSI_DEFAULTS, ...(value && typeof value === 'object' ? value : {}) };
  for (const [key, min, max] of [['delayMs', 100, 10000], ['jitterMs', 0, 5000], ['pollMs', 1000, 30000]]) {
    const number = Number(options[key]);
    options[key] = Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : REVERSI_DEFAULTS[key];
  }
  for (const key of ['enabled', 'preferCorners', 'avoidCornerNeighbors']) options[key] = options[key] === true;
  if (!['random', 'position', 'edge'].includes(options.strategy)) options.strategy = 'position';
  return options;
}


export function chooseReversiMove(moves, width, height, options, random = Math.random) {
  if (!moves.length) return null;
  const corners = [0, width - 1, width * (height - 1), width * height - 1];
  let candidates = moves;
  if (options.preferCorners && moves.some(move => corners.includes(move))) candidates = moves.filter(move => corners.includes(move));
  const scores = candidates.map(pos => {
    const x = pos % width, y = Math.floor(pos / width);
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    const nearCorner = corners.some(corner => Math.abs(x - corner % width) <= 1 && Math.abs(y - Math.floor(corner / width)) <= 1 && pos !== corner);
    let score = options.strategy === 'random' ? 0 : edge ? 10 : 0;
    if (options.strategy === 'position') score += Math.min(x, width - 1 - x, y, height - 1 - y);
    if (options.avoidCornerNeighbors && nearCorner) score -= 30;
    return { pos, score };
  });
  const best = Math.max(...scores.map(move => move.score));
  const tied = scores.filter(move => move.score === best);
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))].pos;
}

function account() {
  try { return JSON.parse(localStorage.getItem('account') ?? 'null'); } catch { return null; }
}
const gameId = () => location.pathname.match(/^\/reversi\/g\/([^/]+)\/?$/)?.[1] ?? null;
let registered = false, timer, pending, generation = 0, controller, socket, session;
let options = REVERSI_DEFAULTS;
let lastMove = null;

function stop() {
  ++generation;
  clearTimeout(timer); clearTimeout(pending);
  timer = pending = null;
  controller?.abort(); controller = null;
  socket?.close(); socket = null; session = null;
  options = REVERSI_DEFAULTS;
}

async function misskeyApi(endpoint, body, token, signal) {
  const response = await fetch(`/api/${endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    credentials: 'same-origin', redirect: 'error', signal,
    body: JSON.stringify({ ...body, i: token }),
  });
  if (!response.ok) throw new Error(`Misskey API: ${response.status}`);
  return response.json();
}

function current(id) {
  const user = account();
  return generation === id && options.enabled && session && gameId() === session.gameId && user?.id === session.userId && user?.token === session.token;
}

async function snapshot(id) {
  const game = await misskeyApi('reversi/show-game', { gameId: session.gameId }, session.token, controller.signal);
  if (!current(id) || !game.isStarted || game.isEnded || ![1, 2].includes(game.black)) return null;
  if (game.user1Id !== session.userId && game.user2Id !== session.userId) return null;
  const state = restoreReversi(game);
  const myColor = (game.black === 1 ? game.user1Id : game.user2Id) === session.userId;
  if (state.turn !== myColor) return null;
  return { ...state, signature: JSON.stringify([session.gameId, game.logs]) };
}

async function poll(id) {
  if (!current(id)) { if (id === generation) void refresh(); return; }
  try {
    const state = await snapshot(id);
    if (!current(id)) return;
    if (state && state.signature !== lastMove && socket?.readyState === WebSocket.OPEN && !pending) {
      const pos = chooseReversiMove(state.moves, state.width, state.height, options);
      if (pos !== null) pending = setTimeout(async () => {
        try {
          if (!current(id)) return;
          const latest = await snapshot(id);
          if (!current(id) || !latest || latest.signature !== state.signature || !latest.moves.includes(pos) || socket?.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({ type: 'ch', body: {
            id: session.channelId, type: 'putStone', body: { pos, id: crypto.randomUUID() },
          } }));
          lastMove = latest.signature;
        } catch {
          // Keep the retry rate bounded; do not expose credentials in errors.
        } finally { if (id === generation) pending = null; }
      }, options.delayMs + Math.floor(Math.random() * (options.jitterMs + 1)));
    }
  } catch {
    // Unsupported instances and temporary API failures are retried at the configured interval.
  } finally {
    if (current(id)) timer = setTimeout(() => void poll(id), options.pollMs);
  }
}

async function refresh() {
  stop();
  const id = generation;
  const settings = await getChromeStorage();
  if (id !== generation) return;
  options = normalizeReversiSettings(settings.autoReversi);
  const user = account(), target = gameId();
  if (!settings.enabled || !hostIsAllowed(settings.allowedHosts) || !options.enabled || !target || !user?.id || !user?.token) return;
  session = { gameId: target, userId: user.id, token: user.token, channelId: crypto.randomUUID() };
  controller = new AbortController();
  const url = new URL('/streaming', location.origin);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('i', user.token);
  const connection = new WebSocket(url);
  socket = connection;
  connection.addEventListener('open', () => {
    if (!current(id)) { connection.close(); return; }
    connection.send(JSON.stringify({ type: 'connect', body: { channel: 'reversiGame', id: session.channelId, params: { gameId: target } } }));
    void poll(id);
  });
  connection.addEventListener('close', () => {
    if (id !== generation) return;
    clearTimeout(timer); clearTimeout(pending); pending = null;
    controller?.abort();
    timer = setTimeout(() => void refresh(), Math.max(5000, options.pollMs));
  });
  connection.addEventListener('error', () => connection.close());
}

export default function registerAutoReversi() {
  if (registered) return;
  registered = true;
  startUpExecute.push(refresh);
  routeChangeExecute.push(refresh);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[INSTANCE_SETTINGS_KEY] || changes.enabled || changes.allowedHosts)) void refresh();
  });
  window.addEventListener('storage', event => { if (event.key === 'account') void refresh(); });
  window.addEventListener('pagehide', stop);
}

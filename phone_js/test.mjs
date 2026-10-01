import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('background.js', import.meta.url), 'utf8');
assert(!source.includes('chrome.'));
const end = source.indexOf("window.MisskeyPatcher = Object.freeze");
const window = new EventTarget();
window.WebSocket = class {};
window.example = { value: 7, double(x) { return x * 2; } };
const data = new Map();
const context = vm.createContext({
  window, console, URL, setTimeout, clearTimeout, queueMicrotask,
  setInterval: () => 0,
  location: { href: 'https://example.test/', pathname: '/', hostname: 'example.test' },
  history: { pushState() {}, replaceState() {} },
  document: {
    documentElement: {},
    querySelector: () => ({ getAttribute: () => 'Misskey' }),
  },
  localStorage: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  },
  CustomEvent: class extends Event {
    constructor(type, options) { super(type); this.detail = options.detail; }
  },
});
vm.runInContext(source.slice(0, end) + 'window.runPlugin = runPlugin; })();', context);
let calls = 0;
await window.runPlugin('test', async api => {
  calls++;
  assert.equal(api.pluginName, 'test');
  for (const key of ['registerSettingsItem', 'registerSidebarMoreItem', 'registerSlashCommand', 'reuseMisskeyStream', 'misskeyApi']) {
    assert.equal(typeof api[key], 'function');
  }
  api.store.set('value', { n: 1 });
  assert.equal(api.store.get('value').n, 1);
  assert.equal(await api.client.get('example.value'), 7);
  await api.client.set('example.value', 9);
  assert.equal(window.example.value, 9);
  assert.equal(await api.client.call('example.double', [5]), 10);
  assert.equal((await api.listReusableStreams()).length, 0);
});
await window.runPlugin('other', api => {
  calls++;
  assert.equal(api.store.get('value'), null);
});
assert.equal(calls, 2);
console.log('Phone API, storage isolation, and page bridge checks passed.');

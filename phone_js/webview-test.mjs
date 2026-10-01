import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('background.js', import.meta.url), 'utf8');
// Exercise the complete injected script without extension or userscript globals.
async function boot(enabled) {
  const elements = [];
  class Node extends EventTarget {
    constructor() { super(); this.dataset = {}; this.children = []; this.attributes = []; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this[key] = value; }
    querySelectorAll() { return []; }
    remove() {}
  }
  const document = new Node();
  document.documentElement = new Node();
  document.body = new Node();
  document.head = new Node();
  const article = new Node();
  document.createElement = () => { const node = new Node(); elements.push(node); return node; };
  document.getElementById = id => elements.find(node => node.id === id) ?? null;
  document.querySelector = selector => selector.startsWith('meta[') ? { getAttribute: () => 'Misskey' } : null;
  document.querySelectorAll = selector => selector === 'article' ? [article] : [];
  const window = new EventTarget();
  window.WebSocket = class {};
  const errors = [];
  const ctx = vm.createContext({
    window, document, HTMLElement: Node, Element: Node,
    location: { href: 'https://example.test/', pathname: '/', hostname: 'example.test' },
    history: { pushState() {}, replaceState() {} },
    localStorage: {
      getItem: () => JSON.stringify({ enabled }), setItem() {}, removeItem() {},
    },
    MutationObserver: class { observe() {} disconnect() {} },
    CustomEvent: class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } },
    console: { error: (...args) => errors.push(args), warn() {}, log() {} },
    URL, setTimeout, clearTimeout, queueMicrotask, setInterval: () => 0,
  });
  vm.runInContext(source, ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert(document.getElementById('mkp-phone-controls'));
  assert(document.getElementById('mkp-phone-ui-style'));
  assert.equal(article.dataset.mkpNoteRoot, enabled ? 'true' : undefined);
  const count = elements.length;
  vm.runInContext(source, ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.length, count, 'Repeated injection must not duplicate controls');
  const controls = document.getElementById('mkp-phone-controls');
  const [panel, toggle] = controls.children;
  toggle.dispatchEvent(new Event('click'));
  assert.equal(panel.hidden, false);
  assert.equal(panel.children.length, 3);
}
await boot(true);
await boot(false);
console.log('Complete WebView injection, basic marking, disabled controls, and duplicate injection checks passed.');

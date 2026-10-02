const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('page freezes defused time and ring, removes urgent color, and resets next round', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  let now = 1000;
  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          const classes = new Set();
          elements.set(id, { style: {}, textContent: '', classes,
            classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } });
        }
        return elements.get(id);
      },
      addEventListener() {},
    },
    performance: { now: () => now },
    // Avoid network requests/timers: exercise the page's rendering with API states.
    fetch: () => new Promise(() => {}),
    AbortSignal: { timeout: () => undefined },
    setInterval() {}, setTimeout() {},
  });
  vm.runInContext(script, context);
  vm.runInContext('state = { planted: true, defused: false, remainingMs: 7900, durationMs: 40000 }; deadline = 8900; render();', context);
  assert.equal(elements.get('app').classes.has('urgent'), true);
  vm.runInContext('state = { planted: false, defused: true, remainingMs: 7900, durationMs: 40000 }; render();', context);
  assert.equal(elements.get('status').textContent, '炸弹已拆除');
  assert.equal(elements.get('time').textContent, '7.9');
  assert.equal(elements.get('app').classes.has('defused'), true);
  assert.equal(elements.get('app').classes.has('urgent'), false);
  const ring = elements.get('progress').style.strokeDashoffset;
  now += 5000;
  vm.runInContext('render();', context);
  assert.equal(elements.get('time').textContent, '7.9');
  assert.equal(elements.get('progress').style.strokeDashoffset, ring);
  vm.runInContext('state = { planted: false, defused: false, remainingMs: 0, durationMs: 40000 }; render();', context);
  assert.equal(elements.get('status').textContent, '炸弹未安放');
  assert.equal(elements.get('time').textContent, '—');
  assert.equal(elements.get('app').classes.has('defused'), false);
});

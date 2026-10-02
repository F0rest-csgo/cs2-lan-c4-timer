const test = require('node:test');
const assert = require('node:assert/strict');
const { BombTimer } = require('../timer');
const { createServer } = require('../server');

function fixture() {
  let now = 0;
  return { timer: new BombTimer(() => now), advance: ms => { now += ms; } };
}
function payload(bomb, phase = 'live', round = 1) {
  return { map: { name: 'de_mirage', round, phase: 'live' }, round: { phase, ...(bomb ? { bomb } : {}) } };
}

test('starts at 40 seconds, repeated planted updates do not restart, clamps at zero', () => {
  const { timer, advance } = fixture();
  timer.update(payload('planted'));
  assert.equal(timer.snapshot().remainingMs, 40000);
  advance(12345);
  timer.update(payload('planted'));
  assert.equal(timer.snapshot().remainingMs, 27655);
  advance(40000);
  assert.equal(timer.snapshot().remainingMs, 0);
  assert.equal(timer.snapshot().planted, true);
});

for (const [bomb, phase] of [[undefined, 'over'], ['planted', 'over'], [undefined, 'freezetime'], ['exploded', 'live']]) {
  test(`clears on ${bomb || phase} and can start next round`, () => {
    const { timer } = fixture();
    timer.update(payload('planted'));
    timer.update(payload(bomb, phase));
    assert.equal(timer.snapshot().planted, false);
    timer.update(payload('planted', 'live', 2));
    assert.equal(timer.snapshot().remainingMs, 40000);
  });
}

test('round change clears old timer even if bomb field is missing', () => {
  const { timer } = fixture();
  timer.update(payload('planted'));
  timer.update(payload(undefined, 'live', 2));
  assert.equal(timer.snapshot().planted, false);
});

test('defuse freezes remaining time through over and duplicate result snapshots', () => {
  const { timer, advance } = fixture();
  timer.update(payload('planted'));
  advance(32100);
  // The round counter can advance at the end of a round.
  timer.update(payload('defused', 'over', 2));
  assert.equal(timer.snapshot().defused, true);
  assert.equal(timer.snapshot().planted, false);
  assert.equal(timer.snapshot().remainingMs, 7900);
  advance(5000);
  timer.update(payload('defused', 'over', 2));
  timer.update(payload(undefined, 'over', 2));
  assert.equal(timer.snapshot().remainingMs, 7900);
  timer.update(payload('defused', 'freezetime', 2));
  assert.equal(timer.snapshot().defused, false);
  assert.equal(timer.snapshot().remainingMs, 0);
});

test('defused result arriving after round over uses the last remaining time', () => {
  const { timer, advance } = fixture();
  timer.update(payload('planted'));
  advance(20000);
  timer.update(payload(undefined, 'over'));
  advance(500);
  timer.update(payload('defused', 'over'));
  assert.equal(timer.snapshot().remainingMs, 20000);
  assert.equal(timer.snapshot().defused, true);
  timer.update(payload(undefined, 'live', 2));
  assert.equal(timer.snapshot().defused, false);
});

test('observer defuse without prior plant shows zero and map/menu changes clear the result', () => {
  const { timer } = fixture();
  timer.update({ ...payload(undefined, 'over'), bomb: { state: 'defused' } });
  assert.equal(timer.snapshot().defused, true);
  assert.equal(timer.snapshot().remainingMs, 0);
  timer.update({ ...payload(), map: { name: 'de_dust2', round: 1, phase: 'live' } });
  assert.equal(timer.snapshot().defused, false);
  timer.update(payload('defused', 'over'));
  timer.update({ provider: { timestamp: 123 } });
  assert.equal(timer.snapshot().defused, false);
});

test('observer bomb state, defusing, missing fields, and warmup', () => {
  const { timer, advance } = fixture();
  timer.update({ ...payload(), bomb: { state: 'planted' } });
  advance(1000);
  timer.update({ ...payload(), bomb: { state: 'defusing' } });
  timer.update(payload());
  assert.equal(timer.snapshot().remainingMs, 39000);
  timer.update({ map: { phase: 'warmup' } });
  assert.equal(timer.snapshot().planted, false);
});

test('connection timeout and out-of-order GSI updates', () => {
  const { timer, advance } = fixture();
  timer.update({ ...payload('planted'), provider: { timestamp: 20 } });
  timer.update({ ...payload('exploded'), provider: { timestamp: 19 } });
  assert.equal(timer.snapshot().planted, true);
  advance(10001);
  assert.equal(timer.snapshot().gsiConnected, false);
});

test('returning to the menu clears the timer', () => {
  const { timer } = fixture();
  timer.update(payload('planted'));
  timer.update({ provider: { timestamp: 123 }, removed: { map: true, round: true } });
  assert.equal(timer.snapshot().planted, false);
  timer.update(payload('planted'));
  assert.equal(timer.snapshot().remainingMs, 40000);
});

test('HTTP page, authenticated GSI, state polling, malformed and oversized requests', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); server.closeAllConnections(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(url)).text(), /炸弹未安放/);
  const post = body => fetch(`${url}/gsi`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
  assert.equal((await post(payload('planted'))).status, 403);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post('null')).status, 400);
  assert.equal((await post('x'.repeat(65537))).status, 413);
  assert.equal((await post({ ...payload('planted'), auth: { token: 'cs2-c4-local-gsi' } })).status, 200);
  const state = await (await fetch(`${url}/api/state`)).json();
  assert.equal(state.planted, true);
  assert.ok(state.remainingMs > 39000 && state.remainingMs <= 40000);
  await post({ ...payload(undefined, 'over'), auth: { token: 'cs2-c4-local-gsi' } });
  assert.equal((await (await fetch(`${url}/api/state`)).json()).planted, false);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { create, act } = require('react-test-renderer');

const state = { tasks: [], events: [], tags: [], subjects: [] };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

// Mock only I/O boundaries while React itself owns state, effects, dependencies and cleanup.
function loadHook(mocks) {
  const filename = require.resolve('../hooks/use-task-sync.ts');
  const original = Module._load;
  delete require.cache[filename];
  Module._load = function (id, ...args) {
    return Object.hasOwn(mocks, id) ? mocks[id] : original.call(this, id, ...args);
  };
  try { return require(filename).useTaskSync; }
  finally { Module._load = original; delete require.cache[filename]; }
}

async function mount(t, options = {}) {
  let now = 0, nextId = 0, root, api, edit;
  const timers = new Map();
  const installTimer = (callback, delay = 0, interval = false) => {
    const id = ++nextId;
    timers.set(id, { callback, at: now + delay, interval: interval ? delay : 0 });
    return id;
  };
  t.mock.method(global, 'setTimeout', (callback, delay) => installTimer(callback, delay));
  t.mock.method(global, 'setInterval', (callback, delay) => installTimer(callback, delay, true));
  t.mock.method(global, 'clearTimeout', id => timers.delete(id));
  t.mock.method(global, 'clearInterval', id => timers.delete(id));
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
  const network = { onLine: true };
  const restoreGlobals = [];
  for (const [key, value] of Object.entries({ window: win, document: doc, navigator: network })) {
    const descriptor = Object.getOwnPropertyDescriptor(global, key);
    Object.defineProperty(global, key, { value, writable: true, configurable: true });
    restoreGlobals.push(() => descriptor ? Object.defineProperty(global, key, descriptor) : delete global[key]);
  }
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  const channels = [], removed = [], calls = [], saves = [], recoveries = [];
  const client = {
    channel(name) {
      const channel = { name, on() { return channel; }, subscribe() { return channel; } };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) { removed.push(channel); return Promise.resolve(); },
  };
  let auth = { user: { id: 'a' }, supabase: client, cloudStatus: 'available' };
  const initial = options.state ?? state;
  const useTaskSync = loadHook({
    '@/context/auth-context': { useAuth: () => auth },
    '@/lib/tasks/storage': {
      loadLocalState: () => options.load ?? Promise.resolve({ state: initial, syncBase: options.base }),
      saveLocalState: async (...args) => { saves.push(args); },
    },
    '@/lib/data/backup': {
      createBackup: async value => value,
      saveRecovery: async value => { recoveries.push(value); },
    },
    '@/lib/sync/round': {
      REMOTE_STATE_TABLE: 'user_state',
      syncOnce: async (supabase, uid, ports) => {
        calls.push({ uid, ports });
        if (options.round) return options.round(uid, ports);
        ports.setBase({ userId: uid, version: 'version', state: ports.getState() });
        ports.markApplied(ports.getState());
        return 'done';
      },
    },
    sonner: { toast: { info() {}, error() {} } },
  });
  function Harness() {
    const [present, setPresent] = React.useState(initial);
    const ref = React.useRef({ present });
    const reset = React.useCallback(value => { ref.current = { present: value }; setPresent(value); }, []);
    edit = reset;
    api = useTaskSync(present, ref, reset);
    return null;
  }
  const unmount = async () => { if (root) { await act(async () => root.unmount()); root = null; } };
  // Restore globals/timers only after React has cleaned up its effects.
  t.after(async () => {
    try { await unmount(); }
    finally { restoreGlobals.forEach(restore => restore()); }
  });
  await act(async () => { root = create(React.createElement(Harness)); });
  return {
    get api() { return api; }, calls, channels, removed, saves, recoveries, errors, network, timers,
    async renderAuth(user) { auth = { ...auth, user }; await act(async () => root.update(React.createElement(Harness))); },
    async edit(value) { await act(async () => edit(value)); },
    async online() { network.onLine = true; await act(async () => win.dispatchEvent(new Event('online'))); },
    nextTimeout() { return Math.min(...[...timers.values()].filter(timer => !timer.interval).map(timer => timer.at - now)); },
    async advance(ms) {
      await act(async () => {
        const end = now + ms;
        for (;;) {
          const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
          if (!next) break;
          const [id, timer] = next;
          now = timer.at;
          if (timer.interval) timer.at += timer.interval;
          else timers.delete(id);
          timer.callback();
        }
        now = end;
      });
    },
    unmount,
  };
}

test('sync waits for local hydration and a token refresh does not restart the account lifecycle', async t => {
  const load = deferred();
  const d = await mount(t, { load: load.promise });
  assert.equal(d.api.isLoading, true);
  assert.equal(d.calls.length, 0);
  await act(async () => load.resolve({ state }));
  assert.equal(d.api.isLoading, false);
  assert.equal(d.api.syncState.status, 'synced');
  assert.equal(d.calls.length, 1);
  await d.renderAuth({ id: 'a', token_refreshed: true });
  assert.equal(d.calls.length, 1);
  assert.equal(d.channels.length, 1);
});

test('retry backoff doubles to its cap, reconnects immediately, and resets after success', async t => {
  let failing = true;
  const d = await mount(t, { round: async (_, ports) => {
    if (failing) throw Error('network unavailable');
    ports.setBase({ userId: 'a', version: 'version', state: ports.getState() });
    ports.markApplied(ports.getState());
    return 'done';
  } });
  for (const delay of [2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
    assert.equal(d.api.syncState.status, 'error');
    assert.equal(d.nextTimeout(), delay);
    await d.advance(delay);
  }
  d.network.onLine = false;
  await d.advance(60000);
  assert.equal(d.api.syncState.status, 'offline');
  assert.equal(d.api.syncState.error, null);
  failing = false;
  await d.online();
  assert.equal(d.api.syncState.status, 'synced');
  assert.equal(d.nextTimeout(), Infinity);
  failing = true;
  await act(async () => d.api.syncNow());
  assert.equal(d.nextTimeout(), 2000);
});

test('local edits debounce against the latest state and sign-out removes timers and subscriptions', async t => {
  const d = await mount(t);
  await d.edit({ ...state, tags: [{ id: 't', name: 'First', color: '#fff' }] });
  assert.equal(d.api.syncState.status, 'pending');
  await d.advance(799);
  assert.equal(d.calls.length, 1);
  await d.edit({ ...state, tags: [{ id: 't', name: 'Latest', color: '#fff' }] });
  await d.advance(799);
  assert.equal(d.calls.length, 1);
  await d.advance(1);
  assert.equal(d.calls.length, 2);
  assert.equal(d.calls[1].ports.getState().tags[0].name, 'Latest');
  await d.renderAuth(null);
  assert.equal(d.api.syncState.status, 'disabled');
  assert.equal(d.removed.length, 1);
  assert.equal(d.timers.size, 0);
  await d.online();
  assert.equal(d.calls.length, 2);
});

test('switching accounts during an in-flight round starts the new account as soon as it settles', async t => {
  const pending = deferred();
  const d = await mount(t, { round: async (uid, ports) => {
    if (uid === 'a') {
      await pending.promise;
      return ports.isActive() ? 'done' : 'aborted';
    }
    ports.setBase({ userId: uid, version: 'version', state: ports.getState() });
    ports.markApplied(ports.getState());
    return 'done';
  } });
  await d.renderAuth({ id: 'b' });
  assert.deepEqual(d.calls.map(call => call.uid), ['a']);
  assert.equal(d.calls[0].ports.isActive(), false);
  await act(async () => pending.resolve());
  await d.advance(0);
  assert.deepEqual(d.calls.map(call => call.uid), ['a', 'b']);
  assert.equal(d.api.syncState.status, 'synced');
  assert.equal(d.removed.length, 1);
});

test('unmount invalidates in-flight work and does not schedule retries or leave listeners', async t => {
  const pending = deferred();
  const d = await mount(t, { round: async () => { await pending.promise; throw Error('network unavailable'); } });
  await d.unmount();
  assert.equal(d.calls[0].ports.isActive(), false);
  await act(async () => pending.resolve());
  assert.equal(d.timers.size, 0);
  assert.equal(d.removed.length, 1);
  await d.online();
  assert.equal(d.calls.length, 1);
});

test('leaving and returning to the same account does not reactivate its stale request', async t => {
  const pending = deferred();
  let first = true;
  const d = await mount(t, { round: async (uid, ports) => {
    if (first) {
      first = false;
      await pending.promise;
      assert.equal(ports.isActive(), false);
      return 'aborted';
    }
    ports.setBase({ userId: uid, version: 'version', state: ports.getState() });
    ports.markApplied(ports.getState());
    return 'done';
  } });
  await d.renderAuth(null);
  await d.renderAuth({ id: 'a' });
  await act(async () => pending.resolve());
  await d.advance(0);
  assert.deepEqual(d.calls.map(call => call.uid), ['a', 'a']);
  assert.equal(d.api.syncState.status, 'synced');
});

test('signing out cancels an error retry and an online event cannot restart it', async t => {
  const d = await mount(t, { round: async () => { throw Error('network unavailable'); } });
  assert.equal(d.nextTimeout(), 2000);
  await d.renderAuth(null);
  assert.equal(d.api.syncState.status, 'disabled');
  assert.equal(d.timers.size, 0);
  await d.advance(60000);
  await d.online();
  assert.equal(d.calls.length, 1);
});

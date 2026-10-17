const { test } = require('node:test');
const assert = require('node:assert/strict');
const { syncOnce } = require('../lib/sync/round.ts');
const { sameState } = require('../lib/sync/merge.ts');

const task = (id, fields = {}) => ({ id, title: id, description: '', status: 'todo', priority: 'medium', steps: [], tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...fields });
const state = (...tasks) => ({ tasks, events: [], tags: [], subjects: [] });
const version = '2099-01-01T00:00:00.000Z';
const copy = value => structuredClone(value);

// Only the Supabase query boundary is simulated: the production read/merge/write round runs unchanged.
function cloud(initial) {
  const db = { row: initial ? { data: copy(initial), updated_at: version } : null, writes: 0, reads: [], afterRead: null, beforeWrite: null, offline: false };
  db.client = { from(table) {
    assert.equal(table, 'user_state');
    let operation, payload, columns;
    const filters = {};
    const query = {
      eq(key, value) { filters[key] = value; return query; },
      update(value) { operation = 'update'; payload = value; return query; },
      insert(value) { operation = 'insert'; payload = value; return query; },
      select(value) {
        columns = value;
        if (!operation) return query;
        return (async () => {
          if (db.offline) throw Error('network unavailable');
          if (db.beforeWrite) await db.beforeWrite();
          if (operation === 'insert' && db.row) return { error: { code: '23505' }, data: null };
          if (operation === 'update') {
            assert.equal(filters.user_id, 'user');
            assert.ok(filters.updated_at, 'updates must compare the version read');
            if (filters.updated_at !== db.row?.updated_at) return { data: [], error: null };
          } else assert.equal(payload.user_id, 'user');
          assert.ok(!db.row || payload.updated_at > db.row.updated_at, 'version advances even with a clock behind the cloud');
          db.row = copy({ data: payload.data, updated_at: payload.updated_at });
          db.writes++;
          return { data: [{ updated_at: payload.updated_at }], error: null };
        })();
      },
      async maybeSingle() {
        if (db.offline) throw Error('network unavailable');
        assert.equal(filters.user_id, 'user');
        db.reads.push(columns);
        const snapshot = copy(db.row);
        if (db.afterRead) await db.afterRead();
        return { data: snapshot && (columns === 'updated_at' ? { updated_at: snapshot.updated_at } : snapshot), error: null };
      },
    };
    return query;
  } };
  return db;
}

function device(local, base = null) {
  const device = { state: local, base, applied: null, saves: [], recoveries: [], active: true };
  device.ports = {
    isActive: () => device.active,
    getState: () => device.state,
    getBase: () => device.base,
    setBase: value => { device.base = value; },
    resetState: value => { device.state = value; },
    markApplied: value => { device.applied = value; },
    preserveAccountState: async value => { device.recoveries.push(value); },
    saveState: async (value, base) => { device.saves.push({ state: value, base }); },
  };
  return device;
}
const baseFor = original => ({ userId: 'user', version, state: original });
const run = (db, device) => syncOnce(db.client, 'user', device.ports);

for (const initialRow of [true, false]) test(`concurrent ${initialRow ? 'updates' : 'inserts'} retry against the winning version and retain both devices`, async () => {
  const original = state(task('original'));
  const db = cloud(initialRow ? original : null);
  const base = initialRow ? baseFor(original) : null;
  const a = device(state(task('a'), ...original.tasks), base);
  const b = device(state(task('b'), ...original.tasks), base);
  let reads = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  db.afterRead = async () => { if (++reads === 2) release(); await barrier; };
  const results = await Promise.all([run(db, a), run(db, b)]);
  assert.deepEqual([...results].sort(), ['conflict', 'done']);
  const loser = results[0] === 'conflict' ? a : b;
  assert.equal(loser.base, base, 'a rejected write must not advance the merge base');
  assert.equal(loser.saves.length, 0);
  db.afterRead = null;
  assert.equal(await run(db, loser), 'done');
  assert.deepEqual(db.row.data.tasks.map(t => t.id).sort(), ['a', 'b', 'original']);
  assert.ok(sameState(loser.base.state, db.row.data));
  assert.equal(db.writes, 2);
});

test('offline edits survive a failed round and merge cloud edits after reconnecting', async () => {
  const original = state(task('a'), task('b'));
  const db = cloud(original);
  const d = device(state(task('a', { title: 'Offline' }), original.tasks[1]), baseFor(original));
  const before = d.state;
  db.offline = true;
  await assert.rejects(run(db, d), /network/);
  assert.equal(d.state, before);
  assert.equal(d.base.version, version);
  assert.equal(d.saves.length, 0);
  db.offline = false;
  db.row.data.tasks[1].description = 'Other device';
  db.row.updated_at = '2099-01-02T00:00:00.000Z';
  assert.equal(await run(db, d), 'done');
  assert.equal(db.row.data.tasks[0].title, 'Offline');
  assert.equal(db.row.data.tasks[1].description, 'Other device');
});

test('edits during a read are merged, and edits during an upload remain pending with their matching base', async () => {
  const original = state(task('a'));
  const db = cloud(original);
  const d = device(state(task('a', { title: 'Local' })), baseFor(original));
  db.afterRead = async () => { d.state = state(task('a', { title: 'During read' })); };
  db.beforeWrite = async () => { d.state = state(task('a', { title: 'During upload' })); };
  await run(db, d);
  assert.equal(db.row.data.tasks[0].title, 'During read');
  assert.equal(d.state.tasks[0].title, 'During upload');
  assert.equal(d.base.state.tasks[0].title, 'During read');
  assert.notEqual(d.applied, d.state);
  assert.equal(d.saves[0].state, d.state);
  assert.equal(d.saves[0].base, d.base);
  db.afterRead = db.beforeWrite = null;
  await run(db, d);
  assert.equal(db.row.data.tasks[0].title, 'During upload');
  assert.equal(d.applied, d.state);
});

test('an unchanged device checks only the cloud version without replacing state or writing', async () => {
  const original = state(task('a'));
  const db = cloud(original);
  const d = device(original, baseFor(original));
  assert.equal(await run(db, d), 'done');
  assert.equal(d.state, original);
  assert.equal(d.applied, original);
  assert.deepEqual(db.reads, ['updated_at']);
  assert.equal(db.writes, 0);
  assert.equal(d.saves.length, 0);
});

test('invalid remote data and a failed account recovery never replace local state or write', async () => {
  const local = state(task('private'));
  const db = cloud(state(task('cloud')));
  const d = device(local, { userId: 'previous-account', version, state: local });
  db.row.data = { invalid: true };
  await assert.rejects(run(db, d), /formato válido/);
  db.row.data = state(task('cloud'));
  d.ports.preserveAccountState = async () => { throw Error('recovery failed'); };
  await assert.rejects(run(db, d), /recovery failed/);
  assert.equal(d.state, local);
  assert.equal(d.base.userId, 'previous-account');
  assert.equal(db.writes, 0);
  assert.equal(d.saves.length, 0);
});

test('account changes during a read abort before applying data, and account switches back up before replacing', async () => {
  const local = state(task('private'));
  const remote = state(task('cloud'));
  const db = cloud(remote);
  const d = device(local, { userId: 'previous-account', version, state: local });
  db.afterRead = async () => { d.active = false; };
  assert.equal(await run(db, d), 'aborted');
  assert.equal(d.state, local);
  assert.equal(d.recoveries.length, 0);
  db.afterRead = null;
  d.active = true;
  d.ports.preserveAccountState = async value => {
    assert.equal(d.state, local, 'recover before replacing');
    d.recoveries.push(value);
  };
  assert.equal(await run(db, d), 'done');
  assert.deepEqual(d.recoveries, [local]);
  assert.ok(sameState(d.state, remote));
  assert.equal(db.writes, 0);
  assert.equal(d.base.userId, 'user');
});

test('a cloud copy written by a version without subjects keeps the subjects and their assignments', async () => {
  const subject = { id: 's1', name: 'Castellano', color: '#3b82f6' };
  const original = { ...state(task('a', { subjectId: 's1' })), subjects: [subject] };
  const db = cloud(original);
  // The old version keeps unknown task fields but uploads no `subjects` list.
  const { subjects: _dropped, ...legacy } = copy(original);
  legacy.tasks.push(task('b'));
  db.row.data = legacy;
  db.row.updated_at = '2099-01-02T00:00:00.000Z';
  const d = device(copy(original), baseFor(original));
  assert.equal(await run(db, d), 'done');
  assert.deepEqual(d.state.subjects, [subject]);
  assert.equal(d.state.tasks.find(t => t.id === 'a').subjectId, 's1');
  assert.ok(d.state.tasks.some(t => t.id === 'b'));
  assert.deepEqual(db.row.data.subjects, [subject], 'the list is written back for updated devices');
});

test('a first sync against a cloud copy without subjects keeps the subjects of this device', async () => {
  const subject = { id: 's1', name: 'Física', color: '#22c55e' };
  const db = cloud(state(task('cloud')));
  delete db.row.data.subjects;
  const d = device({ ...state(task('local', { subjectId: 's1' })), subjects: [subject] });
  assert.equal(await run(db, d), 'done');
  assert.deepEqual(d.state.subjects, [subject]);
  assert.equal(d.state.tasks.find(t => t.id === 'local').subjectId, 's1');
});

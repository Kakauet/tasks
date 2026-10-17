const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeStates, sameState, stableStringify } = require('../lib/sync/merge.ts');
const { createDefaultState } = require('../lib/tasks/model.ts');

const task = (id, fields = {}) => ({ id, title: id, description: '', status: 'todo', priority: 'medium', steps: [], tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...fields });
const event = (id, fields = {}) => ({ id, title: id, description: '', date: '2026-01-05', tags: [], isGraded: false, ...fields });
const tag = (id, name = id) => ({ id, name, color: '#3b82f6' });
const state = (tasks = [], events = [], tags = [], subjects = []) => ({ tasks, events, tags, subjects });
const edit = (record, fields) => ({ ...record, ...fields });
const ids = records => records.map(record => record.id);

test('edits to different tasks on two devices are both kept', () => {
  const base = state([task('a'), task('b')]);
  const local = state([edit(base.tasks[0], { title: 'A local', updatedAt: '2026-01-02T00:00:00.000Z' }), base.tasks[1]]);
  const remote = state([base.tasks[0], edit(base.tasks[1], { status: 'done', updatedAt: '2026-01-03T00:00:00.000Z' })]);
  const merged = mergeStates(base, local, remote);
  assert.equal(merged.tasks[0].title, 'A local');
  assert.equal(merged.tasks[1].status, 'done');
});

test('different fields of the same task merge, and the newer edit wins a real conflict', () => {
  const base = state([task('a', { steps: [{ id: 's1', text: 'Uno', completed: false }, { id: 's2', text: 'Dos', completed: false }] })]);
  const [original] = base.tasks;
  const local = state([edit(original, { title: 'Local', priority: 'high', steps: [{ ...original.steps[0], completed: true }, original.steps[1]], updatedAt: '2026-01-02T00:00:00.000Z' })]);
  const remote = state([edit(original, { title: 'Remoto', description: 'Nota', steps: [original.steps[0], { ...original.steps[1], completed: true }], updatedAt: '2026-01-03T00:00:00.000Z' })]);
  const [merged] = mergeStates(base, local, remote).tasks;
  assert.equal(merged.title, 'Remoto', 'the remote edit is newer');
  assert.equal(merged.priority, 'high');
  assert.equal(merged.description, 'Nota');
  assert.deepEqual(merged.steps.map(step => step.completed), [true, true]);
  assert.equal(merged.updatedAt, '2026-01-03T00:00:00.000Z');
});

test('deletions propagate, but a record edited on the other side survives', () => {
  const [deleted, edited, kept] = [task('deleted'), task('edited'), task('kept')];
  const base = state([deleted, edited, kept]);
  // This device deleted "edited"; the other deleted "deleted" and changed "edited".
  const local = state([deleted, kept]);
  const remote = state([edit(edited, { title: 'Cambiado', updatedAt: '2026-01-02T00:00:00.000Z' }), kept]);
  assert.deepEqual(ids(mergeStates(base, local, remote).tasks), ['edited', 'kept']);
  assert.deepEqual(ids(mergeStates(base, state([kept]), state([edited, kept])).tasks), ['kept']);
});

test('tasks added on both devices are kept where they were inserted', () => {
  const base = state([task('a'), task('b')]);
  const local = state([task('new-local'), task('a'), task('b')]);
  const remote = state([task('a'), task('new-remote'), task('b')]);
  assert.deepEqual(ids(mergeStates(base, local, remote).tasks), ['new-local', 'a', 'new-remote', 'b']);
  const reordered = state([task('b'), task('a')]);
  assert.deepEqual(ids(mergeStates(base, reordered, remote).tasks), ['b', 'a', 'new-remote']);
});

test('a new device without data takes the cloud copy instead of uploading empty starter data', () => {
  const remote = state([task('cloud')], [], [tag('t1', 'Trabajo')]);
  const merged = mergeStates(null, createDefaultState(), remote);
  assert.ok(sameState(merged, remote));
});

test('first sign-in with local work combines both copies and reuses tags with the same name', () => {
  const local = state([task('offline', { tags: ['local-work'] })], [], [tag('local-work', 'Trabajo'), tag('local-only', 'Casa')]);
  const remote = state([task('cloud', { tags: ['cloud-work'] })], [], [tag('cloud-work', 'trabajo')]);
  const merged = mergeStates(null, local, remote);
  assert.deepEqual(ids(merged.tasks).sort(), ['cloud', 'offline']);
  assert.deepEqual(ids(merged.tags).sort(), ['cloud-work', 'local-only']);
  assert.deepEqual(merged.tasks.find(t => t.id === 'offline').tags, ['cloud-work']);
});

test('a tag deleted on one device is removed from tasks tagged on the other', () => {
  const base = state([task('a'), task('b')], [], [tag('t')]);
  const local = state([edit(base.tasks[0], { tags: ['t'], updatedAt: '2026-01-02T00:00:00.000Z' }), base.tasks[1]], [], [tag('t')]);
  const remote = state(base.tasks, [], []);
  const merged = mergeStates(base, local, remote);
  assert.deepEqual(merged.tags, []);
  assert.deepEqual(merged.tasks[0].tags, []);
});

test('tag lists on a task merge additions and removals from both sides', () => {
  const tags = [tag('x'), tag('y'), tag('z')];
  const base = state([task('a', { tags: ['x', 'y'] })], [], tags);
  const local = state([edit(base.tasks[0], { tags: ['x', 'y', 'z'] })], [], tags);
  const remote = state([edit(base.tasks[0], { tags: ['y'] })], [], tags);
  assert.deepEqual(mergeStates(base, local, remote).tasks[0].tags, ['y', 'z']);
});

test('a recurring series rescheduled on both devices keeps a single set of occurrences', () => {
  const parent = event('p', { recurrence: { type: 'weekly', interval: 1, occurrences: 3 } });
  const base = state([], [parent, event('b1', { parentEventId: 'p', date: '2026-01-12' }), event('b2', { parentEventId: 'p', date: '2026-01-19' })]);
  const local = state([], [edit(parent, { date: '2026-01-06' }), event('l1', { parentEventId: 'p', date: '2026-01-13' }), event('l2', { parentEventId: 'p', date: '2026-01-20' })]);
  const remote = state([], [edit(parent, { title: 'Clase' }), base.events[1]]);
  const merged = mergeStates(base, local, remote);
  assert.deepEqual(ids(merged.events).sort(), ['l1', 'l2', 'p']);
  assert.equal(merged.events.find(e => e.id === 'p').title, 'Clase');
  assert.equal(merged.events.find(e => e.id === 'p').date, '2026-01-06');
});

test('occurrences of a series deleted on the other device are not left behind', () => {
  const base = state([], [event('p', { recurrence: { type: 'daily', interval: 1 } }), event('c', { parentEventId: 'p' })]);
  const local = state([], [base.events[0], edit(base.events[1], { grade: '9', isGraded: true })]);
  assert.deepEqual(mergeStates(base, local, state()).events, []);
});

test('the cloud copy compares equal regardless of key order and undefined fields', () => {
  const local = task('a', { dueDate: undefined });
  const fromJsonb = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(local))).reverse());
  assert.equal(stableStringify(local), stableStringify(fromJsonb));
  const base = state([local]);
  assert.ok(sameState(mergeStates(base, base, state([fromJsonb])), base));
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { useTaskOperations } = require('../hooks/use-task-operations.ts');
const { createHistory, recordHistory, undoHistory, redoHistory } = require('../lib/tasks/history.ts');

const task = (id, fields = {}) => ({ id, title: id, description: '', status: 'todo', priority: 'medium', steps: [], tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...fields });
const event = (id, fields = {}) => ({ id, title: id, description: '', date: '2026-01-05', isGraded: false, tags: [], ...fields });
const state = (tasks = [], events = [], tags = [], subjects = []) => ({ tasks, events, tags, subjects });

// React's existing server renderer supplies hooks; commands write to the same pure history used in production.
// No DOM, timers, mock dispatcher or additional test framework is needed.
function commands(initial) {
  let history = createHistory(initial), api;
  const record = next => { history = recordHistory(history, next); };
  const update = producer => { const next = producer(history.present); if (next) record(next); };
  function Harness() { api = useTaskOperations(history.present, update, record); return null; }
  renderToStaticMarkup(React.createElement(Harness));
  return { api, get history() { return history; }, undo() { history = undoHistory(history); }, redo() { history = redoHistory(history); } };
}

test('history has bounded undo, preserves redo for no-ops and clears it for a new edit', () => {
  let history = createHistory(state());
  assert.equal(undoHistory(history), history);
  assert.equal(redoHistory(history), history);
  for (let i = 0; i < 55; i++) history = recordHistory(history, state([task(String(i))]));
  assert.equal(history.past.length, 50);
  const undone = undoHistory(history);
  assert.equal(undone.present.tasks[0].id, '53');
  assert.equal(recordHistory(undone, { ...undone.present }), undone);
  assert.deepEqual(redoHistory(undone), history);
  assert.equal(recordHistory(undone, state([task('branch')])).future.length, 0);
  const reset = createHistory(history.present);
  assert.equal(reset.present, history.present);
  assert.equal(reset.past.length + reset.future.length, 0);
});

test('deleting a tag updates related tasks and events atomically and undo/redo restores all references', () => {
  const initial = state([task('a', { tags: ['t'] })], [event('e', { tags: ['t'] })], [{ id: 't', name: 'Tag', color: '#fff' }]);
  const d = commands(initial);
  d.api.deleteTag('t');
  assert.equal(d.history.past.length, 1);
  const deleted = d.history.present;
  assert.deepEqual(deleted.tags, []);
  assert.deepEqual(deleted.tasks[0].tags, []);
  assert.deepEqual(deleted.events[0].tags, []);
  d.undo();
  assert.equal(d.history.present, initial);
  d.redo();
  assert.equal(d.history.present, deleted);
});

test('sequential commands build on the latest state before a render; no-ops preserve timestamps and redo', () => {
  const initial = state([task('a')]);
  const d = commands(initial);
  d.api.updateTask('a', { title: 'Changed' });
  d.api.addTagToTask('a', 't');
  assert.equal(d.history.present.tasks[0].title, 'Changed');
  assert.deepEqual(d.history.present.tasks[0].tags, ['t']);
  d.undo();
  const before = d.history;
  d.api.updateTask('missing', { title: 'x' });
  d.api.updateTask('a', { title: ' Changed ' });
  d.api.updateTask('a', { title: ' ' });
  d.api.updateStep('a', 'missing', { completed: true });
  d.api.deleteStep('a', 'missing');
  d.api.deleteEvent('missing');
  d.api.deleteTag('missing');
  d.api.moveTask('a', 'todo', 0);
  d.api.bulkUpdateTasks([{ id: 'a', updates: { description: '' } }]);
  d.api.bulkDeleteTasks(['missing']);
  assert.equal(d.history, before);
  d.redo();
  assert.deepEqual(d.history.present.tasks[0].tags, ['t']);
});

test('bulk edits produce one undo entry, retain other records and preserve last-update-wins semantics', () => {
  const initial = state([task('a'), task('b'), task('c')]);
  const d = commands(initial);
  d.api.bulkUpdateTasks([{ id: 'a', updates: { title: 'Ignored' } }, { id: 'a', updates: { status: 'done' } }, { id: 'b', updates: { priority: 'high' } }]);
  assert.equal(d.history.past.length, 1);
  assert.equal(d.history.present.tasks[0].title, 'a');
  assert.equal(d.history.present.tasks[0].status, 'done');
  assert.equal(d.history.present.tasks[1].priority, 'high');
  assert.equal(d.history.present.tasks[0].updatedAt, d.history.present.tasks[1].updatedAt);
  assert.equal(d.history.present.tasks[2], initial.tasks[2]);
  d.undo();
  assert.equal(d.history.present, initial);
});

test('series metadata edits retain occurrence identity, moved dates and grades; deletion is reversible', () => {
  const parent = event('p', { recurrence: { type: 'weekly', interval: 1, occurrences: 3 } });
  const child = event('c', { parentEventId: 'p', date: '2026-01-14', isGraded: true, grade: '9' });
  const initial = state([], [parent, child, event('unrelated')]);
  const d = commands(initial);
  d.api.updateEvent('p', { title: 'Series' });
  const updated = d.history.present;
  assert.equal(updated.events[1].id, 'c');
  assert.equal(updated.events[1].title, 'Series');
  assert.equal(updated.events[1].date, child.date);
  assert.equal(updated.events[1].grade, '9');
  assert.equal(updated.events[2], initial.events[2]);
  d.api.deleteEvent('p');
  assert.deepEqual(d.history.present.events.map(e => e.id), ['unrelated']);
  d.undo();
  assert.equal(d.history.present, updated);
  d.undo();
  assert.equal(d.history.present, initial);
});

test('moving one occurrence leaves the series intact; moving its parent regenerates dates and calendar duration', () => {
  const parent = event('p', { date: '2026-10-24', endDate: '2026-10-26', isMultiDay: true, recurrence: { type: 'weekly', interval: 1, occurrences: 3 } });
  const initial = state([], [parent, event('c', { parentEventId: 'p', date: '2026-10-31' })]);
  const d = commands(initial);
  d.api.moveEvent('c', '2026-11-01');
  assert.equal(d.history.present.events[0], parent);
  assert.equal(d.history.present.events[1].date, '2026-11-01');
  d.api.moveEvent('p', '2026-10-25');
  assert.deepEqual(d.history.present.events.map(e => [e.date, e.endDate]), [
    ['2026-10-25', '2026-10-27'], ['2026-11-01', '2026-11-03'], ['2026-11-08', '2026-11-10'],
  ]);
  assert.ok(d.history.present.events.slice(1).every(e => e.parentEventId === 'p'));
  const before = d.history;
  d.api.moveEvent('p', '2026-10-25');
  assert.equal(d.history, before);
});

test('invalid imports leave history intact, valid imports are one reversible replacement', () => {
  const initial = state([task('local')]);
  const d = commands(initial);
  const before = d.history;
  assert.throws(() => d.api.importData(state([task('valid'), { id: 'broken' }])));
  assert.equal(d.history, before);
  const imported = state([task('imported')]);
  d.api.importData({ ...imported, exportDate: '2026-01-01', version: '2.0' });
  assert.equal(d.history.past.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(d.history.present)), imported);
  d.undo();
  assert.equal(d.history.present, initial);
});

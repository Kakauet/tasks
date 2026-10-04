const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parsePersistedState, repairPersistedState, normalizeEventRecord } = require('../lib/tasks/model.ts');
const { generateRecurringEvents } = require('../lib/tasks/recurrence.ts');
const { insertTask } = require('../lib/tasks/order.ts');
const { exceedsTouchSlop, dragScrollVelocity, nearestColumnIndex, dropSide } = require('../lib/ui/dnd.ts');
const { sortTasks, getSortedTaskGroups, updateColumnSorts, parseColumnSorts } = require('../lib/tasks/view.ts');
const { AppearanceScript } = require('../components/appearance-script.tsx');
const { buildAccentTokens, ACCENT_PRESETS } = require('../lib/appearance.ts');
const task = (id, status = 'todo') => ({ id, status, title: id, description: '', priority: 'medium', steps: [], tags: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' });
const event = { id: 'event', title: 'Evento', description: '', date: '2026-01-31', tags: [], isGraded: false };
const state = { tasks: [task('one')], events: [event], tags: [] };

test('valid exports retain an intentionally empty tag list', () => {
  assert.deepEqual(parsePersistedState(state).tags, []);
});
test('invalid records, duplicates, dates and nested arrays are rejected atomically', () => {
  for (const tasks of [[null], [{...task('one'), steps: [null]}], [{...task('one'), tags: 'wrong'}], [task('one'), task('one')], [{...task('one'), dueDate: 'bad'}]]) {
    assert.equal(parsePersistedState({...state, tasks}), null);
  }
  assert.equal(parsePersistedState({...state, events: [{...event, date: '2026-02-31'}]}), null);
  assert.equal(parsePersistedState({...state, events: [{...event, recurrence: { type: 'daily', interval: 0 }}]}), null);
});
test('saved data with one damaged record is repaired instead of discarding the workspace', () => {
  const damaged = {
    tasks: [task('keep'), {...task('blank'), title: '  ', priority: 'urgent'}, {title: 'no id'}, task('keep')],
    events: [{...event, title: '', isMultiDay: true, endDate: '2026-01-10'}],
    tags: [{id: 'tag', name: 'Clase'}],
  };
  assert.equal(parsePersistedState(damaged), null, 'imports stay strict');
  const repaired = repairPersistedState(damaged);
  assert.deepEqual(repaired.tasks.map(t => t.id), ['keep', 'blank']);
  assert.equal(repaired.tasks[1].title, 'Sin título');
  assert.equal(repaired.tasks[1].priority, 'medium');
  assert.equal(repaired.events[0].isMultiDay, false);
  assert.equal(repaired.events[0].endDate, undefined);
  assert.equal(repaired.tags[0].color, '#6b7280');
  assert.ok(parsePersistedState(repaired), 'repaired data is valid');
  assert.equal(repairPersistedState('garbage'), null);
});
test('a multi-day event ending before it starts becomes a single-day event', () => {
  const normalized = normalizeEventRecord({...event, date: '2026-10-20', endDate: '2026-10-05', isMultiDay: true});
  assert.equal(normalized.isMultiDay, false);
  assert.equal(normalized.endDate, undefined);
  assert.equal(normalizeEventRecord({...event, date: '2026-10-20', endDate: '2026-10-22', isMultiDay: true}).endDate, '2026-10-22');
});
test('a never-ending weekly event repeats for a whole year, and a fixed count can go beyond it', () => {
  const weekly = generateRecurringEvents({...event, date: '2026-09-14'}, {type: 'weekly', interval: 1});
  assert.equal(weekly.length, 52);
  assert.equal(weekly.at(-1).date, '2027-09-13');
  assert.equal(generateRecurringEvents(event, {type: 'weekly', interval: 1, occurrences: 60}).length, 59);
});
test('moving into interleaved columns respects the visible insertion index', () => {
  const tasks = [task('a'), task('b', 'done'), task('c'), task('moving', 'inProgress')];
  const result = insertTask(tasks, tasks[3], 'todo', 1);
  assert.deepEqual(result.filter(t => t.status === 'todo').map(t => t.id), ['a', 'moving', 'c']);
  assert.deepEqual(tasks.map(t => t.id), ['a', 'b', 'c', 'moving']);
});

test('a newly created task is inserted before the first task of its own column', () => {
  const tasks = [task('todo-a'), task('done-a', 'done'), task('todo-b'), task('progress-a', 'inProgress')];
  const fresh = task('fresh', 'todo');
  const result = insertTask(tasks, fresh, fresh.status, 0);
  assert.deepEqual(result.filter(item => item.status === 'todo').map(item => item.id), ['fresh', 'todo-a', 'todo-b']);
  assert.deepEqual(result.filter(item => item.status === 'done').map(item => item.id), ['done-a']);
  assert.deepEqual(result.filter(item => item.status === 'inProgress').map(item => item.id), ['progress-a']);
});

test('dropping in the original position preserves data identity and the undo history', () => {
  const tasks = [task('a'), task('other', 'done'), task('b')];
  assert.equal(insertTask(tasks, tasks[0], 'todo', 0), tasks);
  assert.equal(insertTask(tasks, tasks[2], 'todo', 1), tasks);
  assert.deepEqual(insertTask(tasks, tasks[0], 'todo', 1).filter(t => t.status === 'todo').map(t => t.id), ['b', 'a']);
});

test('touch intent tolerates jitter but yields to deliberate scrolling in every direction', () => {
  const start = {x: 100, y: 200};
  assert.equal(exceedsTouchSlop(start, {x: 106, y: 208}), false);
  for (const point of [{x:111,y:200}, {x:89,y:200}, {x:100,y:211}, {x:100,y:189}]) {
    assert.equal(exceedsTouchSlop(start, point), true);
  }
});

test('auto-scroll follows pointer height beyond the list and chooses the nearest column by x', () => {
  assert.equal(dragScrollVelocity(50, 100, 600), -780);
  assert.equal(dragScrollVelocity(650, 100, 600), 780);
  assert.equal(dragScrollVelocity(300, 100, 600), 0);
  assert.equal(dragScrollVelocity(100, 100, 600), -780);
  assert.equal(dragScrollVelocity(600, 100, 600), 780);
  assert(dragScrollVelocity(590, 100, 600) > dragScrollVelocity(550, 100, 600));
  assert.equal(dragScrollVelocity(100, 100, 100), 0);
  const columns = [{left: 20, right: 200}, {left: 220, right: 400}, {left: 420, right: 600}];
  assert.equal(nearestColumnIndex(2, columns), 0);
  assert.equal(nearestColumnIndex(610, columns), 2);
  assert.equal(nearestColumnIndex(310, columns), 1);
  assert.equal(nearestColumnIndex(210, columns, 1), 1);
  assert.equal(nearestColumnIndex(210, columns, 0), 0);
  assert.equal(nearestColumnIndex(10, []), -1);
});

test('insertion hysteresis holds the intended side near the midpoint', () => {
  assert.equal(dropSide(149, 100, 100, null), 'before');
  assert.equal(dropSide(154, 100, 100, 'before'), 'before');
  assert.equal(dropSide(146, 100, 100, 'after'), 'after');
  assert.equal(dropSide(170, 100, 100, 'before'), 'after');
  assert.equal(dropSide(130, 100, 100, 'after'), 'before');
});
test('task sorting keeps manual order intact and handles priority, names and missing due dates', () => {
  const tasks = [
    {...task('zeta'), priority: 'low', dueDate: undefined},
    {...task('Álfa'), priority: 'high', dueDate: '2026-10-01'},
    {...task('beta'), priority: 'high', dueDate: '2026-09-25'},
  ];
  assert.deepEqual(sortTasks(tasks, 'priority').map(item => item.id), ['Álfa', 'beta', 'zeta']);
  assert.deepEqual(sortTasks(tasks, 'name').map(item => item.id), ['Álfa', 'beta', 'zeta']);
  assert.deepEqual(sortTasks(tasks, 'dueDate').map(item => item.id), ['beta', 'Álfa', 'zeta']);
  assert.deepEqual(sortTasks(tasks, 'manual'), tasks);
  assert.deepEqual(tasks.map(item => item.id), ['zeta', 'Álfa', 'beta']);
});
test('column sorting only updates the chosen column and can be applied to all columns', () => {
  const initial = { todo: 'manual', inProgress: 'name', done: 'newest' };
  const updated = updateColumnSorts(initial, 'todo', 'priority');
  assert.deepEqual(updated, { todo: 'priority', inProgress: 'name', done: 'newest' });
  assert.equal(initial.todo, 'manual');
  assert.deepEqual(updateColumnSorts(updated, 'all', 'dueDate'), { todo: 'dueDate', inProgress: 'dueDate', done: 'dueDate' });
});
test('saved column sorts recover valid choices and tolerate missing or corrupt storage', () => {
  const manual = { todo: 'manual', inProgress: 'manual', done: 'manual' };
  for (const raw of [null, '', 'broken', 'null', '[]', '42']) assert.deepEqual(parseColumnSorts(raw), manual);
  assert.deepEqual(parseColumnSorts('{"todo":"name","inProgress":"bad","done":"dueDate"}'), { todo: 'name', inProgress: 'manual', done: 'dueDate' });
  assert.deepEqual(parseColumnSorts('{"todo":"priority","inProgress":"newest","done":"manual"}'), { todo: 'priority', inProgress: 'newest', done: 'manual' });
});
test('each column maintains its own order after moving a task into a sorted column', () => {
  const tasks = [
    {...task('zeta'), priority: 'low'}, {...task('alfa'), priority: 'high'},
    task('zulu', 'inProgress'), task('beta', 'inProgress'),
    task('last', 'done'), task('first', 'done'),
  ];
  const sorts = { todo: 'priority', inProgress: 'name', done: 'manual' };
  const groups = getSortedTaskGroups(tasks, sorts);
  assert.deepEqual(groups.todo.map(t => t.id), ['alfa', 'zeta']);
  assert.deepEqual(groups.inProgress.map(t => t.id), ['beta', 'zulu']);
  assert.deepEqual(groups.done.map(t => t.id), ['last', 'first']);
  const moved = getSortedTaskGroups(insertTask(tasks, tasks[1], 'inProgress'), sorts);
  assert.deepEqual(moved.inProgress.map(t => t.id), ['alfa', 'beta', 'zulu']);
  assert.deepEqual(getSortedTaskGroups(tasks, {todo:'manual', inProgress:'manual', done:'manual'}).todo.map(t => t.id), ['zeta', 'alfa']);
});
test('monthly recurrence stays anchored to the original day after February', () => {
  assert.deepEqual(generateRecurringEvents(event, {type: 'monthly', interval: 1, occurrences: 4}).map(e => e.date), ['2026-02-28', '2026-03-31', '2026-04-30']);
});
test('multi-day recurrence preserves calendar duration across the autumn clock change', () => {
  process.env.TZ = 'Europe/Madrid';
  const result = generateRecurringEvents({...event, date: '2026-10-24', endDate: '2026-10-26', isMultiDay: true}, {type: 'weekly', interval: 1, occurrences: 2});
  assert.equal(result[0].date, '2026-10-31');
  assert.equal(result[0].endDate, '2026-11-02');
});
test('startup applies saved colors before React and tolerates unavailable storage', () => {
  const script = AppearanceScript().props.dangerouslySetInnerHTML.__html;
  for (const blocked of [false, true]) {
    const values = new Map();
    vm.runInNewContext(script, {
      document: {documentElement: {style: {setProperty: (k,v) => values.set(k,v)}}},
      localStorage: {getItem: key => { if (blocked) throw Error('blocked'); return key === 'taskmaster-accent-id' ? 'rose' : null; }},
    });
    const preset = ACCENT_PRESETS.find(p => p.id === (blocked ? 'blue' : 'rose'));
    assert.equal(values.get('--primary-light'), buildAccentTokens(preset).primaryLight);
    assert.equal(values.get('--board-todo-color'), '215 16% 47%');
  }
});

test('appearance presets keep neutral surfaces distinct in dark mode', () => {
  const neutral = require('../lib/appearance.ts').DARK_MODE_PRESETS.find(preset => preset.id === 'gray-dark');
  assert.equal(neutral.tokens.background, '220 8% 7%');
  assert.notEqual(neutral.tokens.background, neutral.tokens.card);
  assert.notEqual(neutral.tokens.card, neutral.tokens.border);
});

const focus = require('../lib/focus.ts');
test('pomodoro credits finished focus time, survives a reload and keeps time when switching duration', () => {
  const start = 1_000_000;
  let state = focus.createFocusState('task', '25-5', start);
  state = focus.pauseFocus(state, start + 10 * 60_000);
  assert.equal(focus.formatClock(focus.remainingMs(state, start + 99 * 60_000)), '15:00', 'paused time does not run');
  assert.equal(focus.elapsedFocusSeconds(state, start), 600);
  const longer = focus.changePreset(state, '50-10', start);
  assert.equal(focus.remainingMs(longer, start), 40 * 60_000);
  state = focus.resumeFocus(state, start + 20 * 60_000);
  // Page closed: the focus phase and the following break both ended meanwhile.
  const advanced = focus.advanceFocus(state, start + 60 * 60_000);
  assert.equal(advanced.creditedSeconds, 1500);
  assert.equal(advanced.finishedFocus, 1);
  assert.equal(advanced.state.phase, 'focus');
  assert.equal(advanced.state.endsAt, null, 'next pomodoro waits for the student');
  assert.equal(focus.parseFocusState(JSON.stringify(advanced.state)).completedSessions, 1);
  assert.equal(focus.parseFocusState('{"taskId":1}'), null);
});
test('the fourth pomodoro is followed by a long break and short skips are not credited', () => {
  let state = { ...focus.createFocusState('task', '25-5', 0), completedSessions: 3 };
  const result = focus.advanceFocus(state, 25 * 60_000);
  assert.ok(focus.isLongBreak(result.state));
  assert.equal(focus.remainingMs(result.state, 25 * 60_000), 15 * 60_000);
  const quick = focus.skipPhase(focus.createFocusState('task', '25-5', 0), 30_000);
  assert.equal(quick.creditedSeconds, 0);
  assert.equal(quick.state.phase, 'break');
  assert.equal(focus.formatStudyTime(3900), '1 h 5 min');
  assert.equal(focus.formatStudyTime(1500), '25 min');
});

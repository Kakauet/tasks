require('fake-indexeddb/auto');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { useTaskOperations } = require('../hooks/use-task-operations.ts');
const { createHistory, recordHistory, undoHistory, redoHistory } = require('../lib/tasks/history.ts');
const { parsePersistedState, repairPersistedState } = require('../lib/tasks/model.ts');
const { summarizeSubject, inScope, isGradePending, parseGrade, averageGrade, formatDaysAway, countsAsPending, isThreshold, looksLikeExam, findSubjectInTitle, buildGradeReport, applyTitleDetection, describeDetection } = require('../lib/tasks/subjects.ts');
const { mergeStates } = require('../lib/sync/merge.ts');
const { inspectBackup, createBackup, planImport } = require('../lib/data/backup.ts');

const TODAY = '2026-03-10';
const task = (id, fields = {}) => ({ id, title: id, description: '', status: 'todo', priority: 'medium', steps: [], tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...fields });
const event = (id, fields = {}) => ({ id, title: id, description: '', date: '2026-01-05', isGraded: false, tags: [], ...fields });
const subject = (id, name = id, fields = {}) => ({ id, name, color: '#3b82f6', ...fields });
const state = (tasks = [], events = [], tags = [], subjects = []) => ({ tasks, events, tags, subjects });

test('a pending grade only appears after the last scheduled day of an evaluable event', () => {
  const exam = event('exam', { date: '2026-03-09', isGraded: true, grade: '  ' });
  assert.equal(isGradePending(exam, TODAY), true);
  assert.equal(isGradePending({ ...exam, date: TODAY }, TODAY), false);
  assert.equal(isGradePending({ ...exam, date: '2026-03-11' }, TODAY), false);
  assert.equal(isGradePending({ ...exam, isGraded: false }, TODAY), false);
  assert.equal(isGradePending({ ...exam, grade: '0' }, TODAY), false);
  assert.equal(isGradePending({ ...exam, grade: 'Notable' }, TODAY), false);
  const multiDay = { ...exam, isMultiDay: true, endDate: TODAY };
  assert.equal(isGradePending(multiDay, TODAY), false);
  assert.equal(isGradePending(multiDay, '2026-03-11'), true);
  assert.equal(buildGradeReport([], [multiDay], TODAY).groups[0].entries[0].state, 'upcoming');
  assert.equal(buildGradeReport([], [multiDay], '2026-03-11').groups[0].entries[0].state, 'missing');
});

function commands(initial) {
  let history = createHistory(initial), api;
  const record = next => { history = recordHistory(history, next); };
  const update = producer => { const next = producer(history.present); if (next) record(next); };
  function Harness() { api = useTaskOperations(history.present, update, record); return null; }
  renderToStaticMarkup(React.createElement(Harness));
  return { api, get history() { return history; }, undo() { history = undoHistory(history); }, redo() { history = redoHistory(history); } };
}

test('only pending tasks of medium priority or higher keep a subject from being up to date, dates never matter', () => {
  const es = { id: 'es' };
  const tasks = [task('minimal', { subjectId: 'es', priority: 'low' }), task('far', { subjectId: 'es', priority: 'low', dueDate: '2026-02-01' }), task('done', { subjectId: 'es', status: 'done', priority: 'high' }), task('other', { subjectId: 'math', priority: 'high' })];
  const events = [event('past exam', { subjectId: 'es', date: '2026-03-09', isGraded: true, grade: '8' })];
  const calm = summarizeSubject(es, tasks, events, TODAY);
  assert.equal(calm.status, 'upToDate');
  assert.deepEqual({ blocking: calm.blocking, relaxed: calm.relaxed, pending: calm.pending, overdue: calm.overdue }, { blocking: 0, relaxed: 2, pending: 2, overdue: 1 });
  assert.equal(calm.next, undefined);
  // The same task becomes blocking when it is medium, with or without a date.
  for (const fields of [{}, { dueDate: '2030-01-01' }, { dueDate: '2020-01-01' }]) {
    const busy = summarizeSubject(es, [...tasks, task('media', { subjectId: 'es', priority: 'medium', ...fields })], events, TODAY);
    assert.equal(busy.status, 'pending');
    assert.equal(busy.blocking, 1);
  }
  assert.equal(summarizeSubject(es, [task('alta', { subjectId: 'es', priority: 'high' })], [], TODAY).status, 'pending');
});

test('the threshold decides which priorities count, and a manual state overrides the calculation', () => {
  const tasks = [task('m', { subjectId: 's', priority: 'medium' }), task('l', { subjectId: 's', priority: 'low' })];
  const status = (threshold, subject = { id: 's' }) => summarizeSubject(subject, tasks, [], TODAY, threshold);
  assert.equal(countsAsPending({ priority: 'medium' }, 'medium'), true);
  assert.equal(countsAsPending({ priority: 'low' }, 'medium'), false);
  assert.equal(status('high').status, 'upToDate');
  assert.equal(status('medium').status, 'pending');
  assert.equal(status('any').blocking, 2);
  assert.equal(isThreshold('any'), true);
  assert.equal(isThreshold('later'), false);
  assert.equal(status('medium', { id: 's', manual: 'upToDate' }).status, 'upToDate');
  assert.equal(status('medium', { id: 's', manual: 'upToDate' }).blocking, 1);
  assert.equal(status('high', { id: 's', manual: 'pending' }).status, 'pending');
  assert.equal(status('high', { id: 's', manual: 'pending' }).manual, 'pending');
  assert.equal(status('high', { id: 's', manual: 'pending' }).pinned, true);
  assert.equal(status('high', { id: 's', manual: 'pending' }).computed, 'upToDate', 'the menu can still show what the calculation says');
  assert.equal(status('medium').pinned, false);
});

test('in manual mode nothing is calculated: each subject is as marked, up to date until marked otherwise', () => {
  const tasks = [task('h', { subjectId: 's', priority: 'high' })];
  const manual = (subject) => summarizeSubject(subject, tasks, [], TODAY, 'manual');
  assert.equal(isThreshold('manual'), true);
  assert.equal(manual({ id: 's' }).status, 'upToDate');
  assert.equal(manual({ id: 's' }).computed, undefined);
  assert.equal(manual({ id: 's', manual: 'pending' }).status, 'pending');
  assert.equal(manual({ id: 's', manual: 'pending' }).pinned, false, 'no pin when every subject is marked by hand');
  assert.equal(manual({ id: 's' }).blocking, 1, 'counts still show for information');
});

test('the next deadline is the earliest upcoming task or event of the subject', () => {
  const tasks = [task('essay', { subjectId: 'f', dueDate: '2026-03-20' })];
  const events = [event('exam', { subjectId: 'f', date: '2026-03-12', isGraded: true }), event('meeting', { subjectId: 'f', date: '2026-03-11' }), event('elsewhere', { subjectId: 'x', date: '2026-03-10' })];
  const summary = summarizeSubject({ id: 'f' }, tasks, events, TODAY);
  assert.deepEqual({ title: summary.next.title, daysAway: summary.next.daysAway }, { title: 'meeting', daysAway: 1 });
  assert.equal(formatDaysAway(0), 'hoy');
  assert.equal(formatDaysAway(6), 'en 6 días');
});

test('a title with "examen" is recognised as an exam, and a whole subject name in the title picks the subject', () => {
  assert.equal(looksLikeExam('Examen Castellano'), true);
  assert.equal(looksLikeExam('examen final de física'), true);
  assert.equal(looksLikeExam('Exámenes parciales'), true);
  assert.equal(looksLikeExam('Examinar el proyecto'), false);
  assert.equal(looksLikeExam('Reunión'), false);
  const subjects = [subject('es', 'Castellano'), subject('fis', 'Física'), subject('fq', 'Física y Química'), subject('old', 'Historia', { archived: true })];
  assert.equal(findSubjectInTitle('Examen Castellano', subjects).id, 'es');
  assert.equal(findSubjectInTitle('examen de FISICA', subjects).id, 'fis');
  assert.equal(findSubjectInTitle('Examen Física y Química tema 2', subjects).id, 'fq');
  assert.equal(findSubjectInTitle('Examen Castellanos', subjects), undefined);
  assert.equal(findSubjectInTitle('Examen de Historia', subjects), undefined);
  assert.equal(findSubjectInTitle('Examen', subjects), undefined);
  assert.equal(findSubjectInTitle('Cálculo (I)', [subject('c', 'Cálculo (I)')]).id, 'c');
});

test('the grade report groups graded events per subject, averages numeric grades and flags missing ones', () => {
  const subjects = [subject('es', 'Castellano'), subject('fis', 'Física'), subject('old', 'Latín', { archived: true })];
  const events = [
    event('e1', { subjectId: 'es', date: '2026-03-01', isGraded: true, grade: '8' }),
    event('e2', { subjectId: 'es', date: '2026-03-05', isGraded: true, grade: '6' }),
    event('e3', { subjectId: 'es', date: '2026-03-09', isGraded: true }),
    event('e4', { subjectId: 'fis', date: '2026-03-20', isGraded: true }),
    event('e5', { subjectId: 'fis', date: '2026-02-01', isGraded: true, grade: 'Notable' }),
    event('e6', { subjectId: 'old', date: '2026-01-01', isGraded: true, grade: '2' }),
    event('e7', { date: '2026-01-02', isGraded: true, grade: '10' }),
    event('plain', { subjectId: 'es', date: '2026-03-01', grade: '1' }),
  ];
  const report = buildGradeReport(subjects, events, TODAY);
  assert.deepEqual(report.groups.map(g => g.subject && g.subject.id), ['es', 'fis', 'old', undefined]);
  const es = report.groups[0];
  assert.equal(es.average, 7);
  assert.deepEqual(es.entries.map(e => [e.event.id, e.state]), [['e3', 'missing'], ['e2', 'graded'], ['e1', 'graded']]);
  const fis = report.groups[1];
  assert.equal(fis.average, undefined);
  assert.deepEqual(fis.entries.map(e => e.state), ['upcoming', 'text']);
  assert.equal(report.average, 7);
  assert.equal(report.finalAverage, 7);
  assert.equal(report.provisional, true);
  assert.equal(buildGradeReport([], [event('x')], TODAY).groups.length, 0);
  assert.equal(buildGradeReport([], [], TODAY).average, undefined);
});

test('grades average numeric values only, with commas and fractions', () => {
  assert.equal(parseGrade('7,5'), 7.5);
  assert.equal(parseGrade('15/20'), 7.5);
  assert.equal(parseGrade('Notable'), null);
  assert.equal(parseGrade('12'), null);
  const events = [event('a', { isGraded: true, grade: '6' }), event('b', { isGraded: true, grade: '8' }), event('c', { isGraded: true, grade: 'Sobresaliente' }), event('d', { grade: '1' })];
  assert.equal(averageGrade(events), 7);
  assert.equal(averageGrade([event('e')]), undefined);
});

test('weighted grades show a provisional mean and use x.8 for final rounding', () => {
  const grades = [event('exam', { subjectId: 'math', isGraded: true, grade: '8', gradeWeight: 40 })];
  const math = subject('math', 'Matemáticas', { otherGrades: [{ id: 'work', title: 'Trabajo' }] });
  let report = buildGradeReport([math], grades, TODAY);
  assert.equal(report.average, 8);
  assert.equal(report.groups[0].evaluatedWeight, 40);
  assert.equal(report.groups[0].sharedWeight, undefined);
  assert.equal(report.provisional, true);

  math.otherGrades[0].grade = '23/30';
  report = buildGradeReport([math], grades, TODAY);
  assert.ok(Math.abs(report.average - 7.8) < 1e-12);
  assert.equal(report.finalAverage, 8);
  assert.equal(report.groups[0].evaluatedWeight, 100);
  assert.equal(report.provisional, false);

  math.otherGrades[0].grade = '7,65';
  const language = subject('es', 'Castellano', { finalGrade: 6, otherGrades: [{ id: 'oral', title: 'Oral', grade: '9' }] });
  report = buildGradeReport([math, language], grades, TODAY);
  assert.equal(report.groups[0].finalGrade, 7);
  assert.ok(Math.abs(report.average - (7.79 + 9) / 2) < 1e-12);
  assert.equal(report.finalAverage, 6.5);
  assert.equal(report.usesManualFallback, false);

  const manualOnly = buildGradeReport([subject('art', 'Arte', { finalGrade: 0 })], [], TODAY);
  assert.equal(manualOnly.average, 0);
  assert.equal(manualOnly.finalAverage, 0);
  assert.equal(manualOnly.usesManualFallback, true);
});

test('automatic weights split the remainder among numeric grades already entered', () => {
  const dt = subject('dt', 'DT', { otherGrades: [{ id: 'book', title: 'Libreta', grade: '5', weight: 10 }] });
  const exams = ['7,5', '7,8', '8,6', undefined, undefined, 'Pendiente'].map((grade, i) =>
    event(`exam-${i}`, { subjectId: dt.id, isGraded: true, grade }));
  const report = buildGradeReport([dt], exams, TODAY);
  assert.equal(report.groups[0].automaticWeight, 30);
  assert.equal(report.groups[0].evaluatedWeight, 100);
  assert.ok(Math.abs(report.average - 7.67) < 1e-12);
  assert.equal(report.finalAverage, 7);

  exams[3].gradeWeight = 30;
  const withReservedWeight = buildGradeReport([dt], exams, TODAY);
  assert.equal(withReservedWeight.groups[0].automaticWeight, 20);
  assert.equal(withReservedWeight.groups[0].evaluatedWeight, 70);
});

test('bonus items add points without changing weights and survive a backup', async () => {
  const dt = subject('dt', 'DT', { otherGrades: [
    { id: 'book', title: 'Libreta', grade: '5', weight: 10 },
    { id: 'extra', title: 'Voluntario', grade: '0,5', bonus: true },
  ] });
  const exams = [
    event('exam', { subjectId: dt.id, isGraded: true, grade: '8' }),
    event('bonus', { subjectId: dt.id, isGraded: true, grade: '0,25', gradeBonus: true }),
    event('upcoming', { subjectId: dt.id, isGraded: true, gradeBonus: true }),
  ];
  const data = state([], exams, [], [dt]);
  const { payload } = await inspectBackup(JSON.parse(JSON.stringify(await createBackup(data))));
  const report = buildGradeReport(payload.data.subjects, payload.data.events, TODAY);
  assert.equal(report.groups[0].automaticWeight, 90);
  assert.equal(report.groups[0].evaluatedWeight, 100);
  assert.equal(report.groups[0].provisional, false);
  assert.equal(report.average, 8.45);

  exams[1].grade = '4';
  assert.equal(buildGradeReport([dt], exams, TODAY).average, 10);
  assert.equal(buildGradeReport([subject('dt')], exams.slice(1), TODAY).average, undefined);
});

test('weights and standalone grades survive backup, undo and concurrent subject edits', async () => {
  const initial = state([], [event('exam', { subjectId: 'math', isGraded: true, grade: '8' })], [], [subject('math')]);
  const d = commands(initial);
  const work = { id: 'work', title: 'Trabajo', grade: '7,5', weight: 60 };
  d.api.updateEvent('exam', { gradeWeight: 40 });
  d.api.updateSubject('math', { otherGrades: [work], finalGrade: 9 });
  d.undo();
  assert.equal(d.history.present.subjects[0].finalGrade, undefined);
  d.redo();
  const local = d.history.present;
  const backup = await inspectBackup(JSON.parse(JSON.stringify(await createBackup(local))));
  assert.equal(backup.payload.data.events[0].gradeWeight, 40);
  assert.equal(backup.payload.data.subjects[0].finalGrade, 9);
  assert.deepEqual(backup.payload.data.subjects[0].otherGrades, [work]);

  const oral = { id: 'oral', title: 'Oral', grade: '8' };
  const remote = state([], initial.events, [], [subject('math', 'math', { otherGrades: [oral] })]);
  const merged = mergeStates(initial, local, remote);
  assert.deepEqual(merged.subjects[0].otherGrades, [work, oral]);
  assert.equal(merged.subjects[0].finalGrade, 9);
  const firstSync = mergeStates(null, local, {
    ...remote,
    events: [{ ...remote.events[0], id: 'cloud-exam', subjectId: 'cloud-math' }],
    subjects: [{ ...remote.subjects[0], id: 'cloud-math' }],
  });
  assert.deepEqual(firstSync.subjects[0].otherGrades, [work, oral]);
  assert.equal(firstSync.subjects[0].finalGrade, 9);
  assert.equal(firstSync.events.find(e => e.id === 'exam').subjectId, 'cloud-math');
  assert.equal(firstSync.events.find(e => e.id === 'exam').gradeWeight, 40);
});

test('scope keeps everything, unassigned items or one subject; a deleted subject id reads as unassigned', () => {
  const subjects = [subject('a')];
  const assigned = task('1', { subjectId: 'a' });
  const loose = task('2');
  const dangling = task('3', { subjectId: 'gone' });
  assert.deepEqual([assigned, loose, dangling].filter(t => inScope(t, 'all', subjects)).length, 3);
  assert.deepEqual([assigned, loose, dangling].filter(t => inScope(t, 'none', subjects)).map(t => t.id), ['2', '3']);
  assert.deepEqual([assigned, loose, dangling].filter(t => inScope(t, 'a', subjects)).map(t => t.id), ['1']);
});

test('saved data without subjects still loads, and invalid subjects are rejected or repaired', () => {
  const legacy = { tasks: [task('a')], events: [], tags: [] };
  assert.deepEqual(parsePersistedState(legacy).subjects, []);
  assert.equal(parsePersistedState({ ...legacy, subjects: [{ id: 's' }] }), null);
  assert.equal(parsePersistedState({ ...legacy, subjects: [subject('s'), subject('s')] }), null);
  const repaired = repairPersistedState({ ...legacy, tasks: [task('a', { subjectId: 's' })], subjects: [{ id: 's', name: '', color: 3, archived: 'yes', manual: 'always' }, { id: 't', name: 'T', color: '#fff', manual: 'pending' }, null, { name: 'sin id' }] });
  assert.deepEqual(repaired.subjects, [{ id: 's', name: 'Asignatura', color: '#6b7280', archived: undefined, manual: undefined, aliases: undefined }, { id: 't', name: 'T', color: '#fff', archived: undefined, manual: 'pending', aliases: undefined }]);
  assert.equal(parsePersistedState({ ...legacy, subjects: [subject('m', 'M', { manual: 'sometimes' })] }), null);
  assert.equal(repaired.tasks[0].subjectId, 's');
});

test('subjects are created, edited, reordered and archived as single history entries', () => {
  const d = commands(state());
  const first = d.api.addSubject({ name: '  Cálculo  ', color: '#6366f1' })?.id;
  const second = d.api.addSubject({ name: 'Física', color: '#ec4899' })?.id;
  assert.ok(first && second && first !== second);
  assert.equal(d.api.addSubject({ name: '   ', color: '#fff' }), undefined);
  assert.deepEqual(d.history.present.subjects.map(s => s.name), ['Cálculo', 'Física']);
  d.api.updateSubject(first, { name: 'Cálculo I', archived: true });
  assert.equal(d.history.present.subjects[0].archived, true);
  const before = d.history;
  d.api.updateSubject(first, { name: '   ' });
  assert.equal(d.history, before);
  d.api.moveSubject(second, 0);
  assert.deepEqual(d.history.present.subjects.map(s => s.name), ['Física', 'Cálculo I']);
  d.api.moveSubject(second, 0);
  assert.equal(d.history.present.subjects[0].id, second);
});

test('deleting a subject keeps its tasks and events, unassigns them, and undo restores the links', () => {
  const initial = state([task('a', { subjectId: 's' }), task('b', { subjectId: 'other' })], [event('e', { subjectId: 's' })], [], [subject('s'), subject('other')]);
  const d = commands(initial);
  d.api.deleteSubject('s');
  const after = d.history.present;
  assert.equal(after.tasks.length, 2);
  assert.equal(after.events.length, 1);
  assert.equal('subjectId' in after.tasks[0], false);
  assert.equal('subjectId' in after.events[0], false);
  assert.equal(after.tasks[1].subjectId, 'other');
  assert.deepEqual(after.subjects.map(s => s.id), ['other']);
  d.undo();
  assert.equal(d.history.present, initial);
  d.redo();
  assert.equal(d.history.present, after);
});

test('tasks and events can be assigned to a subject and unassigned again', () => {
  const d = commands(state([task('a')], [event('e')], [], [subject('s')]));
  d.api.updateTask('a', { subjectId: 's' });
  d.api.updateEvent('e', { subjectId: 's' });
  assert.equal(d.history.present.tasks[0].subjectId, 's');
  assert.equal(d.history.present.events[0].subjectId, 's');
  d.api.updateTask('a', { subjectId: undefined });
  assert.equal(d.history.present.tasks[0].subjectId, undefined);
});

test('subjects created on two devices are both kept, and a deleted subject is dropped from the other side\'s tasks', () => {
  const base = state([task('a')], [], [], [subject('x')]);
  const local = state([task('a'), task('local', { subjectId: 'y' })], [], [], [subject('x'), subject('y')]);
  const remote = state([task('a')], [], [], [subject('x'), subject('z')]);
  assert.deepEqual(mergeStates(base, local, remote).subjects.map(s => s.id).sort(), ['x', 'y', 'z']);

  const assignedLocally = state([task('a', { subjectId: 'x', updatedAt: '2026-02-01T00:00:00.000Z' })], [], [], [subject('x')]);
  const deletedRemotely = state([task('a')], [], [], []);
  const merged = mergeStates(base, assignedLocally, deletedRemotely);
  assert.deepEqual(merged.subjects, []);
  assert.equal(merged.tasks[0].subjectId, undefined);
});

test('first sign-in reuses a cloud subject with the same name instead of duplicating it', () => {
  const local = state([task('offline', { subjectId: 'local-math' })], [event('exam', { subjectId: 'local-math' })], [], [subject('local-math', 'Cálculo'), subject('local-only', 'Física')]);
  const remote = state([task('cloud', { subjectId: 'cloud-math' })], [], [], [subject('cloud-math', 'cálculo')]);
  const merged = mergeStates(null, local, remote);
  assert.deepEqual(merged.subjects.map(s => s.id).sort(), ['cloud-math', 'local-only']);
  assert.equal(merged.tasks.find(t => t.id === 'offline').subjectId, 'cloud-math');
  assert.equal(merged.events[0].subjectId, 'cloud-math');
});

test('a device holding only subjects is not blank, so first sign-in keeps them', () => {
  const local = state([], [], [], [subject('s', 'Cálculo')]);
  const merged = mergeStates(null, local, state([task('cloud')]));
  assert.deepEqual(merged.subjects.map(s => s.id), ['s']);
});

test('backups keep subjects and assignments, drop unknown fields, and merge by id when imported', async () => {
  const data = state([task('a', { subjectId: 's' })], [event('e', { subjectId: 's' })], [], [{ ...subject('s'), archived: true, manual: 'upToDate', extra: 'x' }]);
  const backup = await createBackup(data);
  const inspected = await inspectBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(inspected.payload.data.subjects, [{ id: 's', name: 's', color: '#3b82f6', archived: true, manual: 'upToDate' }]);
  assert.equal(inspected.payload.data.tasks[0].subjectId, 's');
  assert.equal(inspected.payload.data.events[0].subjectId, 's');

  const missing = await inspectBackup({ ...state([task('a', { subjectId: 'gone' })]), version: '2.0' });
  assert.ok(missing.warnings.some(w => /asignaturas/.test(w)));

  const plan = planImport(state([], [], [], [subject('a')]), state([], [], [], [subject('a', 'Renombrada'), subject('b')]), 'merge', 'keep');
  assert.deepEqual(plan.data.subjects.map(s => s.name), ['a', 'b']);
});

test('a new subject takes the unassigned tasks and events that name it, in a step of its own that undo takes back', () => {
  const initial = state(
    [task('a', { title: 'Comentario de texto castellano' }), task('b', { title: 'Castellano', subjectId: 'other' }), task('c', { title: 'Castellanos ilustres' }), task('d', { title: 'Lengua castellana' })],
    [event('e', { title: 'Examen de Castellano', isGraded: true }), event('f', { title: 'Excursión' })],
    [], [subject('other', 'Historia')],
  );
  const d = commands(initial);
  const added = d.api.addSubject({ name: 'Castellano', color: '#ef4444' });
  assert.deepEqual({ tasks: added.tasks, events: added.events }, { tasks: 1, events: 1 });
  const after = d.history.present;
  assert.equal(after.tasks.find(t => t.id === 'a').subjectId, added.id);
  assert.equal(after.tasks.find(t => t.id === 'b').subjectId, 'other', 'a chosen subject is never replaced');
  assert.equal(after.tasks.find(t => t.id === 'c').subjectId, undefined, 'only whole names match');
  assert.equal(after.tasks.find(t => t.id === 'd').subjectId, undefined);
  assert.notEqual(after.tasks.find(t => t.id === 'a').updatedAt, initial.tasks[0].updatedAt, 'the change syncs as an edit');
  assert.equal(after.events.find(e => e.id === 'e').subjectId, added.id);
  assert.equal(after.events.find(e => e.id === 'f').subjectId, undefined);
  d.undo();
  assert.deepEqual(d.history.present.subjects.map(s => s.name), ['Historia', 'Castellano'], 'undo keeps the subject');
  assert.equal(d.history.present.tasks.find(t => t.id === 'a').subjectId, undefined);
  assert.equal(describeDetection(added), '1 tarea y 1 evento');
  assert.equal(describeDetection({ tasks: 3, events: 0 }), '3 tareas');
});

test('renaming or restoring a subject assigns what its name now matches; other edits assign nothing', () => {
  const d = commands(state([task('a', { title: 'Problemas de física' }), task('b', { title: 'Repaso de química' })], [], [], [subject('s', 'Fisica', { archived: true })]));
  assert.deepEqual(d.api.updateSubject('s', { color: '#000' }), { tasks: 0, events: 0 });
  assert.deepEqual(d.api.updateSubject('s', { archived: undefined }), { tasks: 1, events: 0 }, 'accents do not matter');
  assert.equal(d.history.present.tasks[0].subjectId, 's');
  assert.deepEqual(d.api.updateSubject('s', { name: 'Química' }), { tasks: 1, events: 0 });
  assert.equal(d.history.present.tasks[1].subjectId, 's');
  assert.equal(d.history.present.tasks[0].subjectId, 's', 'an earlier assignment stays');
});

test('title detection marks unmarked exams as graded and prefers the longest subject name', () => {
  const subjects = [subject('f', 'Física'), subject('fq', 'Física y Química')];
  const input = state([task('t', { title: 'Física y química: tema 3' })], [event('x', { title: 'EXAMEN final' }), event('y', { title: 'Exámenes de física', isGraded: true, grade: '8' }), event('z', { title: 'Examinar apuntes' })], [], subjects);
  const result = applyTitleDetection(input, { exams: true, now: '2026-05-01T00:00:00.000Z' });
  assert.deepEqual({ tasks: result.tasks, events: result.events, exams: result.exams }, { tasks: 1, events: 1, exams: 1 });
  assert.equal(result.state.tasks[0].subjectId, 'fq');
  assert.equal(result.state.events[0].isGraded, true);
  assert.equal(result.state.events[1].grade, '8');
  assert.equal(result.state.events[2].isGraded, false);
  assert.equal(applyTitleDetection(result.state, { exams: true }).state, result.state, 'running it again changes nothing');
  assert.equal(applyTitleDetection(input).state.events[0].isGraded, false, 'exams are only marked when asked');
});

test('nicknames match titles like the name, are cleaned, survive copies and assign what they name', async () => {
  const subjects = [subject('es', 'Castellano', { aliases: ['Lengua', 'Cast'] }), subject('ing', 'Inglés')];
  assert.equal(findSubjectInTitle('Examen de lengua', subjects)?.id, 'es');
  assert.equal(findSubjectInTitle('Resumen cast. tema 2', subjects)?.id, 'es');
  assert.equal(findSubjectInTitle('Lengua inglesa', subjects)?.id, 'es', 'whole words only: «inglesa» is not «Inglés»');
  assert.equal(findSubjectInTitle('Castañas', subjects), undefined);

  const d = commands(state([task('a', { title: 'Comentario de Lengua' }), task('b', { title: 'Lengua: tema 1', subjectId: 'ing' })], [event('e', { title: 'Examen de lengua' })], [], [subject('es', 'Castellano'), subject('ing', 'Inglés')]));
  assert.deepEqual(d.api.updateSubject('es', { aliases: ['  Lengua ', 'lengua', 'castellano', ''] }), { tasks: 1, events: 1 });
  assert.deepEqual(d.history.present.subjects[0].aliases, ['Lengua'], 'trimmed, without repeats or the name itself');
  assert.equal(d.history.present.tasks[1].subjectId, 'ing', 'a chosen subject is never replaced');
  d.undo();
  assert.deepEqual(d.history.present.subjects[0].aliases, ['Lengua'], 'undo takes back the assignments and keeps the nickname');
  assert.equal(d.history.present.tasks[0].subjectId, undefined);
  d.redo();
  assert.deepEqual(d.api.updateSubject('es', { name: 'Lengua' }), { tasks: 0, events: 0 });
  assert.equal(d.history.present.subjects[0].aliases, undefined, 'a nickname that becomes the name is dropped');

  const added = commands(state([task('x', { title: 'Mates: derivadas' })])).api;
  assert.ok(added.addSubject({ name: 'Matemáticas', color: '#fff', aliases: ['Mates', ' mates '] }));

  const saved = state([], [], [], [subject('es', 'Castellano', { aliases: ['Lengua'] })]);
  assert.deepEqual(parsePersistedState(saved).subjects[0].aliases, ['Lengua']);
  assert.equal(parsePersistedState(state([], [], [], [subject('es', 'C', { aliases: [3] })])), null);
  assert.deepEqual(repairPersistedState(state([], [], [], [subject('es', 'C', { aliases: ['c', 'Lengua', 7, 'LENGUA'] })])).subjects[0].aliases, ['Lengua']);
  const backup = await createBackup(saved);
  assert.deepEqual((await inspectBackup(JSON.parse(JSON.stringify(backup)))).payload.data.subjects[0].aliases, ['Lengua']);
});

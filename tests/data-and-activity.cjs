const { test } = require('node:test');
const assert = require('node:assert/strict');
require('fake-indexeddb/auto');
const { randomBytes } = require('node:crypto');
const { compressJson, readJsonBlob, checksum } = require('../lib/data/codec.ts');
const { createBackup, inspectBackup, planImport, saveRecovery, listRecovery, readRecovery } = require('../lib/data/backup.ts');
const { packActivity, validateActivity, track, trackStateChange, flushActivity, exportActivity, clearActivity, restoreActivity, activityStats, setActivityEnabled } = require('../lib/activity.ts');
const { openLocalDatabase, transactionDone } = require('../lib/data/database.ts');
const { loadLocalState, saveLocalState, storedStateBytes } = require('../lib/tasks/storage.ts');
const { getDataUsage } = require('../lib/data/usage.ts');
const { movedEventStartDate } = require('../components/calendar/calendar-event-dnd.tsx');
const { opaqueDragBackground } = require('../lib/ui/drag-preview-color.ts');
const task = id => ({ id, title:'Título privado',description:'Descripción privada',status:'todo',priority:'medium',steps:[],tags:[],createdAt:'2026-01-01',updatedAt:'2026-01-01' });
const state = { tasks:[task('a')],events:[],tags:[] };
const empty = {tasks:[],events:[],tags:[]};
const values = new Map();
global.window = new EventTarget();
global.localStorage = { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) };

test('compressed and JSON backups round-trip data, preferences, activity and checksum', async()=>{
  const activity={version:1,batches:[packActivity([[Date.now(),'session',1,'ui.click',{x:2,y:3}]])],daily:[]};
  const backup=await createBackup(state,{theme:'dark'},activity);
  for(const blob of [await compressJson(backup),new Blob([JSON.stringify(backup,null,2)])]) {
    const checked=await inspectBackup(await readJsonBlob(blob));
    assert.equal(checked.legacy,false);
    assert.deepEqual(checked.payload,backup.payload);
  }
  assert.equal(await checksum({a:1,b:2}),await checksum({b:2,a:1}));
});
test('corruption, truncated gzip, unsupported versions and decompression expansion fail', async()=>{
  const backup=await createBackup(state);
  backup.payload.data.tasks[0].title='Alterado';
  await assert.rejects(()=>inspectBackup(backup),/integridad/);
  await assert.rejects(()=>inspectBackup({...backup,version:99}),/versión/);
  const blob=await compressJson({text:'a'.repeat(50000)});
  await assert.rejects(()=>readJsonBlob(blob,100),/tamaño/);
  await assert.rejects(()=>readJsonBlob(blob.slice(0,10)));
  await assert.rejects(()=>readJsonBlob(new Blob(['no es JSON'])));
});
test('legacy imports strip unknown fields and reject duplicate steps',async()=>{
  const old=await inspectBackup({...state,tasks:[{...task('a'),unexpected:'discard'}],version:'2.0'});
  assert.equal(old.legacy,true);
  assert.equal(old.payload.data.tasks[0].unexpected,undefined);
  const step={id:'s',text:'x',completed:false};
  await assert.rejects(()=>inspectBackup({...state,tasks:[{...task('a'),steps:[step,step]}]}),/duplicados/);
});
test('merging resolves conflicts without duplicating IDs or reordering local data',()=>{
  const local={...empty,tasks:[task('a'),task('b')]};
  const incoming={...empty,tasks:[{...task('a'),priority:'high'},task('c')]};
  const keep=planImport(local,incoming,'merge','keep');
  assert.deepEqual(keep.data.tasks.map(t=>t.id),['a','b','c']);
  assert.equal(keep.data.tasks[0].priority,'medium');
  assert.equal(keep.stats.conflicts,1);
  assert.equal(planImport(local,incoming,'merge','incoming').data.tasks[0].priority,'high');
  const replace=planImport(local,incoming,'replace','keep');
  assert.deepEqual(replace.data.tasks.map(t=>t.id),['a','c']);
  assert.equal(replace.stats.removed,1);
  const reordered={...empty,tasks:[Object.fromEntries(Object.entries(task('a')).reverse())]};
  assert.equal(planImport(state,reordered,'merge','keep').stats.conflicts,0);
  assert.deepEqual(local.tasks.map(t=>t.priority),['medium','medium']);
});
test('moving a calendar event preserves the offset of a grabbed middle segment',()=>{
  assert.equal(movedEventStartDate('2026-10-24','2026-10-25','2026-11-01'),'2026-10-31');
  assert.equal(movedEventStartDate('2026-12-31','2026-12-31','2027-01-02'),'2027-01-02');
  assert.equal(movedEventStartDate('2026-09-23','2026-09-23','2026-09-23'),'2026-09-23');
});
test('event drag preview keeps a solid version of its on-calendar background',()=>{
  assert.equal(opaqueDragBackground(['rgba(255, 0, 0, 0.5)','rgb(0, 0, 0)']),'rgb(128 0 0)');
  assert.equal(opaqueDragBackground(['rgba(0, 0, 255, 0.25)','rgb(240, 240, 240)']),'rgb(180 180 244)');
});
test('activity validator rejects malformed entries and accepts histories above 50,000 events',()=>{
  const packed=packActivity([[Date.now(),'s',1,'ui.click',{control:'button'}]]);
  const archive={version:1,batches:[packed],daily:[]};
  assert.equal(validateActivity(archive),archive);
  for(const row of [[0,2,1,0,{}],[0,0,1,2,{}],[0,0,1,0,{nested:{secret:'x'}}]]) {
    assert.throws(()=>validateActivity({...archive,batches:[{...packed,rows:[row]}]}));
  }
  assert.equal(validateActivity({...archive,batches:[{...packed,rows:Array(50001).fill(packed.rows[0])}]}).batches[0].rows.length,50001);
});
test('local journal persists batches, aggregates active time, omits task text and honors pause',async()=>{
  await clearActivity();
  trackStateChange(empty,state);
  track('session.pulse',{activeMs:1250});
  await flushActivity();
  let archive=await exportActivity();
  const json=JSON.stringify(archive);
  assert.ok(!json.includes('Título privado'));
  assert.ok(!json.includes('Descripción privada'));
  assert.equal(archive.daily[0].activeMs,1250);
  const before=(await activityStats()).count;
  setActivityEnabled(false);track('ui.click',{x:1});await flushActivity();
  assert.equal((await activityStats()).count,before);
  setActivityEnabled(true);track('ui.click',{x:1});await flushActivity();
  assert.equal((await activityStats()).count,before+1);
  await clearActivity();
  archive=await exportActivity();
  assert.deepEqual(archive,{version:1,batches:[],daily:[]});
});
test('restored detail and daily summaries retain records older than a year',async()=>{
  const now=Date.now(),day=86400000;
  const recent=packActivity([[now,'recent',1,'ui.click',{}]]);
  const expired=packActivity([[now-31*day,'old',1,'ui.click',{}]]);
  const daily=offset=>({id:new Date(now-offset*day).toISOString().slice(0,10),counts:{'ui.click':1},activeMs:0});
  await restoreActivity({version:1,batches:[recent,expired],daily:[daily(31),daily(366)]});
  const archive=await exportActivity();
  assert.equal(archive.batches.length,2);
  assert.equal(archive.batches[0].sessions[0],'old');
  assert.equal(archive.daily.length,2);
  assert.ok(archive.daily.some(row=>row.id===daily(366).id));
});
test('compressed detail is retained beyond four MiB',async()=>{
  const now=Date.now();
  const batches=[];
  for(let batch=0;batch<24;batch++) {
    const rows=Array.from({length:64},(_,i)=>[now-24000+batch*1000,'s',batch*64+i,'ui.click',
      Object.fromEntries(Array.from({length:19},(_,k)=>[`metric${k}`,randomBytes(140).toString('base64')]))]);
    batches.push(packActivity(rows));
  }
  await restoreActivity({version:1,batches,daily:[]});
  const stats=await activityStats();
  assert.ok(stats.bytes>4*1024*1024);
  assert.equal(stats.count,1536);
  await clearActivity();
});
test('existing local data migrates to compressed IndexedDB without losing tasks',async()=>{
  values.set('taskmaster-state',JSON.stringify(state));
  assert.equal((await loadLocalState()).state.tasks[0].id,'a');
  await saveLocalState(state);
  assert.equal(values.has('taskmaster-state'),false);
  assert.ok((await storedStateBytes())>0);
  assert.equal((await loadLocalState()).state.tasks[0].title,state.tasks[0].title);
});
test('recovery keeps the last three readable snapshots',async()=>{
  const db=await openLocalDatabase();
  const tx=db.transaction('recovery','readwrite');const done=transactionDone(tx);tx.objectStore('recovery').clear();await done;
  for(let i=0;i<4;i++) {
    const backup=await createBackup({...empty,tasks:[task(String(i))]});
    backup.exportedAt=new Date(Date.now()+i*1000).toISOString();
    await saveRecovery(backup);
  }
  const recoveries=await listRecovery();
  assert.equal(recoveries.length,3);
  const latest=await readRecovery(recoveries[0].id);
  assert.equal(latest.payload.data.tasks[0].id,'3');
  await assert.rejects(()=>readRecovery('missing'),/disponible/);
  const usage=await getDataUsage();
  assert.equal(usage.recoveryCount,3);
  assert.ok(usage.stateBytes>0 && usage.recoveryBytes>0);
  assert.equal(usage.knownBytes,usage.stateBytes+usage.localBytes+usage.activityBytes+usage.dailyBytes+usage.recoveryBytes);
});

import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {createEngine} from '../pages/engine.mjs';
import {createStore} from '../pages/local-store.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const book=read('../data/questions.json'),notice=read('../data/errata-2026-10-08.json');
const byId=new Map(book.questions.map(q=>[q.id,q]));
assert.equal(book.book.revision,notice.revision);
assert.deepEqual(book.book.errata,notice.source);
assert.equal(notice.question_count,37);
assert.equal(new Set(notice.edits.map(e=>e.qid)).size,37);
assert.equal(book.questions.filter(q=>q.errata).length,37);
assert.equal(notice.edits.length,48);
assert.deepEqual(notice.answer_changes.map(c=>[c.qid,c.from,c.to]),[
 ['kb-2026-v3-ch01-s00-q095','④','①'],
 ['kb-2026-v3-ch01-s00-q103','①','④'],
 ['kb-2026-v3-ch07-s00-q029','②','③'],
 ['kb-2026-v3-ch07-s00-q039','④','①'],
]);

// The audit lists every changed field. Reversing it must recreate the entire prior bank,
// proving that the other 713 questions, source coordinates, ids and ordering were preserved.
const previous=structuredClone(book),previousById=new Map(previous.questions.map(q=>[q.id,q]));
for(const edit of [...notice.edits].reverse()){
 assert.ok(byId.has(edit.qid));
 const q=previousById.get(edit.qid);let parent=q;
 for(const key of edit.path.slice(0,-1))parent=parent[key];
 const key=edit.path.at(-1);
 assert.deepEqual(parent[key],edit.after,`${edit.qid}: ${edit.path.join('.')}`);
 parent[key]=structuredClone(edit.before);
 assert.equal(byId.get(edit.qid).errata.pdf_page,edit.errata_pdf_page);
}
delete previous.book.revision;delete previous.book.errata;
for(const q of previous.questions){delete q.errata;for(const b of q.content)delete b.errata_original;}
assert.equal(createHash('sha256').update(JSON.stringify(previous)).digest('hex'),notice.baseline_sha256,'unaudited bank change');

const q43=byId.get('kb-2026-v3-ch04-s00-q043'),q92=byId.get('kb-2026-v3-ch04-s00-q092');
assert.ok(q43.content[1].cells.some(c=>c.text.includes('연간원리금상환액')));
assert.ok(q43.content[1].errata_original,'uncorrected source figure must be labelled');
const cells=q92.content[1].cells;
assert.deepEqual(cells.filter(c=>c.column===2).map(c=>c.text),['철회권 행사 예외등록','등록','등록','미등록','등록']);
assert.ok(cells.some(c=>c.row===4&&c.text==='철회가 불리하나 고객이 철회를 요청'));
for(const choice of q92.choices)assert.equal(choice.table_rows[0].table_id,q92.content[1].id);
const figures=read('../data/figures.json'),figure=q92.content[1].source_image.split('/').pop();
assert.deepEqual([...Buffer.from(figures[figure],'base64').subarray(0,8)],[137,80,78,71,13,10,26,10]);
assert.match(byId.get('kb-2026-v3-ch07-s00-q039').errata.warning,/추가 확인/);
const card16=byId.get('kb-2026-v3-ch06-s00-q016');
assert.match(card16.choices[2].content[0].text,/1,000포인트리/);
assert.match(card16.explanation[0].text,/100포인트리/);
assert.ok(!JSON.stringify(card16).includes('연회비 또는'));

const oldEngine=createEngine(previous),engine=createEngine(book),now=1800000000000;
assert.notEqual(oldEngine.version,engine.version);
const oldState=oldEngine.blank(),historical=[];
for(const correction of notice.answer_changes){
 const s=oldEngine.run(oldState,{action:'start',mode:'free',qid:correction.qid},null,now);
 oldEngine.run(oldState,{action:'answer',session:s.id,qid:correction.qid,label:correction.from,unsure:false},null,now);
 oldEngine.run(oldState,{action:'bookmark',qid:correction.qid,value:true},null,now);
 oldEngine.run(oldState,{action:'finish',session:s.id},null,now);
 historical.push(s.id);
}
// Original deployed builds had no snapshot of the grading key.
for(const s of oldState.sessions)for(const a of Object.values(s.answers))delete a.correctLabel;
const preMigration=structuredClone(oldState),migrated=engine.validate(oldState);
assert.deepEqual(oldState,preMigration,'migration mutated the backup');
for(let i=0;i<notice.answer_changes.length;i++){
 const {qid,from,to}=notice.answer_changes[i];
 const p=migrated.progress.find(p=>p.qid===qid);
 assert.equal(p.total,1);assert.equal(p.correct,1);assert.equal(p.bookmark,1);
 assert.equal(p.stage,0);assert.equal(p.due,0,'corrected material must return to due review');
 const result=engine.run(migrated,undefined,historical[i],now);
 assert.equal(result.score,100,'historical score was regraded');
 assert.equal(result.answers[qid].correctLabel,from);
 assert.deepEqual(result.questions[0].answer.labels,[to],'current explanation must use corrected key');
 assert.equal(result.answers[qid].attempt,undefined,'old answers can restore an outdated schedule');
 const newSession=engine.run(migrated,{action:'start',mode:'free',qid},null,now);
 assert.equal(newSession.questions[0].answer,undefined);
 assert.equal(newSession.questions[0].errata,undefined,'errata metadata leaks the answer before reveal');
 engine.run(migrated,{action:'answer',session:newSession.id,qid,label:to,unsure:false},null,now);
 assert.equal(engine.run(migrated,{action:'finish',session:newSession.id},null,now).score,100);
 assert.equal(p.total,2);assert.equal(p.correct,2);
}
assert.deepEqual(engine.validate(migrated),migrated,'migration is not idempotent');
assert.deepEqual(engine.validate(JSON.parse(JSON.stringify(migrated))),migrated,'snapshots lost in backup');
const bad=structuredClone(migrated);bad.sessions[0].answers[notice.answer_changes[0].qid].correctLabel='⑤';
assert.throws(()=>engine.validate(bad));

// An old wrong answer must remain wrong in the result and retry set, even when its label became correct.
const wrong=oldEngine.blank(),changed=notice.answer_changes[0];
const ws=oldEngine.run(wrong,{action:'start',mode:'free',qid:changed.qid},null,now);
oldEngine.run(wrong,{action:'answer',session:ws.id,qid:changed.qid,label:changed.to,unsure:false},null,now);
oldEngine.run(wrong,{action:'finish',session:ws.id},null,now);
delete wrong.sessions[0].answers[changed.qid].correctLabel;
const wrongMigrated=engine.validate(wrong);
assert.equal(engine.run(wrongMigrated,undefined,ws.id,now).score,0);
assert.deepEqual(engine.run(wrongMigrated,{action:'start',mode:'free',retryOf:ws.id},null,now).ids,[changed.qid]);

// Unfinished exams retain selections and expiry; ungraded answers use the key current at submission.
const examState=oldEngine.blank(),examQ=previousById.get(changed.qid);
const exam=oldEngine.run(examState,{action:'start',mode:'exam'},null,now);
const stored=examState.sessions[0];stored.ids=[examQ.id];stored.index=0;
oldEngine.run(examState,{action:'answer',session:exam.id,qid:examQ.id,label:changed.from,unsure:false},null,now);
const examMigrated=engine.validate(examState);
assert.equal(examMigrated.sessions[0].expires,exam.expires);
assert.equal(examMigrated.sessions[0].answers[examQ.id].label,changed.from);
assert.equal(engine.run(examMigrated,{action:'finish',session:exam.id},null,now).score,0);

// Graded but unfinished practice cannot use its old unsure toggle to undo the forced review.
const active=oldEngine.blank();
const as=oldEngine.run(active,{action:'start',mode:'free',qid:changed.qid},null,now);
oldEngine.run(active,{action:'answer',session:as.id,qid:changed.qid,label:changed.from,unsure:false},null,now);
delete active.sessions[0].answers[changed.qid].correctLabel;
const activeMigrated=engine.validate(active);
assert.throws(()=>engine.run(activeMigrated,{action:'unsure',session:as.id,qid:changed.qid,value:true},null,now));

const store=createStore(engine,new IDBFactory());
await store.restore(preMigration);
const restored=await store.snapshot();
assert.equal(restored.progress[0].bookmark,1);
assert.equal((await store.request(undefined,historical[0],now)).score,100);
assert.deepEqual(engine.validate(restored),engine.validate(preMigration));
console.log('PASS: 37 audited corrections, unchanged bank/ids, 4 revised keys, corrected table/image, old scores/bookmarks/counters, forced review, new grading, hidden answers, active exams/practice, backup restore and idempotence');

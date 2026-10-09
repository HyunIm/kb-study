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
assert.equal(notice.edits.length,47);
assert.equal(new Set(notice.edits.map(e=>JSON.stringify([e.qid,e.path]))).size,notice.edits.length,'each corrected field should be listed once');
// Independently enumerated from all 11 PDF pages, rather than from the edit log itself.
const expectedTargets={1:[16,38,55,72,84,94,95,103,105],2:[1,9],3:[6],4:[24,43,64,67,73,92],5:[2,7,43],6:[6,16,29],7:[14,29,39,55],8:[40,51,67],10:[27,39],12:[41,42],13:[16,70]};
assert.deepEqual(book.questions.filter(q=>q.errata).map(q=>`${q.chapter.number}:${Number(q.number_original)}`).sort(),Object.entries(expectedTargets).flatMap(([ch,nums])=>nums.map(n=>`${ch}:${n}`)).sort());
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
const corporate39=byId.get('kb-2026-v3-ch07-s00-q039'),previous39=previousById.get(corporate39.id);
assert.deepEqual(corporate39.answer.labels,['①']);
for(const key of ['content','choices','explanation','source'])assert.deepEqual(corporate39[key],previous39[key],'corporate 39 changes only its answer');
assert.equal(corporate39.errata.warning,undefined,'answer-only correction has been confirmed');
// PDF pages 1–2 strike out the entire old explanation, including ③ and ④.
// This source expectation must remain independent of the editable audit log.
const deposit55=byId.get('kb-2026-v3-ch01-s00-q055');
assert.deepEqual(deposit55.explanation,[{type:'text',text:'① 당행서식(전자서식) 이외의 별도서식으로 질권설정 승낙을 요청하는 경우에는 설정계약내용을 면밀히 검토하여 승낙하고 영업점장의 결재를 받아야 함'}],'deposit 55 must not restore explanations deleted by the errata');
assert.deepEqual(deposit55.answer.labels,['②']);
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

// Text-only corrections must also be reviewed again; untouched questions and bookmarks stay intact.
const mixed=oldEngine.blank();
for(const q of previous.questions.filter(q=>byId.get(q.id).errata||q===previous.questions[0])){
 const s=oldEngine.run(mixed,{action:'start',mode:'free',qid:q.id},null,now);
 oldEngine.run(mixed,{action:'answer',session:s.id,qid:q.id,label:q.answer.labels[0],unsure:false},null,now);
 oldEngine.run(mixed,{action:'bookmark',qid:q.id,value:true},null,now);
 oldEngine.run(mixed,{action:'finish',session:s.id},null,now);
 for(const a of Object.values(mixed.sessions.at(-1).answers))delete a.correctLabel;
}
const bookmarkOnly=previous.questions[1].id;
oldEngine.run(mixed,{action:'bookmark',qid:bookmarkOnly,value:true},null,now);
const mixedMigrated=engine.validate(mixed);
assert.equal(mixedMigrated.progress.filter(p=>p.total&&p.due===0).length,37);
for(const p of mixed.progress){
 const expected=byId.get(p.qid).errata&&p.total?{...p,stage:0,due:0}:p;
 assert.deepEqual(mixedMigrated.progress.find(x=>x.qid===p.qid),expected);
}
assert.equal(mixedMigrated.sessions.length,mixed.sessions.length);

const store=createStore(engine,new IDBFactory());
await store.restore(preMigration);
const restored=await store.snapshot();
assert.equal(restored.progress[0].bookmark,1);
assert.equal((await store.request(undefined,historical[0],now)).score,100);
assert.deepEqual(engine.validate(restored),engine.validate(preMigration));
console.log('PASS: 37 audited corrections, unchanged bank/ids, 4 revised keys, corrected table/image, old scores/bookmarks/counters, forced review, new grading, hidden answers, active exams/practice, backup restore and idempotence');

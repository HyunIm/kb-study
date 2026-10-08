import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {createEngine} from '../pages/engine.mjs';
import {createStore} from '../pages/local-store.mjs';
const book=JSON.parse(readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'));
const engine=createEngine(book), state=engine.blank(), now=1800000000000;
const run=(cmd,id,time=now)=>engine.run(state,cmd,id,time);
assert.equal(book.questions.length,750);
assert.deepEqual(Array.from({length:13},(_,i)=>book.questions.filter(q=>q.chapter.number===i+1).length),[105,15,15,105,45,30,105,75,45,45,45,45,75]);
assert.ok(book.questions.every(q=>q.choices.length===4&&q.answer.labels.length===1&&q.source.printed_pages.length));
assert.ok(run().catalog.every(q=>!q.answer));
const credit=book.questions.find(q=>q.chapter.number===6&&Number(q.number_original)===11);assert.deepEqual(credit.answer.labels,['①']);
const practice=run({action:'start',mode:'free',qid:credit.id});assert.ok(!practice.questions[0].answer);
const cmd={action:'answer',session:practice.id,qid:credit.id,label:'①',unsure:true};
assert.equal(run(cmd).questions[0].answer.labels[0],'①');run(cmd);assert.equal(state.progress[0].total,1);assert.equal(state.progress[0].stage,0);
assert.equal(run(undefined,practice.id).answers[credit.id].label,'①');
run({action:'bookmark',qid:credit.id,value:true});assert.equal(state.progress[0].bookmark,1);
assert.equal(run({action:'start',mode:'review',filter:'unsure'}).ids[0],credit.id);
const exam=run({action:'start',mode:'exam'});assert.equal(new Set(exam.ids).size,50);assert.equal(exam.expires-now,3600000);
const x=book.questions.find(q=>q.id===exam.ids[0]);
assert.ok(!run({action:'answer',session:exam.id,qid:x.id,label:x.answer.labels[0],unsure:false}).questions[0].answer);
const finished=run({action:'finish',session:exam.id});assert.equal(finished.score,2);assert.ok(finished.questions.every(q=>q.answer));
const prior=JSON.stringify(state.progress);run({action:'finish',session:exam.id});assert.equal(JSON.stringify(state.progress),prior);
const expired=run({action:'start',mode:'exam'});const end=run({action:'answer',session:expired.id,qid:expired.ids[0],label:'①',unsure:false},null,expired.expires);assert.equal(end.status,'complete');assert.equal(end.answers[expired.ids[0]].label,'');
const backup=JSON.parse(JSON.stringify(state));assert.deepEqual(engine.validate(backup),state);
for(const mutate of [b=>b.progress[0].total=-1,b=>b.sessions[0].ids=['unknown'],b=>b.sessions[0].index=999,b=>b.sessions[1].expires=0,b=>b.sessions.push(b.sessions[0])]){const b=structuredClone(backup);mutate(b);assert.throws(()=>engine.validate(b));}
assert.throws(()=>run({action:'start',mode:'free',search:'NO_MATCH_92749392842'}));
const factory=new IDBFactory(), tab1=createStore(engine,factory),tab2=createStore(engine,factory);
const s=await tab1.request({action:'start',mode:'free',qid:credit.id},null,now);
await Promise.all([tab1.request({action:'answer',session:s.id,qid:credit.id,label:'①',unsure:false},null,now),tab2.request({action:'answer',session:s.id,qid:credit.id,label:'①',unsure:false},null,now)]);
assert.equal((await tab2.snapshot()).progress[0].total,1);
const reload=createStore(engine,factory);assert.equal((await reload.request(undefined,s.id,now)).answers[credit.id].label,'①');
await reload.restore(backup);assert.deepEqual(engine.validate(await tab1.snapshot()),backup);
assert.throws(()=>reload.restore({...backup,year:2025}));assert.deepEqual(engine.validate(await tab1.snapshot()),backup);
const independent=createStore(engine,new IDBFactory());assert.equal((await independent.snapshot()).sessions.length,0);
await assert.rejects(()=>createStore(engine,null).snapshot());
console.log('PASS: 750 questions, 13 chapter counts, original answers/printed pages, grading once, review/bookmark, 50-question exam/60-minute expiry, reload persistence, two-tab atomicity, backup round-trip, invalid backup preservation, independent device storage');
// Retry uses only this completed session, including unanswered questions.
const retryState=engine.blank();const rr=cmd=>engine.run(retryState,cmd,null,now);
const original=rr({action:'start',mode:'free',count:5});
const first=book.questions.find(q=>q.id===original.ids[0]);
rr({action:'answer',session:original.id,qid:first.id,label:first.answer.labels[0],unsure:false});
assert.throws(()=>rr({action:'start',mode:'free',retryOf:original.id}));
rr({action:'finish',session:original.id});
const storedResult=JSON.stringify(retryState.sessions[0]), storedProgress=JSON.stringify(retryState.progress);
const retry=rr({action:'start',mode:'free',retryOf:original.id,count:10,chapter:13});
assert.deepEqual(retry.ids,original.ids.slice(1));assert.notEqual(retry.id,original.id);
assert.equal(retry.ids.length,4);assert.ok(retry.questions.every(q=>!q.answer));assert.deepEqual(retry.answers,{});
assert.equal(JSON.stringify(retryState.sessions[0]),storedResult);assert.equal(JSON.stringify(retryState.progress),storedProgress);
assert.deepEqual(engine.validate(JSON.parse(JSON.stringify(retryState))),retryState);
const perfect=rr({action:'start',mode:'free',qid:first.id});rr({action:'answer',session:perfect.id,qid:first.id,label:first.answer.labels[0],unsure:false});rr({action:'finish',session:perfect.id});
assert.throws(()=>rr({action:'start',mode:'free',retryOf:perfect.id}));
assert.throws(()=>rr({action:'start',mode:'free',retryOf:'unknown'}));
console.log('PASS: exact wrong/unanswered retry, fresh hidden answers, original result/progress preservation, all-correct and unfinished rejection, backup compatibility');

const {choiceText}=await import('../pages/text-layout.mjs');
assert.equal(choiceText('경우에는 거래가\n제한된다.'),'경우에는 거래가 제한된다.');
assert.equal(choiceText('징구하여야\r\n한다.'),'징구하여야 한다.');
assert.equal(choiceText('ㄱ. 첫 문장\n이어지는 문장\nㄴ. 다음 항목'),'ㄱ. 첫 문장 이어지는 문장\nㄴ. 다음 항목');
assert.equal(choiceText('첫 문단\n\n둘째 문단'),'첫 문단\n\n둘째 문단');
assert.equal(choiceText('(1) 첫 항목\n이어지는 문장\n(2) 다음 항목'),'(1) 첫 항목 이어지는 문장\n(2) 다음 항목');
assert.equal(choiceText('(가) 첫 항목\n  (나) 다음 항목'),'(가) 첫 항목\n(나) 다음 항목');
assert.equal(choiceText('(ㄱ) 첫 항목\n(ㄴ) 다음 항목'),'(ㄱ) 첫 항목\n(ㄴ) 다음 항목');
assert.equal(choiceText('첫 문장\n(참고) 부연 설명'),'첫 문장 (참고) 부연 설명');
assert.equal(choiceText('개시일부터\n(1)개월 이내에 지급합니다.'),'개시일부터 (1)개월 이내에 지급합니다.');
assert.equal(choiceText('신청하는 경우\n(가)을/를 우대하여'),'신청하는 경우 (가)을/를 우대하여');
const rawChoice=book.questions[0].choices[0].content[0].text;
assert.ok(rawChoice.includes('거래가\n제한된다.'));
assert.ok(choiceText(rawChoice).includes('거래가 제한된다.'));
console.log('PASS: choice PDF line reflow, paragraph/list preservation, original data unchanged');
// Selecting a catalog item opens subsequent matching questions only on demand.
const flowState=engine.blank(),flow=(cmd)=>engine.run(flowState,cmd,null,now);
const sequence=[book.questions[10].id,book.questions[13].id,book.questions[18].id];
let follow=flow({action:'start',mode:'free',qid:sequence[0],followIds:sequence});
assert.deepEqual(follow.ids,[sequence[0]]);assert.deepEqual(follow.queue,sequence.slice(1));
assert.throws(()=>flow({action:'next',session:follow.id,qid:sequence[0]}));
const answerFlow=id=>flow({action:'answer',session:follow.id,qid:id,label:book.questions.find(q=>q.id===id).answer.labels[0],unsure:false});
answerFlow(sequence[0]);follow=flow({action:'next',session:follow.id,qid:sequence[0]});
assert.equal(follow.ids[follow.index],sequence[1]);assert.ok(!follow.questions[1].answer);
flow({action:'next',session:follow.id,qid:sequence[0]});assert.equal(flowState.sessions[0].ids.length,2,'duplicate next skipped a question');
assert.deepEqual(engine.validate(JSON.parse(JSON.stringify(flowState))),flowState,'queue lost on backup');
const resumedStore=createStore(engine,new IDBFactory());await resumedStore.restore(flowState);
assert.deepEqual((await resumedStore.request(undefined,follow.id,now)).queue,[sequence[2]]);
answerFlow(sequence[1]);const stopped=flow({action:'finish',session:follow.id});
assert.equal(stopped.score,100);assert.equal(stopped.ids.length,2);assert.equal(flowState.progress.length,2);
assert.ok(!flowState.progress.some(p=>p.qid===sequence[2]),'unopened question counted as wrong');
const badQueue=structuredClone(flowState);badQueue.sessions[0].queue=[sequence[0]];assert.throws(()=>engine.validate(badQueue));
const last=flow({action:'start',mode:'free',qid:sequence[2],followIds:[sequence[2]]});assert.deepEqual(last.queue,[]);
assert.throws(()=>flow({action:'start',mode:'free',qid:sequence[0],followIds:[sequence[0],sequence[0]]}));
const longState=engine.blank();const longIds=book.questions.slice(0,51).map(q=>q.id);
const longRun=cmd=>engine.run(longState,cmd,null,now);const longSession=longRun({action:'start',mode:'free',qid:longIds[0],followIds:longIds});
for(let i=0;i<longIds.length;i++){longRun({action:'answer',session:longSession.id,qid:longIds[i],label:book.questions[i].answer.labels[0],unsure:false});if(i<50)longRun({action:'next',session:longSession.id,qid:longIds[i]});}
assert.deepEqual(engine.validate(longState),longState);assert.equal(longRun({action:'finish',session:longSession.id}).score,100);
console.log('PASS: filtered-order continuation, answer-before-next, duplicate next safety, queue persistence/backup, early finish excluding unopened questions, last item, long sessions');

// Unseen practice excludes graded questions but includes bookmark-only records.
const unseenState=engine.blank(), ur=cmd=>engine.run(unseenState,cmd,null,now);
const chapterQuestions=book.questions.filter(q=>q.chapter.number===2);
for(const q of chapterQuestions.slice(0,-2)){
 const s=ur({action:'start',mode:'free',qid:q.id});
 ur({action:'answer',session:s.id,qid:q.id,label:q.choices[0].label,unsure:false});
}
ur({action:'bookmark',qid:chapterQuestions.at(-1).id,value:true});
const unseen=ur({action:'start',mode:'free',chapter:2,count:10,random:true,unseenOnly:true});
assert.deepEqual([...unseen.ids].sort(),chapterQuestions.slice(-2).map(q=>q.id).sort());
assert.equal(ur({action:'start',mode:'free',chapter:2,count:10,unseenOnly:false}).ids.length,10);
for(const id of unseen.ids)ur({action:'answer',session:unseen.id,qid:id,label:book.questions.find(q=>q.id===id).choices[0].label,unsure:false});
assert.throws(()=>ur({action:'start',mode:'free',chapter:2,unseenOnly:true}));
console.log('PASS: unseen-only practice, chapter intersection, bookmark-only inclusion, fewer than 10 remaining, empty pool, filter off');

// List UI and engine share these predicates.
const {searchQuery,matchesSearch,matchesReview}=await import('../pages/engine.mjs');
const item=engine.run(engine.blank()).catalog[0];
assert.equal(searchQuery('  ABC '),'abc');assert.ok(matchesSearch(item,searchQuery('   ')));assert.ok(matchesSearch(item,searchQuery(' '+item.title.slice(0,8).toUpperCase()+' ')));assert.ok(!matchesSearch(item,'no_match_92749392842'));
const dueP={total:1,last_correct:0,unsure:1,bookmark:0,due:now};
assert.ok(matchesReview(dueP,'due',now)&&!matchesReview(dueP,'due',now-1)&&matchesReview(dueP,'wrong',now)&&matchesReview(dueP,'unsure',now)&&!matchesReview(dueP,'bookmark',now)&&!matchesReview(undefined,'due',now));
console.log('PASS: shared search and review predicates');

// Unsure can be toggled after the answer is revealed and reschedules correct answers.
const unsureState=engine.blank(),us=cmd=>engine.run(unsureState,cmd,null,now);
const uq=book.questions[30],us1=us({action:'start',mode:'free',qid:uq.id});
us({action:'answer',session:us1.id,qid:uq.id,label:uq.answer.labels[0],unsure:false});
const up=()=>unsureState.progress.find(p=>p.qid===uq.id);
assert.equal(up().stage,1);assert.equal(up().due,now+3*86400000);
let toggled=us({action:'unsure',session:us1.id,qid:uq.id,value:true});
assert.equal(toggled.answers[uq.id].unsure,true);assert.equal(up().unsure,1);assert.equal(up().stage,0);assert.equal(up().due,now+86400000);
us({action:'unsure',session:us1.id,qid:uq.id,value:false});assert.equal(up().unsure,0);assert.equal(up().stage,1);assert.equal(up().due,now+3*86400000);
assert.equal(up().total,1,'toggle must not grade again');
assert.ok(matchesReview(up(),'due',now+3*86400000));
const wq=book.questions[31],ws=us({action:'start',mode:'free',qid:wq.id});const wrongLabel=wq.choices.find(c=>c.label!==wq.answer.labels[0]).label;
us({action:'answer',session:ws.id,qid:wq.id,label:wrongLabel,unsure:false});us({action:'unsure',session:ws.id,qid:wq.id,value:true});
const wp=unsureState.progress.find(p=>p.qid===wq.id);assert.equal(wp.unsure,1);assert.equal(wp.stage,0);
const ungraded=us({action:'start',mode:'free',qid:book.questions[32].id});
assert.throws(()=>us({action:'unsure',session:ungraded.id,qid:book.questions[32].id,value:true}));
const ue=us({action:'start',mode:'exam'});assert.throws(()=>us({action:'unsure',session:ue.id,qid:ue.ids[0],value:true}));
us({action:'finish',session:us1.id});const doneProgress=JSON.stringify(up());assert.equal(us({action:'unsure',session:us1.id,qid:uq.id,value:true}).answers[uq.id].unsure,false);assert.equal(JSON.stringify(up()),doneProgress,'complete session is read-only');
assert.deepEqual(engine.validate(JSON.parse(JSON.stringify(unsureState))),unsureState);
const badStage=structuredClone(unsureState);badStage.sessions[0].answers[uq.id].priorStage=9;assert.throws(()=>engine.validate(badStage));
console.log('PASS: unsure toggle after reveal, reschedule and restore, wrong answers, ungraded/exam/complete rejection, backup keeps priorStage');

// Toggling an older answer must not rewrite progress owned by a later grading.
const olderState=engine.blank(),os=cmd=>engine.run(olderState,cmd,null,now);
const oq=book.questions[40],first1=os({action:'start',mode:'free',qid:oq.id}),second1=os({action:'start',mode:'free',qid:oq.id});
os({action:'answer',session:first1.id,qid:oq.id,label:oq.answer.labels[0],unsure:false});os({action:'answer',session:second1.id,qid:oq.id,label:oq.answer.labels[0],unsure:false});
const op=olderState.progress[0];assert.equal(op.stage,2);const latest=JSON.stringify(op);
os({action:'unsure',session:first1.id,qid:oq.id,value:true});assert.equal(JSON.stringify(op),latest,'older answer changed latest progress');
assert.equal(engine.run(olderState,undefined,first1.id,now).answers[oq.id].unsure,true);os({action:'unsure',session:first1.id,qid:oq.id,value:false});assert.equal(JSON.stringify(op),latest);
os({action:'unsure',session:second1.id,qid:oq.id,value:true});assert.equal(op.stage,0);os({action:'unsure',session:second1.id,qid:oq.id,value:false});assert.equal(op.stage,2);
// Answers graded before attempts were recorded cannot toggle.
const legacy=structuredClone(olderState);for(const s of legacy.sessions)for(const a of Object.values(s.answers)){delete a.priorStage;delete a.attempt;}
const legacyState=engine.validate(legacy);assert.throws(()=>engine.run(legacyState,{action:'unsure',session:legacyState.sessions[0].id,qid:oq.id,value:true},null,now));
const badAttempt=structuredClone(olderState);badAttempt.sessions[0].answers[oq.id].attempt=0;assert.throws(()=>engine.validate(badAttempt));
assert.deepEqual(engine.validate(JSON.parse(JSON.stringify(olderState))),olderState);
console.log('PASS: older-session unsure toggle keeps latest progress, legacy answers rejected, attempt validated');

// A data version change migrates records by question id instead of discarding them.
const oldVersion={...backup,version:'old-data-version',sessions:backup.sessions.map(x=>({...x,version:'old-data-version'}))};
assert.deepEqual(engine.validate(oldVersion),backup);
const gone=structuredClone(oldVersion);gone.progress.push({...gone.progress[0],qid:'kb-removed-question'});gone.sessions.push({...structuredClone(gone.sessions[0]),id:'00000000-0000-0000-0000-000000000000',ids:['kb-removed-question'],answers:{},index:0});
const migrated=engine.validate(gone);assert.equal(migrated.progress.length,backup.progress.length);assert.equal(migrated.sessions.length,backup.sessions.length);
const sameVersionGone=structuredClone(gone);sameVersionGone.version=engine.version;for(const x of sameVersionGone.sessions)x.version=engine.version;assert.throws(()=>engine.validate(sameVersionGone),'current version stays strict');
assert.throws(()=>engine.validate({...blankOther(),progress:[{...backup.progress[0],qid:'kb-removed-question'}]}),'nothing compatible');
function blankOther(){return {...engine.blank(),version:'other-book'};}
const putRaw=(factory,key,value)=>new Promise((res,rej)=>{const o=factory.open('kb-study-local',1);o.onupgradeneeded=()=>o.result.createObjectStore('books');o.onsuccess=()=>{const tx=o.result.transaction('books','readwrite');tx.objectStore('books').put(value,key);tx.oncomplete=()=>{o.result.close();res();};tx.onerror=rej;};o.onerror=rej;});
const legacyFactory=new IDBFactory();await putRaw(legacyFactory,'2026:'+engine.version,backup);
assert.deepEqual(engine.validate(await createStore(engine,legacyFactory).snapshot()),backup,'legacy key not migrated');
const changedBook={...book,book:{...book.book,sha256:'next-'+book.book.sha256}},nextEngine=createEngine(changedBook);assert.notEqual(nextEngine.version,engine.version);
const upgradeFactory=new IDBFactory();await putRaw(upgradeFactory,'2026:'+engine.version,backup);await putRaw(upgradeFactory,'2026:stale',{...engine.blank(),version:'stale'});
const upgraded=await createStore(nextEngine,upgradeFactory).snapshot();assert.equal(upgraded.version,nextEngine.version);assert.equal(upgraded.progress.length,backup.progress.length);assert.equal(upgraded.sessions.length,backup.sessions.length);
const afterWrite=createStore(nextEngine,upgradeFactory);await afterWrite.request({action:'bookmark',qid:book.questions[5].id,value:true},null,now);
assert.equal((await createStore(nextEngine,upgradeFactory).snapshot()).sessions.length,backup.sessions.length,'migrated records persist under the fixed key');
console.log('PASS: data version migration by question id, strict current version, legacy key pickup, upgrade after data change');

// Migration trims removed questions out of sessions instead of dropping them, and stored state never bricks.
const keepQ=book.questions.slice(60,63).map(q=>q.id),trimState=engine.blank(),tr=cmd=>engine.run(trimState,cmd,null,now);
const ts=tr({action:'start',mode:'free',qid:keepQ[0],followIds:keepQ});const tq=book.questions[60];tr({action:'answer',session:ts.id,qid:tq.id,label:tq.answer.labels[0],unsure:false});
const te=tr({action:'start',mode:'exam'});tr({action:'answer',session:te.id,qid:te.ids[1],label:'①',unsure:false});
const removed=new Set([te.ids[0],keepQ[2]]);
const trimBook={...book,book:{...book.book,sha256:'trim-'+book.book.sha256}};
const trimEngine=createEngine({...trimBook,questions:book.questions.filter(q=>!removed.has(q.id))});
const trimmed=trimEngine.validate(JSON.parse(JSON.stringify(trimState)));
const tFree=trimmed.sessions.find(x=>x.id===ts.id),tExam=trimmed.sessions.find(x=>x.id===te.id);
assert.deepEqual(tFree.ids,[keepQ[0]]);assert.deepEqual(tFree.queue,[keepQ[1]]);assert.equal(tFree.answers[keepQ[0]].label,tq.answer.labels[0]);
assert.equal(tExam.ids.length,49);assert.ok(!tExam.ids.includes(te.ids[0]));assert.equal(tExam.answers[te.ids[1]].label,'①');assert.equal(tExam.ids[tExam.index],te.ids[1]);
assert.equal(trimmed.progress.length,1);
const onlyRemoved=engine.blank();const or=engine.run(onlyRemoved,{action:'start',mode:'free',qid:te.ids[0]},null,now);
assert.throws(()=>trimEngine.validate(JSON.parse(JSON.stringify(onlyRemoved))),'backup with nothing usable is refused');
assert.deepEqual(trimEngine.validate(JSON.parse(JSON.stringify(onlyRemoved)),{fromStore:true}).sessions,[]);
const brickFactory=new IDBFactory();await putRaw(brickFactory,'2026',JSON.parse(JSON.stringify(onlyRemoved)));
const recovered=createStore(trimEngine,brickFactory);assert.equal((await recovered.snapshot()).sessions.length,0);
await recovered.request({action:'bookmark',qid:book.questions[5].id,value:true},null,now);assert.equal((await recovered.snapshot()).progress.length,1,'store usable after migration left nothing');
assert.ok(or.id);
console.log('PASS: migration trims removed questions from sessions and exams, keeps position/answers/queue, stored state recovers when nothing survives');

await import('./check-errata.mjs');

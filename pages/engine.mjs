export function createEngine(book) {
 const bank=book.questions, byId=new Map(bank.map(q=>[q.id,q]));
 const version=book.book.sha256+'-credit-card-11-confirmed-1';
 const catalog=bank.map(q=>({id:q.id,chapter:q.chapter,section:q.section,number:q.number_original,pages:q.source.printed_pages,title:q.content.filter(b=>b.type==='text').map(b=>b.text).join(' ').slice(0,160)}));
 const blank=()=>({format:'kb-study-backup',schema:1,version,year:2026,progress:[],sessions:[]});
 const shuffle=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const n=new Uint32Array(1);crypto.getRandomValues(n);const j=Math.floor(n[0]/4294967296*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const question=(id,reveal)=>{const q=byId.get(id);const {answer,explanation,...rest}=q;return reveal?q:rest;};
 const score=s=>s.ids.filter(id=>s.answers[id]?.label===byId.get(id).answer?.labels?.[0]).length*100/s.ids.length;
 const payload=(s,now)=>({...s,questions:s.ids.map(id=>question(id,s.status==='complete'||s.mode!=='exam'&&s.answers[id]?.graded)),score:s.status==='complete'?score(s):null,serverTime:now});
 function progress(state,id){let p=state.progress.find(p=>p.qid===id);if(!p){p={qid:id,total:0,correct:0,last_correct:0,unsure:0,stage:0,due:0,bookmark:0};state.progress.push(p);}return p;}
 function grade(state,s,id,now){const a=s.answers[id]||{label:'',unsure:false,graded:false};if(a.graded)return;const p=progress(state,id);const correct=a.label===byId.get(id).answer?.labels?.[0]?1:0;p.total++;p.correct+=correct;p.last_correct=correct;p.unsure=a.unsure?1:0;p.stage=correct&&!a.unsure?Math.min(p.stage+1,3):0;p.due=now+[1,3,7,14][p.stage]*86400000;s.answers[id]={...a,graded:true};}
 function finish(state,s,now){if(s.status==='complete')return;for(const id of s.ids)grade(state,s,id,now);s.status='complete';s.finished=now;}
 function examIds(){const quotas=book.book.chapters.map(ch=>{const exact=bank.filter(q=>q.chapter.number===ch.number).length/bank.length*50;return {chapter:ch.number,exact,n:Math.floor(exact)};});let left=50-quotas.reduce((n,q)=>n+q.n,0);for(const q of [...quotas].sort((a,b)=>(b.exact-b.n)-(a.exact-a.n)||a.chapter-b.chapter)){if(left-->0)q.n++;}return shuffle(quotas.flatMap(q=>shuffle(bank.filter(b=>b.chapter.number===q.chapter)).slice(0,q.n).map(q=>q.id)));}
 function run(state,input,id,now=Date.now()){
  for(const s of state.sessions)if(s.status==='active'&&s.expires!==null&&now>=s.expires)finish(state,s,s.expires);
  if(!input){if(id){const s=state.sessions.find(s=>s.id===id);if(!s)throw Error('이 기기에서 학습 기록을 찾을 수 없습니다.');return payload(s,now);}return {authMode:'local',catalog,progress:state.progress,sessions:[...state.sessions].sort((a,b)=>b.created-a.created).map(s=>({id:s.id,mode:s.mode,status:s.status,count:s.ids.length,created:s.created,answered:Object.keys(s.answers).length,score:s.status==='complete'?score(s):null}))};}
  if(input.action==='start'){
   const mode=['daily','free','review','exam'].includes(input.mode)?input.mode:'daily';let ids;
   if(input.retryOf){const prior=state.sessions.find(s=>s.id===input.retryOf);if(!prior||prior.status!=='complete'||mode!=='free')throw Error('완료된 학습에서만 오답을 다시 풀 수 있습니다.');ids=prior.ids.filter(id=>prior.answers[id]?.label!==byId.get(id).answer?.labels?.[0]);}
   else if(mode==='exam')ids=examIds();else if(input.qid&&byId.has(input.qid))ids=[input.qid];else{
    const map=new Map(state.progress.map(p=>[p.qid,p]));let pool=bank.filter(q=>(!input.chapter||q.chapter.number===Number(input.chapter))&&(!input.section||q.section?.id===input.section));
    if(input.search){const query=String(input.search).toLowerCase().slice(0,200);const matches=new Set(catalog.filter(q=>[q.title,q.number,...q.pages,q.chapter.title,q.section?.title||''].join(' ').toLowerCase().includes(query)).map(q=>q.id));pool=pool.filter(q=>matches.has(q.id));}
    if(mode==='review'){pool=pool.filter(q=>{const p=map.get(q.id);return p&&(input.filter==='bookmark'?p.bookmark:input.filter==='wrong'?p.total&&!p.last_correct:input.filter==='unsure'?p.unsure:p.total&&p.due<=now);}).sort((a,b)=>(map.get(a.id)?.due||0)-(map.get(b.id)?.due||0));}
    else if(mode==='daily'){const rank=p=>p?.total?(p.due<=now?0:2):1;pool.sort((a,b)=>rank(map.get(a.id))-rank(map.get(b.id))||(map.get(a.id)?.due||0)-(map.get(b.id)?.due||0));}else if(input.random)pool=shuffle(pool);
    ids=pool.slice(0,[5,10,20].includes(input.count)?input.count:10).map(q=>q.id);
   }
   if(!ids.length)throw Error('해당 조건에 맞는 문제가 없습니다.');let queue;
   if(input.followIds!==undefined){if(mode!=='free'||!input.qid||!Array.isArray(input.followIds)||input.followIds.length<1||input.followIds.length>bank.length||input.followIds[0]!==input.qid||new Set(input.followIds).size!==input.followIds.length||!input.followIds.every(id=>byId.has(id)))throw Error('이어 풀 문제 목록을 확인해주세요.');queue=input.followIds.slice(1);}
   const s={id:crypto.randomUUID(),mode,ids,answers:{},index:0,status:'active',created:now,expires:mode==='exam'?now+3600000:null,version,...(queue!==undefined?{queue}:{})};state.sessions.push(s);return payload(s,now);
  }
  if(input.action==='bookmark'){if(!byId.has(input.qid)||typeof input.value!=='boolean')throw Error('잘못된 문제입니다.');progress(state,input.qid).bookmark=input.value?1:0;return {ok:true};}
  const s=state.sessions.find(s=>s.id===input.session);if(!s)throw Error('학습 기록을 찾을 수 없습니다.');if(s.status==='complete')return payload(s,now);
  if(input.action==='finish')finish(state,s,now);
  else if(input.action==='answer'){if(!s.ids.includes(input.qid)||!byId.get(input.qid).choices.some(c=>c.label===input.label)||typeof input.unsure!=='boolean')throw Error('선택한 답안을 확인해주세요.');if(s.mode!=='exam'&&s.answers[input.qid]?.graded)return payload(s,now);s.answers[input.qid]={label:input.label,unsure:input.unsure,graded:false};if(s.mode!=='exam')grade(state,s,input.qid,now);}
  else if(input.action==='next'){if(s.mode!=='free'||!Array.isArray(s.queue))throw Error('이어 풀 수 없는 학습입니다.');if(s.ids[s.index]!==input.qid)return payload(s,now);if(!s.answers[input.qid]?.graded)throw Error('정답을 먼저 확인해주세요.');if(s.index<s.ids.length-1)s.index++;else{if(!s.queue.length)throw Error('마지막 문제입니다. 학습을 마쳐주세요.');s.ids.push(s.queue.shift());s.index=s.ids.length-1;}}
  else if(input.action==='position'){if(!Number.isInteger(input.index)||input.index<0||input.index>=s.ids.length)throw Error('잘못된 문제 위치입니다.');s.index=input.index;}
  else throw Error('지원하지 않는 요청입니다.');return payload(s,now);
 }
 function validate(value){
  const fail=()=>{throw Error('이 문제집과 호환되는 올바른 백업 파일이 아닙니다. 기존 기록은 변경하지 않았습니다.');};
  if(!value||value.format!=='kb-study-backup'||value.schema!==1||value.version!==version||value.year!==2026||!Array.isArray(value.progress)||!Array.isArray(value.sessions)||value.progress.length>bank.length||value.sessions.length>100000)fail();
  const integer=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
  const pids=new Set(),sids=new Set();const clean=blank();
  for(const p of value.progress){if(!p||!byId.has(p.qid)||pids.has(p.qid)||!['total','correct','due'].every(k=>integer(p[k]))||p.correct>p.total||!['last_correct','unsure','bookmark'].every(k=>integer(p[k],1))||!integer(p.stage,3))fail();pids.add(p.qid);clean.progress.push(Object.fromEntries(['qid','total','correct','due','last_correct','unsure','bookmark','stage'].map(k=>[k,p[k]])));}
  for(const s of value.sessions){if(!s||typeof s.id!=='string'||!/^[a-f0-9-]{36}$/.test(s.id)||sids.has(s.id)||s.version!==version||!['daily','free','review','exam'].includes(s.mode)||!['active','complete'].includes(s.status)||!Array.isArray(s.ids)||!s.ids.length||s.ids.length>bank.length||new Set(s.ids).size!==s.ids.length||!s.ids.every(id=>byId.has(id))||!integer(s.index,s.ids.length-1)||!integer(s.created)||s.mode==='exam'&&(s.ids.length!==50||s.expires!==s.created+3600000)||s.mode!=='exam'&&s.expires!==null||!s.answers||typeof s.answers!=='object'||Array.isArray(s.answers))fail();
   if(s.queue!==undefined&&(s.mode!=='free'||!Array.isArray(s.queue)||s.queue.length+s.ids.length>bank.length||new Set(s.queue).size!==s.queue.length||!s.queue.every(id=>byId.has(id)&&!s.ids.includes(id))))fail();
   const answers={};for(const [id,a] of Object.entries(s.answers)){if(!s.ids.includes(id)||!a||typeof a.unsure!=='boolean'||typeof a.graded!=='boolean'||!(byId.get(id).choices.some(c=>c.label===a.label)||a.label===''&&s.status==='complete')||s.status==='active'&&(s.mode==='exam'?a.graded:!a.graded)||s.status==='complete'&&!a.graded)fail();answers[id]={label:a.label,unsure:a.unsure,graded:a.graded};}
   if(s.status==='complete'&&(Object.keys(answers).length!==s.ids.length||!integer(s.finished)||s.finished<s.created))fail();sids.add(s.id);clean.sessions.push({id:s.id,mode:s.mode,ids:[...s.ids],answers,index:s.index,status:s.status,created:s.created,expires:s.expires,version,...(s.queue!==undefined?{queue:[...s.queue]}:{}),...(s.status==='complete'?{finished:s.finished}:{})});
  }return clean;
 }
 return {blank,run,validate,version};
}

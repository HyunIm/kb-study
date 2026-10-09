export function createStore(engine,factory=globalThis.indexedDB){
 // One fixed key for the 2026 book. Older builds stored records under '2026:<data version>'; the most
 // recent one that still validates is migrated on first use and left in place untouched.
 const key='2026',legacyPrefix='2026:';let opening;
 const latest=v=>Math.max(0,...(v?.sessions||[]).map(s=>Number(s?.finished||s?.created)||0));
 function pickLegacy(values){for(const v of values.sort((a,b)=>latest(b)-latest(a))){try{engine.validate(v,{fromStore:true});return v;}catch{}}}
 // Version 2 marks records that carry correctLabel. Builds before the errata open version 1 and would strip it,
 // so once this build opens the database they get a VersionError instead of rewriting historical grading.
 const DB_VERSION=2;
 function database(){return opening??=new Promise((resolve,reject)=>{if(!factory){reject(Error('이 브라우저에서 기록을 저장할 수 없습니다.'));return;}const r=factory.open('kb-study-local',DB_VERSION);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('books'))r.result.createObjectStore('books');};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();opening=undefined;};resolve(r.result);};r.onerror=()=>{opening=undefined;reject(Error('기기에 기록을 저장할 수 없습니다. 브라우저 저장 설정을 확인해주세요.'));};r.onblocked=()=>{opening=undefined;reject(Error('다른 학습 탭을 닫고 다시 시도해주세요.'));};});}
 async function transaction(change){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('books','readwrite'),store=tx.objectStore('books');let result,failure;
  const apply=value=>{try{const original=value!==undefined?engine.validate(value,{fromStore:true}):engine.blank();const changed=change(original);result=structuredClone(changed.result);store.put(changed.state,key);}catch(e){failure=e;tx.abort();}};
  const r=store.get(key);r.onsuccess=()=>{if(r.result!==undefined){apply(r.result);return;}const legacy=[],c=store.openCursor();c.onsuccess=()=>{const cur=c.result;if(!cur){apply(pickLegacy(legacy));return;}if(typeof cur.key==='string'&&cur.key.startsWith(legacyPrefix))legacy.push(cur.value);cur.continue();};};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||Error('저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인해주세요.'));tx.onerror=()=>{};});}
 return {request:(body,id,now)=>transaction(state=>({state,result:engine.run(state,body,id,now)})),snapshot:()=>transaction(state=>({state,result:{...state,exportedAt:new Date().toISOString()}})),restore:value=>{const clean=engine.validate(value);return transaction(()=>({state:clean,result:true}));}};
}

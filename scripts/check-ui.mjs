// Browser checks for the built site. Run `npm run build:pages` first.
import {strict as assert} from 'node:assert';
import {readFileSync,existsSync} from 'node:fs';
import {preview} from 'vite';
import {chromium} from 'playwright';
import {createEngine} from '../pages/engine.mjs';
if(!existsSync(new URL('../dist-pages/index.html',import.meta.url)))throw Error('dist-pages is missing. Run npm run build:pages first.');
const book=JSON.parse(readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'));
const engine=createEngine(book);
const server=await preview({configFile:new URL('../pages/vite.config.ts',import.meta.url).pathname,preview:{port:0,strictPort:false},logLevel:'silent'});
const base=server.resolvedUrls.local[0];
const browser=await chromium.launch();
const errors=[];
async function page(){const p=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.getByRole('heading',{name:'오늘의 학습'}).waitFor();return p;}
const putRecord=(p,key,value)=>p.evaluate(([key,value])=>new Promise((res,rej)=>{const o=indexedDB.open('kb-study-local',1);o.onsuccess=()=>{const tx=o.result.transaction('books','readwrite'),st=tx.objectStore('books');st.delete('2026');if(value!==null)st.put(value,key);tx.oncomplete=()=>{o.result.close();res();};tx.onerror=rej;};o.onerror=rej;}),[key,value]);
const nav=(p,i)=>p.locator('.app-nav button').nth(i).click();
const pass=[];
try{
 // Practice flow: wrong answer marking, unsure after reveal, result badges, Back returns to home.
 {const p=await page();
  assert.match(await p.locator('.page-heading small').textContent(),/11월 7일 시험/);
  await p.getByRole('button',{name:'5문제',exact:true}).click();await p.getByRole('button',{name:'5문제 시작하기'}).click();await p.waitForURL(/session=/);
  const first=book.questions[0],wrong=first.choices.find(c=>c.label!==first.answer.labels[0]).label;
  await p.locator('.choice',{hasText:wrong}).first().click();await p.getByRole('button',{name:'정답 확인'}).click();
  await p.locator('.choice-wrong').waitFor();assert.equal(await p.locator('.choice-correct').count(),1);
  const unsure=p.getByRole('checkbox');assert.ok(await unsure.isEnabled(),'unsure locked after reveal');await unsure.click();
  await p.locator('.answer-note small',{hasText:'헷갈림'}).waitFor();
  for(let i=0;i<5;i++){if(i>0){await p.locator('.choice').first().click();await p.getByRole('button',{name:'정답 확인'}).click();}await p.getByRole('button',{name:/다음 문제|학습 마치기/}).last().click();}
  await p.getByText('문제별 확인').waitFor();assert.equal(await p.locator('.result-list .learning-label').count(),5);
  await p.goBack();await p.getByRole('heading',{name:'오늘의 학습'}).waitFor();
  // Empty review filter points to a filter that has questions.
  await nav(p,2);await p.getByRole('button',{name:/문제 보기$/}).click();
  assert.notEqual(await p.locator('.review-options button[aria-pressed=true]').textContent(),'오늘 복습0');
  pass.push('practice flow, wrong/unsure marking, result badges, Back, review empty-state jump');}
 // Catalog renders in pages of 50 and keeps its length and scroll after returning from a question.
 {const p=await page();await nav(p,1);
  assert.equal(await p.locator('.catalog button').count(),50);
  await p.getByRole('button',{name:/문제 더 보기/}).click();assert.equal(await p.locator('.catalog button').count(),100);
  await p.locator('.list-more').scrollIntoViewIfNeeded();await p.waitForFunction(()=>document.querySelectorAll('.catalog button').length>=150);
  await p.locator('.catalog button').nth(120).click();await p.waitForURL(/session=/);
  await p.goBack();await p.locator('.catalog').waitFor();await p.waitForTimeout(200);
  assert.ok(await p.locator('.catalog button').count()>=150,'list length lost after Back');assert.ok(await p.evaluate(()=>scrollY)>1000,'scroll position lost after Back');
  await p.getByRole('textbox',{name:'문제 검색'}).fill('  신용카드  ');assert.ok(await p.locator('.catalog button').count()<=50);
  pass.push('catalog paging, auto-load, length and scroll restore, search');}
 // Exam: timer ticks, leaving asks first through both the button and browser Back.
 {const p=await page();await nav(p,3);await p.getByRole('button',{name:/60분 모의고사 시작/}).click();await p.waitForURL(/session=/);
  const t0=await p.locator('.timer').textContent();await p.waitForTimeout(2100);assert.notEqual(await p.locator('.timer').textContent(),t0,'exam timer stopped');
  await p.getByRole('button',{name:'목록으로'}).click();await p.getByRole('alertdialog').waitFor();await p.getByRole('button',{name:'계속 풀기'}).click();
  await p.goBack();await p.getByRole('alertdialog').waitFor();assert.ok(await p.locator('.timer').isVisible());
  await p.getByRole('button',{name:'나가기'}).click();await p.getByRole('heading',{name:'모의고사'}).waitFor();assert.ok(!new URL(p.url()).searchParams.has('session'));
  pass.push('exam timer, leave confirmation via button and Back');}
 // Records stored by an older build under the versioned key are picked up.
 {const p=await page();const state=engine.blank();engine.run(state,{action:'bookmark',qid:book.questions[3].id,value:true});
  await putRecord(p,'2026:'+engine.version,state);await p.reload();await p.getByRole('heading',{name:'오늘의 학습'}).waitFor();
  await nav(p,2);assert.match(await p.locator('.review-options button').nth(3).textContent(),/1$/);
  pass.push('legacy storage key migration');}
 // History shows the latest 20 sessions with a button for older ones.
 {const p=await page();const state=engine.blank(),t=Date.now()-86400000;
  for(let i=0;i<21;i++){const s=engine.run(state,{action:'start',mode:'free',qid:book.questions[i].id},null,t+i);engine.run(state,{action:'finish',session:s.id},null,t+i);}
  await putRecord(p,'2026',state);await p.reload();await p.getByRole('heading',{name:'오늘의 학습'}).waitFor();await nav(p,4);
  const rows=p.locator('.result-list button');assert.equal(await rows.count(),20);await p.getByRole('button',{name:'이전 기록 더 보기'}).click();assert.equal(await rows.count(),21);
  pass.push('history paging');}
 assert.deepEqual(errors,[],'page errors');
 console.log('PASS (ui): '+pass.join('; '));
}finally{await browser.close();await server.close();}

import {createStore} from './local-store.mjs';
import raw from '../data/questions.json';
import {createEngine} from './engine.mjs';
export const engine=createEngine(raw);
const store=createStore(engine);
export function request(body?:unknown,url='./'):Promise<any>{const id=new URL(url,location.href).searchParams.get('session');return store.request(body,id);}
export const snapshot=store.snapshot;
export const restore=store.restore;
export function download(value:unknown,prefix='kb-study-2026'){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}

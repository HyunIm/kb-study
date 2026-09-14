import raw from '../data/questions.json';
export type Block={type:string;text?:string;rows?:number;cells?:{row:number;column:number;rowspan:number;colspan:number;text:string}[];src?:string;source_image?:string;extracted_text?:string};
export type Question={id:string;chapter:{number:number;title:string};section:{id:string;title:string}|null;number_original:string;content:Block[];choices:{label:string;content:Block[];table_rows?:{table_id:string;rows:number[]}[]}[];source:{printed_pages:string[];pdf_pages:number[]};answer?:{labels:string[]|null;raw:string};explanation?:Block[]};
export const bank=raw.questions as Question[];
export const byId=new Map(bank.map(q=>[q.id,q]));
export const version=raw.book.sha256+'-credit-card-11-confirmed-1';
export function publicQuestion(q:Question,reveal=false):Question {return {id:q.id,chapter:q.chapter,section:q.section,number_original:q.number_original,content:q.content,choices:q.choices,source:{printed_pages:q.source.printed_pages,pdf_pages:q.source.pdf_pages},...(reveal?{answer:q.answer,explanation:q.explanation}:{})};}
export const catalog=bank.map(q=>({id:q.id,chapter:q.chapter,section:q.section,number:q.number_original,pages:q.source.printed_pages,title:q.content.filter(b=>b.type==='text').map(b=>b.text).join(' ').slice(0,160)}));
export function shuffle<T>(items:T[]):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const n=new Uint32Array(1);crypto.getRandomValues(n);const j=Math.floor(n[0]/4294967296*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function examIds(){const counts=raw.book.chapters.map(ch=>({chapter:ch.number,exact:bank.filter(q=>q.chapter.number===ch.number).length/15}));const quotas=counts.map(x=>({...x,n:Math.floor(x.exact)}));let remaining=50-quotas.reduce((s,x)=>s+x.n,0);for(const q of [...quotas].sort((a,b)=>(b.exact-b.n)-(a.exact-a.n)||a.chapter-b.chapter)){if(remaining-->0)q.n++;}return shuffle(quotas.flatMap(x=>shuffle(bank.filter(q=>q.chapter.number===x.chapter)).slice(0,x.n).map(q=>q.id)));}

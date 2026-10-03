// Types for engine.mjs. The engine stays plain JavaScript so scripts/check-pages.mjs runs it in Node directly.
import type {Question} from '../lib/bank';

export type ReviewFilter='due'|'wrong'|'unsure'|'bookmark';
export type Mode='daily'|'free'|'review'|'exam';

export type CatalogItem={id:string;chapter:Question['chapter'];section:Question['section'];number:string;pages:string[];title:string};
export type Progress={qid:string;total:number;correct:number;last_correct:0|1;unsure:0|1;stage:number;due:number;bookmark:0|1};
export type Answer={label:string;unsure:boolean;graded:boolean;priorStage?:number;attempt?:number};
export type StoredSession={id:string;mode:Mode;ids:string[];answers:Record<string,Answer>;index:number;status:'active'|'complete';created:number;expires:number|null;version:string;queue?:string[];finished?:number};
export type State={format:'kb-study-backup';schema:1;version:string;year:2026;progress:Progress[];sessions:StoredSession[]};

/** One session as returned to the UI, with questions (answers hidden until revealed). */
export type SessionPayload=StoredSession&{questions:Question[];score:number|null;serverTime:number};
export type SessionSummary={id:string;mode:Mode;status:'active'|'complete';count:number;currentChapter?:string;created:number;answered:number;score:number|null};
/** What `run` returns without input: the home screen data. */
export type Info={authMode:'local';catalog:CatalogItem[];progress:Progress[];sessions:SessionSummary[]};

export type Engine={
 version:string;
 blank():State;
 run(state:State,input:undefined,id:string,now?:number):SessionPayload;
 run(state:State,input?:undefined,id?:null,now?:number):Info;
 run(state:State,input:{action:'bookmark'}&Record<string,unknown>,id?:string|null,now?:number):{ok:true};
 run(state:State,input:Record<string,unknown>,id?:string|null,now?:number):SessionPayload;
 /** Checks a stored record or backup, migrating other data versions by question id. Throws if unusable;
  * with fromStore, a migration that leaves nothing yields an empty state instead of throwing. */
 validate(value:unknown,options?:{fromStore?:boolean}):State;
};

export function searchQuery(text:unknown):string;
export function matchesSearch(item:CatalogItem,query:string):boolean;
export function matchesReview(p:Progress|undefined,filter:string,now:number):boolean;
export function createEngine(book:unknown):Engine;

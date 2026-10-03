import type {Engine,State} from './engine.mjs';

export type Store={
 request(body:unknown,id:string|null,now?:number):Promise<unknown>;
 snapshot():Promise<State&{exportedAt:string}>;
 restore(value:unknown):Promise<true>;
};
export function createStore(engine:Engine,factory?:IDBFactory|null):Store;

import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const figures=JSON.parse(readFileSync(new URL('../data/figures.json',import.meta.url),'utf8'));
const target=new URL('../pages/public/figures/',import.meta.url);mkdirSync(target,{recursive:true});
for(const [name,base64] of Object.entries(figures)){if(!/^[a-zA-Z0-9_.-]+\.png$/.test(name))throw Error('Invalid figure filename');writeFileSync(new URL(name,target),Buffer.from(base64,'base64'));}
writeFileSync(new URL('../pages/public/.nojekyll',import.meta.url),'');
console.log('Prepared '+Object.keys(figures).length+' original figures');

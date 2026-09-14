// Reflow PDF line wrapping for display only. Keep paragraph and list boundaries.
export function choiceText(text='') {
 const lines=text.replace(/\r\n?/g,'\n').split('\n');
 const item=/^\s*(?:[ㄱ-ㅎ][.)]|[가나다라마바사아자차카타파하][.)]|[①-⑳㉠-㉻]|[•▪▶※]|[-*]\s|\d+[.)]\s)/;
 return lines.map((line,i)=>i===0?line:(!line.trim()||!lines[i-1].trim()||item.test(line)?'\n':' ')+line.trimStart()).join('');
}

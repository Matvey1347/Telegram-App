#!/usr/bin/env node
/** Import only human review fields from an edited blind CSV, preserving the original JSONL. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {outputPath} from './lead-review-evaluate.mjs';
const LABELS=new Set(['AD','VP_POSSIBLE','VP_CONFIRMED','ORGANIC','UNKNOWN']);
const HUMAN=['human_label','human_reason','human_evidence','reviewer'];
const MAX=16*1024*1024;
export function parseCsv(input){
 if(Buffer.byteLength(input)>MAX)throw Error('CSV exceeds size limit');
 let text=input.replace(/^\uFEFF/u,''),rows=[],row=[],field='',quoted=false,closed=false,started=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=ch;continue}
  if(ch==='"'){if(started||closed)throw Error('Invalid CSV quoting');quoted=true;started=true;continue}
  if(ch===','||ch==='\n'||ch==='\r'){
   row.push(field);field='';started=false;closed=false;
   if(ch!==','){if(ch==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[]}
   continue;
  }
  if(closed)throw Error('Invalid CSV after closing quote');field+=ch;started=true;
 }
 if(quoted)throw Error('Unclosed CSV quote');if(started||closed||field||row.length){row.push(field);rows.push(row)}
 return rows;
}
export function importReview(csv,original){
 const data=parseCsv(csv);if(!data.length)throw Error('Empty CSV');
 const headers=data.shift(),required=['id','sourceId','split',...HUMAN];
 if(new Set(headers).size!==headers.length||required.some(k=>!headers.includes(k)))throw Error('Invalid CSV headers');
 const source=new Map();for(const r of original){if(!r.id||source.has(r.id))throw Error('Invalid original manifest');source.set(r.id,r)}
 const result=new Map();
 for(const cells of data){if(cells.length!==headers.length)throw Error('Invalid CSV row width');const r=Object.fromEntries(headers.map((k,i)=>[k,cells[i]])),old=source.get(r.id);
  if(!old||result.has(r.id)||r.sourceId!==old.sourceId||r.split!==old.split)throw Error('CSV identifiers do not match original manifest');
  const label=r.human_label.trim(),reason=r.human_reason.trim(),reviewer=r.reviewer.trim(),evidence=r.human_evidence.trim();
  if(label&&!LABELS.has(label))throw Error('Invalid human label');
  const flags=[label,reason,reviewer].map(Boolean);if(flags.some(Boolean)&&!flags.every(Boolean))throw Error('Incomplete human review');
  if(!label&&evidence)throw Error('Evidence requires a complete human review');
  result.set(r.id,{...old,human_label:label,human_reason:reason,human_evidence:evidence,reviewer});
 }
 if(result.size!==source.size)throw Error('CSV does not contain the full original manifest');
 return original.map(r=>result.get(r.id));
}
function read(path){const b=readFileSync(path,'utf8');if(Buffer.byteLength(b)>MAX)throw Error('Input exceeds size limit');return b}
function main(args){if(args.length!==6||args[0]!=='--csv'||args[2]!=='--original'||args[4]!=='--output')throw Error('Provide --csv, --original, --output');
 const original=read(args[3]).split(/\r?\n/u).filter(Boolean).map(JSON.parse),rows=importReview(read(args[1]),original),out=outputPath(args[5]);writeFileSync(out,rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx',mode:0o600});return {total:rows.length,reviewed:rows.filter(r=>r.human_label).length}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(main(process.argv.slice(2))))}catch(e){console.error(e.code==='EEXIST'?'Output exists; preserve prior reviews':e.message);process.exitCode=1}}

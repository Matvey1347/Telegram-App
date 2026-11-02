#!/usr/bin/env node
/** Make blind, separate reviewer and prediction files without changing earlier files. */
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {csvCell} from './lead-review-sample.mjs';
const root=resolve('research/telegram-ad-filter/review-sample-v3');
export function blind(rows){return rows.map(r=>({id:r.id,sourceId:r.sourceId,channel:r.channel,publishedAt:r.publishedAt,messageUrl:r.messageUrl,split:r.split,text:r.text,human_label:'',human_reason:'',human_evidence:'',reviewer:''}))}
export function predictions(rows){return rows.map(r=>({id:r.id,prediction:'',actual_ai_calls:null,baseline_ai_calls:null}))}
const fields=['id','sourceId','channel','publishedAt','messageUrl','split','text','human_label','human_reason','human_evidence','reviewer'];
function write(name,data){const file=join(realpathSync(root),name),p=relative(process.cwd(),file);try{execFileSync('git',['check-ignore','-q','--no-index','--',p],{stdio:'ignore'})}catch{throw Error('Output must be Git ignored')}if(execFileSync('git',['ls-files','--',p],{encoding:'utf8'}).trim())throw Error('Output is tracked');writeFileSync(file,data,{flag:'wx',mode:0o600})}
function main(){const counts={};for(const name of ['dev','holdout']){const rows=readFileSync(join(root,`review-${name}.jsonl`),'utf8').split(/\r?\n/u).filter(Boolean).map(JSON.parse),blindRows=blind(rows);write(`blind-${name}.jsonl`,blindRows.map(x=>JSON.stringify(x)).join('\n')+'\n');write(`blind-${name}.csv`,fields.map(csvCell).join(',')+'\n'+blindRows.map(r=>fields.map(k=>csvCell(r[k])).join(',')).join('\n')+'\n');write(`predictions-${name}.jsonl`,predictions(rows).map(x=>JSON.stringify(x)).join('\n')+'\n');write(`expected-${name}.jsonl`,rows.map(r=>JSON.stringify({id:r.id})).join('\n')+'\n');counts[name]=rows.length}
write('BLIND-REVIEW.txt','Blind files exclude all provisional labels and hints. Freeze predictions in the separate prediction file before inspecting holdout human reviews. The expected manifest defines the full sample; do not rewrite it to match a partially reviewed subset. Reviewer independence and near-duplicate leakage are unverified. VP_CONFIRMED requires reviewer verification of reciprocal posts. CSV protects against formula injection; JSONL preserves exact text. Keep these files local and out of Git.\n');return counts}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(main()))}catch(e){console.error(e.code==='EEXIST'?'Output exists; preserve reviewer edits':e.message);process.exitCode=1}}

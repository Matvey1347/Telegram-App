#!/usr/bin/env node
/** Dev-only research hints; links and calls to action do not prove mutual promotion. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDataset } from './lead-autopilot-label.mjs';
import { buildSample, csvCell } from './lead-review-sample.mjs';

const ROOT=resolve('research/telegram-ad-filter');
const hash=id=>createHash('sha256').update(`lead-review-v2:${id}`).digest('hex');
export function vpReviewHint(text) {
  const tg=/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[a-z][a-z0-9_]{3,31}/iu;
  const cta=/(?:п[іи]дпиш|подпиш|п[іи]дпис|подпис|долуч|приєднуй|переход|запрошу|заходь|subscribe)/iu;
  return tg.test(text) && cta.test(text);
}
export function buildV2(rows, assignment) {
  const sample=buildSample(rows,assignment);
  const split=new Map(assignment.assignments.map(a=>[a.id,a.split]));
  // Only dev posts are inspected for the exploratory hint; held-out data remain blind.
  const hints=rows.filter(r=>split.get(r.id)==='dev' && vpReviewHint(r.text)).sort((a,b)=>hash(a.id).localeCompare(hash(b.id)));
  for (const row of hints) {
    if (sample.some(s=>s.id===row.id)) continue;
    const replace=sample.findIndex(s=>s.split==='dev' && s.sourceId===row.sourceId && !hints.some(h=>h.id===s.id));
    if (replace<0) throw new Error('Too many hints for source sample');
    sample[replace]={id:row.id,sourceId:row.sourceId,channel:row.channel??'',publishedAt:row.publishedAt??'',split:'dev',text:row.text,
      provisional_label:'UNKNOWN',provisional_reason:'Telegram link and call to action need review',human_label:'',human_reason:'',human_evidence:'',reviewer:''};
  }
  const hintIds=new Set(hints.map(r=>r.id));
  return sample.map(row=>{
    const flagged=hintIds.has(row.id);
    return {...row,...(flagged?{provisional_label:'UNKNOWN',provisional_reason:'Telegram link and call to action need review'}:{}),
      vp_review_hint:flagged, vp_review_reason:flagged?'Telegram link and call to action; may be own channel or footer, reciprocity unverified':''};
  });
}
const columns=['id','sourceId','channel','publishedAt','split','text','provisional_label','provisional_reason','vp_review_hint','vp_review_reason','human_label','human_reason','human_evidence','reviewer'];
export function csv(rows) { return columns.map(csvCell).join(',')+'\n'+rows.map(r=>columns.map(c=>csvCell(r[c])).join(',')).join('\n')+'\n'; }
function outputDir() {
  const dir=join(ROOT,'review-sample-v2');mkdirSync(dir,{recursive:true,mode:0o700});const real=realpathSync(dir),rel=relative(realpathSync(ROOT),real);
  if(!rel||rel.startsWith('..')||rel.startsWith('/'))throw new Error('Invalid output directory');
  for(const name of ['review-dev.csv','review-dev.jsonl','review-holdout.csv','review-holdout.jsonl','README.txt']) {
    const p=relative(process.cwd(),join(real,name));try{execFileSync('git',['check-ignore','-q','--no-index','--',p],{stdio:'ignore'})}catch{throw new Error('Output path must be ignored by Git')}
    if(execFileSync('git',['ls-files','--',p],{encoding:'utf8'}).trim())throw new Error('Output path is tracked by Git');
  }return real;
}
function writeOnce(p,data){try{writeFileSync(p,data,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST'||readFileSync(p,'utf8')!==data)throw new Error('Existing output differs; preserve reviewer edits')}}
function main(){
  const input=readFileSync(join(ROOT,'dataset-original.jsonl'),'utf8');parseDataset(input);
  const rows=input.split(/\r?\n/u).filter(Boolean).map(JSON.parse),assignment=JSON.parse(readFileSync(join(ROOT,'labeling-workflow-v2/assignments.json'),'utf8'));
  const sample=buildV2(rows,assignment),dir=outputDir();
  for(const [name,subset] of [['dev',sample.filter(r=>r.split==='dev')],['holdout',sample.filter(r=>r.split!=='dev')]]) {
    writeOnce(join(dir,`review-${name}.csv`),csv(subset));writeOnce(join(dir,`review-${name}.jsonl`),subset.map(r=>JSON.stringify(r)).join('\n')+'\n');
  }
  writeOnce(join(dir,'README.txt'),`Sensitive local review material; do not commit or send automatically.\nDevelopment and test/source-holdout are separate; keep holdout blind until rules are frozen.\nHeuristic labels and vp_review_hint are unvalidated hypotheses, not ground truth. The VP review hint is computed only for dev: a Telegram link plus a call to action can be a footer or self-promotion; it does not establish reciprocity or VP.\nHuman label, reason, evidence and reviewer are blank. Allowed labels: AD, VP_POSSIBLE, VP_CONFIRMED, ORGANIC, UNKNOWN. VP_CONFIRMED requires independently verifiable reciprocal posts.\nJSONL preserves original text; CSV prefixes spreadsheet-formula cells with an apostrophe. Review records are not automatically imported into the labeling workflow.\n`);
  const count=k=>sample.reduce((o,r)=>(o[r[k]]=(o[r[k]]??0)+1,o),{});
  return {total:sample.length,bySource:count('sourceId'),bySplit:count('split'),byProvisional:count('provisional_label'),vpReviewHints:sample.filter(r=>r.vp_review_hint).length,directory:relative(process.cwd(),dir)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(main(),null,2))}catch(e){console.error(e.message);process.exitCode=1}}

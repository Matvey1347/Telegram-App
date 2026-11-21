#!/usr/bin/env node
/** Offline evaluation of reviewed holdout examples. Never infers labels from text. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const LABELS=['AD','VP_POSSIBLE','VP_CONFIRMED','ORGANIC','UNKNOWN'];
const MAX_BYTES=16*1024*1024;
const filled=x=>typeof x==='string'&&x.trim().length>0;
function jsonl(path){const data=readFileSync(path,'utf8');if(Buffer.byteLength(data)>MAX_BYTES)throw new Error('Input too large');return data.split(/\r?\n/u).filter(Boolean).map(JSON.parse)}
export function evaluate(rows,catalog,assignments,expected = null) {
  const splits=new Map(assignments.map(a=>[a.id,`${a.sourceId}:${a.split}`]));
  const evidence=new Map();for(const row of catalog){if(!filled(row.id)||!filled(row.sourceId)||evidence.has(row.id))throw new Error('Invalid evidence catalog');evidence.set(row.id,row.sourceId)}
  const seen=new Set();let reviewed=0,unreviewed=0,unscored=0;const scored=[];
  for(const row of rows){
    if(!filled(row.id)||seen.has(row.id)||!['test','source-holdout'].includes(row.split)||evidence.get(row.id)!==row.sourceId||splits.get(row.id)!==`${row.sourceId}:${row.split}`)throw new Error('Invalid holdout row');
    seen.add(row.id);
    const parts=[row.human_label,row.human_reason,row.reviewer].map(filled);
    if(parts.every(x=>!x)){unreviewed++;continue}
    if(!parts.every(Boolean)||!LABELS.includes(row.human_label))throw new Error('Incomplete or invalid human review');
    if(row.human_label==='VP_CONFIRMED'){
      const ids=Array.isArray(row.human_evidence)?row.human_evidence:typeof row.human_evidence==='string'?row.human_evidence.split(',').map(x=>x.trim()).filter(Boolean):[];
      if(!ids.includes(row.id)||!ids.some(id=>evidence.has(id)&&evidence.get(id)!==row.sourceId)||ids.some(id=>!evidence.has(id)))throw new Error('VP_CONFIRMED requires catalog evidence from this post and another source');
    }
    reviewed++;
    if(!filled(row.prediction)){unscored++;continue}
    if(!LABELS.includes(row.prediction))throw new Error('Invalid prediction');
    scored.push(row);
  }
  const metrics=Object.fromEntries(LABELS.map(label=>{
    const eligible=label==='UNKNOWN'?scored:scored.filter(r=>r.human_label!=='UNKNOWN');
    const tp=eligible.filter(r=>r.human_label===label&&r.prediction===label).length;
    const fp=eligible.filter(r=>r.human_label!==label&&r.prediction===label).length;
    const fn=eligible.filter(r=>r.human_label===label&&r.prediction!==label).length;
    return [label,{truePositives:tp,falsePositives:fp,falseNegatives:fn,precisionNumerator:tp,precisionDenominator:tp+fp,precision:tp+fp?tp/(tp+fp):null,recallNumerator:tp,recallDenominator:tp+fn,recall:tp+fn?tp/(tp+fn):null}];
  }));
  const countsValid=scored.length>0&&scored.every(r=>Number.isSafeInteger(r.actual_ai_calls)&&r.actual_ai_calls>=0&&Number.isSafeInteger(r.baseline_ai_calls)&&r.baseline_ai_calls>=0);
  const actual=countsValid?scored.reduce((n,r)=>n+r.actual_ai_calls,0):null;
  const baseline=countsValid?scored.reduce((n,r)=>n+r.baseline_ai_calls,0):null;
  const expectedIds = expected === null ? null : new Set(expected.map(item => item.id));
  if (expected !== null && (expectedIds.size !== expected.length || expected.some(item => !filled(item.id)))) throw new Error('Invalid expected manifest');
  const expectedMatches = expectedIds !== null && expectedIds.size === seen.size && [...expectedIds].every(id => seen.has(id));
  const completeness=unreviewed||unscored||!rows.length||!expectedMatches?'partial':'complete';
  return {status:'partial',completeness,expectedManifestProvided:expectedIds!==null,expectedCount:expectedIds?.size??null,expectedMatches,total:rows.length,reviewed,unreviewed,reviewedWithoutPrediction:unscored,scored:scored.length,metrics,
    aiCalls:{actual,baseline,reduction:baseline>0?(baseline-actual)/baseline:null,provenance:'USER_SUPPLIED_UNVERIFIED'},
    reviewIndependence:'NOT_VERIFIED',freezeTiming:'NOT_VERIFIED',interpretation:'Only complete human reviews with predictions are scored. Human UNKNOWN is excluded from metrics of other classes, but UNKNOWN is assessed separately. Freeze independent predictions before inspecting holdout labels. Reviewer independence and near-duplicate leakage remain unverified. Holdout sampling is stratified, so results describe this reviewed sample and may not estimate channel-wide prevalence. VP_CONFIRMED evidence references establish source identity only; a reviewer must verify reciprocal publication content. AI reduction requires explicit actual and baseline call counts for every scored row.'};
}
function parseOptions(args){const out={};for(let i=0;i<args.length;i+=2){if(!['--input','--catalog','--assignments','--output','--expected','--predictions','--freeze'].includes(args[i])||!args[i+1]||out[args[i]])throw new Error('Provide --input, --catalog, --assignments and --output');out[args[i]]=args[i+1]}if(!['--input','--catalog','--assignments','--output'].every(key=>out[key]))throw new Error('Provide --input, --catalog, --assignments and --output');return out}
export function outputPath(path){const root=realpathSync(resolve('research/telegram-ad-filter')),full=resolve(path),parent=dirname(full);mkdirSync(parent,{recursive:true,mode:0o700});const rel=relative(root,realpathSync(parent));if(rel.startsWith('..')||rel.startsWith('/'))throw new Error('Output must be under research/telegram-ad-filter');const gitpath=relative(process.cwd(),full);try{execFileSync('git',['check-ignore','-q','--no-index','--',gitpath],{stdio:'ignore'})}catch{throw new Error('Output must be ignored by Git')}if(execFileSync('git',['ls-files','--',gitpath],{encoding:'utf8'}).trim())throw new Error('Output is tracked by Git');return full}
export function freezeDigest(expected,predictions) {
  const ids=expected.map(x=>x.id);if(!ids.length||ids.some(id=>!filled(id))||new Set(ids).size!==ids.length)throw new Error('Invalid expected manifest');
  const map=new Map();for(const p of predictions){if(!filled(p.id)||map.has(p.id)||!LABELS.includes(p.prediction))throw new Error('Invalid frozen predictions');map.set(p.id,p.prediction)}
  if(map.size!==ids.length||ids.some(id=>!map.has(id)))throw new Error('Predictions do not match expected manifest');
  return createHash('sha256').update(JSON.stringify(ids.sort().map(id=>[id,map.get(id)]))).digest('hex');
}
export function mergePredictions(rows,predictions) {
  const lookup=new Map();for(const p of predictions){if(!filled(p.id)||lookup.has(p.id))throw new Error('Invalid prediction file');lookup.set(p.id,p)}
  const ids=new Set(rows.map(r=>r.id));if([...lookup.keys()].some(id=>!ids.has(id)))throw new Error('Prediction ID not in review');
  return rows.map(row=>{const p=lookup.get(row.id);return {...row,prediction:p?.prediction??'',actual_ai_calls:p?.actual_ai_calls,baseline_ai_calls:p?.baseline_ai_calls}});
}
export function main(args){const opt=parseOptions(args),input=jsonl(opt['--input']),pred=opt['--predictions']?jsonl(opt['--predictions']):null,expected=opt['--expected']?jsonl(opt['--expected']):null;
  let freezeIntegrity='NOT_VERIFIED';if(opt['--freeze']){if(!pred||!expected)throw new Error('Freeze requires --predictions and --expected');const frozen=JSON.parse(readFileSync(opt['--freeze'],'utf8'));if(frozen.version!==1||frozen.sha256!==freezeDigest(expected,pred))throw new Error('Frozen predictions or manifest changed');freezeIntegrity='MATCHED';}
  const rows=pred?mergePredictions(input,pred):input,report=evaluate(rows,jsonl(opt['--catalog']),JSON.parse(readFileSync(opt['--assignments'],'utf8')).assignments,expected),path=outputPath(opt['--output']);report.freezeIntegrity=freezeIntegrity;report.status=report.completeness==='complete'&&freezeIntegrity==='MATCHED'?'complete':'partial';writeFileSync(path,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return {status:report.status,total:report.total,reviewed:report.reviewed,scored:report.scored,completeness:report.completeness,freezeIntegrity,freezeTiming:report.freezeTiming,reviewIndependence:report.reviewIndependence}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(main(process.argv.slice(2))))}catch(e){console.error(e.code==='EEXIST'?'Output exists; use a new path':e.message);process.exitCode=1}}

#!/usr/bin/env node
/** Offline human labeling for an already permitted local JSONL dataset. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, realpathSync, statSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('research/telegram-ad-filter');
const MAX_INPUT = 16 * 1024 * 1024;
const LABELS = new Set(['AD', 'VP_CONFIRMED_BY_EVIDENCE', 'VP_POSSIBLE', 'ORGANIC', 'UNKNOWN']);
const SPLITS = new Set(['dev', 'test', 'source-holdout']);
const rank = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const error = message => { throw new Error(message); };
function bounded(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/u.test(value)) error(`Invalid ${name}`);
  return value.trim();
}
export function parseDataset(text) {
  if (Buffer.byteLength(text) > MAX_INPUT) error('Dataset exceeds 16 MiB');
  const rows = []; const seen = new Set();
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const id = bounded(row.id, 'post id', 200), sourceId = bounded(row.sourceId, 'source id', 200);
    if (!/^[A-Za-z0-9_.:-]+$/.test(id) || !/^[A-Za-z0-9_.:-]+$/.test(sourceId)) error('IDs must be opaque identifiers');
    if (seen.has(id)) error('Duplicate post id');
    if (typeof row.text !== 'string') error('Missing post text');
    seen.add(id); rows.push({ id, sourceId, text: row.text });
    if (rows.length > 100000) error('Dataset exceeds 100000 rows');
  }
  return rows;
}
export function makeAssignment(rows, seed) {
  bounded(seed, 'seed', 200);
  const sources = [...new Set(rows.map(r => r.sourceId))].sort((a,b)=>rank(seed,'source',a).localeCompare(rank(seed,'source',b)));
  const held = new Set(sources.slice(0, sources.length > 1 ? Math.min(sources.length - 1, Math.max(1, Math.round(sources.length * .2))) : 0));
  const creative = text => rank(text.normalize('NFKC').toLocaleLowerCase('und').replace(/\s+/gu,' ').trim());
  const heldCreatives = new Set(rows.filter(row=>held.has(row.sourceId)).map(row=>creative(row.text)));
  const assignments = rows.map(({id,sourceId,text})=>{
    const key=creative(text);
    return { id, sourceId, split: heldCreatives.has(key) ? 'source-holdout' : (parseInt(rank(seed,'creative',key).slice(0,8),16) / 0x100000000 < .2 ? 'test' : 'dev') };
  }).sort((a,b)=>rank(seed,'order',a.id).localeCompare(rank(seed,'order',b.id)));
  return {version:2,seed,datasetFingerprint:rank(rows.map(({id,sourceId,text})=>[sourceId,id,rank(text)]).sort((a,b)=>a[1].localeCompare(b[1]))),assignments};
}
export function validateLabel(input, assignments) {
  const id=bounded(input.id,'post id',200), label=bounded(input.label,'label',40), reviewer=bounded(input.reviewer,'reviewer',120), reason=bounded(input.reason,'reason',1200);
  if (!LABELS.has(label)) error('Unknown label');
  const selected=assignments.find(item=>item.id===id); if (!selected) error('Post not found');
  const evidence=(input.evidence ?? []).map(x=>bounded(x,'evidence id',200));
  if (new Set(evidence).size !== evidence.length || evidence.length > 10 || evidence.some(x=>!assignments.some(a=>a.id===x))) error('Invalid evidence references');
  if (label==='VP_CONFIRMED_BY_EVIDENCE' && (!evidence.some(x=>x===id) || !evidence.some(x=>assignments.find(a=>a.id===x)?.sourceId!==selected.sourceId))) error('Confirmed VP needs this post and another source post as evidence');
  return { id,sourceId:selected.sourceId,split:selected.split,label,reason,evidence,reviewer,reviewedAt:new Date().toISOString() };
}
function inputFile(path) {
  const full=resolve(path); if (statSync(full).size > MAX_INPUT) error('Dataset exceeds 16 MiB');
  return parseDataset(readFileSync(full,'utf8'));
}
function outputDir(path) {
  const full=resolve(path), local=relative(ROOT,full);
  if (!local || local.startsWith('..') || local.startsWith('/')) error('Output must be a subdirectory of research/telegram-ad-filter');
  mkdirSync(full,{recursive:true,mode:0o700});
  const root=realpathSync(ROOT), real=realpathSync(full), rel=relative(root,real);
  if (!rel || rel.startsWith('..') || rel.startsWith('/')) error('Output must be a subdirectory of research/telegram-ad-filter');
  try { execFileSync('git',['check-ignore','-q','--no-index','--',relative(process.cwd(),join(real,'labels.jsonl'))],{stdio:'ignore'}); }
  catch { error('Output must be ignored by Git'); }
  return real;
}
function options(args) {
  const out={}; for(let i=0;i<args.length;i+=2){ if(!args[i].startsWith('--') || args[i+1]===undefined || args[i+1].startsWith('--')) error('Expected --option value'); const k=args[i].slice(2); if(k in out)error('Duplicate option'); out[k]=args[i+1]; } return out;
}
function readAssignments(dir) { return JSON.parse(readFileSync(join(dir,'assignments.json'),'utf8')); }
function readLabels(dir) {
  try { const p=join(dir,'labels.jsonl'); if(statSync(p).size>MAX_INPUT)error('Label file exceeds 16 MiB'); return readFileSync(p,'utf8').split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line)); }
  catch (e) { if(e.code==='ENOENT') return []; throw e; }
}
function lock(dir, callback) {
  const p=join(dir,'.label.lock'); let fd; try { fd=openSync(p,'wx',0o600); return callback(); }
  finally { if(fd!==undefined){closeSync(fd);unlinkSync(p)} }
}
export function run(args) {
  const [command,...rest]=args, opt=options(rest), dir=outputDir(opt.dir ?? join(ROOT,'labeling-workflow-v2'));
  if(command==='init') {
    const rows=inputFile(opt.input ?? join(ROOT,'dataset-original.jsonl')), result=makeAssignment(rows,opt.seed ?? 'lead-autopilot-v1');
    const file=join(dir,'assignments.json');
    try { writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600}); }
    catch(e) { if(e.code!=='EEXIST')throw e; const old=readAssignments(dir); if(old.version!==result.version || old.datasetFingerprint!==result.datasetFingerprint || old.seed!==result.seed)error('Existing assignment differs; use a new ignored directory'); }
    return {datasetFingerprint:result.datasetFingerprint,total:rows.length,counts:countSplits(result.assignments)};
  }
  const assignment=readAssignments(dir), labels=readLabels(dir);
  if(command==='status')return {total:assignment.assignments.length,bySplit:countSplits(assignment.assignments),reviewed:labels.length,reviewedBySplit:countSplits(labels)};
  if(command==='next' || command==='show') {
    const split=opt.split ?? 'test'; if(!SPLITS.has(split))error('Unknown split');
    const selected=command==='show' ? assignment.assignments.find(a=>a.id===opt.id) : assignment.assignments.find(a=>a.split===split && !labels.some(l=>l.id===a.id)); if(!selected){if(command==='show')error('Post not found');return {done:true,split};}
    const rows=inputFile(opt.input ?? join(ROOT,'dataset-original.jsonl')), current=makeAssignment(rows,assignment.seed);
    if(current.datasetFingerprint!==assignment.datasetFingerprint)error('Dataset changed since assignment');
    const row=rows.find(r=>r.id===selected.id); return {...selected,text:row.text};
  }
  if(command==='label')return lock(dir,()=>{
    const current=makeAssignment(inputFile(opt.input ?? join(ROOT,'dataset-original.jsonl')),assignment.seed);
    if(current.datasetFingerprint!==assignment.datasetFingerprint)error('Dataset changed since assignment');
    if(readLabels(dir).some(l=>l.id===opt.id))error('Post already labeled; retain the original judgment');
    const record=validateLabel({id:opt.id,label:opt.label,reviewer:opt.reviewer,reason:opt.reason,evidence:opt.evidence ? opt.evidence.split(',') : []},assignment.assignments);
    appendFileSync(join(dir,'labels.jsonl'),JSON.stringify(record)+'\n',{mode:0o600}); return {saved:true,id:record.id,split:record.split};
  });
  error('Commands: init, next, show, label, status');
}
function countSplits(rows) { const out={dev:0,test:0,'source-holdout':0};for(const row of rows)if(row.split in out)out[row.split]++;return out; }
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(run(process.argv.slice(2)),null,2)); }
  catch(e) { console.error(e.message); process.exitCode=1; }
}

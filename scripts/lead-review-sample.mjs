#!/usr/bin/env node
/** Offline research sampling only. Provisional rules are not validated labels or production skip rules. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDataset, makeAssignment } from './lead-autopilot-label.mjs';

const ROOT = resolve('research/telegram-ad-filter');
const SEED = 'lead-review-sample-v1';
const CATEGORIES = ['AD', 'VP_POSSIBLE', 'ORGANIC', 'UNKNOWN'];
const hash = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

// Frozen before sampling: these weak text signals are candidates for human review, not conclusions.
export function classify(text) {
  const value = text.normalize('NFKC').toLocaleLowerCase('und');
  if (/(вза[єе]моп[іи]ар|вза[єе]мн(?:ий|ый|ого|ий)\s+п[іи]ар|вп\s*(?:канал|пост|реклам))/u.test(value))
    return { label: 'VP_POSSIBLE', reason: 'Explicit mutual-promotion wording; reciprocity not verified' };
  const commercial = /(реклам|партнер|партнёр|спонсор|промокод|знижк|скидк|купити|купить|замовити|заказать)/u.test(value);
  const destination = /(?:https?:\/\/|t\.me\/|@[\p{L}\p{N}_]{4,})/u.test(value);
  if (commercial && destination) return { label: 'AD', reason: 'Commercial wording and destination; unverified' };
  if (destination || commercial || /(п[іи]дписуй|подписывай|рекомендую|рекомендован)/u.test(value))
    return { label: 'UNKNOWN', reason: 'Promotion or destination signal requires review' };
  return { label: 'ORGANIC', reason: 'No simple promotion or destination signal; unverified' };
}

export function buildSample(rows, assignment, seed = SEED) {
  const stripped = rows.map(({id,sourceId,text}) => ({id,sourceId,text}));
  const expected = makeAssignment(stripped, assignment.seed);
  if (assignment.version !== 2 || expected.datasetFingerprint !== assignment.datasetFingerprint ||
      JSON.stringify(expected.assignments) !== JSON.stringify(assignment.assignments)) throw new Error('Assignment or dataset mismatch');
  const map = new Map(assignment.assignments.map(a => [a.id, a]));
  const sources = [...new Set(rows.map(r => r.sourceId))].sort();
  const buckets = new Map();
  for (const row of rows) {
    const part = map.get(row.id)?.split;
    if (!part) throw new Error('Missing split');
    const provisional = classify(row.text);
    const key = `${row.sourceId}\u0000${part}\u0000${provisional.label}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({id:row.id, sourceId:row.sourceId, channel:row.channel ?? '', publishedAt:row.publishedAt ?? '',
      split:part, text:row.text, provisional_label:provisional.label, provisional_reason:provisional.reason,
      human_label:'', human_reason:'', human_evidence:'', reviewer:''});
  }
  for (const bucket of buckets.values()) bucket.sort((a,b) => hash(seed,a.id).localeCompare(hash(seed,b.id)));
  const selected = [];
  function take(source, split, limit) {
    let count = 0, progressed = true;
    while (count < limit && progressed) {
      progressed = false;
      for (const category of CATEGORIES) {
        const bucket = buckets.get(`${source}\u0000${split}\u0000${category}`);
        if (bucket?.length && count < limit) { selected.push(bucket.shift()); count++; progressed = true; }
      }
    }
    return count;
  }
  for (const source of sources) {
    const available = split => CATEGORIES.reduce((n,c) => n+(buckets.get(`${source}\u0000${split}\u0000${c}`)?.length ?? 0),0);
    let count = 0;
    if (available('dev')) { count += take(source,'dev',30); count += take(source,'test',15); }
    else count += take(source,'source-holdout',45);
    for (const split of ['dev','test','source-holdout']) if (count < 45) count += take(source,split,45-count);
    if (count < 45) throw new Error('Source contains fewer than 45 available posts');
  }
  return selected;
}
const columns = ['id','sourceId','channel','publishedAt','split','text','provisional_label','provisional_reason','human_label','human_reason','human_evidence','reviewer'];
export function csvCell(value) {
  let s = String(value ?? '');
  // Neutralize spreadsheet formulas while keeping the original exact text in JSONL.
  if (/^[\s\u0000-\u001f]*[=+@\-]/u.test(s)) s = "'"+s;
  return `"${s.replace(/"/g,'""')}"`;
}
export function toCsv(rows) { return columns.map(csvCell).join(',')+'\n'+rows.map(r=>columns.map(c=>csvCell(r[c])).join(',')).join('\n')+'\n'; }
function outputDirectory() {
  const dir = join(ROOT,'review-sample-v1'); mkdirSync(dir,{recursive:true,mode:0o700});
  const actual = realpathSync(dir), rel = relative(realpathSync(ROOT),actual);
  if (!rel || rel.startsWith('..') || rel.startsWith('/')) throw new Error('Invalid output directory');
  for (const name of ['review-dev.csv','review-dev.jsonl','review-holdout.csv','review-holdout.jsonl','README.txt']) {
    const path = relative(process.cwd(),join(actual,name));
    try { execFileSync('git',['check-ignore','-q','--no-index','--',path],{stdio:'ignore'}); }
    catch { throw new Error('Output path must be ignored by Git'); }
    if (execFileSync('git',['ls-files','--',path],{encoding:'utf8'}).trim()) throw new Error('Output path is tracked by Git');
  }
  return actual;
}
function writeOnce(path, content) {
  try { writeFileSync(path,content,{flag:'wx',mode:0o600}); }
  catch (err) { if (err.code !== 'EEXIST' || readFileSync(path,'utf8') !== content) throw new Error('Existing output differs; preserve reviewer edits and use a new directory'); }
}
export function main() {
  const input = readFileSync(join(ROOT,'dataset-original.jsonl'),'utf8');
  parseDataset(input); // validates limits, identifiers and uniqueness
  const rows = input.split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line));
  const assignment = JSON.parse(readFileSync(join(ROOT,'labeling-workflow-v2/assignments.json'),'utf8'));
  const result = buildSample(rows,assignment), dir = outputDirectory();
  for (const [name,subset] of [['dev',result.filter(r=>r.split==='dev')],['holdout',result.filter(r=>r.split!=='dev')]]) {
    writeOnce(join(dir,`review-${name}.csv`),toCsv(subset));
    writeOnce(join(dir,`review-${name}.jsonl`),subset.map(row=>JSON.stringify(row)).join('\n')+'\n');
  }
  writeOnce(join(dir,'README.txt'),`Local, sensitive review material. Do not commit or send automatically.\nFrozen seed: ${SEED}. Heuristic labels are unvalidated suggestions, not ground truth. Human fields are blank.\nUse review-dev for rule development. Keep review-holdout (test and source-holdout) blind during rule selection; review and evaluate it only after rules are frozen.\nAllowed human labels: AD, VP_POSSIBLE, VP_CONFIRMED, ORGANIC, UNKNOWN. VP_CONFIRMED requires verifiable reciprocal posts and evidence references; otherwise use VP_POSSIBLE.\nThe JSONL contains the exact original text. CSV prefixes formula-like cells with an apostrophe for spreadsheet safety.\nReview labels are not automatically imported into the separate labeling workflow; retain reviewer, reason and evidence for validation.\n`);
  const count = (field) => result.reduce((out,r)=>(out[r[field]]=(out[r[field]]??0)+1,out),{});
  return {total:result.length,bySource:count('sourceId'),bySplit:count('split'),byProvisional:count('provisional_label'),directory:relative(process.cwd(),dir)};
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(main(),null,2)); } catch (error) { console.error(error.message); process.exitCode=1; }
}

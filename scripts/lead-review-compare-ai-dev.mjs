#!/usr/bin/env node
/** Compare provisional AI reviews with heuristics on the fixed development set only.
 * Neither source is gold; outputs contain aggregate counts and never post contents.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv } from './lead-review-import-csv.mjs';

const LABELS = new Set(['AD', 'VP_POSSIBLE', 'VP_CONFIRMED', 'ORGANIC', 'UNKNOWN']);
const MAX_BYTES = 16 * 1024 * 1024;

export function compareAiDev(csv, trusted, expectedIds) {
  const expected = new Set(expectedIds);
  if (!expected.size || expected.size !== expectedIds.length) throw Error('Invalid expected dev manifest');
  const baseline = new Map();
  for (const item of trusted) {
    if (!expected.has(item.id) || baseline.has(item.id) || item.split !== 'dev' ||
        !item.sourceId || !LABELS.has(item.provisional_label)) throw Error('Invalid trusted dev sample');
    baseline.set(item.id, item);
  }
  if (baseline.size !== expected.size) throw Error('Incomplete trusted dev sample');
  const data = parseCsv(csv);
  if (!data.length) throw Error('Empty CSV');
  const headers = data.shift();
  const required = ['id', 'sourceId', 'split', 'ai_review_label'];
  if (new Set(headers).size !== headers.length || required.some((h) => !headers.includes(h)))
    throw Error('Expected id, sourceId, split and ai_review_label columns');
  const seen = new Set(), matrix = {}, aiCounts = {}, provisionalCounts = {};
  let disagreements = 0;
  for (const cells of data) {
    if (cells.length !== headers.length) throw Error('Invalid CSV row width');
    const row = Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    const old = baseline.get(row.id), label = row.ai_review_label.trim();
    if (!old || seen.has(row.id) || row.split !== 'dev' || row.sourceId !== old.sourceId)
      throw Error('CSV identifiers or split do not match the trusted dev sample');
    if (!LABELS.has(label)) throw Error('Invalid or missing provisional AI label');
    seen.add(row.id);
    const key = `${old.provisional_label} -> ${label}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
    aiCounts[label] = (aiCounts[label] ?? 0) + 1;
    provisionalCounts[old.provisional_label] = (provisionalCounts[old.provisional_label] ?? 0) + 1;
    if (label !== old.provisional_label) disagreements++;
  }
  if (seen.size !== expected.size) throw Error('CSV does not contain the full dev manifest');
  return { total: seen.size, disagreements, matrix, aiCounts, provisionalCounts,
    status: 'AI_ASSISTED_UNVERIFIED_NOT_HUMAN_GOLD' };
}

function read(path) {
  const content = readFileSync(path, 'utf8');
  if (Buffer.byteLength(content) > MAX_BYTES) throw Error('Input exceeds size limit');
  return content;
}
function readJsonl(path) {
  try { return read(path).split(/\r?\n/u).filter(Boolean).map(JSON.parse); }
  catch { throw Error('Unable to read the trusted dev sample or manifest'); }
}
function main(args) {
  if (args.length !== 2 || args[0] !== '--csv') throw Error('Provide --csv <ai-assisted-dev.csv>');
  const file = realpathSync(args[1]);
  if (!/dev/iu.test(basename(file)) || /holdout|test/iu.test(basename(file)))
    throw Error('Input filename must identify the dev set');
  const root = resolve('research/telegram-ad-filter/review-sample-v3');
  const trusted = readJsonl(resolve(root, 'review-dev.jsonl'));
  const expected = readJsonl(resolve(root, 'expected-dev.jsonl')).map((r) => r.id);
  return compareAiDev(read(file), trusted, expected);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

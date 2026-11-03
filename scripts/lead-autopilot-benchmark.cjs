/** Local offline aggregate only. Never prints or copies publication text. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const apiRequire = createRequire(path.resolve('apps/api/package.json'));
const ts = apiRequire('typescript');
const sourcePath = path.resolve('apps/api/src/domains/telegram/telegram-crm/lead-discovery/lead-prefilter.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleInstance = new Module(sourcePath, module);
moduleInstance.filename = sourcePath;
moduleInstance.paths = module.paths;
moduleInstance._compile(compiled, sourcePath);
const { prefilterLeadPost, LEAD_PREFILTER_VERSION } = moduleInstance.exports;
const dataset = process.argv[2] || 'research/telegram-ad-filter/dataset-original.jsonl';
const output = process.argv[3] || 'docs/qa/lead-discovery-autopilot/filter-evaluation.json';
const counts = {};
const sourceCounts = {};
const assignmentsPath = 'research/telegram-ad-filter/labeling-workflow-v2/assignments.json';
const assignmentFile = fs.existsSync(assignmentsPath) ? JSON.parse(fs.readFileSync(assignmentsPath, 'utf8')) : null;
const assignments = new Map((assignmentFile?.assignments ?? []).map((item) => [item.id, item.split]));
const splits = {};
const fingerprintRows = [];
const rank = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
let total = 0;
// Dataset is bounded at 2,700 rows; the benchmark performs no network access.
for (const line of fs.readFileSync(dataset, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const post = JSON.parse(line);
  fingerprintRows.push([post.sourceId, post.id, rank(post.text)]);
  const result = prefilterLeadPost({ text: String(post.text ?? ''), sourceChannelId: null, metadataComplete: false, advertisedTargets: [] });
  counts[result.decision] = (counts[result.decision] || 0) + 1;
  sourceCounts[post.sourceId] = (sourceCounts[post.sourceId] || 0) + 1;
  const split = assignments.get(post.id);
  if (['dev', 'test', 'source-holdout'].includes(split)) splits[split] = (splits[split] || 0) + 1;
  total++;
}
if (assignmentFile && rank(fingerprintRows.sort((a,b)=>a[1].localeCompare(b[1]))) !== assignmentFile.datasetFingerprint)
  throw new Error('Dataset changed since labeling assignments were created');
const evaluation = { ruleVersion: LEAD_PREFILTER_VERSION, posts: total, sources: Object.keys(sourceCounts).length, counts, splits, inputs: 'Text export; canonical identities, Telegram entities, forward and media metadata unavailable.', groundTruth: 'NOT_AVAILABLE', adRecall: null, adPrecision: null, safeSkipFalseNegatives: null, llmCallsAvoidedMeasured: null, note: 'Offline routing counts are not ad/VP accuracy and no AI calls were performed.' };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(evaluation, null, 2) + '\n');
console.log(JSON.stringify(evaluation));

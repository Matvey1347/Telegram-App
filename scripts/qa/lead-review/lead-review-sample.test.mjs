import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { makeAssignment } from './lead-autopilot-label.mjs';
import { buildSample, classify, csvCell } from './lead-review-sample.mjs';

test('sample is reproducible, source-balanced and retains split with blank human judgments', () => {
  const rows = Array.from({length:9*100},(_,i)=>({id:`post-${i}`,sourceId:`source-${Math.floor(i/100)}`,text:`unique ${i} ${i%4===0?'взаємопіар':i%4===1?'реклама https://example.org':i%4===2?'https://example.org':''}`,publishedAt:'2026-01-01'}));
  const assignment = makeAssignment(rows,'seed');
  const sample = buildSample(rows,assignment);
  assert.deepEqual(sample,buildSample(rows,assignment));
  assert.equal(sample.length,405);
  assert.equal(new Set(sample.map(row=>row.sourceId)).size,9);
  assert.ok(sample.some(row=>row.split==='dev'));
  assert.ok(sample.some(row=>row.split==='test'));
  assert.ok(sample.some(row=>row.split==='source-holdout'));
  assert.ok(sample.every(row=>row.human_label==='' && row.human_reason==='' && row.human_evidence==='' && row.reviewer===''));
  assert.ok(sample.every(row=>row.provisional_label!=='VP_CONFIRMED'));
  assert.throws(()=>buildSample(rows.map((r,i)=>i ? r : {...r,text:'changed'}),assignment),/mismatch/);
});
test('heuristic uses explicit signals and never confirms reciprocity', () => {
  assert.equal(classify('Взаємопіар').label,'VP_POSSIBLE');
  assert.equal(classify('Реклама https://example.org').label,'AD');
  assert.equal(classify('https://example.org').label,'UNKNOWN');
  assert.equal(classify('Сьогодні гарний день').label,'ORGANIC');
});
test('CSV quotes content and neutralizes formula-like cells', () => {
  assert.equal(csvCell('=1+2'),`"'=1+2"`);
  assert.equal(csvCell('a,"b"'),`"a,""b"""`);
});

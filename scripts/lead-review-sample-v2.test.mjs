import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {makeAssignment} from './lead-autopilot-label.mjs';
import {buildSample} from './lead-review-sample.mjs';
import {buildV2,vpReviewHint,csv} from './lead-review-sample-v2.mjs';

test('hint is weak, detects Telegram CTA, and ignores ordinary posts',()=>{
  assert.equal(vpReviewHint('Підпишіться https://t.me/channelname'),true);
  assert.equal(vpReviewHint('https://t.me/channelname'),false);
  assert.equal(vpReviewHint('Підпишіться https://example.com'),false);
});
test('dev hints are included and UNKNOWN; holdout sampling remains unchanged',()=>{
  const rows=Array.from({length:9*100},(_,i)=>({id:`post-${i}`,sourceId:`source-${Math.floor(i/100)}`,text:`post ${i}`}));
  let a=makeAssignment(rows,'seed');const dev=a.assignments.find(x=>x.split==='dev');const held=a.assignments.find(x=>x.split==='source-holdout');
  rows.find(r=>r.id===dev.id).text+=' Підпишіться https://t.me/channelname';
  rows.find(r=>r.id===held.id).text+=' Підпишіться https://t.me/channelname';
  a=makeAssignment(rows,'seed');const base=buildSample(rows,a),sample=buildV2(rows,a);
  assert.equal(sample.length,405);assert.deepEqual(sample,buildV2(rows,a));
  const hinted=sample.find(r=>r.id===dev.id);assert.ok(hinted?.vp_review_hint);assert.equal(hinted.provisional_label,'UNKNOWN');
  assert.ok(sample.filter(r=>r.split!=='dev').every(r=>!r.vp_review_hint));
  assert.deepEqual(sample.filter(r=>r.split!=='dev').map(r=>r.id),base.filter(r=>r.split!=='dev').map(r=>r.id));
  assert.equal(new Set(sample.map(r=>r.id)).size,405);
});
test('CSV protects formulas and escapes quotes',()=>{
  const result=csv([{text:'=1+1',vp_review_reason:'a,"b"'}]);
  assert.match(result,/"'=1\+1"/);assert.match(result,/"a,""b"""/);
});

import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {evaluate as evaluateWithSplit} from './lead-review-evaluate.mjs';
const evaluate=(rows,catalog)=>evaluateWithSplit(rows,catalog,catalog.map(r=>({...r,split:'test'})),rows.map(r=>({id:r.id})));
const catalog=[{id:'a',sourceId:'s1'},{id:'b',sourceId:'s2'},{id:'c',sourceId:'s1'}];
const row=(id='a',sourceId='s1',extra={})=>({id,sourceId,split:'test',human_label:'',human_reason:'',reviewer:'',...extra});
const judged=(label,prediction)=>({human_label:label,human_reason:'checked',reviewer:'person',prediction});
test('unreviewed and missing predictions are not scored; undefined ratios are null',()=>{
 const r=evaluate([row(),row('b','s2',judged('AD',''))],catalog);assert.equal(r.status,'partial');assert.equal(r.reviewed,1);assert.equal(r.scored,0);assert.equal(r.metrics.AD.precision,null);assert.equal(r.metrics.AD.recall,null);assert.equal(r.aiCalls.reduction,null);
});
test('confusion metrics and explicit call counts',()=>{
 const r=evaluate([row('a','s1',{...judged('AD','AD'),actual_ai_calls:1,baseline_ai_calls:2}),row('b','s2',{...judged('AD','ORGANIC'),actual_ai_calls:0,baseline_ai_calls:1})],catalog);
 assert.deepEqual([r.metrics.AD.truePositives,r.metrics.AD.falseNegatives,r.metrics.AD.precisionDenominator,r.metrics.AD.recallDenominator],[1,1,1,2]);assert.equal(r.metrics.AD.recall,.5);assert.equal(r.metrics.ORGANIC.falsePositives,1);assert.equal(r.aiCalls.reduction,2/3);assert.equal(r.completeness,'complete');assert.equal(r.status,'partial');
});
test('confirmed reciprocity requires real ids across sources and reviewer',()=>{
 const p=judged('VP_CONFIRMED','VP_POSSIBLE');assert.throws(()=>evaluate([row('a','s1',{...p,human_evidence:['a','c']})],catalog),/evidence/);assert.throws(()=>evaluate([row('a','s1',{...p,human_evidence:['a','missing']})],catalog),/evidence/);assert.equal(evaluate([row('a','s1',{...p,human_evidence:['a','b']})],catalog).metrics.VP_CONFIRMED.falseNegatives,1);
});
test('rejects partial labels, dev data, duplicate ids, and invalid predictions',()=>{
 assert.throws(()=>evaluate([row('a','s1',{human_label:'AD'})],catalog),/Incomplete/);assert.throws(()=>evaluate([row('a','s1',{split:'dev'})],catalog),/holdout/);assert.throws(()=>evaluate([row(),row()],catalog),/holdout/);assert.throws(()=>evaluate([row('a','s1',judged('AD','BAD'))],catalog),/prediction/);
});
test('missing actual or baseline calls does not invent savings',()=>{const r=evaluate([row('a','s1',{...judged('AD','AD'),actual_ai_calls:0})],catalog);assert.equal(r.aiCalls.reduction,null)});

test('unknown human label is not a false positive for AD',()=>{
 const r=evaluate([row('a','s1',judged('UNKNOWN','AD'))],catalog);
 assert.equal(r.metrics.AD.falsePositives,0);assert.equal(r.metrics.AD.precision,null);
 assert.equal(r.metrics.UNKNOWN.falseNegatives,1);assert.equal(r.metrics.UNKNOWN.recall,0);
});

test('complete requires exact expected manifest, never just a reviewed subset',()=>{
 const rows=[row('a','s1',judged('AD','AD'))], splits=catalog.map(r=>({...r,split:'test'}));
 assert.equal(evaluateWithSplit(rows,catalog,splits).status,'partial');
 assert.equal(evaluateWithSplit(rows,catalog,splits,[{id:'a'},{id:'b'}]).status,'partial');
 assert.equal(evaluateWithSplit(rows,catalog,splits,[{id:'a'}]).completeness,'complete');assert.equal(evaluateWithSplit(rows,catalog,splits,[{id:'a'}]).status,'partial');
 assert.throws(()=>evaluateWithSplit(rows,catalog,splits,[{id:'a'},{id:'a'}]),/manifest/);
});

test('freeze detects edited predictions and expected IDs, not reviewer independence', async()=>{
 const {freezeDigest}=await import('./lead-review-evaluate.mjs');
 const expected=[{id:'a'},{id:'b'}],p=[{id:'a',prediction:'AD'},{id:'b',prediction:'UNKNOWN'}];
 const digest=freezeDigest(expected,p);assert.equal(digest,freezeDigest([...expected].reverse(),[...p].reverse()));
 assert.notEqual(digest,freezeDigest(expected,[p[0],{id:'b',prediction:'ORGANIC'}]));
 assert.throws(()=>freezeDigest(expected,[p[0]]),/match/);
 assert.throws(()=>freezeDigest([{id:'a'},{id:'a'}],p),/manifest/);
 const report=evaluate([row('a','s1',judged('AD','AD'))],catalog);
 assert.equal(report.reviewIndependence,'NOT_VERIFIED');assert.equal(report.freezeTiming,'NOT_VERIFIED');
});

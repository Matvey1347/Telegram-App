import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {makeLeadReviewFixture} from './fixture-workspace.mjs';
test('CLI requires matching freeze for complete and reports call data unverified',()=>{
 const workspace=makeLeadReviewFixture();
 const dir=workspace.research;
 try{
  const put=(n,x)=>{const p=join(dir,n);writeFileSync(p,x);return p};
  const expected=put('expected.jsonl',JSON.stringify({id:'a'})+'\n');
  const predictions=put('predictions.jsonl',JSON.stringify({id:'a',prediction:'AD',actual_ai_calls:0,baseline_ai_calls:1})+'\n');
  const review=put('review.jsonl',JSON.stringify({id:'a',sourceId:'s',split:'test',human_label:'AD',human_reason:'review',reviewer:'human'})+'\n');
  const catalog=put('catalog.jsonl',JSON.stringify({id:'a',sourceId:'s'})+'\n');
  const assignments=put('assignments.json',JSON.stringify({assignments:[{id:'a',sourceId:'s',split:'test'}]}));
  const freeze=join(dir,'freeze.json'),out1=join(dir,'one.json'),out2=join(dir,'two.json'),out3=join(dir,'three.json');
  const run=(script,args)=>spawnSync(process.execPath,[fileURLToPath(new URL(script,import.meta.url)),...args],{encoding:'utf8',cwd:workspace.cwd});
  const args=['--input',review,'--catalog',catalog,'--assignments',assignments,'--expected',expected,'--predictions',predictions];
  assert.equal(run('./lead-review-evaluate.mjs',[...args,'--output',out1]).status,0);
  const a=JSON.parse(readFileSync(out1));assert.equal(a.completeness,'complete');assert.equal(a.status,'partial');assert.equal(a.freezeIntegrity,'NOT_VERIFIED');
  assert.equal(run('./lead-review-freeze.mjs',['--expected',expected,'--predictions',predictions,'--output',freeze]).status,0);
  assert.equal(run('./lead-review-evaluate.mjs',[...args,'--freeze',freeze,'--output',out2]).status,0);
  const b=JSON.parse(readFileSync(out2));assert.equal(b.status,'complete');assert.equal(b.freezeIntegrity,'MATCHED');assert.equal(b.freezeTiming,'NOT_VERIFIED');assert.equal(b.reviewIndependence,'NOT_VERIFIED');assert.equal(b.aiCalls.provenance,'USER_SUPPLIED_UNVERIFIED');
  writeFileSync(predictions,JSON.stringify({id:'a',prediction:'ORGANIC'})+'\n');assert.notEqual(run('./lead-review-evaluate.mjs',[...args,'--freeze',freeze,'--output',out3]).status,0);
  assert.notEqual(run('./lead-review-evaluate.mjs',[...args,'--output',out1]).status,0);
 }finally{workspace.close()}
});

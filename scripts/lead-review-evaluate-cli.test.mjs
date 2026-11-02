import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('CLI requires matching freeze for complete and reports call data unverified',()=>{
 const dir=mkdtempSync(resolve('research/telegram-ad-filter/evaluator-test-'));
 try{
  const put=(n,x)=>{const p=join(dir,n);writeFileSync(p,x);return p};
  const expected=put('expected.jsonl',JSON.stringify({id:'a'})+'\n');
  const predictions=put('predictions.jsonl',JSON.stringify({id:'a',prediction:'AD',actual_ai_calls:0,baseline_ai_calls:1})+'\n');
  const review=put('review.jsonl',JSON.stringify({id:'a',sourceId:'s',split:'test',human_label:'AD',human_reason:'review',reviewer:'human'})+'\n');
  const catalog=put('catalog.jsonl',JSON.stringify({id:'a',sourceId:'s'})+'\n');
  const assignments=put('assignments.json',JSON.stringify({assignments:[{id:'a',sourceId:'s',split:'test'}]}));
  const freeze=join(dir,'freeze.json'),out1=join(dir,'one.json'),out2=join(dir,'two.json'),out3=join(dir,'three.json');
  const run=(script,args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
  const args=['--input',review,'--catalog',catalog,'--assignments',assignments,'--expected',expected,'--predictions',predictions];
  assert.equal(run('scripts/lead-review-evaluate.mjs',[...args,'--output',out1]).status,0);
  const a=JSON.parse(readFileSync(out1));assert.equal(a.completeness,'complete');assert.equal(a.status,'partial');assert.equal(a.freezeIntegrity,'NOT_VERIFIED');
  assert.equal(run('scripts/lead-review-freeze.mjs',['--expected',expected,'--predictions',predictions,'--output',freeze]).status,0);
  assert.equal(run('scripts/lead-review-evaluate.mjs',[...args,'--freeze',freeze,'--output',out2]).status,0);
  const b=JSON.parse(readFileSync(out2));assert.equal(b.status,'complete');assert.equal(b.freezeIntegrity,'MATCHED');assert.equal(b.freezeTiming,'NOT_VERIFIED');assert.equal(b.reviewIndependence,'NOT_VERIFIED');assert.equal(b.aiCalls.provenance,'USER_SUPPLIED_UNVERIFIED');
  writeFileSync(predictions,JSON.stringify({id:'a',prediction:'ORGANIC'})+'\n');assert.notEqual(run('scripts/lead-review-evaluate.mjs',[...args,'--freeze',freeze,'--output',out3]).status,0);
  assert.notEqual(run('scripts/lead-review-evaluate.mjs',[...args,'--output',out1]).status,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

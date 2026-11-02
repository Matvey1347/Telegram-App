import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeAssignment, parseDataset, run, validateLabel } from './lead-autopilot-label.mjs';

const fixture = (n=600) => Array.from({length:n},(_,i)=>({id:`post-${i}`,sourceId:`source-${i%9}`,text:`Synthetic review data ${i} 🧠`,manualLabel:'AD'}));
const lines = rows => rows.map(row=>JSON.stringify(row)).join('\n');
test('deterministic split retains all posts and holds out whole sources',()=>{
 const rows=fixture();const a=makeAssignment(rows,'fixed'), b=makeAssignment([...rows].reverse(),'fixed');
 assert.deepEqual(a,b);assert.equal(a.assignments.length,600);
 const held=new Set(a.assignments.filter(x=>x.split==='source-holdout').map(x=>x.sourceId));
 assert.ok(held.size>0);assert.ok(a.assignments.some(x=>x.split==='test'));assert.ok(a.assignments.some(x=>x.split==='dev'));
 assert.ok(a.assignments.every(x=>held.has(x.sourceId)===(x.split==='source-holdout')));
 assert.notDeepEqual(a.assignments,makeAssignment(rows,'another-seed').assignments);
 assert.notEqual(a.datasetFingerprint,makeAssignment(rows.map((r,i)=>i? r:{...r,text:r.text+' edited'}),'fixed').datasetFingerprint);
});
test('JSONL validates duplicates, bounded fields and Unicode',()=>{
 assert.equal(parseDataset('').length,0);assert.equal(parseDataset(lines(fixture(3)))[0].text,'Synthetic review data 0 🧠');
 assert.throws(()=>parseDataset(lines([fixture(1)[0],fixture(1)[0]])),/Duplicate/);
 assert.throws(()=>parseDataset('{not json}'));assert.throws(()=>parseDataset(lines([{id:'bad/path',sourceId:'x',text:'ok'}])),/opaque/);
});
test('keeps identical normalized creatives in one split across sources',()=>{
 const rows=fixture(30); rows[0].text='Shared  creative'; rows[1].text=' shared\nCREATIVE ';
 const assignment=makeAssignment(rows,'fixed').assignments;
 assert.equal(assignment.find(x=>x.id===rows[0].id).split,assignment.find(x=>x.id===rows[1].id).split);
});
test('human labels require reason, reviewer, valid evidence and two source VP evidence',()=>{
 const a=makeAssignment(fixture(12),'fixed').assignments, first=a[0], other=a.find(x=>x.sourceId!==first.sourceId);
 const base={id:first.id,label:'VP_CONFIRMED_BY_EVIDENCE',reviewer:'Reviewer',reason:'Paired evidence',evidence:[first.id,other.id]};
 assert.equal(validateLabel(base,a).label,'VP_CONFIRMED_BY_EVIDENCE');
 assert.throws(()=>validateLabel({...base,evidence:[first.id]},a),/another source/);
 assert.throws(()=>validateLabel({...base,label:'UNKNOWN',reason:''},a),/reason/);
 assert.throws(()=>validateLabel({...base,label:'FAKE'},a),/Unknown/);
 assert.throws(()=>validateLabel({...base,evidence:['absent']},a),/evidence/);
});
test('offline CLI stores metadata only, never auto-labels, and rejects changed dataset',()=>{
 const root=resolve('research/telegram-ad-filter'), dir=mkdtempSync(join(root,'.label-test-')), input=join(dir,'synthetic.jsonl'), out=join(dir,'output');
 try {
  const rows=fixture(40);writeFileSync(input,lines(rows));
  const init=run(['init','--input',input,'--dir',out,'--seed','fixed']);assert.equal(init.total,40);
  assert.equal(existsSync(join(out,'labels.jsonl')),false);assert.equal(run(['status','--dir',out]).reviewed,0);
  const next=run(['next','--input',input,'--dir',out,'--split','dev']);assert.ok(next.text.startsWith('Synthetic'));
  assert.equal(run(['label','--input',input,'--dir',out,'--id',next.id,'--label','ORGANIC','--reviewer','Reviewer','--reason','Reviewed in context']).saved,true);
  assert.equal(run(['status','--dir',out]).reviewed,1);
  assert.throws(()=>run(['label','--input',input,'--dir',out,'--id',next.id,'--label','AD','--reviewer','Reviewer','--reason','Repeat']),/already labeled/);
  assert.ok(!readFileSync(join(out,'labels.jsonl'),'utf8').includes('Synthetic review data'));
  assert.ok(!readFileSync(join(out,'assignments.json'),'utf8').includes('Synthetic review data'));
  rows[0].text='changed';writeFileSync(input,lines(rows));assert.throws(()=>run(['next','--input',input,'--dir',out,'--split','dev']),/Dataset changed/);
  assert.throws(()=>run(['label','--input',input,'--dir',out,'--id',next.id,'--label','AD','--reviewer','Reviewer','--reason','Repeat']),/Dataset changed/);
 } finally {rmSync(dir,{recursive:true,force:true})}
});
test('refuses output outside the ignored research directory',()=>{
 assert.throws(()=>run(['status','--dir','/tmp/lead-autopilot-not-permitted']),/subdirectory/);
});
test('refuses to silently reuse an older split version',()=>{
 const root=resolve('research/telegram-ad-filter'), dir=mkdtempSync(join(root,'.label-version-test-')), input=join(dir,'posts.jsonl'), out=join(dir,'output');
 try {
  writeFileSync(input,lines(fixture(9)));
  run(['init','--input',input,'--dir',out,'--seed','fixed']);
  const file=join(out,'assignments.json'), old=JSON.parse(readFileSync(file,'utf8'));
  writeFileSync(file,JSON.stringify({...old,version:1}));
  assert.throws(()=>run(['init','--input',input,'--dir',out,'--seed','fixed']),/Existing assignment differs/);
 } finally {rmSync(dir,{recursive:true,force:true})}
});

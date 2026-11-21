import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compareAiDev } from './lead-review-compare-ai-dev.mjs';

const trusted = [
  { id: 'a', sourceId: 's', split: 'dev', provisional_label: 'UNKNOWN', text: 'private' },
  { id: 'b', sourceId: 't', split: 'dev', provisional_label: 'ORGANIC', text: 'private' },
];
const header = 'id,sourceId,split,ai_review_label,human_label,text\n';
const good = 'a,s,dev,AD,AD,secret\nb,t,dev,ORGANIC,AD,secret\n';
test('reports only aggregate disagreements; human fields and text are ignored', () => {
  const result = compareAiDev(header + good, trusted, ['a', 'b']);
  assert.equal(result.disagreements, 1);
  assert.equal(result.matrix['UNKNOWN -> AD'], 1);
  assert.equal(result.status, 'AI_ASSISTED_UNVERIFIED_NOT_HUMAN_GOLD');
  assert.doesNotMatch(JSON.stringify(result), /secret|private|human_label/);
});
test('rejects missing, duplicated, unexpected, holdout and invalid rows', () => {
  for (const input of [
    'a,s,dev,AD,,x\n',
    'a,s,dev,AD,,x\na,s,dev,AD,,x\n',
    'a,s,dev,AD,,x\nc,t,dev,AD,,x\n',
    'a,s,dev,AD,,x\nb,t,test,AD,,x\n',
    'a,s,dev,AD,,x\nb,t,dev,MAYBE,,x\n',
    'a,s,dev,AD,,x\nb,wrong,dev,AD,,x\n',
  ]) assert.throws(() => compareAiDev(header + input, trusted, ['a', 'b']));
});
test('rejects an untrusted or incomplete dev manifest', () => {
  assert.throws(() => compareAiDev(header + good, [{ ...trusted[0], split: 'test' }, trusted[1]], ['a', 'b']));
  assert.throws(() => compareAiDev(header + good, trusted, ['a', 'a']));
  assert.throws(() => compareAiDev(header + good, trusted, ['a']));
});

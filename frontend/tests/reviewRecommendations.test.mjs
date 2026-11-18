import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationActions } from '../src/services/reviewRecommendations.js';

const dataset = { connection_id: 'customer_source', schema: 'public', table: 'customers' };
function reviewedRun(aiUsed = true) {
  return { run_id: 'verified-run', dataset, agent: { ai_used: aiUsed }, validation: { issues: [
    { column: 'email', rule: 'required', row_ref: 'row-1', recommendation: 'Recover email' },
    { column: 'email', rule: 'required', row_ref: 'row-2', recommendation: 'Recover email' },
    { column: 'email', rule: 'unique', row_ref: 'row-3', recommendation: 'Resolve duplicates' },
    { column: 'phone', rule: 'regex', row_ref: 'row-4', recommendation: 'Correct phone format' },
  ] }, anomalies: [] };
}

test('Standard mode hides next steps even after a previous successful AI review', () => {
  assert.deepEqual(recommendationActions(reviewedRun(), { aiMode: false }), []);
});
test('AI selection alone, pending AI and failed AI do not unlock next steps', () => {
  assert.deepEqual(recommendationActions(reviewedRun(false), { aiMode: true }), []);
  assert.deepEqual(recommendationActions(reviewedRun(), { aiMode: true, pending: true }), []);
  assert.deepEqual(recommendationActions(reviewedRun(), { aiMode: true, failed: true }), []);
});
test('completed AI review links each issue to its matching resolution workflow and dataset', () => {
  const actions = recommendationActions(reviewedRun(), { aiMode: true });
  assert.equal(actions.length, 3);
  const missing = actions.find(a => a.id === 'required:email');
  assert.equal(missing.findings.length, 2);
  assert.match(missing.title, /Recover missing values in email/);
  assert.deepEqual(missing.dataset, dataset);
  assert.equal(missing.runId, 'verified-run');
  assert.deepEqual(missing.findings.map(f => f.row_ref), ['row-1', 'row-2']);
  assert.match(actions.find(a => a.id === 'unique:email').title, /duplicate/);
  assert.match(actions.find(a => a.id === 'regex:phone').title, /formatting/);
});
test('anomaly workflows investigate values and never recommend automatic replacement', () => {
  const run = reviewedRun();
  run.anomalies.push({ column: 'amount', method: 'median_mad', row_ref: 'row-5', recommendation: 'Investigate amount' });
  const before = JSON.stringify(run);
  const action = recommendationActions(run, { aiMode: true }).find(a => a.rule === 'median_mad');
  assert.match(action.title, /Investigate unusual values in amount/);
  assert.ok(action.steps.some(step => step.includes('retain valid unusual values')));
  assert.equal(JSON.stringify(run), before);
});
test('a clean AI-reviewed sample has no fabricated fix actions', () => {
  assert.deepEqual(recommendationActions({ ...reviewedRun(), validation: { issues: [] } }, { aiMode: true }), []);
});

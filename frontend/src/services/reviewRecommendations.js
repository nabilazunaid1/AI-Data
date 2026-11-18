// Route verified findings to a specific resolution workflow; never infer actions
// by parsing model prose or treat a model suggestion as an applied correction.
const WORKFLOWS = {
  required: ['Recover missing values', 'Confirm the correct value in the source system.', 'Recover the verified value, or document why it must remain missing.', 'Enforce a required-value check at ingestion.'],
  unique: ['Resolve duplicate values', 'Compare the affected records and confirm whether they represent the same entity.', 'Choose the canonical record with the data owner before merging.', 'Correct duplicates in the source system and enforce uniqueness.'],
  duplicate_record: ['Resolve duplicate records', 'Compare the affected business records.', 'Confirm the canonical record before merging or removing duplicates.', 'Apply the approved correction in the source system.'],
  regex: ['Correct invalid formatting', 'Confirm the required format and the correct source value.', 'Normalize only values that can be verified; do not invent personal data.', 'Apply the validated format in the source system.'],
  number: ['Correct invalid numeric values', 'Confirm the expected numeric type and allowed range.', 'Check the original record for conversion, unit or entry errors.', 'Correct the verified value in the source system.'],
  reference: ['Repair unmatched references', 'Find the referenced record in the authoritative lookup table.', 'Correct the key or restore the missing reference after verification.', 'Enforce referential checks during ingestion.'],
  product: ['Correct inconsistent totals', 'Compare quantity, unit price and the recorded total.', 'Confirm the business calculation with the data owner.', 'Correct the inconsistent value in the source system.'],
  date: ['Correct invalid dates', 'Confirm the event date against the authoritative source.', 'Use the configured date format and a valid calendar date.', 'Correct the verified date in the source system.'],
  enum: ['Correct unexpected categories', 'Compare the category with the approved business values.', 'Choose the correct category using the source evidence.', 'Update the source record and restrict future values.'],
  median_mad: ['Investigate unusual values', 'Compare the flagged value with its source record and business context.', 'Confirm whether the outlier is legitimate before changing it.', 'Correct only confirmed errors; retain valid unusual values.'],
};

export function recommendationActions(run, { aiMode = false, pending = false, failed = false } = {}) {
  if (!aiMode || pending || failed || run?.agent?.ai_used !== true) return [];
  const groups = new Map();
  for (const finding of [...(run.validation?.issues || []), ...(run.anomalies || [])]) {
    const rule = finding.rule || finding.method;
    const id = `${rule}:${finding.column}`;
    if (!groups.has(id)) {
      const workflow = WORKFLOWS[rule] || ['Review the source value', 'Confirm the value with the data owner.', 'Apply only verified corrections in the source system.'];
      groups.set(id, { id, rule, column: finding.column,
        title: `${workflow[0]}${finding.column === '*' ? '' : ` in ${finding.column}`}`,
        description: finding.recommendation, steps: workflow.slice(1), findings: [],
        dataset: run.dataset, runId: run.run_id });
    }
    groups.get(id).findings.push(finding);
  }
  return [...groups.values()];
}

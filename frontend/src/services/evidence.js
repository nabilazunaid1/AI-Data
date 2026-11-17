import { guardianFetch as fetch } from "./apiClient.js";

/**
 * AI Data Guardian 3.0
 * Verified Row-Level Evidence Service
 *
 * Retrieves deterministic validation evidence
 * directly from FastAPI.
 *
 * Ollama is NOT called by this service.
 *
 * Customer evidence is available in this
 * first implementation.
 */

const EVIDENCE_API =
  "/api/v1/evidence/customers";

const ALLOWED_RULES = [
  "missing_email",
  "duplicate_email",
  "invalid_phone"
];

export async function getCustomerEvidence(signal) {
  const response = await fetch(EVIDENCE_API, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store",
    signal
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Evidence API returned invalid JSON."
    );
  }

  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Evidence request failed: HTTP ${response.status}`
    );
  }

  if (
    data.status !== "success" ||
    data.table !== "customers" ||
    data.ai_used !== false ||
    data.pii_included !== false ||
    data.validation_method !== "deterministic_sql" ||
    data.row_reference_type !== "temporary_hmac" ||
    !Array.isArray(data.evidence) ||
    !data.issue_counts ||
    typeof data.rule_descriptions !== "object" ||
    data.rule_descriptions === null
  ) {
    throw new Error(
      "Unexpected evidence API response."
    );
  }

  // Validate the evidence structure before
  // displaying it in the interface.
  const evidence = data.evidence.map((item) => {
    if (
      typeof item.row_ref !== "string" ||
      !/^row_[a-f0-9]{20}$/.test(item.row_ref) ||
      !Array.isArray(item.failed_rules) ||
      !item.failed_rules.every(
        (rule) => ALLOWED_RULES.includes(rule)
      ) ||
      item.issue_count !== item.failed_rules.length
    ) {
      throw new Error(
        "Invalid row-level evidence received."
      );
    }

    return {
      row_ref: item.row_ref,
      failed_rules: [...item.failed_rules],
      issue_count: item.issue_count
    };
  });

  return {
    table: "customers",
    validation_method: "deterministic_sql",
    total_affected_rows: data.total_affected_rows,
    total_issue_occurrences:
      data.total_issue_occurrences,
    issue_counts: {
      missing: data.issue_counts.missing,
      duplicates: data.issue_counts.duplicates,
      invalid: data.issue_counts.invalid
    },
    rule_descriptions: {
      missing_email:
        data.rule_descriptions.missing_email,
      duplicate_email:
        data.rule_descriptions.duplicate_email,
      invalid_phone:
        data.rule_descriptions.invalid_phone
    },
    evidence,
    truncated: data.truncated === true,
    limitations: data.limitations
  };
}

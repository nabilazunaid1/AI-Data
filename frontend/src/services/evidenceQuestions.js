
/**
 * AI Data Guardian 3.0
 * Evidence-Aware Question Service
 *
 * Responsibilities:
 * - Recognize supported evidence questions
 * - Retrieve deterministic SQL evidence from FastAPI
 * - Validate the API response
 * - Return verified findings for display
 *
 * Does not invoke Ollama.
 * Does not execute SQL in the browser.
 * Does not expose raw customer identifiers.
 */

// =====================================================
// SUPPORTED CUSTOMER VALIDATION RULES
// =====================================================

const RULES = {
  missing_email: {
    label: "Missing email"
  },

  duplicate_email: {
    label: "Duplicate email"
  },

  invalid_phone: {
    label: "Invalid phone"
  }
};

const VALID_RULE_NAMES = Object.keys(RULES);

// =====================================================
// IDENTIFY AN EVIDENCE-BASED QUESTION
// =====================================================

export function detectEvidenceQuestion(
  tableName,
  question
) {
  if (
    tableName !== "customers" ||
    typeof question !== "string"
  ) {
    return null;
  }

  const text = question
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

  if (!text) return null;

  // Only answer requests for specific affected
  // records through deterministic SQL evidence.
  //
  // General explanation and recommendation
  // questions continue to use Ollama.

  const asksForRecords =
    /\b(which|what|show|list|find|identify|display)\b/.test(
      text
    ) &&
    /\b(record|records|row|rows|customer|customers|entries)\b/.test(
      text
    );

  if (!asksForRecords) {
    return null;
  }

  // Restrict intent detection to the three
  // validation rules supported by our backend.

  const mentionsEmail =
    /\b(email|emails|e-mail|e-mails)\b/.test(text);

  const mentionsPhone =
    /\b(phone|phones|telephone|telephones)\b/.test(
      text
    );

  const mentionsMissing =
    /\b(missing|blank|empty|null)\b/.test(text);

  const mentionsDuplicate =
    /\b(duplicate|duplicates|duplicated|repeated)\b/.test(
      text
    );

  const mentionsInvalid =
    /\b(invalid|incorrect|malformed|bad)\b/.test(text);

  const matchedRules = [];

  if (mentionsMissing && mentionsEmail) {
    matchedRules.push("missing_email");
  }

  if (mentionsDuplicate && mentionsEmail) {
    matchedRules.push("duplicate_email");
  }

  if (mentionsInvalid && mentionsPhone) {
    matchedRules.push("invalid_phone");
  }

  // If several rules are requested together,
  // do not silently answer only one.
  // Send the question to the ordinary chat path,
  // which must not claim row-level knowledge.
  if (matchedRules.length !== 1) {
    return null;
  }

  return matchedRules[0];
}

// =====================================================
// VALIDATE RULE NAME
// =====================================================

function validateRule(ruleName) {
  if (!VALID_RULE_NAMES.includes(ruleName)) {
    throw new Error(
      "Unsupported evidence validation rule."
    );
  }

  return ruleName;
}

// =====================================================
// FETCH VERIFIED RULE EVIDENCE
// =====================================================

export async function getVerifiedRuleEvidence(
  ruleName,
  signal
) {
  const approvedRule = validateRule(ruleName);

  const url =
    "/api/v1/evidence/customers/rules/" +
    encodeURIComponent(approvedRule);

  const response = await fetch(url, {
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
      "Evidence service returned invalid JSON."
    );
  }

  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Evidence request failed: HTTP ${response.status}`
    );
  }

  // ===================================================
  // VERIFY RESPONSE METADATA
  // ===================================================

  if (
    data.status !== "success" ||
    data.table !== "customers" ||
    data.rule !== approvedRule ||
    data.verified !== true ||
    data.validation_method !== "deterministic_sql" ||
    data.ai_used !== false ||
    data.pii_included !== false ||
    !Array.isArray(data.rows) ||
    !Number.isInteger(data.verified_issue_count) ||
    !Number.isInteger(data.returned_rows) ||
    data.verified_issue_count < 0 ||
    data.returned_rows !== data.rows.length ||
    typeof data.finding !== "string" ||
    typeof data.recommendation !== "string"
  ) {
    throw new Error(
      "Evidence service returned an invalid response."
    );
  }

  if (
    data.truncated !== true &&
    data.returned_rows !== data.verified_issue_count
  ) {
    throw new Error(
      "Verified evidence counts are inconsistent."
    );
  }

  if (
    data.returned_rows > data.verified_issue_count
  ) {
    throw new Error(
      "Evidence contains more rows than verified findings."
    );
  }

  // ===================================================
  // VALIDATE EACH PSEUDONYMOUS ROW
  // ===================================================

  const seen = new Set();

  const rows = data.rows.map((row) => {
    if (
      !row ||
      typeof row.row_ref !== "string" ||
      !/^row_[a-f0-9]{20}$/.test(row.row_ref) ||
      !Array.isArray(row.failed_rules) ||
      !row.failed_rules.includes(approvedRule) ||
      !row.failed_rules.every(
        (rule) => VALID_RULE_NAMES.includes(rule)
      )
    ) {
      throw new Error(
        "Invalid row evidence received."
      );
    }

    if (seen.has(row.row_ref)) {
      throw new Error(
        "Duplicate row reference received."
      );
    }

    seen.add(row.row_ref);

    return {
      row_ref: row.row_ref,
      failed_rules: [...row.failed_rules]
    };
  });

  // ===================================================
  // RETURN THE APPROVED DISPLAY DATA
  // ===================================================

  return {
    table: "customers",
    rule: approvedRule,
    rule_label: RULES[approvedRule].label,
    verified: true,
    ai_used: false,
    verified_issue_count: data.verified_issue_count,
    returned_rows: rows.length,
    truncated: data.truncated === true,
    finding: data.finding,
    rows,
    recommendation: data.recommendation,
    recommendation_source:
      data.recommendation_source,
    limitations: data.limitations
  };
}

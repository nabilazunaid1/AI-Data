
/**
 * AI Data Guardian 3.0
 * Evidence-Aware Question Classification
 *
 * This module:
 * - Recognizes supported customer evidence requests
 * - Blocks unsupported record-level requests
 * - Keeps general questions on the normal AI path
 * - Retrieves approved deterministic SQL evidence
 *
 * No Ollama calls occur in this module.
 *
 * IMPORTANT:
 * Client-side classification is a UX safeguard.
 * Server-side privacy controls are still required.
 */

// =====================================================
// APPROVED RULES
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
// NORMALIZE QUESTION
// =====================================================

function normalizeQuestion(question) {
  if (typeof question !== "string") {
    return "";
  }

  return question
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// =====================================================
// CLASSIFY QUESTION
// =====================================================

export function classifyGuardianQuestion(
  tableName,
  question
) {
  const text = normalizeQuestion(question);

  if (!text) {
    return {
      type: "unsupported",
      reason: "Question is empty."
    };
  }

  const requestsRecords =
    /\b(which|what|who|show|list|find|identify|display|give|provide|retrieve|fetch|return|export)\b/.test(
      text
    ) &&
    /\b(records?|rows?|customers?|entries|ids?|identifiers?|references?|values?|emails?|phones?|names?|details?)\b/.test(
      text
    );

  const requestsSensitiveValues =
    /\b(raw|actual|real|original|unmasked|full|personal|private)\b/.test(
      text
    ) &&
    /\b(ids?|identifiers?|names?|emails?|phones?|values?|details?|records?|rows?)\b/.test(
      text
    );

  const requestsDirectPII =
    /\b(give|show|list|provide|return|display|reveal|expose|export)\b/.test(
      text
    ) &&
    /\b(customer ids?|customer names?|email addresses?|phone numbers?|real ids?|raw data)\b/.test(
      text
    );

  if (requestsSensitiveValues || requestsDirectPII) {
    return {
      type: "unsupported",
      reason: (
        "Raw customer identifiers and personal "
        + "values cannot be disclosed through "
        + "AI Guardian. Use the approved masked "
        + "preview or verified evidence features."
      )
    };
  }

  const mentionsEmail =
    /\b(emails?|e-mails?)\b/.test(text);

  const mentionsPhone =
    /\b(phones?|telephone|telephones|phone numbers?)\b/.test(
      text
    );

  const mentionsMissing =
    /\b(missing|blank|empty|null|absent|not provided)\b/.test(
      text
    );

  const mentionsDuplicate =
    /\b(duplicate|duplicates|duplicated|repeated)\b/.test(
      text
    );

  const mentionsInvalid =
    /\b(invalid|incorrect|malformed|bad|wrong)\b/.test(
      text
    );

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

  // General quality advice can still use AI.
  // Record-level questions require deterministic
  // evidence and cannot rely on model guesses.

  if (!requestsRecords) {
    return {
      type: "general",
      rule: null
    };
  }

  if (tableName !== "customers") {
    return {
      type: "unsupported",
      reason: (
        "Verified row-level evidence is currently "
        + "available for customers only."
      )
    };
  }

  if (matchedRules.length === 1) {
    return {
      type: "verified_evidence",
      rule: matchedRules[0]
    };
  }

  if (matchedRules.length > 1) {
    return {
      type: "unsupported",
      reason: (
        "Please ask about one validation rule "
        + "at a time: missing email, duplicate "
        + "email, or invalid phone."
      )
    };
  }

  return {
    type: "unsupported",
    reason: (
      "I cannot identify exact customer records "
      + "without a supported validation rule. "
      + "Please specify missing email, duplicate "
      + "email, or invalid phone."
    )
  };
}

// =====================================================
// BACKWARD COMPATIBILITY
// =====================================================

export function detectEvidenceQuestion(
  tableName,
  question
) {
  const classification = classifyGuardianQuestion(
    tableName,
    question
  );

  if (
    classification.type === "verified_evidence"
  ) {
    return classification.rule;
  }

  return null;
}

// =====================================================
// FETCH VERIFIED RULE EVIDENCE
// =====================================================

export async function getVerifiedRuleEvidence(
  ruleName,
  signal
) {
  if (!VALID_RULE_NAMES.includes(ruleName)) {
    throw new Error(
      "Unsupported evidence validation rule."
    );
  }

  const url =
    "/api/v1/evidence/customers/rules/" +
    encodeURIComponent(ruleName);

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

  if (
    data.status !== "success" ||
    data.table !== "customers" ||
    data.rule !== ruleName ||
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

  const seen = new Set();

  const rows = data.rows.map((row) => {
    if (
      !row ||
      typeof row.row_ref !== "string" ||
      !/^row_[a-f0-9]{20}$/.test(row.row_ref) ||
      !Array.isArray(row.failed_rules) ||
      !row.failed_rules.includes(ruleName) ||
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

  return {
    table: "customers",
    rule: ruleName,
    rule_label: RULES[ruleName].label,
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
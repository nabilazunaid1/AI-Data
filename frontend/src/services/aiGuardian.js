import { guardianFetch as fetch } from "./apiClient.js";

/**
 * AI Data Guardian 3.0
 * Centralized Frontend AI Service
 *
 * Supports:
 * 1. On-demand AI investigation
 * 2. On-demand AI chat
 *
 * Architecture:
 * React -> FastAPI -> Local Ollama
 *
 * The browser never connects directly to Ollama.
 * No SQL queries or database records are sent
 * from this frontend service.
 */

const APPROVED_TABLES = [
  "customers",
  "transactions",
  "products",
  "dim_region",
  "etl_logs"
];

const MAX_QUESTION_LENGTH = 500;


// =====================================================
// VALIDATE TABLE NAME
// =====================================================

function validateTableName(tableName) {
  if (!APPROVED_TABLES.includes(tableName)) {
    throw new Error(
      "This table is not approved for AI Guardian."
    );
  }

  return tableName;
}


// =====================================================
// SHARED API RESPONSE HANDLING
// =====================================================

async function readApiResponse(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "AI Guardian returned an invalid server response."
    );
  }

  if (!response.ok) {
    const message =
      typeof data.detail === "string"
        ? data.detail
        : `AI request failed: HTTP ${response.status}`;

    throw new Error(message);
  }

  return data;
}


// =====================================================
// FEATURE 1 — INVESTIGATE WITH AI
//
// Preserves the existing working functionality.
// =====================================================

export async function investigateTable(
  tableName,
  signal
) {
  const approvedTable = validateTableName(
    tableName
  );

  const response = await fetch(
    `/api/v1/ai/investigate/${encodeURIComponent(
      approvedTable
    )}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store",
      signal
    }
  );

  const result = await readApiResponse(response);

  if (
    result.status !== "success" ||
    result.table !== approvedTable ||
    result.ai_used !== true ||
    result.read_only !== true ||
    typeof result.explanation !== "string" ||
    !result.explanation.trim()
  ) {
    throw new Error(
      "AI Guardian returned an unexpected investigation response."
    );
  }

  return {
    table: result.table,
    model: result.model,
    provider: result.provider,
    summary: result.summary,
    explanation: result.explanation,
    disclaimer:
      result.disclaimer ||
      "AI recommendations require human review."
  };
}


// =====================================================
// FEATURE 2 — ASK AI GUARDIAN
//
// Sends one user question to FastAPI.
// Ollama is invoked only when the user submits.
// =====================================================

export async function askGuardianQuestion(
  tableName,
  question,
  signal
) {
  const approvedTable = validateTableName(
    tableName
  );

  if (typeof question !== "string") {
    throw new Error(
      "AI Guardian question must be text."
    );
  }

  const cleanQuestion = question.trim();

  if (!cleanQuestion) {
    throw new Error(
      "Please enter a question."
    );
  }

  if (cleanQuestion.length > MAX_QUESTION_LENGTH) {
    throw new Error(
      "Your question must be 500 characters or fewer."
    );
  }

  const response = await fetch(
    `/api/v1/ai/chat/${encodeURIComponent(
      approvedTable
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({
        question: cleanQuestion
      }),
      signal
    }
  );

  const result = await readApiResponse(response);

  if (
    result.status !== "success" ||
    result.table !== approvedTable ||
    result.ai_used !== true ||
    result.read_only !== true ||
    typeof result.answer !== "string" ||
    !result.answer.trim()
  ) {
    throw new Error(
      "AI Guardian returned an unexpected chat response."
    );
  }

  return {
    table: result.table,
    model: result.model,
    provider: result.provider,
    summary: result.summary,
    answer: result.answer,
    disclaimer:
      result.disclaimer ||
      "AI guidance uses aggregate metrics only."
  };
}

// STEP 10.9.7 - CONTROLLED AGENTIC QUALITY REVIEW

export async function runAgenticQualityReview({
  useAi = false,
  signal
} = {}) {
  if (typeof useAi !== "boolean") {
    throw new Error("Invalid AI option.");
  }

  const response = await fetch(
    "/api/v1/ai/quality-review",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        use_ai: useAi
      }),
      cache: "no-store",
      signal
    }
  );

  const data = await readApiResponse(response);

  if (
    data.status !== "success" ||
    data.workflow !== "controlled_data_quality_review" ||
    data.table !== "customers" ||
    data.validation_method !== "deterministic_sql" ||
    data.verified !== true ||
    data.read_only !== true ||
    data.pii_included !== false ||
    typeof data.ai_used !== "boolean" ||
    !Number.isInteger(data.ai_calls) ||
    data.ai_calls < 0 ||
    data.ai_calls > 1 ||
    data.ai_calls !== (data.ai_used ? 1 : 0) ||
    (data.ai_used && !useAi) ||
    !Number.isInteger(data.total_records) ||
    data.total_records <= 0 ||
    typeof data.quality_score !== "number" ||
    data.quality_score < 0 ||
    data.quality_score > 100 ||
    !Array.isArray(data.findings) ||
    !data.findings.every((finding) =>
      finding &&
      typeof finding.rule === "string" &&
      typeof finding.label === "string" &&
      Number.isInteger(finding.verified_issue_count) &&
      finding.verified_issue_count >= 0 &&
      typeof finding.recommendation === "string"
    ) ||
    (
      data.ai_used &&
      (
        !data.ai_guidance ||
        typeof data.ai_guidance.explanation !== "string" ||
        !data.ai_guidance.explanation.trim()
      )
    )
  ) {
    throw new Error(
      "Unexpected or unsafe quality review response."
    );
  }

  return data;
}

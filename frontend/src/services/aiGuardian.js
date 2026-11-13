
/**
 * AI Data Guardian 3.0
 * Centralized AI Guardian Frontend Service
 *
 * One local Ollama model through FastAPI.
 * No direct browser-to-Ollama connection.
 *
 * The backend retrieves fresh validation results
 * and sends approved aggregate metrics to AI.
 */

const APPROVED_TABLES = [
  "customers",
  "transactions",
  "products",
  "dim_region",
  "etl_logs"
];

/**
 * Run one AI investigation on demand.
 *
 * @param {string} tableName
 * @param {AbortSignal} signal
 * @returns {Promise<object>}
 */
export async function investigateTable(
  tableName,
  signal
) {
  if (!APPROVED_TABLES.includes(tableName)) {
    throw new Error(
      "This table is not approved for AI investigation."
    );
  }

  const response = await fetch(
    `/api/v1/ai/investigate/${encodeURIComponent(
      tableName
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

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      "AI Guardian returned an invalid server response."
    );
  }

  if (!response.ok) {
    const message =
      typeof result.detail === "string"
        ? result.detail
        : `AI investigation failed: HTTP ${response.status}`;

    throw new Error(message);
  }

  if (
    result.status !== "success" ||
    result.table !== tableName ||
    result.ai_used !== true ||
    result.read_only !== true ||
    typeof result.explanation !== "string" ||
    !result.explanation.trim()
  ) {
    throw new Error(
      "AI Guardian returned an unexpected response."
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

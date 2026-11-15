/**
 * AI Data Guardian 3.0
 * Shared frontend API client.
 *
 * Designed for backend-managed browser sessions.
 * Does not contain API keys or administrator tokens.
 */

const API_PREFIX = "/api/v1";

/**
 * Resolve a relative API path.
 *
 * Supports:
 *   /api/v1/health
 *   /health
 */
export function resolveApiPath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("API path must start with /");
  }

  if (path.startsWith(API_PREFIX + "/")) {
    return path;
  }

  if (path === API_PREFIX) {
    return path;
  }

  return `${API_PREFIX}${path}`;
}

/**
 * Make a same-origin authenticated API request.
 *
 * Browser-managed cookies are included.
 * CSRF integration will be added before
 * protected state-changing operations are enabled.
 */
export async function apiRequest(path, options = {}) {
  const url = resolveApiPath(path);

  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
  });

  return response;
}

/**
 * Retrieve the current authenticated identity.
 */
export async function getCurrentIdentity() {
  const response = await apiRequest("/auth/me", {
    method: "GET",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

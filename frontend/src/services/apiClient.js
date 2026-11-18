// Keep the prototype token only in memory; enter it again after reloading.
let accessToken = "";
export const BACKEND_UNAVAILABLE = 'Cannot reach the application backend. Start the backend service, then select Refresh.';
export function setAccessToken(value) { accessToken = value.trim(); }
export function guardianFetch(input, options = {}) {
  const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
  const trusted = url.origin === window.location.origin || url.origin === "http://127.0.0.1:8000";
  const headers = new Headers(options.headers);
  if (trusted && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return window.fetch(input, { ...options, headers });
}

export async function readApiResponse(response) {
  const body = await response.text();
  let data;
  try { data = body.trim() ? JSON.parse(body) : undefined; } catch { /* Proxy failures can be empty or plain text. */ }
  if (!response.ok) {
    if (response.status === 401) throw new Error('An API token is required. Open Access settings and enter your token.');
    if (response.status === 403) throw new Error('Your account does not have permission for this action.');
    if (typeof data?.detail === 'string') throw new Error(data.detail);
    throw new Error(response.status >= 500 ? BACKEND_UNAVAILABLE : `Request failed (${response.status}).`);
  }
  if (data === undefined) throw new Error('The backend returned an empty or invalid response. Select Refresh and try again.');
  return data;
}

export async function requestJson(input, options = {}) {
  let response;
  try { response = await guardianFetch(input, options); }
  catch (error) {
    if (error.name === 'AbortError' || options.signal?.aborted) throw error;
    throw new Error(BACKEND_UNAVAILABLE);
  }
  return readApiResponse(response);
}

// Keep the prototype token only in memory; enter it again after reloading.
let accessToken = "";
export function setAccessToken(value) { accessToken = value.trim(); }
export function guardianFetch(input, options = {}) {
  const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
  const trusted = url.origin === window.location.origin || url.origin === "http://127.0.0.1:8000";
  const headers = new Headers(options.headers);
  if (trusted && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return window.fetch(input, { ...options, headers });
}

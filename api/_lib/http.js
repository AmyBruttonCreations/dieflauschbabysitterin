export function sendJson(res, status, payload) {
  // Avoid browser/CDN serving stale JSON for the same /api/... URL (e.g. 304 after edits).
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  const req = res?.req;
  if (req?.method && req?.url) {
    const ok = status >= 200 && status < 400;
    const label = ok ? "API" : "API_ERROR";
    console.log(`[${label}] ${req.method} ${req.url} -> ${status}`);
  }
  res.status(status).json(payload);
}

export function methodNotAllowed(res, allow) {
  res.setHeader("Allow", allow.join(", "));
  sendJson(res, 405, { ok: false, error: "Method not allowed." });
}

export async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) return JSON.parse(req.body);
  return {};
}

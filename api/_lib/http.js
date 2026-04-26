export function sendJson(res, status, payload) {
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

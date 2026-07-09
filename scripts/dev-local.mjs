/**
 * Local dev: static site + /api/* serverless handlers (no `vercel login` required).
 * Loads DATABASE_URL from .env.local (see scripts/lib/read-env-local.mjs).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { databaseUrlFromEnv } from "./lib/read-env-local.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);

const dbUrl = databaseUrlFromEnv();
if (dbUrl) {
  process.env.DATABASE_URL = dbUrl;
} else {
  console.warn(
    "Warning: no DATABASE_URL in .env.local — API routes that need Postgres will fail.\n"
  );
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function resolveApiHandler(pathname) {
  const rel = pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  if (!rel) return null;
  const parts = rel.split("/").filter(Boolean);
  const candidates = [
    path.join(ROOT, "api", ...parts) + ".js",
    path.join(ROOT, "api", ...parts, "index.js")
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function wrapResponse(nodeRes, req) {
  const res = nodeRes;
  res.req = req;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function handleApi(req, res, pathname) {
  const handlerPath = resolveApiHandler(pathname);
  if (!handlerPath) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "API route not found." }));
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  req.query = Object.fromEntries(url.searchParams.entries());
  req.body = await readRequestBody(req);

  const mod = await import(pathToFileURL(handlerPath).href);
  const handler = mod.default;
  if (typeof handler !== "function") {
    res.statusCode = 500;
    res.end("Handler export missing");
    return;
  }

  await handler(req, wrapResponse(res, req));
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT, pathname);
  if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (pathname === "/" || !path.extname(pathname)) {
      filePath = path.join(ROOT, "index.html");
    } else {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
  }

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.end(fs.readFileSync(resolved));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/") || pathname === "/api") {
      await handleApi(req, res, pathname);
      return;
    }

    const staticPath = pathname === "/" ? "/index.html" : pathname;
    serveStatic(req, res, staticPath);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use. Close any other terminal running npm run dev, serve, or vercel dev, then try again.\n`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Local dev server: http://localhost:${PORT}/`);
  console.log("API routes under /api/* (same as production). Press Ctrl+C to stop.");
});

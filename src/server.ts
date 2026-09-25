import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { fetch } from "undici";

const port = Number(process.env.PORT ?? 3000);
const relayToken = process.env.RELAY_TOKEN ?? "";
const galenoOrigin = new URL(process.env.GALENO_ORIGIN ?? "https://www.gsbeneficios.com.ar");
const allowedPrefix = process.env.GALENO_PATH_PREFIX ?? "/WS-Seguros-desa/";
const maxBodyBytes = 1_000_000;

if (relayToken.length < 32) throw new Error("RELAY_TOKEN must contain at least 32 characters");
if (galenoOrigin.protocol !== "https:" || galenoOrigin.pathname !== "/") throw new Error("GALENO_ORIGIN must be an HTTPS origin without a path");
if (!allowedPrefix.startsWith("/") || !allowedPrefix.endsWith("/") || allowedPrefix.includes("..")) throw new Error("Invalid GALENO_PATH_PREFIX");

function json(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function authorized(request: IncomingMessage) {
  const received = request.headers["x-relay-token"];
  if (typeof received !== "string") return false;
  const expected = Buffer.from(relayToken);
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function createRelayServer() {
  return createServer(async (request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    if (request.method === "GET" && request.url === "/health") return json(response, 200, { ok: true });
    if (!authorized(request)) return json(response, 401, { error: "Unauthorized" });
    if (!request.url?.startsWith("/relay/")) return json(response, 404, { error: "Not found" });
    if (!request.method || !["GET", "POST"].includes(request.method)) return json(response, 405, { error: "Method not allowed" });

    const incoming = new URL(request.url, "http://relay.internal");
    const targetPath = `/${incoming.pathname.slice("/relay/".length)}`;
    if (!targetPath.startsWith(allowedPrefix) || targetPath.includes("..") || targetPath.includes("%2e")) return json(response, 403, { error: "Destination not allowed" });
    const target = new URL(`${targetPath}${incoming.search}`, galenoOrigin);

    try {
      const body = request.method === "POST" ? await readBody(request) : undefined;
      const upstream = await fetch(target, {
        method: request.method,
        headers: {
          ...(typeof request.headers.authorization === "string" ? { authorization: request.headers.authorization } : {}),
          ...(typeof request.headers["content-type"] === "string" ? { "content-type": request.headers["content-type"] } : {}),
          accept: "application/json",
        },
        body: body?.length ? body : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const payload = Buffer.from(await upstream.arrayBuffer());
      response.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
        "content-length": String(payload.length),
        "x-galeno-relay-status": "forwarded",
      });
      response.end(payload);
    } catch (error) {
      if (error instanceof Error && error.message === "BODY_TOO_LARGE") return json(response, 413, { error: "Payload too large" });
      console.error("Relay upstream failure", { name: error instanceof Error ? error.name : "UnknownError" });
      response.setHeader("x-galeno-relay-status", "unavailable");
      return json(response, 502, { error: "Upstream unavailable" });
    }
  });
}

if (process.env.NODE_ENV !== "test") {
  createRelayServer().listen(port, "0.0.0.0", () => console.log(`Galeno relay listening on port ${port}`));
}

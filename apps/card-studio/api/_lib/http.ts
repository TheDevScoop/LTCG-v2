import type { VercelRequest, VercelResponse } from "@vercel/node";

export function enforcePost(request: VercelRequest, response: VercelResponse): boolean {
  if (request.method === "POST") return true;
  response.setHeader("Allow", "POST");
  response.status(405).json({ error: "Method not allowed" });
  return false;
}

export function json(response: VercelResponse, status: number, payload: unknown): void {
  response.status(status).setHeader("Content-Type", "application/json").send(JSON.stringify(payload));
}

export function readJsonBody<T>(request: VercelRequest): T {
  if (request.body && typeof request.body === "object") {
    return request.body as T;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body) as T;
  }

  if (Buffer.isBuffer(request.body)) {
    return JSON.parse(request.body.toString("utf8")) as T;
  }

  return {} as T;
}

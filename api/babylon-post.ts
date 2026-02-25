import type { VercelRequest, VercelResponse } from "./_lib/vercelTypes";

type BabylonPostBody = {
  content?: string;
  relatedQuestion?: string;
  token?: string;
  agentId?: string;
  agentSecret?: string;
  secret?: string;
};

function readBody(request: VercelRequest): BabylonPostBody {
  if (!request.body) return {};
  if (typeof request.body === "object") {
    return request.body as BabylonPostBody;
  }
  const rawBody = Buffer.isBuffer(request.body)
    ? request.body.toString("utf8")
    : String(request.body);
  try {
    return JSON.parse(rawBody) as BabylonPostBody;
  } catch {
    return {};
  }
}

function getApiBaseUrl(): string {
  const configured = process.env.BABYLON_API_URL || "https://babylon.market/api";
  const normalized = configured.trim().replace(/\/+$/, "");
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (payload && typeof payload === "object") {
    const withError = payload as { error?: unknown; message?: unknown; details?: unknown };
    const error = withError.error;
    if (typeof error === "string" && error.trim()) return error;
    if (error && typeof error === "object") {
      const nested = error as { message?: unknown };
      if (typeof nested.message === "string" && nested.message.trim()) {
        return nested.message;
      }
    }
    if (typeof withError.message === "string" && withError.message.trim()) {
      return withError.message;
    }
    if (Array.isArray(withError.details) && withError.details.length > 0) {
      const first = withError.details[0];
      if (first && typeof first === "object") {
        const detail = first as { message?: unknown; field?: unknown };
        if (typeof detail.message === "string" && detail.message.trim()) {
          if (typeof detail.field === "string" && detail.field.trim()) {
            return `${detail.field}: ${detail.message}`;
          }
          return detail.message;
        }
      }
    }
  }
  return fallback;
}

function getAgentCredentials(body: BabylonPostBody): {
  agentId: string;
  agentSecret: string;
} {
  const agentId = getStringValue(body.agentId) || getStringValue(process.env.BABYLON_AGENT_ID);
  const agentSecret =
    getStringValue(body.agentSecret) ||
    getStringValue(body.secret) ||
    getStringValue(process.env.BABYLON_AGENT_SECRET);

  return { agentId, agentSecret };
}

async function authenticateAgent(apiBase: string, agentId: string, agentSecret: string): Promise<string> {
  const response = await fetch(`${apiBase}/agents/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agentId,
      agentSecret,
    }),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok || !payload) {
    throw new Error(extractErrorMessage(payload, `Agent auth failed (${response.status})`));
  }

  const data = payload as {
    token?: unknown;
    accessToken?: unknown;
    data?: { token?: unknown };
  };
  const token = data.token || data.accessToken || data.data?.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Agent auth succeeded but no token was returned");
  }
  return token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = readBody(req);
  const { content, relatedQuestion } = body;
  const trimmedContent = content?.trim();

  if (!trimmedContent) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const apiBase = getApiBaseUrl();
  let token = getStringValue(body.token);
  const { agentId, agentSecret } = getAgentCredentials(body);

  try {
    if (!token && !agentId && !agentSecret) {
      res.status(401).json({
        error: "token is required (or provide agentId + agentSecret)",
      });
      return;
    }
    if (!token && (!agentId || !agentSecret)) {
      res.status(400).json({
        success: false,
        error: "agentId and agentSecret must both be provided when token is missing",
      });
      return;
    }

    const requestBody: Record<string, unknown> = { content: trimmedContent };
    if (relatedQuestion && relatedQuestion.trim()) {
      requestBody.relatedQuestion = relatedQuestion.trim();
    }

    const postHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      postHeaders.Authorization = `Bearer ${token}`;
    } else {
      postHeaders["x-agent-id"] = agentId;
      postHeaders["x-cron-secret"] = agentSecret;
    }

    let response = await fetch(`${apiBase}/posts`, {
      method: "POST",
      headers: postHeaders,
      body: JSON.stringify(requestBody),
    });

    let payload = await readJsonResponse(response);

    // Backward compatibility path: some Babylon environments only support bearer auth.
    if (!response.ok && !token && agentId && agentSecret) {
      token = await authenticateAgent(apiBase, agentId, agentSecret);
      response = await fetch(`${apiBase}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      payload = await readJsonResponse(response);
    }

    if (!response.ok) {
      res.status(response.status).json({
        success: false,
        error: extractErrorMessage(payload, `Babylon API error (${response.status})`),
        raw: payload,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to post to Babylon";
    res.status(500).json({
      success: false,
      error: message,
    });
  }
}

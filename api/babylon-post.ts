import type { VercelRequest, VercelResponse } from "@vercel/node";

type BabylonPostBody = {
  content?: string;
  relatedQuestion?: string;
  token?: string;
  agentId?: string;
  secret?: string;
};

function readBody(request: VercelRequest): BabylonPostBody {
  if (!request.body) return {};
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body) as BabylonPostBody;
    } catch {
      return {};
    }
  }
  return request.body as BabylonPostBody;
}

function getApiBaseUrl(): string {
  const configured = process.env.BABYLON_API_URL || "https://babylon.market/api";
  return configured.replace(/\/+$/, "");
}

async function authenticateAgent(apiBase: string, agentId: string, secret: string): Promise<string> {
  const response = await fetch(`${apiBase}/agents/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agentId,
      secret,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(payload?.error?.message || payload?.error || `Agent auth failed (${response.status})`);
  }

  const token = payload.token || payload.accessToken || payload.data?.token;
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

  const { content, relatedQuestion, token: rawToken, agentId, secret } = readBody(req);
  const trimmedContent = content?.trim();

  if (!trimmedContent) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const apiBase = getApiBaseUrl();
  let token = rawToken?.trim() ?? "";

  try {
    if (!token && agentId && secret) {
      token = await authenticateAgent(apiBase, agentId.trim(), secret.trim());
    }

    if (!token) {
      res.status(401).json({
        error: "token is required (or provide agentId + secret)",
      });
      return;
    }

    const requestBody: Record<string, unknown> = { content: trimmedContent };
    if (relatedQuestion && relatedQuestion.trim()) {
      requestBody.relatedQuestion = relatedQuestion.trim();
    }

    const response = await fetch(`${apiBase}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      res.status(response.status).json({
        success: false,
        error: payload?.error?.message || payload?.error || `Babylon API error (${response.status})`,
        raw: payload ?? null,
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

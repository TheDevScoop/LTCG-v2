import type { VercelRequest, VercelResponse } from "./_lib/vercelTypes";

type DiscordTokenRequestBody = {
  code?: unknown;
};

function readBody(request: VercelRequest): DiscordTokenRequestBody {
  if (!request.body) return {};
  if (typeof request.body === "object") {
    return request.body as DiscordTokenRequestBody;
  }

  const rawBody = Buffer.isBuffer(request.body)
    ? request.body.toString("utf8")
    : String(request.body);

  try {
    return JSON.parse(rawBody) as DiscordTokenRequestBody;
  } catch {
    return {};
  }
}

function getMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (!payload || typeof payload !== "object") return fallback;

  const withErrors = payload as { error?: unknown; error_description?: unknown; message?: unknown };
  if (typeof withErrors.error_description === "string" && withErrors.error_description.trim()) {
    return withErrors.error_description;
  }
  if (typeof withErrors.error === "string" && withErrors.error.trim()) {
    return withErrors.error;
  }
  if (typeof withErrors.message === "string" && withErrors.message.trim()) {
    return withErrors.message;
  }

  return fallback;
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = readBody(request);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    response.status(400).json({ error: "code is required" });
    return;
  }

  const clientId = (process.env.DISCORD_CLIENT_ID || process.env.VITE_DISCORD_CLIENT_ID || "").trim();
  const clientSecret = (process.env.DISCORD_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    response.status(500).json({
      error: "Discord OAuth is not configured on the server.",
    });
    return;
  }

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
      }),
    });

    const payload = await readResponsePayload(tokenResponse);
    if (!tokenResponse.ok) {
      response.status(tokenResponse.status).json({
        error: getMessage(payload, `Discord OAuth token exchange failed (${tokenResponse.status})`),
      });
      return;
    }

    const tokenData = payload as {
      access_token?: unknown;
      token_type?: unknown;
      expires_in?: unknown;
      scope?: unknown;
    };

    if (typeof tokenData.access_token !== "string" || !tokenData.access_token.trim()) {
      response.status(502).json({ error: "Discord returned an invalid token response." });
      return;
    }

    response.status(200).json({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
    });
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : "Discord token exchange failed.";
    response.status(500).json({ error: message });
  }
}

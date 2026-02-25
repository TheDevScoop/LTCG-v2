import type { VercelRequest, VercelResponse } from "./_lib/vercelTypes";
import { createPublicKey, verify } from "node:crypto";

// Discord signs requests with Ed25519. We must validate the signature against the *raw* body bytes.
// Docs: https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
// Vercel's Node runtime may provide parsed JSON in `req.body`, so we prefer reading from the stream when possible.
export const config = {
  api: {
    bodyParser: false,
  },
};

const DISCORD_PING_TYPE = 1;
const DISCORD_PONG_RESPONSE_TYPE = 1;
const DISCORD_APPLICATION_COMMAND_TYPE = 2;
const DISCORD_CHANNEL_MESSAGE_WITH_SOURCE_TYPE = 4;
const DISCORD_EPHEMERAL_MESSAGE_FLAG = 1 << 6;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_INTERACTION_AGE_SECONDS = 5 * 60;

type DiscordInteractionPayload = {
  type?: unknown;
  data?: {
    name?: unknown;
  };
};

function getHeaderValue(headers: VercelRequest["headers"], key: string) {
  const direct = headers[key];
  if (typeof direct === "string") return direct;
  if (Array.isArray(direct)) return direct[0] ?? "";

  const lower = headers[key.toLowerCase()];
  if (typeof lower === "string") return lower;
  if (Array.isArray(lower)) return lower[0] ?? "";

  return "";
}

async function readRawRequestBody(request: VercelRequest) {
  if (typeof request.body === "string") return request.body;
  if (Buffer.isBuffer(request.body)) return request.body.toString("utf8");

  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }
  if (chunks.length === 0) {
    // Fallback: some runtimes may pre-parse JSON into `req.body` and consume the stream.
    // This is not ideal for signature verification, but can still work if the original JSON
    // payload is already canonical (Discord typically sends minified JSON).
    if (request.body && typeof request.body === "object") {
      try {
        return JSON.stringify(request.body);
      } catch {
        return "";
      }
    }
    return "";
  }
  return Buffer.concat(chunks).toString("utf8");
}

function verifyDiscordRequestSignature({
  publicKeyHex,
  signatureHex,
  timestamp,
  body,
}: {
  publicKeyHex: string;
  signatureHex: string;
  timestamp: string;
  body: string;
}) {
  if (!publicKeyHex || !signatureHex || !timestamp) return false;

  try {
    const publicKeyBytes = Buffer.from(publicKeyHex, "hex");
    const signatureBytes = Buffer.from(signatureHex, "hex");
    if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) return false;

    const spkiKey = Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]);
    const keyObject = createPublicKey({
      key: spkiKey,
      format: "der",
      type: "spki",
    });

    return verify(
      null,
      Buffer.from(`${timestamp}${body}`),
      keyObject,
      signatureBytes,
    );
  } catch {
    return false;
  }
}

function parseInteractionPayload(rawBody: string): DiscordInteractionPayload | null {
  if (!rawBody.trim()) return null;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as DiscordInteractionPayload;
  } catch {
    return null;
  }
}

function getInteractionCommandName(payload: DiscordInteractionPayload | null) {
  const rawName = payload?.data?.name;
  if (typeof rawName !== "string") return null;
  const trimmed = rawName.trim();
  return trimmed ? trimmed : null;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const publicKeyHex = (process.env.DISCORD_PUBLIC_KEY || "").trim();
  if (!publicKeyHex) {
    response.status(500).json({ error: "Discord interactions are not configured on the server." });
    return;
  }

  const signatureHex = getHeaderValue(request.headers, "x-signature-ed25519").trim();
  const timestamp = getHeaderValue(request.headers, "x-signature-timestamp").trim();
  const rawBody = await readRawRequestBody(request);

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    response.status(401).json({ error: "Invalid request signature." });
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - timestampSeconds > MAX_INTERACTION_AGE_SECONDS) {
    response.status(401).json({ error: "Invalid request signature." });
    return;
  }

  const validSignature = verifyDiscordRequestSignature({
    publicKeyHex,
    signatureHex,
    timestamp,
    body: rawBody,
  });

  if (!validSignature) {
    response.status(401).json({ error: "Invalid request signature." });
    return;
  }

  const payload = parseInteractionPayload(rawBody);
  if (!payload) {
    response.status(400).json({ error: "Invalid interaction payload." });
    return;
  }

  if (payload.type === DISCORD_PING_TYPE) {
    response.status(200).json({ type: DISCORD_PONG_RESPONSE_TYPE });
    return;
  }

  if (payload.type === DISCORD_APPLICATION_COMMAND_TYPE) {
    const commandName = getInteractionCommandName(payload);
    if (commandName === "play") {
      response.status(200).json({
        type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE_TYPE,
        data: {
          content:
            "LunchTable launch is managed by Discord's entry point command handler. Open the Activity to start a duel.",
          flags: DISCORD_EPHEMERAL_MESSAGE_FLAG,
        },
      });
      return;
    }

    response.status(200).json({
      type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE_TYPE,
      data: {
        content: "Interaction received.",
        flags: DISCORD_EPHEMERAL_MESSAGE_FLAG,
      },
    });
    return;
  }

  response.status(200).json({
    type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE_TYPE,
    data: {
      content: "Unsupported interaction type.",
      flags: DISCORD_EPHEMERAL_MESSAGE_FLAG,
    },
  });
}

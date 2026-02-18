import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "./telegram";

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Raw(keyBytes: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(signature);
}

async function buildSignedInitData(
  botToken: string,
  params: Record<string, string>,
): Promise<string> {
  const searchParams = new URLSearchParams(params);
  searchParams.delete("hash");
  const dataCheckString = Array.from(searchParams.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = await hmacSha256Raw(encoder.encode("WebAppData"), botToken);
  const hash = toHex(await hmacSha256Raw(secret, dataCheckString));
  searchParams.set("hash", hash);
  return searchParams.toString();
}

describe("verifyTelegramInitData", () => {
  const botToken = "123456789:TEST_TOKEN";

  it("accepts valid initData payloads", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const initDataRaw = await buildSignedInitData(botToken, {
      auth_date: String(nowSeconds),
      query_id: "AAEAAAE",
      user: JSON.stringify({ id: 123456, first_name: "Ada", username: "ada" }),
      signature: "mock_signature_value",
    });

    const result = await verifyTelegramInitData(initDataRaw, botToken);
    expect(result.ok).toBe(true);
    expect(result.params?.get("user")).toContain('"id":123456');
  });

  it("rejects payloads with invalid hash", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const initDataRaw = await buildSignedInitData(botToken, {
      auth_date: String(nowSeconds),
      query_id: "AAEAAAE",
      user: JSON.stringify({ id: 123456, first_name: "Ada" }),
    });
    const tampered = initDataRaw.replace(/hash=[a-f0-9]+$/, "hash=deadbeef");

    const result = await verifyTelegramInitData(tampered, botToken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("signature mismatch");
  });

  it("rejects payloads older than five minutes", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const initDataRaw = await buildSignedInitData(botToken, {
      auth_date: String(nowSeconds - 301),
      query_id: "AAEAAAE",
      user: JSON.stringify({ id: 123456, first_name: "Ada" }),
    });

    const result = await verifyTelegramInitData(initDataRaw, botToken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("rejects payloads from the future", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const initDataRaw = await buildSignedInitData(botToken, {
      auth_date: String(nowSeconds + 120),
      query_id: "AAEAAAE",
      user: JSON.stringify({ id: 123456, first_name: "Ada" }),
    });

    const result = await verifyTelegramInitData(initDataRaw, botToken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timestamp");
  });

  it("rejects payloads missing auth_date", async () => {
    const initDataRaw = await buildSignedInitData(botToken, {
      query_id: "AAEAAAE",
      user: JSON.stringify({ id: 123456, first_name: "Ada" }),
    });

    const result = await verifyTelegramInitData(initDataRaw, botToken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("auth_date");
  });
});

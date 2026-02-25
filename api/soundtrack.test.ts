import { describe, expect, it } from "vitest";
import handler from "./soundtrack";

type MockRequest = {
  method: string;
  headers: Record<string, string | undefined>;
  query: Record<string, unknown>;
};

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  ended: boolean;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  end: () => MockResponse;
};

function createMockResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(name, value) {
      response.headers[name] = value;
    },
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(payload) {
      response.body = payload;
      return response;
    },
    end() {
      response.ended = true;
      return response;
    },
  };
  return response;
}

describe("/api/soundtrack", () => {
  it("handles CORS preflight requests", async () => {
    const request: MockRequest = {
      method: "OPTIONS",
      headers: {
        origin: "https://lunchtable.app",
      },
      query: {},
    };
    const response = createMockResponse();

    await handler(request as any, response as any);

    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://lunchtable.app");
    expect(response.headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    expect(response.headers["Access-Control-Allow-Headers"]).toContain("Content-Type");
  });

  it("rejects unsupported methods", async () => {
    const request: MockRequest = {
      method: "POST",
      headers: {},
      query: {},
    };
    const response = createMockResponse();

    await handler(request as any, response as any);

    expect(response.statusCode).toBe(405);
    expect(response.body).toEqual({ error: "Method not allowed" });
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(response.headers["Vary"]).toBe("Origin");
  });
});

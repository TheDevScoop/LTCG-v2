import { beforeEach, describe, expect, it, vi } from "vitest";
import { put } from "@vercel/blob";
import handler from "./blob-upload";
import { validateBlobUploadRequest } from "./_lib/uploadSecurity";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}));

vi.mock("./_lib/uploadSecurity", () => ({
  validateBlobUploadRequest: vi.fn(),
}));

type MockRequest = {
  method: string;
  query: Record<string, unknown>;
};

type MockResponse = {
  statusCode: number;
  jsonBody: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

function createMockResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    jsonBody: null,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(payload) {
      response.jsonBody = payload;
      return response;
    },
  };
  return response;
}

describe("/api/blob-upload", () => {
  beforeEach(() => {
    vi.mocked(put).mockReset();
    vi.mocked(validateBlobUploadRequest).mockReset();
  });

  it("returns 405 for non-POST requests", async () => {
    const request: MockRequest = { method: "GET", query: {} };
    const response = createMockResponse();

    await handler(request as any, response as any);

    expect(response.statusCode).toBe(405);
    expect(response.jsonBody).toEqual({ error: "Method not allowed" });
  });

  it("returns validation failures", async () => {
    vi.mocked(validateBlobUploadRequest).mockReturnValue({
      ok: false,
      status: 400,
      error: "Invalid filename",
    });

    const request: MockRequest = {
      method: "POST",
      query: { filename: "bad.exe" },
    };
    const response = createMockResponse();

    await handler(request as any, response as any);

    expect(validateBlobUploadRequest).toHaveBeenCalledWith(request, "bad.exe");
    expect(response.statusCode).toBe(400);
    expect(response.jsonBody).toEqual({ error: "Invalid filename" });
  });

  it("uploads validated payloads and returns blob metadata", async () => {
    vi.mocked(validateBlobUploadRequest).mockReturnValue({
      ok: true,
      filename: "avatar.png",
    });
    vi.mocked(put).mockResolvedValue({
      url: "https://example.blob/avatar.png",
      pathname: "avatar.png",
      contentType: "image/png",
      contentDisposition: "inline",
      downloadUrl: "https://example.blob/avatar.png",
    } as any);

    const request: MockRequest = {
      method: "POST",
      query: { filename: "avatar.png" },
    };
    const response = createMockResponse();

    await handler(request as any, response as any);

    expect(put).toHaveBeenCalledWith("avatar.png", request, { access: "public" });
    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toEqual({
      url: "https://example.blob/avatar.png",
      pathname: "avatar.png",
      contentType: "image/png",
      contentDisposition: "inline",
      downloadUrl: "https://example.blob/avatar.png",
    });
  });

  it("returns 500 when upload throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(validateBlobUploadRequest).mockReturnValue({
      ok: true,
      filename: "avatar.png",
    });
    vi.mocked(put).mockRejectedValue(new Error("upload failed"));

    const request: MockRequest = {
      method: "POST",
      query: { filename: "avatar.png" },
    };
    const response = createMockResponse();

    await handler(request as any, response as any);

    expect(errorSpy).toHaveBeenCalled();
    expect(response.statusCode).toBe(500);
    expect(response.jsonBody).toEqual({ error: "Upload failed" });
    errorSpy.mockRestore();
  });
});

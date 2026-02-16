import { put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { filename } = request.query;

    if (!filename || typeof filename !== "string") {
      return response.status(400).json({ error: "Filename is required" });
    }

    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];
    const hasValidExtension = allowedExtensions.some((ext) =>
      filename.toLowerCase().endsWith(ext),
    );

    if (!hasValidExtension) {
      return response.status(400).json({
        error: "Invalid file type. Allowed: jpg, png, webp, gif, svg",
      });
    }

    const blob = await put(filename, request, {
      access: "public",
    });

    return response.status(200).json(blob);
  } catch (error) {
    console.error("Upload error:", error);
    return response.status(500).json({ error: "Upload failed" });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

import { put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateBlobUploadRequest } from "../../../api/_lib/uploadSecurity";

export default async function handler(
	request: VercelRequest,
	response: VercelResponse,
) {
	if (request.method !== "POST") {
		return response.status(405).json({ error: "Method not allowed" });
	}

	try {
		const validation = validateBlobUploadRequest(
			request,
			request.query.filename,
		);
		if (!validation.ok) {
			return response
				.status(validation.status)
				.json({ error: validation.error });
		}

		const blob = await put(validation.filename, request, {
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

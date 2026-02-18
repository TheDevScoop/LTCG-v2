import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildToneBuffer, resolveTrackFrequency } from "./_lib/soundtrackSfx";

function setCorsHeaders(response: VercelResponse): void {
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
	response.setHeader("Access-Control-Allow-Headers", "Content-Type");
	response.setHeader("Vary", "Origin");
	response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
}

export default async function handler(
	request: VercelRequest,
	response: VercelResponse,
) {
	setCorsHeaders(response);

	if (request.method === "OPTIONS") {
		response.status(204).end();
		return;
	}

	if (request.method !== "GET") {
		response.status(405).json({ error: "Method not allowed" });
		return;
	}

	const frequency = resolveTrackFrequency(request.query.name);

	response.setHeader("Content-Type", "audio/wav");
	response.status(200).send(buildToneBuffer(frequency));
}

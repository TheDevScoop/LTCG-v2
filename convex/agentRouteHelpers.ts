export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCompatibilityResponseType(
	responseType: unknown,
): boolean | undefined {
	if (typeof responseType === "boolean") return responseType;
	if (typeof responseType !== "string") return undefined;

	const normalized = responseType.toLowerCase().trim();
	if (normalized === "pass") return true;
	if (
		normalized === "play" ||
		normalized === "continue" ||
		normalized === "no"
	) {
		return false;
	}

	return undefined;
}

// Backward-compatible export retained for existing internal imports.
export const parseLegacyResponseType = parseCompatibilityResponseType;

export function normalizeGameCommand(rawCommand: unknown): unknown {
	if (!isPlainObject(rawCommand)) {
		return rawCommand;
	}

	const command = { ...rawCommand };

	const compatibilityKeyMap: Record<string, string> = {
		cardInstanceId: "cardId",
		attackerInstanceId: "attackerId",
		targetInstanceId: "targetId",
		newPosition: "position",
	};

	for (const [compatibilityKey, canonicalKey] of Object.entries(compatibilityKeyMap)) {
		if (compatibilityKey in command && !(canonicalKey in command)) {
			command[canonicalKey] = command[compatibilityKey];
		}
		if (compatibilityKey in command) {
			delete command[compatibilityKey];
		}
	}

	if (
		command.type === "CHAIN_RESPONSE" &&
		!("pass" in command) &&
		"responseType" in command
	) {
		const parsedPass = parseCompatibilityResponseType(command.responseType);
		if (parsedPass !== undefined) {
			command.pass = parsedPass;
			delete command.responseType;
		}
	}

	return command;
}

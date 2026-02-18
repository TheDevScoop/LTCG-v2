export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLegacyResponseType(
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

export function normalizeGameCommand(rawCommand: unknown): unknown {
	if (!isPlainObject(rawCommand)) {
		return rawCommand;
	}

	const command = { ...rawCommand };

	const legacyToCanonical: Record<string, string> = {
		cardInstanceId: "cardId",
		attackerInstanceId: "attackerId",
		targetInstanceId: "targetId",
		newPosition: "position",
	};

	for (const [legacyKey, canonicalKey] of Object.entries(legacyToCanonical)) {
		if (legacyKey in command && !(canonicalKey in command)) {
			command[canonicalKey] = command[legacyKey];
		}
		if (legacyKey in command) {
			delete command[legacyKey];
		}
	}

	if (
		command.type === "CHAIN_RESPONSE" &&
		!("pass" in command) &&
		"responseType" in command
	) {
		const parsedPass = parseLegacyResponseType(command.responseType);
		if (parsedPass !== undefined) {
			command.pass = parsedPass;
			delete command.responseType;
		}
	}

	return command;
}

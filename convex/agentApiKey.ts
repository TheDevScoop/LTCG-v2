export function isSupportedAgentApiKey(apiKey: string): boolean {
	return apiKey.startsWith("ltcg_") || apiKey.startsWith("rpg_");
}

export function buildApiKeyPrefix(apiKey: string): string {
	const prefix = apiKey.startsWith("rpg_") ? "rpg_" : "ltcg_";
	const body = apiKey.slice(prefix.length);
	return `${prefix}${body.slice(0, 8)}...`;
}

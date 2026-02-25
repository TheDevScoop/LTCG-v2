export function isSupportedAgentApiKey(apiKey: string): boolean {
	return apiKey.startsWith("ltcg_");
}

export function buildApiKeyPrefix(apiKey: string): string {
	const body = apiKey.startsWith("ltcg_")
		? apiKey.slice("ltcg_".length)
		: apiKey;
	return `ltcg_${body.slice(0, 8)}...`;
}

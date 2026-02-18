const SECRET_PATTERN = /(api[_-]?key|token|secret|authorization)/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, innerValue] of Object.entries(value)) {
      if (SECRET_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactSecrets(innerValue);
      }
    }
    return output;
  }

  if (typeof value === "string") {
    if (value.length > 80 && /sk-|api|token|secret/i.test(value)) {
      return "[REDACTED]";
    }
  }

  return value;
}

export function hashPromotionToken(token: string): string {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(index);
    hash |= 0;
  }
  return `token_${Math.abs(hash)}`;
}

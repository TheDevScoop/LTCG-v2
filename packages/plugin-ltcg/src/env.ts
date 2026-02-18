function getGlobalNodeEnv(): Record<string, string | undefined> | undefined {
  const globalAny = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return globalAny.process?.env;
}

export function getEnvValue(name: string): string | undefined {
  return getGlobalNodeEnv()?.[name];
}

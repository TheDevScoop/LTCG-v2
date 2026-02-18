export function expectDefined<T>(value: T | undefined, context: string): T {
  if (value === undefined) {
    throw new Error(`[engine invariant] ${context}`);
  }
  return value;
}

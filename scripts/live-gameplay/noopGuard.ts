export type SubmitActionResult = {
  events: string;
  version: number;
};

export type ParsedSubmitEvents = {
  eventCount: number;
  isNoop: boolean;
  validPayload: boolean;
};

export const DEFAULT_NOOP_REPEAT_LIMIT = 3;

export function parseSubmitEvents(result: SubmitActionResult): ParsedSubmitEvents {
  if (typeof result.events !== "string") {
    return { eventCount: 0, isNoop: true, validPayload: false };
  }

  try {
    const parsed = JSON.parse(result.events) as unknown;
    if (!Array.isArray(parsed)) {
      return { eventCount: 0, isNoop: true, validPayload: false };
    }
    return { eventCount: parsed.length, isNoop: parsed.length === 0, validPayload: true };
  } catch {
    return { eventCount: 0, isNoop: true, validPayload: false };
  }
}

function commandKey(signature: string, command: Record<string, unknown>) {
  return `${signature}|${JSON.stringify(command)}`;
}

export class NoopProgressionGuard {
  private lastNoopKey: string | null = null;
  private repeatedNoops = 0;

  constructor(private readonly repeatLimit = DEFAULT_NOOP_REPEAT_LIMIT) {}

  register(args: {
    signature: string;
    command: Record<string, unknown>;
    submitResult: SubmitActionResult;
  }) {
    const parsed = parseSubmitEvents(args.submitResult);
    const key = commandKey(args.signature, args.command);
    if (parsed.isNoop) {
      this.repeatedNoops = this.lastNoopKey === key ? this.repeatedNoops + 1 : 1;
      this.lastNoopKey = key;
    } else {
      this.reset();
    }

    return {
      ...parsed,
      key,
      repeats: this.repeatedNoops,
      shouldForceProgression: parsed.isNoop && this.repeatedNoops >= this.repeatLimit,
    };
  }

  reset() {
    this.lastNoopKey = null;
    this.repeatedNoops = 0;
  }
}

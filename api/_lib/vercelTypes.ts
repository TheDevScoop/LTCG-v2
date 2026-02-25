import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

type QueryValue = string | string[] | undefined;
type QueryRecord = Record<string, QueryValue>;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type VercelRequest = IncomingMessage & {
  query: QueryRecord;
  body?: unknown;
  headers: IncomingHttpHeaders;
};

export type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse;
  json(body: JsonValue | Record<string, unknown>): VercelResponse;
  send(body: unknown): VercelResponse;
};

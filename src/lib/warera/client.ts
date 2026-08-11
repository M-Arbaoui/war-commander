/**
 * Low-level transport for the WarEra tRPC API.
 *
 * SERVER-ONLY. The brief explicitly requires that the browser never talks to
 * api2.warera.io directly — every call must go through a server function.
 * This module throws immediately if it's ever bundled into browser code
 * that runs (best-effort guard; the real enforcement is that only
 * src/lib/warera/api.ts calls this, and only server functions call api.ts).
 *
 * Base URL: https://api2.warera.io/trpc
 * Request shape (confirmed by majimawrks/warera-api-docs against the live API):
 *   GET https://api2.warera.io/trpc/<procedure>
 *   GET https://api2.warera.io/trpc/<procedure>?input=<url-encoded JSON>
 *
 * We deliberately do NOT use tRPC's batch-link wire format (`?batch=1&input=
 * {"0":{"json":...}}`) even though it's what the official web client sends —
 * the community docs captured plain unbatched GETs working directly, and
 * unbatched requests are simpler to cache/reason about per-endpoint. If the
 * live smoke test (scripts/verify-endpoints.ts) finds unbatched GETs no
 * longer work, batching should be reintroduced here — the call sites in
 * api.ts don't need to change either way.
 */

import type { TrpcEnvelope, TrpcErrorEnvelope } from "./types";

if (typeof window !== "undefined") {
  throw new Error(
    "[warera/client] This module must only run on the server. Call warera.* functions " +
      "from a server function / loader, never from browser code.",
  );
}

export const WARERA_BASE_URL = "https://api2.warera.io/trpc";

export class WareraApiError extends Error {
  constructor(
    message: string,
    public readonly procedure: string,
    public readonly cause?: unknown,
    public readonly httpStatus?: number,
    /**
     * Whether this specific failure is worth retrying. Defaults to true for
     * transport-level failures (network blips, 5xx). Application-level tRPC
     * error envelopes (e.g. "Company not found") set this to false — retrying
     * an already-answered "not found" just wastes calls against the upstream API.
     */
    public readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = "WareraApiError";
  }
}

export class WareraTimeoutError extends WareraApiError {
  constructor(procedure: string, timeoutMs: number) {
    super(`Request to ${procedure} timed out after ${timeoutMs}ms`, procedure);
    this.name = "WareraTimeoutError";
  }
}

export interface RequestOptions {
  timeoutMs?: number;
  retries?: number;
  /** Base delay for exponential backoff between retries, in ms. */
  retryDelayMs?: number;
  /** Called for every attempt in development for observability. */
  onLog?: (event: WareraLogEvent) => void;
}

export type WareraLogEvent =
  | { type: "request"; procedure: string; url: string; attempt: number }
  | { type: "success"; procedure: string; durationMs: number; attempt: number }
  | { type: "error"; procedure: string; error: string; attempt: number; willRetry: boolean };

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const IS_DEV = process.env.NODE_ENV !== "production";

function devLog(event: WareraLogEvent, onLog?: (e: WareraLogEvent) => void) {
  onLog?.(event);
  if (!IS_DEV) return;
  switch (event.type) {
    case "request":
      console.debug(`[warera] → ${event.procedure} (attempt ${event.attempt}) ${event.url}`);
      break;
    case "success":
      console.debug(`[warera] ✓ ${event.procedure} in ${event.durationMs}ms`);
      break;
    case "error":
      console.debug(
        `[warera] ✗ ${event.procedure} attempt ${event.attempt}: ${event.error}${
          event.willRetry ? " (retrying)" : ""
        }`,
      );
      break;
  }
}

function buildUrl(procedure: string, input?: unknown): string {
  const url = new URL(`${WARERA_BASE_URL}/${procedure}`);
  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify(input));
  }
  return url.toString();
}

function isErrorEnvelope(body: unknown): body is TrpcErrorEnvelope {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "object"
  );
}

/** tRPC error envelopes have been observed both flat (`error.message`) and
 * nested under a superjson-style `error.json.message` — confirmed against
 * majimawrks/warera-fetch's own error handling for this exact API. */
function extractErrorMessage(envelope: TrpcErrorEnvelope): string {
  const err = envelope.error as { message?: string; json?: { message?: string } };
  return err.json?.message ?? err.message ?? "Unknown WarEra API error";
}

function isSuccessEnvelope<T>(body: unknown): body is TrpcEnvelope<T> {
  return (
    typeof body === "object" &&
    body !== null &&
    "result" in body &&
    typeof (body as { result?: unknown }).result === "object"
  );
}

/**
 * Unwraps a tRPC response body into the raw payload, tolerating both the
 * standard `{ result: { data } }` envelope and a bare/unwrapped payload
 * (observed in the community docs' captured examples).
 */
export function unwrapTrpcResponse<T>(body: unknown, procedure: string): T {
  if (isErrorEnvelope(body)) {
    throw new WareraApiError(extractErrorMessage(body), procedure, body.error, undefined, false);
  }
  if (isSuccessEnvelope<T>(body)) {
    return body.result.data;
  }
  // Bare payload — this is what majimawrks/warera-api-docs' examples show.
  return body as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Issues one HTTP request (GET with ?input=, or POST with a JSON body) to
 * a WarEra tRPC procedure and returns the unwrapped payload. Not exported —
 * wareraGet() below is the public entry point and handles the GET/POST
 * ambiguity described there.
 */
async function requestOnce<T>(
  procedure: string,
  httpMethod: "GET" | "POST",
  input: Record<string, unknown> | undefined,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      httpMethod === "GET" ? buildUrl(procedure, input) : `${WARERA_BASE_URL}/${procedure}`,
      {
        method: httpMethod,
        signal: controller.signal,
        headers:
          httpMethod === "GET"
            ? { accept: "application/json" }
            : { accept: "application/json", "content-type": "application/json" },
        body: httpMethod === "POST" ? JSON.stringify(input ?? {}) : undefined,
      },
    );
    if (!response.ok) {
      throw new WareraApiError(`${procedure} responded with HTTP ${response.status}`, procedure, undefined, response.status);
    }
    const body = await response.json();
    return unwrapTrpcResponse<T>(body, procedure);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Issues a single GET request to a WarEra tRPC procedure with timeout +
 * retry + error handling. Returns the *unwrapped* payload, still untyped —
 * schema validation happens one layer up in api.ts.
 *
 * GET-vs-POST NOTE: every endpoint whose transport this codebase has real
 * evidence for (majimawrks/warera-api-docs' captured traffic) uses plain
 * GET with a `?input=` query string, and that's the default here. A small
 * number of newer procedures (search.searchAnything, user.getUserById,
 * user.getUserLite) are documented as POST-only in WarEraProjects/TRPC's
 * generated OpenAPI spec — but that same spec also labels
 * gameConfig.getGameConfig as POST, which is *confirmed* to work via GET,
 * so that labeling isn't trustworthy evidence of the real transport either
 * way. Rather than guess, this function tries GET first (matching every
 * confirmed-working endpoint) and automatically falls back to POST once if
 * GET fails — so it self-corrects in production regardless of which
 * assumption turns out to be right, instead of hard-failing on a guess.
 */
export async function wareraGet<T>(
  procedure: string,
  input?: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: unknown;
  let triedPostFallback = false;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const httpMethod: "GET" | "POST" = triedPostFallback ? "POST" : "GET";
    devLog({ type: "request", procedure, url: `[${httpMethod}] ${procedure}`, attempt }, options.onLog);
    const startedAt = Date.now();

    try {
      const data = await requestOnce<T>(procedure, httpMethod, input, timeoutMs);
      devLog({ type: "success", procedure, durationMs: Date.now() - startedAt, attempt }, options.onLog);
      return data;
    } catch (err) {
      const normalized =
        err instanceof Error && err.name === "AbortError" ? new WareraTimeoutError(procedure, timeoutMs) : err;
      lastError = normalized;

      // One-time GET->POST fallback, but ONLY on signals that plausibly mean
      // "wrong HTTP method" (404/405) — never on a legitimate 4xx/5xx
      // business error or timeout, which would otherwise double every real
      // failure for no benefit and break "don't retry 4xx" semantics.
      const looksLikeWrongMethod =
        normalized instanceof WareraApiError && (normalized.httpStatus === 404 || normalized.httpStatus === 405);
      if (httpMethod === "GET" && !triedPostFallback && looksLikeWrongMethod) {
        triedPostFallback = true;
        devLog(
          {
            type: "error",
            procedure,
            error: `GET returned HTTP ${(normalized as WareraApiError).httpStatus} — trying POST fallback`,
            attempt,
            willRetry: true,
          },
          options.onLog,
        );
        attempt--; // Don't consume a retry slot on the fallback attempt.
        continue;
      }

      const willRetry = attempt <= maxRetries && isRetryable(normalized);
      devLog(
        {
          type: "error",
          procedure,
          error: normalized instanceof Error ? normalized.message : String(normalized),
          attempt,
          willRetry,
        },
        options.onLog,
      );

      if (!willRetry) break;
      const isRateLimited = normalized instanceof WareraApiError && normalized.httpStatus === 429;
      const backoffMs = isRateLimited ? 2 ** attempt * 1000 + Math.random() * 1000 : retryDelayMs * attempt;
      await delay(backoffMs);
    }
  }

  if (lastError instanceof WareraApiError) throw lastError;
  throw new WareraApiError(
    lastError instanceof Error ? lastError.message : "Unknown WarEra API error",
    procedure,
    lastError,
  );
}

function isRetryable(error: unknown): boolean {
  if (error instanceof WareraTimeoutError) return true;
  if (error instanceof WareraApiError) {
    if (!error.retryable) return false; // e.g. tRPC application-level error envelope.
    // Retry network errors, 429 (rate limit — confirmed present on this API by
    // majimawrks/warera-fetch's own retry handling), and 5xx. Not other 4xx.
    return error.httpStatus === undefined || error.httpStatus === 429 || error.httpStatus >= 500;
  }
  return true; // Unknown errors (network blips) are worth one retry.
}

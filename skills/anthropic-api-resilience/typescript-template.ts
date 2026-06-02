/**
 * ResilientAnthropicClient
 *
 * Drop-in wrapper around @anthropic-ai/sdk that adds:
 *   - Round-robin rotation across N API keys (env-var discovered)
 *   - Exponential backoff: 1s base, 5min max, 2.0x multiplier
 *   - Circuit breaker: trip after 10 consecutive failures
 *   - Per-key health snapshot for observability
 *
 * Usage:
 *   import { ResilientAnthropicClient } from "./resilient_client";
 *   const client = new ResilientAnthropicClient();
 *   const msg = await client.messages.create({ model, messages, max_tokens });
 *   const stats = client.getKeyStats(); // for /health endpoints
 *
 * Env vars (discovered automatically):
 *   ANTHROPIC_API_KEY
 *   ANTHROPIC_API_KEY_2
 *   ANTHROPIC_API_KEY_3
 *   ...
 *
 * Or pass an explicit list:
 *   new ResilientAnthropicClient({ apiKeys: ["sk-...", "sk-..."] });
 */

import Anthropic, {
  APIConnectionError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type { MessageCreateParams, Message } from "@anthropic-ai/sdk/resources/messages";

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 5 * 60 * 1_000; // 5 minutes
const BACKOFF_MULTIPLIER = 2.0;
const CIRCUIT_BREAKER_THRESHOLD = 10;

interface KeyState {
  name: string;
  client: Anthropic;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  consecutiveFailures: number;
  backoffUntilMs: number;
  circuitBroken: boolean;
  lastError: string | null;
}

export interface KeyHealthSnapshot {
  name: string;
  healthy: boolean;
  success_rate: number;
  total_requests: number;
  consecutive_failures: number;
  in_backoff: boolean;
  circuit_broken: boolean;
  last_error: string | null;
}

export interface ResilientAnthropicClientOptions {
  /** Explicit list of API keys. If omitted, discovers from env vars. */
  apiKeys?: string[];
  /** Default model timeout (ms). Forwarded to the underlying client. */
  timeoutMs?: number;
}

export class ResilientAnthropicClient {
  private keys: KeyState[];
  private currentIdx: number;

  constructor(opts: ResilientAnthropicClientOptions = {}) {
    const discovered = opts.apiKeys ?? this.discoverKeys();
    if (discovered.length === 0) {
      throw new Error(
        "ResilientAnthropicClient: no API keys found. Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_API_KEY_2, _3, ...) or pass { apiKeys: [...] }.",
      );
    }
    this.keys = discovered.map((key, i) => ({
      name: i === 0 ? "ANTHROPIC_API_KEY" : `ANTHROPIC_API_KEY_${i + 1}`,
      client: new Anthropic({ apiKey: key, timeout: opts.timeoutMs }),
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      consecutiveFailures: 0,
      backoffUntilMs: 0,
      circuitBroken: false,
      lastError: null,
    }));
    // Randomize starting key to avoid thundering herd across replicas
    this.currentIdx = Math.floor(Math.random() * this.keys.length);
  }

  private discoverKeys(): string[] {
    const out: string[] = [];
    const primary = process.env.ANTHROPIC_API_KEY;
    if (primary) out.push(primary);
    for (let i = 2; i < 100; i++) {
      const v = process.env[`ANTHROPIC_API_KEY_${i}`];
      if (v) out.push(v);
      else if (i > 2) break; // stop on first gap after the secondary
    }
    return out;
  }

  /** Interface-compatible shim: `client.messages.create(...)` */
  public readonly messages = {
    create: (params: MessageCreateParams): Promise<Message> => this.callWithRetry(params),
  };

  private async callWithRetry(params: MessageCreateParams): Promise<Message> {
    const maxAttempts = Math.max(this.keys.length * 3, 6);
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const key = this.selectKey();
      if (!key) {
        // All keys unhealthy — use least-backed-off and let it through
        const fallback = this.leastBackedOffKey();
        await this.waitForBackoff(fallback);
        const result = await this.tryCall(fallback, params);
        if (result.ok) return result.value;
        lastErr = result.err;
        continue;
      }

      const result = await this.tryCall(key, params);
      if (result.ok) return result.value;
      lastErr = result.err;

      // Non-retryable: bail immediately
      if (!this.isRetryable(result.err)) {
        throw result.err;
      }
    }

    throw lastErr ?? new Error("ResilientAnthropicClient: exhausted retries");
  }

  private async tryCall(
    key: KeyState,
    params: MessageCreateParams,
  ): Promise<{ ok: true; value: Message } | { ok: false; err: unknown }> {
    key.totalRequests++;
    try {
      // Cast: streaming union narrowing — the wrapper covers the non-stream case.
      const result = (await key.client.messages.create(params)) as Message;
      this.recordSuccess(key);
      return { ok: true, value: result };
    } catch (err) {
      this.recordFailure(key, err);
      return { ok: false, err };
    }
  }

  private selectKey(): KeyState | null {
    const now = Date.now();
    const n = this.keys.length;
    for (let step = 0; step < n; step++) {
      const idx = (this.currentIdx + step) % n;
      const k = this.keys[idx];
      if (k.circuitBroken) continue;
      if (k.backoffUntilMs > now) continue;
      this.currentIdx = (idx + 1) % n;
      return k;
    }
    return null;
  }

  private leastBackedOffKey(): KeyState {
    return [...this.keys].sort((a, b) => a.backoffUntilMs - b.backoffUntilMs)[0];
  }

  private async waitForBackoff(key: KeyState): Promise<void> {
    const wait = Math.max(0, key.backoffUntilMs - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  private recordSuccess(key: KeyState): void {
    key.totalSuccesses++;
    key.consecutiveFailures = 0;
    key.backoffUntilMs = 0;
    key.circuitBroken = false;
    key.lastError = null;
  }

  private recordFailure(key: KeyState, err: unknown): void {
    key.totalFailures++;
    key.consecutiveFailures++;
    key.lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const backoffMs = Math.min(
      BASE_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, key.consecutiveFailures - 1),
      MAX_BACKOFF_MS,
    );
    key.backoffUntilMs = Date.now() + backoffMs;
    if (key.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      key.circuitBroken = true;
    }
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof RateLimitError) return true;
    if (err instanceof APIConnectionError) return true;
    if (err instanceof InternalServerError) return true;
    // Catch overloaded_error (529) and other 5xx surfaced by the SDK
    const anyErr = err as { status?: number; type?: string };
    if (anyErr?.status === 529 || anyErr?.status === 503) return true;
    if (anyErr?.type === "overloaded_error") return true;
    return false;
  }

  /** Per-key snapshot for /health endpoints and dashboards. */
  getKeyStats(): {
    status: "healthy" | "degraded" | "down";
    total_keys: number;
    healthy_keys: number;
    keys: KeyHealthSnapshot[];
  } {
    const now = Date.now();
    const keys: KeyHealthSnapshot[] = this.keys.map((k) => ({
      name: k.name,
      healthy: !k.circuitBroken && k.backoffUntilMs <= now,
      success_rate: k.totalRequests === 0 ? 1 : k.totalSuccesses / k.totalRequests,
      total_requests: k.totalRequests,
      consecutive_failures: k.consecutiveFailures,
      in_backoff: k.backoffUntilMs > now,
      circuit_broken: k.circuitBroken,
      last_error: k.lastError,
    }));
    const healthyCount = keys.filter((k) => k.healthy).length;
    return {
      status: healthyCount === 0 ? "down" : healthyCount < keys.length ? "degraded" : "healthy",
      total_keys: keys.length,
      healthy_keys: healthyCount,
      keys,
    };
  }

  /** Manually reset all key state (e.g. after rotating revoked keys). */
  resetAll(): void {
    for (const k of this.keys) {
      k.consecutiveFailures = 0;
      k.backoffUntilMs = 0;
      k.circuitBroken = false;
      k.lastError = null;
    }
  }
}

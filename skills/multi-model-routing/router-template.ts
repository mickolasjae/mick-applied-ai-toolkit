/**
 * multi-model-routing — TypeScript router template
 *
 * Drop-in router that picks the model per task type, calls the right provider,
 * and emits one telemetry record per call.
 *
 * Usage:
 *   const client = new ModelRouter({ telemetrySink: console.log });
 *   const res = await client.complete({
 *     taskType: "vocab_extraction",
 *     messages: [{ role: "user", content: "..." }],
 *     requestId: "req_123",
 *   });
 *
 * Add new task types by editing TASK_TYPE_MAP. Never pass `model` from a
 * call site — that breaks the per-quarter re-eval loop.
 */

// ---------- Types ----------

export type TaskType =
  | "text_classification"
  | "vocab_extraction"
  | "rag_synthesis"
  | "agent_planning"
  | "code_completion"
  | "voice_transcription"
  | "multimodal_reasoning"
  | "long_context_summarize"
  | "creative_writing";

export type Provider = "anthropic" | "openai" | "google" | "deepgram";

export interface ModelSpec {
  provider: Provider;
  modelId: string;
  /** USD per 1M input tokens */
  inputPricePerMTok: number;
  /** USD per 1M output tokens */
  outputPricePerMTok: number;
  /** True if the model accepts non-text input (image/audio/video). */
  multimodal: boolean;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; [k: string]: unknown }>;
}

export interface CompleteRequest {
  taskType: TaskType;
  messages: Message[];
  requestId: string;
  /** Optional caller-provided overrides; do NOT include `model`. */
  maxOutputTokens?: number;
  temperature?: number;
}

export interface CompleteResponse {
  text: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface TelemetryRecord {
  requestId: string;
  taskType: TaskType;
  modelId: string;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: "ok" | "error";
  errorMessage?: string;
  timestampIso: string;
}

export type TelemetrySink = (rec: TelemetryRecord) => void | Promise<void>;

// ---------- Task-type → model map ----------
// Edit ONLY here. See task-taxonomy.md for the rationale per row.

export const TASK_TYPE_MAP: Record<TaskType, ModelSpec> = {
  text_classification: {
    provider: "openai",
    modelId: "gpt-5-nano",
    inputPricePerMTok: 0.05,
    outputPricePerMTok: 0.4,
    multimodal: false,
  },
  vocab_extraction: {
    provider: "anthropic",
    modelId: "claude-haiku-4-5",
    inputPricePerMTok: 0.8,
    outputPricePerMTok: 4.0,
    multimodal: false,
  },
  rag_synthesis: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-7",
    inputPricePerMTok: 3.0,
    outputPricePerMTok: 15.0,
    multimodal: false,
  },
  agent_planning: {
    provider: "anthropic",
    modelId: "claude-opus-4-7",
    inputPricePerMTok: 15.0,
    outputPricePerMTok: 75.0,
    multimodal: false,
  },
  code_completion: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-7",
    inputPricePerMTok: 3.0,
    outputPricePerMTok: 15.0,
    multimodal: false,
  },
  voice_transcription: {
    provider: "deepgram",
    modelId: "nova-3",
    inputPricePerMTok: 0, // priced per audio minute, not tokens
    outputPricePerMTok: 0,
    multimodal: true,
  },
  multimodal_reasoning: {
    provider: "google",
    modelId: "gemini-2.5-flash",
    inputPricePerMTok: 0.3,
    outputPricePerMTok: 2.5,
    multimodal: true,
  },
  long_context_summarize: {
    provider: "google",
    modelId: "gemini-2.5-flash",
    inputPricePerMTok: 0.3,
    outputPricePerMTok: 2.5,
    multimodal: true,
  },
  creative_writing: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-7",
    inputPricePerMTok: 3.0,
    outputPricePerMTok: 15.0,
    multimodal: false,
  },
};

// ---------- Provider adapters ----------
// Each adapter exposes a uniform `invoke(spec, req)` returning normalized
// `{ text, inputTokens, outputTokens }`. Replace stubs with real SDK calls.

interface ProviderAdapter {
  invoke(
    spec: ModelSpec,
    req: CompleteRequest,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}

class AnthropicAdapter implements ProviderAdapter {
  async invoke(spec: ModelSpec, req: CompleteRequest) {
    // TODO: replace with @anthropic-ai/sdk
    // const res = await anthropic.messages.create({ model: spec.modelId, messages: req.messages, ... });
    // return { text: res.content[0].text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
    throw new Error("AnthropicAdapter not wired; install @anthropic-ai/sdk");
  }
}

class OpenAIAdapter implements ProviderAdapter {
  async invoke(spec: ModelSpec, req: CompleteRequest) {
    // TODO: replace with openai SDK
    throw new Error("OpenAIAdapter not wired; install openai");
  }
}

class GoogleAdapter implements ProviderAdapter {
  async invoke(spec: ModelSpec, req: CompleteRequest) {
    // TODO: replace with @google/genai
    throw new Error("GoogleAdapter not wired; install @google/genai");
  }
}

class DeepgramAdapter implements ProviderAdapter {
  async invoke(spec: ModelSpec, req: CompleteRequest) {
    // TODO: replace with @deepgram/sdk; pricing is per audio minute
    throw new Error("DeepgramAdapter not wired; install @deepgram/sdk");
  }
}

const ADAPTERS: Record<Provider, ProviderAdapter> = {
  anthropic: new AnthropicAdapter(),
  openai: new OpenAIAdapter(),
  google: new GoogleAdapter(),
  deepgram: new DeepgramAdapter(),
};

// ---------- Router ----------

export interface ModelRouterOptions {
  telemetrySink?: TelemetrySink;
  /** Override the default task-type map (rarely needed). */
  taskTypeMap?: Partial<Record<TaskType, ModelSpec>>;
}

export class ModelRouter {
  private readonly map: Record<TaskType, ModelSpec>;
  private readonly sink?: TelemetrySink;

  constructor(opts: ModelRouterOptions = {}) {
    this.map = { ...TASK_TYPE_MAP, ...(opts.taskTypeMap ?? {}) };
    this.sink = opts.telemetrySink;
  }

  resolveModel(taskType: TaskType): ModelSpec {
    const spec = this.map[taskType];
    if (!spec) {
      throw new Error(`No model registered for task_type=${taskType}`);
    }
    return spec;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const spec = this.resolveModel(req.taskType);
    const adapter = ADAPTERS[spec.provider];
    const start = Date.now();

    try {
      const { text, inputTokens, outputTokens } = await adapter.invoke(spec, req);
      const latencyMs = Date.now() - start;
      const costUsd =
        (inputTokens / 1_000_000) * spec.inputPricePerMTok +
        (outputTokens / 1_000_000) * spec.outputPricePerMTok;

      await this.emit({
        requestId: req.requestId,
        taskType: req.taskType,
        modelId: spec.modelId,
        provider: spec.provider,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs,
        status: "ok",
        timestampIso: new Date().toISOString(),
      });

      return { text, modelId: spec.modelId, inputTokens, outputTokens, costUsd, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - start;
      await this.emit({
        requestId: req.requestId,
        taskType: req.taskType,
        modelId: spec.modelId,
        provider: spec.provider,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        timestampIso: new Date().toISOString(),
      });
      throw err;
    }
  }

  private async emit(rec: TelemetryRecord) {
    if (!this.sink) return;
    try {
      await this.sink(rec);
    } catch {
      // Telemetry must never break the call path.
    }
  }
}

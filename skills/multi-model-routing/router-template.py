"""
multi-model-routing — Python router template

Drop-in router that picks the model per task type, calls the right provider,
and emits one telemetry record per call.

Usage:
    router = ModelRouter(telemetry_sink=print)
    res = router.complete(
        task_type="vocab_extraction",
        messages=[{"role": "user", "content": "..."}],
        request_id="req_123",
    )

Add new task types by editing TASK_TYPE_MAP. Never pass `model` from a call
site — that breaks the per-quarter re-eval loop.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Literal, Optional, Protocol

TaskType = Literal[
    "text_classification",
    "vocab_extraction",
    "rag_synthesis",
    "agent_planning",
    "code_completion",
    "voice_transcription",
    "multimodal_reasoning",
    "long_context_summarize",
    "creative_writing",
]

Provider = Literal["anthropic", "openai", "google", "deepgram"]


@dataclass(frozen=True)
class ModelSpec:
    provider: Provider
    model_id: str
    input_price_per_mtok: float   # USD per 1M input tokens
    output_price_per_mtok: float  # USD per 1M output tokens
    multimodal: bool


@dataclass
class TelemetryRecord:
    request_id: str
    task_type: str
    model_id: str
    provider: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int
    status: Literal["ok", "error"]
    timestamp_iso: str
    error_message: Optional[str] = None


@dataclass
class CompleteResponse:
    text: str
    model_id: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms: int


# ---------- Task-type → model map ----------
# Edit ONLY here. See task-taxonomy.md for the rationale per row.

TASK_TYPE_MAP: Dict[TaskType, ModelSpec] = {
    "text_classification": ModelSpec(
        provider="openai",
        model_id="gpt-5-nano",
        input_price_per_mtok=0.05,
        output_price_per_mtok=0.40,
        multimodal=False,
    ),
    "vocab_extraction": ModelSpec(
        provider="anthropic",
        model_id="claude-haiku-4-5",
        input_price_per_mtok=0.80,
        output_price_per_mtok=4.00,
        multimodal=False,
    ),
    "rag_synthesis": ModelSpec(
        provider="anthropic",
        model_id="claude-sonnet-4-7",
        input_price_per_mtok=3.00,
        output_price_per_mtok=15.00,
        multimodal=False,
    ),
    "agent_planning": ModelSpec(
        provider="anthropic",
        model_id="claude-opus-4-7",
        input_price_per_mtok=15.00,
        output_price_per_mtok=75.00,
        multimodal=False,
    ),
    "code_completion": ModelSpec(
        provider="anthropic",
        model_id="claude-sonnet-4-7",
        input_price_per_mtok=3.00,
        output_price_per_mtok=15.00,
        multimodal=False,
    ),
    "voice_transcription": ModelSpec(
        provider="deepgram",
        model_id="nova-3",
        input_price_per_mtok=0.0,  # priced per audio minute, not tokens
        output_price_per_mtok=0.0,
        multimodal=True,
    ),
    "multimodal_reasoning": ModelSpec(
        provider="google",
        model_id="gemini-2.5-flash",
        input_price_per_mtok=0.30,
        output_price_per_mtok=2.50,
        multimodal=True,
    ),
    "long_context_summarize": ModelSpec(
        provider="google",
        model_id="gemini-2.5-flash",
        input_price_per_mtok=0.30,
        output_price_per_mtok=2.50,
        multimodal=True,
    ),
    "creative_writing": ModelSpec(
        provider="anthropic",
        model_id="claude-sonnet-4-7",
        input_price_per_mtok=3.00,
        output_price_per_mtok=15.00,
        multimodal=False,
    ),
}


# ---------- Provider adapters ----------

class ProviderAdapter(Protocol):
    def invoke(
        self, spec: ModelSpec, messages: List[Dict[str, Any]], **kwargs: Any
    ) -> Dict[str, Any]:
        """Returns {'text': str, 'input_tokens': int, 'output_tokens': int}."""
        ...


class AnthropicAdapter:
    def invoke(self, spec, messages, **kwargs):
        # TODO: replace with anthropic SDK
        # client = Anthropic()
        # res = client.messages.create(model=spec.model_id, messages=messages, ...)
        # return {"text": res.content[0].text,
        #         "input_tokens": res.usage.input_tokens,
        #         "output_tokens": res.usage.output_tokens}
        raise NotImplementedError("Install `anthropic` and wire AnthropicAdapter")


class OpenAIAdapter:
    def invoke(self, spec, messages, **kwargs):
        raise NotImplementedError("Install `openai` and wire OpenAIAdapter")


class GoogleAdapter:
    def invoke(self, spec, messages, **kwargs):
        raise NotImplementedError("Install `google-genai` and wire GoogleAdapter")


class DeepgramAdapter:
    def invoke(self, spec, messages, **kwargs):
        # Deepgram is audio-in; pricing is per audio minute, not tokens.
        raise NotImplementedError("Install `deepgram-sdk` and wire DeepgramAdapter")


ADAPTERS: Dict[Provider, ProviderAdapter] = {
    "anthropic": AnthropicAdapter(),
    "openai": OpenAIAdapter(),
    "google": GoogleAdapter(),
    "deepgram": DeepgramAdapter(),
}


# ---------- Router ----------

TelemetrySink = Callable[[TelemetryRecord], None]


class ModelRouter:
    def __init__(
        self,
        telemetry_sink: Optional[TelemetrySink] = None,
        task_type_map: Optional[Dict[TaskType, ModelSpec]] = None,
    ):
        self._map: Dict[TaskType, ModelSpec] = {**TASK_TYPE_MAP, **(task_type_map or {})}
        self._sink = telemetry_sink

    def resolve_model(self, task_type: TaskType) -> ModelSpec:
        if task_type not in self._map:
            raise ValueError(f"No model registered for task_type={task_type!r}")
        return self._map[task_type]

    def complete(
        self,
        task_type: TaskType,
        messages: List[Dict[str, Any]],
        request_id: str,
        **kwargs: Any,
    ) -> CompleteResponse:
        spec = self.resolve_model(task_type)
        adapter = ADAPTERS[spec.provider]
        start = time.perf_counter()

        try:
            out = adapter.invoke(spec, messages, **kwargs)
            latency_ms = int((time.perf_counter() - start) * 1000)
            input_tokens = int(out["input_tokens"])
            output_tokens = int(out["output_tokens"])
            cost_usd = (
                input_tokens / 1_000_000 * spec.input_price_per_mtok
                + output_tokens / 1_000_000 * spec.output_price_per_mtok
            )

            self._emit(TelemetryRecord(
                request_id=request_id,
                task_type=task_type,
                model_id=spec.model_id,
                provider=spec.provider,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
                latency_ms=latency_ms,
                status="ok",
                timestamp_iso=datetime.now(timezone.utc).isoformat(),
            ))

            return CompleteResponse(
                text=out["text"],
                model_id=spec.model_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
                latency_ms=latency_ms,
            )
        except Exception as err:
            latency_ms = int((time.perf_counter() - start) * 1000)
            self._emit(TelemetryRecord(
                request_id=request_id,
                task_type=task_type,
                model_id=spec.model_id,
                provider=spec.provider,
                input_tokens=0,
                output_tokens=0,
                cost_usd=0.0,
                latency_ms=latency_ms,
                status="error",
                timestamp_iso=datetime.now(timezone.utc).isoformat(),
                error_message=str(err),
            ))
            raise

    def _emit(self, record: TelemetryRecord) -> None:
        if self._sink is None:
            return
        try:
            self._sink(record)
        except Exception:
            # Telemetry must never break the call path.
            pass

"""
ResilientAnthropicClient

Drop-in wrapper around the `anthropic` Python SDK that adds:
  - Round-robin rotation across N API keys (env-var discovered)
  - Exponential backoff: 1s base, 5min max, 2.0x multiplier
  - Circuit breaker: trip after 10 consecutive failures
  - Per-key health snapshot for observability

Usage:
    from resilient_client import ResilientAnthropicClient
    client = ResilientAnthropicClient()
    msg = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hello"}],
    )
    stats = client.get_key_stats()  # for /health endpoints

Env vars (discovered automatically):
    ANTHROPIC_API_KEY
    ANTHROPIC_API_KEY_2
    ANTHROPIC_API_KEY_3
    ...

Or pass an explicit list:
    ResilientAnthropicClient(api_keys=["sk-...", "sk-..."])
"""

from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from anthropic import (
    Anthropic,
    APIConnectionError,
    InternalServerError,
    RateLimitError,
)

BASE_BACKOFF_S = 1.0
MAX_BACKOFF_S = 5 * 60.0  # 5 minutes
BACKOFF_MULTIPLIER = 2.0
CIRCUIT_BREAKER_THRESHOLD = 10


@dataclass
class _KeyState:
    name: str
    client: Anthropic
    total_requests: int = 0
    total_successes: int = 0
    total_failures: int = 0
    consecutive_failures: int = 0
    backoff_until_ts: float = 0.0
    circuit_broken: bool = False
    last_error: Optional[str] = None


class ResilientAnthropicClient:
    """Interface-compatible wrapper around `anthropic.Anthropic`."""

    def __init__(
        self,
        api_keys: Optional[list[str]] = None,
        timeout: Optional[float] = None,
    ) -> None:
        keys = api_keys if api_keys is not None else self._discover_keys()
        if not keys:
            raise RuntimeError(
                "ResilientAnthropicClient: no API keys found. Set ANTHROPIC_API_KEY "
                "(and optionally ANTHROPIC_API_KEY_2, _3, ...) or pass api_keys=[...]."
            )
        self._keys: list[_KeyState] = []
        for i, key in enumerate(keys):
            kwargs: dict[str, Any] = {"api_key": key}
            if timeout is not None:
                kwargs["timeout"] = timeout
            self._keys.append(
                _KeyState(
                    name="ANTHROPIC_API_KEY" if i == 0 else f"ANTHROPIC_API_KEY_{i + 1}",
                    client=Anthropic(**kwargs),
                )
            )
        # Randomize starting key to avoid thundering herd across replicas
        self._current_idx = random.randint(0, len(self._keys) - 1)
        self.messages = _MessagesShim(self)

    @staticmethod
    def _discover_keys() -> list[str]:
        out: list[str] = []
        primary = os.environ.get("ANTHROPIC_API_KEY")
        if primary:
            out.append(primary)
        for i in range(2, 100):
            v = os.environ.get(f"ANTHROPIC_API_KEY_{i}")
            if v:
                out.append(v)
            elif i > 2:
                # stop on first gap after the secondary
                break
        return out

    # ----- public API -----

    def get_key_stats(self) -> dict[str, Any]:
        """Per-key snapshot for /health endpoints and dashboards."""
        now = time.time()
        keys = []
        for k in self._keys:
            keys.append(
                {
                    "name": k.name,
                    "healthy": not k.circuit_broken and k.backoff_until_ts <= now,
                    "success_rate": (
                        1.0 if k.total_requests == 0 else k.total_successes / k.total_requests
                    ),
                    "total_requests": k.total_requests,
                    "consecutive_failures": k.consecutive_failures,
                    "in_backoff": k.backoff_until_ts > now,
                    "circuit_broken": k.circuit_broken,
                    "last_error": k.last_error,
                }
            )
        healthy = sum(1 for k in keys if k["healthy"])
        if healthy == 0:
            status = "down"
        elif healthy < len(keys):
            status = "degraded"
        else:
            status = "healthy"
        return {
            "status": status,
            "total_keys": len(keys),
            "healthy_keys": healthy,
            "keys": keys,
        }

    def reset_all(self) -> None:
        """Reset all per-key state (use after rotating revoked keys)."""
        for k in self._keys:
            k.consecutive_failures = 0
            k.backoff_until_ts = 0.0
            k.circuit_broken = False
            k.last_error = None

    # ----- internal -----

    def _create_message(self, **params: Any) -> Any:
        max_attempts = max(len(self._keys) * 3, 6)
        last_err: Optional[BaseException] = None

        for _ in range(max_attempts):
            key = self._select_key()
            if key is None:
                key = self._least_backed_off_key()
                self._wait_for_backoff(key)

            key.total_requests += 1
            try:
                result = key.client.messages.create(**params)
                self._record_success(key)
                return result
            except BaseException as err:
                self._record_failure(key, err)
                last_err = err
                if not self._is_retryable(err):
                    raise

        if last_err is not None:
            raise last_err
        raise RuntimeError("ResilientAnthropicClient: exhausted retries")

    def _select_key(self) -> Optional[_KeyState]:
        now = time.time()
        n = len(self._keys)
        for step in range(n):
            idx = (self._current_idx + step) % n
            k = self._keys[idx]
            if k.circuit_broken:
                continue
            if k.backoff_until_ts > now:
                continue
            self._current_idx = (idx + 1) % n
            return k
        return None

    def _least_backed_off_key(self) -> _KeyState:
        return min(self._keys, key=lambda k: k.backoff_until_ts)

    @staticmethod
    def _wait_for_backoff(key: _KeyState) -> None:
        wait = key.backoff_until_ts - time.time()
        if wait > 0:
            time.sleep(wait)

    @staticmethod
    def _record_success(key: _KeyState) -> None:
        key.total_successes += 1
        key.consecutive_failures = 0
        key.backoff_until_ts = 0.0
        key.circuit_broken = False
        key.last_error = None

    @staticmethod
    def _record_failure(key: _KeyState, err: BaseException) -> None:
        key.total_failures += 1
        key.consecutive_failures += 1
        key.last_error = f"{type(err).__name__}: {err}"
        backoff = min(
            BASE_BACKOFF_S * (BACKOFF_MULTIPLIER ** (key.consecutive_failures - 1)),
            MAX_BACKOFF_S,
        )
        key.backoff_until_ts = time.time() + backoff
        if key.consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD:
            key.circuit_broken = True

    @staticmethod
    def _is_retryable(err: BaseException) -> bool:
        if isinstance(err, (RateLimitError, APIConnectionError, InternalServerError)):
            return True
        # overloaded_error (529) and other transient 5xx
        status = getattr(err, "status_code", None)
        if status in (503, 529):
            return True
        err_type = getattr(err, "type", None)
        if err_type == "overloaded_error":
            return True
        return False


class _MessagesShim:
    """Mirrors `client.messages.create(...)` shape."""

    def __init__(self, parent: ResilientAnthropicClient) -> None:
        self._parent = parent

    def create(self, **params: Any) -> Any:
        return self._parent._create_message(**params)

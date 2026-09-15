from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request, status


@dataclass
class _RateLimitBucket:
    timestamps: deque[float]
    last_seen_at: float


_buckets: dict[tuple[str, str], _RateLimitBucket] = {}
_lock = Lock()
_MAX_BUCKETS = 10_000


def enforce_rate_limit(
    request: Request,
    *,
    scope: str,
    max_requests: int,
    window_seconds: int,
    actor_id: str | None = None,
) -> None:
    """Apply a small in-process safety limit.

    A reverse proxy or shared store should enforce the same policy in a
    multi-worker production deployment. This guard still prevents accidental
    bursts and single-process abuse when the API is run directly.
    """

    now = monotonic()
    identifier = actor_id or _client_identifier(request)
    bucket_key = (scope, identifier)

    with _lock:
        bucket = _buckets.setdefault(
            bucket_key,
            _RateLimitBucket(timestamps=deque(), last_seen_at=now),
        )
        cutoff = now - window_seconds
        while bucket.timestamps and bucket.timestamps[0] <= cutoff:
            bucket.timestamps.popleft()

        if len(bucket.timestamps) >= max_requests:
            retry_after = max(1, int(window_seconds - (now - bucket.timestamps[0])))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
                headers={"Retry-After": str(retry_after)},
            )

        bucket.timestamps.append(now)
        bucket.last_seen_at = now
        if len(_buckets) > _MAX_BUCKETS:
            _prune_stale_buckets(now, window_seconds)


def _client_identifier(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _prune_stale_buckets(now: float, window_seconds: int) -> None:
    stale_before = now - max(window_seconds, 60)
    stale_keys = [
        key for key, bucket in _buckets.items() if bucket.last_seen_at < stale_before
    ]
    for key in stale_keys:
        _buckets.pop(key, None)


def reset_rate_limits_for_tests() -> None:
    with _lock:
        _buckets.clear()

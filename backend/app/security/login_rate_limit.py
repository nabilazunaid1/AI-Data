"""
AI Data Guardian 3.0
Development login rate limiter.

Tracks failed authentication attempts per identifier.
In-memory only: not suitable for multi-worker production.
"""

import threading
import time
from collections import deque
from typing import Callable


class LoginRateLimiter:
    def __init__(
        self,
        max_attempts: int = 5,
        window_seconds: int = 300,
        clock: Callable[[], float] | None = None,
    ):
        if max_attempts <= 0 or window_seconds <= 0:
            raise ValueError("Invalid rate limit configuration")

        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.clock = clock or time.monotonic

        self._attempts: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, identifier: str, now: float):
        attempts = self._attempts.get(identifier)

        if attempts is None:
            return

        cutoff = now - self.window_seconds

        while attempts and attempts[0] <= cutoff:
            attempts.popleft()

        if not attempts:
            self._attempts.pop(identifier, None)

    def is_allowed(self, identifier: str) -> bool:
        if not identifier:
            return False

        now = self.clock()

        with self._lock:
            self._prune(identifier, now)

            attempts = self._attempts.get(identifier)

            return (
                attempts is None
                or len(attempts) < self.max_attempts
            )

    def record_failure(self, identifier: str) -> None:
        if not identifier:
            return

        now = self.clock()

        with self._lock:
            self._prune(identifier, now)

            self._attempts.setdefault(
                identifier,
                deque(),
            ).append(now)

    def reset(self, identifier: str) -> None:
        with self._lock:
            self._attempts.pop(identifier, None)


login_rate_limiter = LoginRateLimiter()

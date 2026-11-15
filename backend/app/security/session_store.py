"""
AI Data Guardian 3.0
Backend-managed session foundation.

Development prototype:
- Cryptographically random session credentials
- Only session hashes are stored
- Server-side role association
- Session expiration and revocation
- CSRF token generation and verification

Sessions currently exist in process memory only.
This module is not yet connected to API routes.
"""

import hashlib
import hmac
import secrets
import threading
import time

from dataclasses import dataclass
from typing import Callable

from app.security.auth import Role


SESSION_TTL_SECONDS = 30 * 60


@dataclass(frozen=True)
class SessionIdentity:
    user_id: str
    role: Role


@dataclass
class SessionRecord:
    identity: SessionIdentity
    csrf_hash: str
    expires_at: float


class SessionStore:

    def __init__(
        self,
        ttl_seconds: int = SESSION_TTL_SECONDS,
        clock: Callable[[], float] | None = None,
    ):
        if ttl_seconds <= 0:
            raise ValueError(
                "Session lifetime must be positive"
            )

        self.ttl_seconds = ttl_seconds
        self.clock = clock or time.monotonic
        self._sessions: dict[str, SessionRecord] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(
            value.encode("utf-8")
        ).hexdigest()

    def create(
        self,
        user_id: str,
        role: Role,
    ) -> tuple[str, str]:

        if not user_id or not user_id.strip():
            raise ValueError("User identity is required")

        if role not in ("reader", "operator", "admin"):
            raise ValueError("Invalid role")

        session_token = secrets.token_urlsafe(48)
        csrf_token = secrets.token_urlsafe(32)

        session_hash = self._hash(session_token)

        record = SessionRecord(
            identity=SessionIdentity(
                user_id=user_id,
                role=role,
            ),
            csrf_hash=self._hash(csrf_token),
            expires_at=self.clock() + self.ttl_seconds,
        )

        with self._lock:
            self._sessions[session_hash] = record

        return session_token, csrf_token

    def get(
        self,
        session_token: str | None,
    ) -> SessionIdentity | None:

        if not session_token:
            return None

        session_hash = self._hash(session_token)

        with self._lock:
            record = self._sessions.get(session_hash)

            if record is None:
                return None

            if self.clock() >= record.expires_at:
                self._sessions.pop(session_hash, None)
                return None

            return record.identity

    def verify_csrf(
        self,
        session_token: str | None,
        csrf_token: str | None,
    ) -> bool:

        if not session_token or not csrf_token:
            return False

        session_hash = self._hash(session_token)

        with self._lock:
            record = self._sessions.get(session_hash)

            if record is None:
                return False

            if self.clock() >= record.expires_at:
                self._sessions.pop(session_hash, None)
                return False

            expected_hash = record.csrf_hash

        return hmac.compare_digest(
            self._hash(csrf_token),
            expected_hash,
        )

    def revoke(self, session_token: str | None) -> None:

        if not session_token:
            return

        session_hash = self._hash(session_token)

        with self._lock:
            self._sessions.pop(session_hash, None)


session_store = SessionStore()

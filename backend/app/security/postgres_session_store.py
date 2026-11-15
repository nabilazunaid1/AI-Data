"""
AI Data Guardian 3.0
Persistent PostgreSQL browser session store.

Uses the existing guardian_auth schema and a dedicated
authentication database connection.

Session tokens and CSRF tokens are never stored in plaintext.
"""

import hashlib
import hmac
import secrets

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import psycopg

from app.security.auth_db_config import auth_database_config


SESSION_TTL_SECONDS = 30 * 60


@dataclass(frozen=True)
class PersistentSessionIdentity:
    user_id: int
    username: str
    role: str


class PostgreSQLSessionStore:

    def __init__(self, ttl_seconds=SESSION_TTL_SECONDS):
        if ttl_seconds <= 0:
            raise ValueError("Session TTL must be positive")

        self.ttl_seconds = ttl_seconds

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(
            value.encode("utf-8")
        ).hexdigest()

    @staticmethod
    def _connect():
        return psycopg.connect(
            **auth_database_config()
        )

    def create(self, user_id: int):
        session_token = secrets.token_urlsafe(48)
        csrf_token = secrets.token_urlsafe(32)

        session_hash = self._hash(session_token)
        csrf_hash = self._hash(csrf_token)

        created_at = datetime.now(timezone.utc)
        expires_at = created_at + timedelta(
            seconds=self.ttl_seconds
        )

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO guardian_auth.guardian_sessions (
                        user_id,
                        session_hash,
                        csrf_hash,
                        created_at,
                        expires_at
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        user_id,
                        session_hash,
                        csrf_hash,
                        created_at,
                        expires_at,
                    ),
                )

        return session_token, csrf_token

    def get(self, session_token: str | None):
        if not session_token:
            return None

        session_hash = self._hash(session_token)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        u.user_id,
                        u.username,
                        u.role
                    FROM guardian_auth.guardian_sessions s
                    JOIN guardian_auth.guardian_users u
                        ON u.user_id = s.user_id
                    WHERE s.session_hash = %s
                      AND s.revoked_at IS NULL
                      AND s.expires_at > NOW()
                      AND u.is_active = TRUE
                    LIMIT 1
                    """,
                    (session_hash,),
                )

                record = cur.fetchone()

        if record is None:
            return None

        return PersistentSessionIdentity(
            user_id=record[0],
            username=record[1],
            role=record[2],
        )

    def verify_csrf(
        self,
        session_token: str | None,
        csrf_token: str | None,
    ) -> bool:
        if not session_token or not csrf_token:
            return False

        session_hash = self._hash(session_token)
        supplied_csrf_hash = self._hash(csrf_token)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT s.csrf_hash
                    FROM guardian_auth.guardian_sessions s
                    JOIN guardian_auth.guardian_users u
                        ON u.user_id = s.user_id
                    WHERE s.session_hash = %s
                      AND s.revoked_at IS NULL
                      AND s.expires_at > NOW()
                      AND u.is_active = TRUE
                    LIMIT 1
                    """,
                    (session_hash,),
                )

                record = cur.fetchone()

        if record is None:
            return False

        return hmac.compare_digest(
            record[0],
            supplied_csrf_hash,
        )

    def revoke(self, session_token: str | None):
        if not session_token:
            return

        session_hash = self._hash(session_token)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE guardian_auth.guardian_sessions
                    SET revoked_at = NOW()
                    WHERE session_hash = %s
                      AND revoked_at IS NULL
                    """,
                    (session_hash,),
                )


postgres_session_store = PostgreSQLSessionStore()

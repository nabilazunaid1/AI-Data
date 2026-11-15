"""
AI Data Guardian 3.0
PostgreSQL authentication repository.

Provides read-only account lookup and authentication
database connectivity.

Session persistence will be implemented separately.
"""

import psycopg
from psycopg.rows import dict_row

from app.security.auth_db_config import auth_database_config
from app.security.password_security import verify_password


class PostgreSQLAuthRepository:

    def __init__(self, connection_factory=None):
        self.connection_factory = (
            connection_factory or self._connect
        )

    @staticmethod
    def _connect():
        return psycopg.connect(
            **auth_database_config(),
            row_factory=dict_row,
        )

    def get_user(self, username: str):
        if not isinstance(username, str):
            return None

        normalized = username.strip().lower()

        if not normalized:
            return None

        with self.connection_factory() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        user_id,
                        username,
                        password_hash,
                        role,
                        is_active
                    FROM guardian_auth.guardian_users
                    WHERE username = %s
                    LIMIT 1
                    """,
                    (normalized,),
                )

                return cur.fetchone()

    def authenticate(self, username: str, password: str):
        account = self.get_user(username)

        if account is None:
            return None

        if not account["is_active"]:
            return None

        if not verify_password(
            password,
            account["password_hash"],
        ):
            return None

        return {
            "user_id": account["user_id"],
            "username": account["username"],
            "role": account["role"],
        }


auth_repository = PostgreSQLAuthRepository()

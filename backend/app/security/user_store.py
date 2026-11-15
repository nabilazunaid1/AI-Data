"""
AI Data Guardian 3.0
Local user account registry.

Development prototype only:
- Store password hashes, never plaintext passwords
- Assign reader, operator, or admin roles
- Reject duplicate usernames
- Verify credentials
- No public self-registration

Accounts are stored in process memory and will not
survive a FastAPI restart.
"""

import threading
from dataclasses import dataclass

from app.security.auth import Role
from app.security.password_security import (
    hash_password,
    verify_password,
)

@dataclass(frozen=True)
class UserAccount:
    username: str
    password_hash: str
    role: Role

class UserStore:

    def __init__(self):
        self._users: dict[str, UserAccount] = {}
        self._lock = threading.Lock()

    @staticmethod
    def normalize_username(username: str) -> str:
        if not isinstance(username, str):
            raise ValueError("Username must be a string")

        normalized = username.strip().lower()

        if not normalized:
            raise ValueError("Username is required")

        if len(normalized) > 100:
            raise ValueError("Username is too long")

        return normalized

    def create_user(
        self,
        username: str,
        password: str,
        role: Role,
    ) -> UserAccount:

        normalized = self.normalize_username(username)

        if role not in ("reader", "operator", "admin"):
            raise ValueError("Invalid application role")

        with self._lock:
            if normalized in self._users:
                raise ValueError("User already exists")

            password_hash = hash_password(password)

            account = UserAccount(
                username=normalized,
                password_hash=password_hash,
                role=role,
            )

            self._users[normalized] = account

        return account

    def authenticate(
        self,
        username: str,
        password: str,
    ) -> UserAccount | None:

        try:
            normalized = self.normalize_username(username)
        except ValueError:
            return None

        with self._lock:
            account = self._users.get(normalized)

        if account is None:
            return None

        if not verify_password(
            password,
            account.password_hash,
        ):
            return None

        return account

    def get_user(
        self,
        username: str,
    ) -> UserAccount | None:

        normalized = self.normalize_username(username)

        with self._lock:
            return self._users.get(normalized)

user_store = UserStore()

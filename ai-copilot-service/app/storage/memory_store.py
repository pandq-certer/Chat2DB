import time
import threading
from typing import Any

from app.core.config import settings


class MemoryStore:
    """Simple in-memory key-value store with TTL expiration."""

    def __init__(self, ttl_seconds: int | None = None):
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds or settings.session_ttl_seconds

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, timestamp = entry
            if time.time() - timestamp > self._ttl:
                del self._store[key]
                return None
            return value

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = (value, time.time())

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def cleanup(self) -> int:
        now = time.time()
        expired = []
        with self._lock:
            for key, (_, ts) in self._store.items():
                if now - ts > self._ttl:
                    expired.append(key)
            for key in expired:
                del self._store[key]
        return len(expired)


# Global session store
session_store = MemoryStore()

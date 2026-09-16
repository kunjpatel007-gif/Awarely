"""Redis-primary, in-memory-LRU-fallback cache service with TTL support."""


import json
import logging
import os
import time
from collections import OrderedDict
from threading import Lock
from typing import Any, Optional, Dict

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


class InMemoryLRUCache:
    """Thread-safe in-memory LRU cache with TTL support."""
    def __init__(self, capacity: int = 1000):
        self.capacity = capacity
        self._cache: OrderedDict[str, Any] = OrderedDict()
        self._expirations: Dict[str, float] = {}
        self._lock = Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None
            
            if key in self._expirations and time.time() > self._expirations[key]:
                del self._cache[key]
                del self._expirations[key]
                return None

            self._cache.move_to_end(key)
            return self._cache[key]

    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = value
            self._expirations[key] = time.time() + ttl

            if len(self._cache) > self.capacity:
                oldest_key, _ = self._cache.popitem(last=False)
                self._expirations.pop(oldest_key, None)
            return True

    def delete(self, key: str) -> bool:
        with self._lock:
            popped = self._cache.pop(key, None)
            self._expirations.pop(key, None)
            return popped is not None


class CacheService:
    def __init__(self):
        self._redis_client = None
        self._memory_cache = InMemoryLRUCache()
        self._mode = "in-memory"
        self._init_redis()

    def _init_redis(self):
        try:
            import redis
            client = redis.from_url(REDIS_URL, socket_timeout=1.0, socket_connect_timeout=1.0)
            client.ping()
            self._redis_client = client
            self._mode = "redis"
            logger.info(f"Connected to Redis at {REDIS_URL}")
        except Exception as e:
            self._mode = "in-memory-fallback"
            logger.info(f"Redis unavailable ({e}). Active cache mode: Thread-safe in-memory LRU.")

    def get(self, key: str) -> Optional[Any]:
        if self._redis_client:
            try:
                val = self._redis_client.get(key)
                if val:
                    return json.loads(val)
                return None
            except Exception as e:
                logger.warning(f"Redis read error: {e}. Falling back to memory cache.")
        return self._memory_cache.get(key)

    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        if self._redis_client:
            try:
                serialized = json.dumps(value)
                self._redis_client.setex(key, ttl, serialized)
                return True
            except Exception as e:
                logger.warning(f"Redis write error: {e}. Writing to memory cache.")
        return self._memory_cache.set(key, value, ttl=ttl)

    def delete(self, key: str) -> bool:
        if self._redis_client:
            try:
                self._redis_client.delete(key)
            except Exception:
                pass
        return self._memory_cache.delete(key)

    def clear(self) -> None:
        if self._redis_client:
            try:
                self._redis_client.flushdb()
            except Exception:
                pass
        with self._memory_cache._lock:
            self._memory_cache._cache.clear()
            self._memory_cache._expirations.clear()

    def status(self) -> Dict[str, Any]:
        return {
            "mode": self._mode,
            "redis_url": REDIS_URL if self._mode == "redis" else None,
            "healthy": True
        }


cache = CacheService()

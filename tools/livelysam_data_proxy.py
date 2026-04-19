#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import defaultdict, deque
import json
import os
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from data_proxy_core import DataProxyService, ProxyServiceError


DEFAULT_PORT = 58673
DEFAULT_RATE_LIMITS = {
    "neis_school_search": (120, 600),
    "neis_meals_week": (240, 600),
    "neis_schedule_month": (240, 600),
    "neis_timetable_week": (240, 600),
    "weather_geocode": (90, 600),
    "weather_bundle": (180, 600),
}


def resolve_data_root() -> Path:
    explicit = str(os.environ.get("LIVELYSAM_DATA_PROXY_DATA_ROOT") or "").strip()
    if explicit:
        return Path(explicit)
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        return Path(local_appdata) / "LivelySam" / "user-data"
    return Path(tempfile.gettempdir()) / "livelysam-data-proxy"


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        if limit <= 0 or window_seconds <= 0:
            return True

        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                return False
            events.append(now)
            return True


def build_rate_limits() -> dict[str, tuple[int, int]]:
    result = {}
    for key, (limit, window_seconds) in DEFAULT_RATE_LIMITS.items():
        env_name = f"LIVELYSAM_PROXY_LIMIT_{key.upper()}"
        raw = str(os.environ.get(env_name) or "").strip()
        parsed_limit = limit
        if raw:
            try:
                parsed_limit = max(0, int(raw))
            except ValueError:
                parsed_limit = limit
        result[key] = (parsed_limit, window_seconds)
    return result


class LivelySamDataProxyHandler(BaseHTTPRequestHandler):
    server_version = "LivelySamDataProxy/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query or "")
        service = self.server.data_proxy  # type: ignore[attr-defined]

        try:
            if path == "/health":
                self._send_json(200, service.health_snapshot())
                return
            if path == "/api/health":
                self._send_json(200, service.health_snapshot())
                return
            if path == "/api/neis/school-search":
                self._enforce_rate_limit("neis_school_search")
                self._send_json(200, {"ok": True, "schools": service.search_school(self._get_query_value(query, "name"))})
                return
            if path == "/api/neis/meals/week":
                self._enforce_rate_limit("neis_meals_week")
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "meals": service.get_week_meals(
                            self._get_query_value(query, "atptCode"),
                            self._get_query_value(query, "schoolCode"),
                            self._get_query_value(query, "startDate"),
                        ),
                    },
                )
                return
            if path == "/api/neis/schedule/month":
                self._enforce_rate_limit("neis_schedule_month")
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "schedule": service.get_schedule_month(
                            self._get_query_value(query, "atptCode"),
                            self._get_query_value(query, "schoolCode"),
                            self._get_query_value(query, "year"),
                            self._get_query_value(query, "month"),
                        ),
                    },
                )
                return
            if path == "/api/neis/timetable/week":
                self._enforce_rate_limit("neis_timetable_week")
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "timetable": service.get_week_timetable(
                            self._get_query_value(query, "atptCode"),
                            self._get_query_value(query, "schoolCode"),
                            self._get_query_value(query, "grade"),
                            self._get_query_value(query, "classNum"),
                            self._get_query_value(query, "startDate"),
                        ),
                    },
                )
                return
            if path == "/api/weather/geocode":
                self._enforce_rate_limit("weather_geocode")
                self._send_json(200, {"ok": True, "location": service.geocode(self._get_query_value(query, "address"))})
                return
            if path == "/api/weather/bundle":
                self._enforce_rate_limit("weather_bundle")
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "bundle": service.get_weather_bundle(
                            self._get_query_value(query, "lat"),
                            self._get_query_value(query, "lon"),
                        ),
                    },
                )
                return
        except ProxyServiceError as exc:
            self._send_json(exc.status, {"ok": False, "error": str(exc), "code": exc.code, "detail": exc.detail})
            return
        except Exception as exc:
            self._send_json(
                500,
                {
                    "ok": False,
                    "error": "데이터 프록시 처리 중 알 수 없는 오류가 발생했습니다.",
                    "code": "proxy_internal_error",
                    "detail": str(exc),
                },
            )
            return

        self._send_json(404, {"ok": False, "error": "Not found"})

    def _get_query_value(self, query: dict[str, list[str]], key: str, fallback: str = "") -> str:
        values = query.get(key) or [fallback]
        return str(values[0]).strip()

    def _get_client_key(self) -> str:
        forwarded = str(self.headers.get("X-Forwarded-For") or "").strip()
        if forwarded:
            return forwarded.split(",")[0].strip() or "unknown"
        return str(self.client_address[0] or "unknown").strip() or "unknown"

    def _enforce_rate_limit(self, bucket: str) -> None:
        rate_limits = getattr(self.server, "rate_limits", {})  # type: ignore[attr-defined]
        limit, window_seconds = rate_limits.get(bucket, (0, 0))
        limiter = getattr(self.server, "rate_limiter", None)  # type: ignore[attr-defined]
        if not limiter:
            return

        client_key = f"{bucket}:{self._get_client_key()}"
        if limiter.allow(client_key, int(limit), int(window_seconds)):
            return

        raise ProxyServiceError(
            429,
            "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
            code="rate_limited",
            detail=f"{bucket}:{limit}/{window_seconds}s",
        )

    def _send_json(self, status: int, payload: Any) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="LivelySam data proxy server")
    parser.add_argument(
        "--host",
        default=str(os.environ.get("LIVELYSAM_DATA_PROXY_HOST") or "127.0.0.1"),
        help="Bind host",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT") or os.environ.get("LIVELYSAM_DATA_PROXY_PORT") or DEFAULT_PORT),
        help="Bind port",
    )
    parser.add_argument(
        "--data-root",
        default=str(resolve_data_root()),
        help="Directory for cache and optional config files",
    )
    return parser


def main() -> None:
    args = build_argument_parser().parse_args()
    data_root = Path(args.data_root).expanduser().resolve()
    data_root.mkdir(parents=True, exist_ok=True)
    server = ReusableThreadingHTTPServer((args.host, args.port), LivelySamDataProxyHandler)
    server.data_proxy = DataProxyService(data_root)  # type: ignore[attr-defined]
    server.rate_limiter = SlidingWindowRateLimiter()  # type: ignore[attr-defined]
    server.rate_limits = build_rate_limits()  # type: ignore[attr-defined]

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

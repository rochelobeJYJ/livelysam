#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify the public LivelySam data proxy.")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument("--school-name", default="명호고등학교")
    parser.add_argument("--weather-lat", type=float, default=37.5665)
    parser.add_argument("--weather-lon", type=float, default=126.9780)
    parser.add_argument("--skip-school-search", action="store_true")
    parser.add_argument("--skip-weather-bundle", action="store_true")
    return parser.parse_args()


def text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    normalized = str(value).strip()
    return normalized or fallback


def read_version_info(root: Path) -> dict[str, Any]:
    version_path = root / "version.json"
    return json.loads(version_path.read_text(encoding="utf-8"))


def create_opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def fetch_json(opener: urllib.request.OpenerDirector, base_url: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {key: value for key, value in (params or {}).items() if value is not None and str(value).strip() != ""},
        doseq=True,
    )
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    if query:
        url = f"{url}?{query}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with opener.open(request, timeout=20) as response:
            body = response.read().decode("utf-8")
            payload = json.loads(body)
            return {
                "ok": 200 <= response.status < 300,
                "status": int(response.status),
                "url": url,
                "payload": payload,
                "raw": body,
            }
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(body)
        except Exception:
            payload = None
        return {
            "ok": False,
            "status": int(exc.code),
            "url": url,
            "payload": payload,
            "raw": body,
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": 0,
            "url": url,
            "payload": None,
            "raw": str(exc),
        }


def add_check(checks: list[dict[str, Any]], name: str, passed: bool, detail: str, data: dict[str, Any]) -> None:
    checks.append(
        {
            "name": name,
            "passed": bool(passed),
            "detail": detail,
            "data": data,
        }
    )


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    version_info = read_version_info(root)
    proxy_base_url = text(version_info.get("proxyBaseUrl")).rstrip("/")
    if not proxy_base_url:
        raise RuntimeError("proxyBaseUrl is not configured in version.json.")

    opener = create_opener()
    checks: list[dict[str, Any]] = []

    health = fetch_json(opener, proxy_base_url, "api/health")
    health_payload = health.get("payload") if isinstance(health.get("payload"), dict) else {}
    configured = health_payload.get("configured") if isinstance(health_payload, dict) else {}
    neis_configured = bool(configured.get("neis")) if isinstance(configured, dict) else False
    weather_configured = bool(configured.get("weather")) if isinstance(configured, dict) else False
    if not health["ok"]:
        health_detail = "Health endpoint failed."
    elif not neis_configured or not weather_configured:
        health_detail = "Health endpoint responded, but proxy keys are not fully configured."
    else:
        health_detail = "Health endpoint responded and both proxy keys are configured."
    add_check(checks, "health", bool(health["ok"] and neis_configured and weather_configured), health_detail, health)

    if not args.skip_school_search:
        school = fetch_json(opener, proxy_base_url, "api/neis/school-search", {"name": args.school_name})
        school_payload = school.get("payload") if isinstance(school.get("payload"), dict) else {}
        schools = school_payload.get("schools") if isinstance(school_payload, dict) else []
        schools = schools if isinstance(schools, list) else []
        if not school["ok"]:
            school_detail = "School search failed."
        elif not schools:
            school_detail = "School search returned no results."
        else:
            school_detail = "School search returned at least one result."
        add_check(
            checks,
            "school-search",
            bool(school["ok"] and schools),
            school_detail,
            {
                "status": school["status"],
                "url": school["url"],
                "code": text(school_payload.get("code")),
                "error": text(school_payload.get("error")),
                "detail": text(school_payload.get("detail")),
                "count": len(schools),
                "first": schools[0] if schools else None,
            },
        )

    if not args.skip_weather_bundle:
        weather = fetch_json(
            opener,
            proxy_base_url,
            "api/weather/bundle",
            {
                "lat": args.weather_lat,
                "lon": args.weather_lon,
            },
        )
        weather_payload = weather.get("payload") if isinstance(weather.get("payload"), dict) else {}
        bundle = weather_payload.get("bundle") if isinstance(weather_payload, dict) else {}
        current = bundle.get("weather") if isinstance(bundle, dict) else {}
        if not weather["ok"]:
            weather_detail = "Weather bundle failed."
        elif not isinstance(current, dict) or not current:
            weather_detail = "Weather bundle responded without current weather."
        else:
            weather_detail = "Weather bundle returned current weather."
        add_check(
            checks,
            "weather-bundle",
            bool(weather["ok"] and isinstance(current, dict) and current),
            weather_detail,
            {
                "status": weather["status"],
                "url": weather["url"],
                "code": text(weather_payload.get("code")),
                "error": text(weather_payload.get("error")),
                "detail": text(weather_payload.get("detail")),
                "cityName": text(current.get("cityName")) if isinstance(current, dict) else "",
                "description": text(current.get("description")) if isinstance(current, dict) else "",
                "updatedAt": current.get("updatedAt") if isinstance(current, dict) else None,
            },
        )

    failed = any(not item.get("passed") for item in checks)
    summary = {
        "status": "failed" if failed else "passed",
        "checkedAt": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "proxyBaseUrl": proxy_base_url,
        "checks": checks,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

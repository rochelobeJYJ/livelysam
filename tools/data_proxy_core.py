#!/usr/bin/env python3
from __future__ import annotations

import calendar
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


NEIS_BASE_URL = "https://open.neis.go.kr/hub"
OWM_WEATHER_BASE = "https://api.openweathermap.org/data/2.5"
OWM_GEO_BASE = "https://api.openweathermap.org/geo/1.0"

CACHE_VERSION = 1

SCHOOL_SEARCH_TTL = 24 * 60 * 60
MEALS_WEEK_TTL = 6 * 60 * 60
SCHEDULE_MONTH_TTL = 6 * 60 * 60
TIMETABLE_WEEK_TTL = 60 * 60
WEATHER_GEOCODE_TTL = 30 * 24 * 60 * 60
WEATHER_BUNDLE_TTL = 30 * 60
KST = timezone(timedelta(hours=9))


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_ms() -> int:
    return int(time.time() * 1000)


def text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    normalized = str(value).strip()
    return normalized or fallback


def clone_json(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def parse_compact_date(value: Any, field_name: str) -> date:
    raw = text(value)
    if len(raw) != 8 or not raw.isdigit():
        raise ProxyServiceError(400, f"{field_name} 값이 올바르지 않습니다.", code="invalid_date")
    return date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))


def to_compact_date(value: date) -> str:
    return value.strftime("%Y%m%d")


def read_json_file(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return None


def write_json_file(path: Path, payload: Any) -> bool:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(f"{path.suffix}.tmp")
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temp_path, path)
        return True
    except Exception:
        return False


def extract_service_keys_from_shared_snapshot(raw: Any) -> dict[str, str]:
    values = raw.get("values") if isinstance(raw, dict) else None
    config = values.get("config") if isinstance(values, dict) else None
    if not isinstance(config, dict):
        return {
            "neisApiKey": "",
            "weatherApiKey": "",
        }

    return {
        "neisApiKey": text(config.get("neisApiKey")),
        "weatherApiKey": text(config.get("weatherApiKey")),
    }


class ProxyServiceError(RuntimeError):
    def __init__(self, status: int, message: str, *, code: str = "proxy_error", detail: str = "") -> None:
        super().__init__(message)
        self.status = int(status)
        self.code = code
        self.detail = text(detail)


class FileTTLCache:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._loaded = False
        self._state: dict[str, Any] = {
            "version": CACHE_VERSION,
            "updatedAt": utc_now_iso(),
            "entries": {},
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _load_locked(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        if not self.path.exists():
            return

        raw = read_json_file(self.path)
        if not isinstance(raw, dict):
            return
        if not isinstance(raw.get("entries"), dict):
            return
        self._state = {
            "version": CACHE_VERSION,
            "updatedAt": text(raw.get("updatedAt"), utc_now_iso()),
            "entries": raw.get("entries", {}),
        }

    def _save_locked(self) -> None:
        self._state["updatedAt"] = utc_now_iso()
        temp_path = self.path.with_suffix(".tmp")
        temp_path.write_text(
            json.dumps(self._state, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temp_path, self.path)

    def get(self, bucket: str, key: str) -> Any:
        with self._lock:
            self._load_locked()
            bucket_entries = self._state["entries"].get(bucket, {})
            entry = bucket_entries.get(key)
            if not isinstance(entry, dict):
                return None

            expires_at = float(entry.get("expiresAt") or 0)
            if expires_at <= time.time():
                try:
                    del bucket_entries[key]
                    self._save_locked()
                except Exception:
                    pass
                return None

            return clone_json(entry.get("value"))

    def set(self, bucket: str, key: str, value: Any, ttl_seconds: int) -> Any:
        with self._lock:
            self._load_locked()
            entries = self._state["entries"].setdefault(bucket, {})
            entries[key] = {
                "value": clone_json(value),
                "updatedAt": utc_now_iso(),
                "expiresAt": time.time() + max(1, int(ttl_seconds)),
            }
            self._save_locked()
            return clone_json(value)


class DataProxyService:
    def __init__(self, data_root: Path) -> None:
        self.data_root = data_root
        self.cache = FileTTLCache(data_root / "data-proxy-cache.json")
        self._config = self._load_service_config()

    def _read_bootstrap_config(self) -> dict[str, str]:
        snapshot = read_json_file(self.data_root / "shared-storage.json")
        return extract_service_keys_from_shared_snapshot(snapshot)

    def _persist_service_config(self, config: dict[str, str]) -> None:
        next_config = {
            "neisApiKey": text(config.get("neisApiKey")),
            "weatherApiKey": text(config.get("weatherApiKey")),
        }
        if not next_config["neisApiKey"] and not next_config["weatherApiKey"]:
            return
        write_json_file(self.data_root / "service-keys.json", next_config)

    def _load_service_config(self) -> dict[str, str]:
        config_path = text(os.environ.get("LIVELYSAM_DATA_PROXY_CONFIG"))
        service_keys_path = self.data_root / "service-keys.json"
        candidates = []
        if config_path:
            candidates.append(Path(config_path))
        candidates.append(service_keys_path)

        file_config: dict[str, Any] = {}
        for candidate in candidates:
            raw = read_json_file(candidate)
            if isinstance(raw, dict):
                file_config = raw
                break

        bootstrap_config = self._read_bootstrap_config()
        merged_file_config = {
            "neisApiKey": text(
                file_config.get("neisApiKey")
                or file_config.get("LIVELYSAM_NEIS_API_KEY")
            ),
            "weatherApiKey": text(
                file_config.get("weatherApiKey")
                or file_config.get("LIVELYSAM_WEATHER_API_KEY")
            ),
        }

        # Recover the proxy key file from the user's existing local config.
        # This fixes updated installs where the bridge switched to proxy mode
        # before the dedicated service-keys file had been provisioned.
        recovered_config = {
            "neisApiKey": merged_file_config["neisApiKey"] or text(bootstrap_config.get("neisApiKey")),
            "weatherApiKey": merged_file_config["weatherApiKey"] or text(bootstrap_config.get("weatherApiKey")),
        }
        if recovered_config != merged_file_config:
            self._persist_service_config(recovered_config)

        return {
            "neisApiKey": text(
                os.environ.get("LIVELYSAM_NEIS_API_KEY")
                or recovered_config.get("neisApiKey")
            ),
            "weatherApiKey": text(
                os.environ.get("LIVELYSAM_WEATHER_API_KEY")
                or recovered_config.get("weatherApiKey")
            ),
        }

    def health_snapshot(self) -> dict[str, Any]:
        return {
            "ok": True,
            "configured": {
                "neis": bool(self._config.get("neisApiKey")),
                "weather": bool(self._config.get("weatherApiKey")),
            },
            "cachePath": str(self.cache.path),
            "updatedAt": utc_now_iso(),
        }

    def _require_key(self, name: str) -> str:
        if name == "neis":
            key = text(self._config.get("neisApiKey"))
            if not key:
                raise ProxyServiceError(
                    503,
                    "기본 학교 서버가 아직 준비되지 않았습니다. 운영자가 NEIS 서비스 키를 설정해야 합니다.",
                    code="neis_key_missing",
                )
            return key

        key = text(self._config.get("weatherApiKey"))
        if not key:
            raise ProxyServiceError(
                503,
                "기본 날씨 서버가 아직 준비되지 않았습니다. 운영자가 날씨 서비스 키를 설정해야 합니다.",
                code="weather_key_missing",
            )
        return key

    def _fetch_json(self, url: str) -> Any:
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "LivelySamDataProxy/1.0",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = ""
            try:
                body = exc.read(4096).decode("utf-8", errors="ignore")
            except Exception:
                body = ""
            raise ProxyServiceError(
                502,
                f"외부 데이터 서버가 {exc.code} 응답을 반환했습니다.",
                code="upstream_http_error",
                detail=body,
            ) from exc
        except urllib.error.URLError as exc:
            raise ProxyServiceError(
                502,
                "외부 데이터 서버에 연결하지 못했습니다.",
                code="upstream_unreachable",
                detail=text(getattr(exc, "reason", exc)),
            ) from exc
        except json.JSONDecodeError as exc:
            raise ProxyServiceError(
                502,
                "외부 데이터 서버 응답을 해석하지 못했습니다.",
                code="upstream_invalid_json",
            ) from exc

    def _remember(self, bucket: str, key: str, ttl_seconds: int, producer) -> Any:
        cached = self.cache.get(bucket, key)
        if cached is not None:
            return cached
        value = producer()
        return self.cache.set(bucket, key, value, ttl_seconds)

    def _fetch_neis(self, endpoint: str, params: dict[str, Any]) -> Any:
        query = {
            "KEY": self._require_key("neis"),
            "Type": "json",
            "pIndex": "1",
            "pSize": "100",
        }
        for key, value in (params or {}).items():
            if value is None or value == "":
                continue
            query[key] = str(value)
        url = f"{NEIS_BASE_URL}/{endpoint}?{urllib.parse.urlencode(query)}"
        return self._fetch_json(url)

    def _get_neis_result(self, payload: Any, root_name: str) -> dict[str, Any] | None:
        if isinstance(payload, dict) and isinstance(payload.get("RESULT"), dict):
            return payload.get("RESULT")

        section = payload.get(root_name) if isinstance(payload, dict) else None
        if not isinstance(section, list) or not section:
            return None
        head = section[0].get("head") if isinstance(section[0], dict) else None
        if not isinstance(head, list):
            return None
        for item in head:
            if isinstance(item, dict) and isinstance(item.get("RESULT"), dict):
                return item.get("RESULT")
        return None

    def _check_neis_error(self, payload: Any, root_name: str) -> None:
        result = self._get_neis_result(payload, root_name)
        if not isinstance(result, dict):
            return
        code = text(result.get("CODE"))
        if code and code != "INFO-000":
            raise ProxyServiceError(
                502,
                "학교 데이터 서버가 오류를 반환했습니다.",
                code=code,
                detail=text(result.get("MESSAGE")),
            )

    def search_school(self, school_name: Any) -> list[dict[str, Any]]:
        name = text(school_name)
        if not name:
            return []

        cache_key = name.replace(" ", "").lower()

        def producer() -> list[dict[str, Any]]:
            payload = self._fetch_neis("schoolInfo", {"SCHUL_NM": name})
            self._check_neis_error(payload, "schoolInfo")
            section = payload.get("schoolInfo") if isinstance(payload, dict) else None
            rows = section[1].get("row", []) if isinstance(section, list) and len(section) > 1 else []
            if not isinstance(rows, list):
                return []
            return [
                {
                    "name": text(row.get("SCHUL_NM")),
                    "atptCode": text(row.get("ATPT_OFCDC_SC_CODE")),
                    "schoolCode": text(row.get("SD_SCHUL_CODE")),
                    "address": text(row.get("ORG_RDNMA") or row.get("ORG_RDNDA")),
                    "schoolType": text(row.get("SCHUL_KND_SC_NM")),
                    "region": text(row.get("ATPT_OFCDC_SC_NM")),
                }
                for row in rows
                if isinstance(row, dict)
            ]

        return self._remember("school-search", cache_key, SCHOOL_SEARCH_TTL, producer)

    def get_week_meals(self, atpt_code: Any, school_code: Any, start_date: Any) -> list[dict[str, Any]]:
        atpt = text(atpt_code)
        school = text(school_code)
        monday = parse_compact_date(start_date, "startDate")
        friday = monday + timedelta(days=4)
        cache_key = f"{atpt}:{school}:{to_compact_date(monday)}"

        def producer() -> list[dict[str, Any]]:
            payload = self._fetch_neis(
                "mealServiceDietInfo",
                {
                    "ATPT_OFCDC_SC_CODE": atpt,
                    "SD_SCHUL_CODE": school,
                    "MLSV_FROM_YMD": to_compact_date(monday),
                    "MLSV_TO_YMD": to_compact_date(friday),
                },
            )
            self._check_neis_error(payload, "mealServiceDietInfo")
            section = payload.get("mealServiceDietInfo") if isinstance(payload, dict) else None
            rows = section[1].get("row", []) if isinstance(section, list) and len(section) > 1 else []
            if not isinstance(rows, list):
                return []
            return [
                {
                    "date": text(row.get("MLSV_YMD")),
                    "mealType": text(row.get("MMEAL_SC_NM")),
                    "menu": text(row.get("DDISH_NM")),
                    "calorie": text(row.get("CAL_INFO")),
                    "origin": text(row.get("ORPLC_INFO")),
                    "nutrient": text(row.get("NTR_INFO")),
                }
                for row in rows
                if isinstance(row, dict)
            ]

        return self._remember("meals-week", cache_key, MEALS_WEEK_TTL, producer)

    def get_schedule_month(self, atpt_code: Any, school_code: Any, year: Any, month: Any) -> list[dict[str, Any]]:
        atpt = text(atpt_code)
        school = text(school_code)
        year_num = int(text(year, "0"))
        month_num = int(text(month, "0"))
        if year_num <= 0 or month_num < 1 or month_num > 12:
            raise ProxyServiceError(400, "year 또는 month 값이 올바르지 않습니다.", code="invalid_month")
        last_day = calendar.monthrange(year_num, month_num)[1]
        date_from = f"{year_num}{month_num:02d}01"
        date_to = f"{year_num}{month_num:02d}{last_day:02d}"
        cache_key = f"{atpt}:{school}:{year_num:04d}{month_num:02d}"

        def producer() -> list[dict[str, Any]]:
            payload = self._fetch_neis(
                "SchoolSchedule",
                {
                    "ATPT_OFCDC_SC_CODE": atpt,
                    "SD_SCHUL_CODE": school,
                    "AA_FROM_YMD": date_from,
                    "AA_TO_YMD": date_to,
                },
            )
            self._check_neis_error(payload, "SchoolSchedule")
            section = payload.get("SchoolSchedule") if isinstance(payload, dict) else None
            rows = section[1].get("row", []) if isinstance(section, list) and len(section) > 1 else []
            if not isinstance(rows, list):
                return []
            return [
                {
                    "date": text(row.get("AA_YMD")),
                    "eventName": text(row.get("EVENT_NM")),
                    "eventContent": text(row.get("EVENT_CNTNT")),
                    "isOneDayYn": text(row.get("ONE_GRADE_EVENT_YN")),
                }
                for row in rows
                if isinstance(row, dict)
            ]

        return self._remember("schedule-month", cache_key, SCHEDULE_MONTH_TTL, producer)

    def get_week_timetable(
        self,
        atpt_code: Any,
        school_code: Any,
        grade: Any,
        class_num: Any,
        start_date: Any,
    ) -> dict[str, list[dict[str, Any]]]:
        atpt = text(atpt_code)
        school = text(school_code)
        monday = parse_compact_date(start_date, "startDate")
        friday = monday + timedelta(days=4)
        grade_value = text(grade)
        class_value = text(class_num)
        cache_key = f"{atpt}:{school}:{grade_value}:{class_value}:{to_compact_date(monday)}"

        def producer() -> dict[str, list[dict[str, Any]]]:
            payload = self._fetch_neis(
                "hisTimetable",
                {
                    "ATPT_OFCDC_SC_CODE": atpt,
                    "SD_SCHUL_CODE": school,
                    "GRADE": grade_value,
                    "CLASS_NM": class_value,
                    "TI_FROM_YMD": to_compact_date(monday),
                    "TI_TO_YMD": to_compact_date(friday),
                },
            )
            self._check_neis_error(payload, "hisTimetable")
            section = payload.get("hisTimetable") if isinstance(payload, dict) else None
            rows = section[1].get("row", []) if isinstance(section, list) and len(section) > 1 else []
            by_day: dict[str, list[dict[str, Any]]] = {}
            if not isinstance(rows, list):
                return by_day
            for row in rows:
                if not isinstance(row, dict):
                    continue
                day_key = text(row.get("ALL_TI_YMD"))
                by_day.setdefault(day_key, []).append(
                    {
                        "period": int(text(row.get("PERIO"), "0") or 0),
                        "subject": text(row.get("ITRT_CNTNT")),
                    }
                )
            for day_key in list(by_day.keys()):
                by_day[day_key].sort(key=lambda item: int(item.get("period") or 0))
            return by_day

        return self._remember("timetable-week", cache_key, TIMETABLE_WEEK_TTL, producer)

    def _fetch_weather_endpoint(self, path: str, params: dict[str, Any]) -> Any:
        query = {"appid": self._require_key("weather")}
        for key, value in (params or {}).items():
            if value is None or value == "":
                continue
            query[key] = str(value)
        url = f"{OWM_WEATHER_BASE}/{path}?{urllib.parse.urlencode(query)}"
        payload = self._fetch_json(url)
        if isinstance(payload, dict) and str(payload.get("cod", "200")) not in {"200", "0"}:
            raise ProxyServiceError(
                502,
                "날씨 서버가 오류를 반환했습니다.",
                code="weather_upstream_error",
                detail=text(payload.get("message")),
            )
        return payload

    def geocode(self, address: Any) -> dict[str, Any] | None:
        normalized = text(address)
        if not normalized:
            return None
        cache_key = normalized.lower()

        def producer() -> dict[str, Any] | None:
            query = {
                "q": f"{normalized},KR",
                "limit": "1",
                "appid": self._require_key("weather"),
            }
            url = f"{OWM_GEO_BASE}/direct?{urllib.parse.urlencode(query)}"
            payload = self._fetch_json(url)
            if not isinstance(payload, list) or not payload:
                return None
            item = payload[0]
            if not isinstance(item, dict):
                return None
            local_names = item.get("local_names") if isinstance(item.get("local_names"), dict) else {}
            return {
                "lat": float(item.get("lat")),
                "lon": float(item.get("lon")),
                "name": text(local_names.get("ko") or item.get("name")),
            }

        return self._remember("weather-geocode", cache_key, WEATHER_GEOCODE_TTL, producer)

    def _map_weather_current(self, payload: dict[str, Any]) -> dict[str, Any]:
        main = payload.get("main") if isinstance(payload.get("main"), dict) else {}
        weather = payload.get("weather") if isinstance(payload.get("weather"), list) else []
        first_weather = weather[0] if weather and isinstance(weather[0], dict) else {}
        wind = payload.get("wind") if isinstance(payload.get("wind"), dict) else {}
        clouds = payload.get("clouds") if isinstance(payload.get("clouds"), dict) else {}
        system = payload.get("sys") if isinstance(payload.get("sys"), dict) else {}

        return {
            "temp": round(float(main.get("temp") or 0)),
            "feelsLike": round(float(main.get("feels_like") or 0)),
            "tempMin": round(float(main.get("temp_min") or 0)),
            "tempMax": round(float(main.get("temp_max") or 0)),
            "humidity": int(main.get("humidity") or 0),
            "pressure": int(main.get("pressure") or 0),
            "description": text(first_weather.get("description")),
            "icon": text(first_weather.get("icon")),
            "windSpeed": float(wind.get("speed") or 0),
            "windGust": float(wind.get("gust") or 0),
            "visibilityKm": round((float(payload.get("visibility") or 0) / 1000) * 10) / 10,
            "clouds": int(clouds.get("all") or 0),
            "cityName": text(payload.get("name")),
            "sunrise": int(system.get("sunrise") or 0) * 1000 if system.get("sunrise") else None,
            "sunset": int(system.get("sunset") or 0) * 1000 if system.get("sunset") else None,
            "updatedAt": now_ms(),
        }

    def _map_forecast_entry(self, item: dict[str, Any]) -> dict[str, Any]:
        main = item.get("main") if isinstance(item.get("main"), dict) else {}
        weather = item.get("weather") if isinstance(item.get("weather"), list) else []
        first_weather = weather[0] if weather and isinstance(weather[0], dict) else {}
        return {
            "time": int(item.get("dt") or 0) * 1000,
            "temp": round(float(main.get("temp") or 0)),
            "tempMin": round(float(main.get("temp_min") or 0)),
            "tempMax": round(float(main.get("temp_max") or 0)),
            "icon": text(first_weather.get("icon")),
            "description": text(first_weather.get("description")),
            "pop": round(float(item.get("pop") or 0) * 100),
        }

    def _map_air_quality_entry(self, item: dict[str, Any]) -> dict[str, Any]:
        main = item.get("main") if isinstance(item.get("main"), dict) else {}
        components = item.get("components") if isinstance(item.get("components"), dict) else {}
        return {
            "aqi": int(main.get("aqi") or 0),
            "pm25": round(float(components.get("pm2_5") or 0)),
            "pm10": round(float(components.get("pm10") or 0)),
            "o3": round(float(components.get("o3") or 0)),
            "no2": round(float(components.get("no2") or 0)),
            "so2": round(float(components.get("so2") or 0)),
            "co": round(float(components.get("co") or 0)),
        }

    def _group_by_local_date(self, items: list[dict[str, Any]], timestamp_key: str) -> dict[str, list[dict[str, Any]]]:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for item in items:
            dt_ms = int(item.get(timestamp_key) or 0) * 1000
            local = datetime.fromtimestamp(dt_ms / 1000, KST)
            key = local.strftime("%Y-%m-%d")
            grouped.setdefault(key, []).append(item)
        return grouped

    def _build_daily_forecast(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        grouped = self._group_by_local_date(items, "dt")
        daily: list[dict[str, Any]] = []
        for _, day_items in list(grouped.items())[:5]:
            sorted_items = sorted(
                day_items,
                key=lambda item: abs(datetime.fromtimestamp(int(item.get("dt") or 0), KST).hour - 12),
            )
            representative = sorted_items[0] if sorted_items else day_items[0]
            temps_min = [
                float((item.get("main") or {}).get("temp_min") or (item.get("main") or {}).get("temp") or 0)
                for item in day_items
                if isinstance(item, dict)
            ]
            temps_max = [
                float((item.get("main") or {}).get("temp_max") or (item.get("main") or {}).get("temp") or 0)
                for item in day_items
                if isinstance(item, dict)
            ]
            weather = representative.get("weather") if isinstance(representative.get("weather"), list) else []
            first_weather = weather[0] if weather and isinstance(weather[0], dict) else {}
            daily.append(
                {
                    "date": int(representative.get("dt") or 0) * 1000,
                    "minTemp": round(min(temps_min) if temps_min else 0),
                    "maxTemp": round(max(temps_max) if temps_max else 0),
                    "icon": text(first_weather.get("icon")),
                    "description": text(first_weather.get("description")),
                    "popMax": round(max(float(item.get("pop") or 0) for item in day_items) * 100),
                }
            )
        return daily

    def _average(self, values: list[float]) -> int:
        if not values:
            return 0
        return round(sum(values) / len(values))

    def _build_daily_air_quality_forecast(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        grouped = self._group_by_local_date(items, "dt")
        daily: list[dict[str, Any]] = []
        for _, day_items in list(grouped.items())[:5]:
            mapped = [self._map_air_quality_entry(item) for item in day_items if isinstance(item, dict)]
            if not mapped:
                continue
            daily.append(
                {
                    "date": int(day_items[0].get("dt") or 0) * 1000,
                    "aqiMax": max(item["aqi"] for item in mapped),
                    "pm25Avg": self._average([float(item["pm25"]) for item in mapped]),
                    "pm25Max": max(item["pm25"] for item in mapped),
                    "pm10Avg": self._average([float(item["pm10"]) for item in mapped]),
                    "pm10Max": max(item["pm10"] for item in mapped),
                }
            )
        return daily

    def get_weather_bundle(self, lat: Any, lon: Any) -> dict[str, Any]:
        try:
            lat_value = float(lat)
            lon_value = float(lon)
        except Exception as exc:
            raise ProxyServiceError(400, "lat 또는 lon 값이 올바르지 않습니다.", code="invalid_coordinates") from exc

        cache_key = f"{lat_value:.4f},{lon_value:.4f}"

        def producer() -> dict[str, Any]:
            with ThreadPoolExecutor(max_workers=4) as executor:
                current_future = executor.submit(
                    self._fetch_weather_endpoint,
                    "weather",
                    {"lat": lat_value, "lon": lon_value, "units": "metric", "lang": "kr"},
                )
                forecast_future = executor.submit(
                    self._fetch_weather_endpoint,
                    "forecast",
                    {"lat": lat_value, "lon": lon_value, "units": "metric", "lang": "kr"},
                )
                air_future = executor.submit(
                    self._fetch_weather_endpoint,
                    "air_pollution",
                    {"lat": lat_value, "lon": lon_value},
                )
                air_forecast_future = executor.submit(
                    self._fetch_weather_endpoint,
                    "air_pollution/forecast",
                    {"lat": lat_value, "lon": lon_value},
                )

                current_payload = current_future.result()
                forecast_payload = forecast_future.result()
                air_payload = air_future.result()
                air_forecast_payload = air_forecast_future.result()

            forecast_list = forecast_payload.get("list", []) if isinstance(forecast_payload, dict) else []
            air_forecast_list = air_forecast_payload.get("list", []) if isinstance(air_forecast_payload, dict) else []
            air_current_list = air_payload.get("list", []) if isinstance(air_payload, dict) else []

            hourly_forecast = [
                self._map_forecast_entry(item)
                for item in forecast_list[:6]
                if isinstance(item, dict)
            ]
            hourly_air = [
                {
                    **self._map_air_quality_entry(item),
                    "time": int(item.get("dt") or 0) * 1000,
                }
                for item in air_forecast_list[:24]
                if isinstance(item, dict)
            ]

            return {
                "weather": self._map_weather_current(current_payload if isinstance(current_payload, dict) else {}),
                "forecast": hourly_forecast,
                "dailyForecast": self._build_daily_forecast([item for item in forecast_list if isinstance(item, dict)]),
                "airQuality": self._map_air_quality_entry(air_current_list[0]) if air_current_list else None,
                "airQualityForecast": hourly_air,
                "dailyAirQualityForecast": self._build_daily_air_quality_forecast(
                    [item for item in air_forecast_list if isinstance(item, dict)]
                ),
                "updatedAt": now_ms(),
            }

        return self._remember("weather-bundle", cache_key, WEATHER_BUNDLE_TTL, producer)

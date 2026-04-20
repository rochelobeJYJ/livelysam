#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


CATALOG_VERSION = 3
DEFAULT_RANKING_LABEL = "Firebase Firestore 명예의 전당"
DEFAULT_ALL_SCORES_HALL_NOTICE = "개인당 최고 점수 3개를 기록합니다."


class MinigameMetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: dict[str, str] = {}
        self._inside_title = False
        self._title_parts: list[str] = []

    @property
    def title(self) -> str:
        return "".join(self._title_parts).strip()

    def handle_starttag(self, tag: str, attrs) -> None:
        attrs_dict = {str(key).lower(): str(value) for key, value in attrs if key}
        lower_tag = str(tag).lower()
        if lower_tag == "meta":
            name = attrs_dict.get("name", "").strip()
            if name:
                self.meta[name] = attrs_dict.get("content", "").strip()
            return
        if lower_tag == "title":
            self._inside_title = True

    def handle_endtag(self, tag: str) -> None:
        if str(tag).lower() == "title":
            self._inside_title = False

    def handle_data(self, data: str) -> None:
        if self._inside_title:
            self._title_parts.append(data)


def get_root_path() -> Path:
    return Path(__file__).resolve().parent.parent


def text(value, fallback: str = "") -> str:
    normalized = str(value or "").strip()
    return normalized or fallback


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def parse_bool(value: str) -> bool:
    return text(value).lower() in {"1", "true", "yes", "on"}


def slugify_filename(name: str) -> str:
    normalized = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", text(name))
    normalized = re.sub(r"[^A-Za-z0-9]+", "-", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    return normalized.lower() or "minigame"


def titleize_slug(slug: str) -> str:
    parts = [part for part in re.split(r"[-_\s]+", text(slug)) if part]
    if not parts:
        return "Mini Game"
    return " ".join(part.upper() if part.isdigit() else part.capitalize() for part in parts)


def make_icon(title: str) -> str:
    words = [part for part in re.split(r"[^A-Za-z0-9]+", text(title)) if part]
    if not words:
        return "MG"
    if len(words) == 1:
        token = words[0]
        return token[:2].upper()
    return "".join(word[0].upper() for word in words[:2])[:2] or "MG"


def normalize_status(value: str) -> str:
    normalized = text(value, "prototype").lower()
    if normalized in {"ready", "prototype", "coming-soon"}:
        return normalized
    return "prototype"


def normalize_leaderboard_mode(value: str) -> str:
    return "all-scores" if text(value).lower() == "all-scores" else "personal-best"


def parse_tags(value: str) -> list[str]:
    if not text(value):
        return []
    seen: set[str] = set()
    tags: list[str] = []
    for token in re.split(r"[,\n|]+", value):
        item = text(token)
        lowered = item.lower()
        if not item or lowered in seen:
            continue
        seen.add(lowered)
        tags.append(item)
    return tags[:6]


def parse_sort_order(value: str) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return 1000


def parse_html_metadata(path: Path) -> tuple[dict[str, str], str]:
    parser = MinigameMetaParser()
    parser.feed(read_text(path))
    parser.close()
    return parser.meta, parser.title


def meta_value(meta: dict[str, str], key: str) -> str:
    return text(meta.get(f"livelysam:minigame:{key}", ""))


def build_game_descriptor(root_path: Path, html_path: Path) -> tuple[int, dict] | None:
    meta, title_tag = parse_html_metadata(html_path)
    if parse_bool(meta_value(meta, "disabled")):
        return None

    inferred_id = slugify_filename(html_path.stem)
    title = meta_value(meta, "title") or text(title_tag, titleize_slug(inferred_id))
    leaderboard_mode = normalize_leaderboard_mode(meta_value(meta, "leaderboard-mode"))
    hall_notice = meta_value(meta, "hall-notice")
    if not hall_notice and leaderboard_mode == "all-scores":
        hall_notice = DEFAULT_ALL_SCORES_HALL_NOTICE

    game = {
        "id": meta_value(meta, "id") or inferred_id,
        "seriesId": meta_value(meta, "series-id") or inferred_id,
        "seriesTitle": meta_value(meta, "series-title") or title,
        "seriesDescription": meta_value(meta, "series-description"),
        "seriesIcon": meta_value(meta, "series-icon") or meta_value(meta, "icon") or make_icon(title),
        "title": title,
        "icon": meta_value(meta, "icon") or make_icon(title),
        "status": normalize_status(meta_value(meta, "status")),
        "launchType": "iframe",
        "entry": html_path.relative_to(root_path).as_posix(),
        "description": meta_value(meta, "description") or f"{title} 미니게임",
        "scoreLabel": meta_value(meta, "score-label") or "점수",
        "rankingLabel": meta_value(meta, "ranking-label") or DEFAULT_RANKING_LABEL,
        "leaderboardMode": leaderboard_mode,
    }

    tags = parse_tags(meta_value(meta, "tags"))
    if tags:
        game["tags"] = tags
    if hall_notice:
        game["hallNotice"] = hall_notice
    if parse_bool(meta_value(meta, "preview-disabled")):
        game["previewDisabled"] = True

    return parse_sort_order(meta_value(meta, "sort-order")), game


def build_catalog(root_path: Path | None = None) -> dict:
    project_root = Path(root_path) if root_path else get_root_path()
    games_dir = project_root / "js" / "minigames" / "games"
    if not games_dir.exists():
        raise RuntimeError(f"Games directory not found: {games_dir}")

    collected: list[tuple[int, dict]] = []
    latest_mtime = 0.0
    for html_path in sorted(games_dir.glob("*.html")):
        descriptor = build_game_descriptor(project_root, html_path)
        if descriptor is None:
            continue
        latest_mtime = max(latest_mtime, html_path.stat().st_mtime)
        collected.append(descriptor)

    collected.sort(key=lambda item: (item[0], item[1]["seriesId"], item[1]["title"].lower(), item[1]["entry"].lower()))
    games = [game for _, game in collected]

    if not games:
        raise RuntimeError("No minigame entries were discovered.")

    seen_ids: set[str] = set()
    seen_entries: set[str] = set()
    for game in games:
        game_id = text(game.get("id"))
        entry = text(game.get("entry"))
        if not game_id:
            raise RuntimeError("Discovered a minigame without an id.")
        if game_id in seen_ids:
            raise RuntimeError(f"Duplicate minigame id detected: {game_id}")
        if entry in seen_entries:
            raise RuntimeError(f"Duplicate minigame entry detected: {entry}")
        seen_ids.add(game_id)
        seen_entries.add(entry)

    return {
        "version": CATALOG_VERSION,
        "generatedAt": datetime.fromtimestamp(latest_mtime, tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "games": games,
    }


def render_catalog_js(payload: dict) -> str:
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    return (
        "(function () {\n"
        "  'use strict';\n\n"
        "  // Generated by tools/generate_minigame_catalog.py. Do not edit manually.\n"
        "  window.LivelySamMinigameCatalog = Object.freeze("
        f"{serialized}"
        ");\n"
        "})();\n"
    )


def get_catalog_output_path(root_path: Path | None = None) -> Path:
    project_root = Path(root_path) if root_path else get_root_path()
    return project_root / "js" / "minigames" / "games-catalog.js"


def write_catalog_js(output_path: Path, payload: dict) -> None:
    output_path.write_text(render_catalog_js(payload), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the LivelySam minigame catalog from game HTML metadata.")
    parser.add_argument("--root", default=str(get_root_path()))
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args(argv)

    root_path = Path(args.root).resolve()
    payload = build_catalog(root_path)
    output_path = get_catalog_output_path(root_path)
    expected_js = render_catalog_js(payload)

    if args.print_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))

    if args.check:
        current_js = output_path.read_text(encoding="utf-8") if output_path.exists() else ""
        if current_js != expected_js:
            print(f"Catalog is out of date: {output_path}", file=sys.stderr)
            return 1
        return 0

    write_catalog_js(output_path, payload)
    print(f"Generated {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

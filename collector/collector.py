from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_CACHE_DIR = Path(__file__).resolve().parent / ".cache" / "collector"


@dataclass
class FieldSelector:
    field_name: str
    css: str
    required: bool = False


@dataclass
class RawEvidencePayload:
    source: str
    pageName: str | None = None
    targetUrl: str | None = None
    status: str = "pending_verification"
    confidence: float | None = None
    rawText: str | None = None
    rawPayload: dict[str, Any] = field(default_factory=dict)
    parsedFields: dict[str, Any] = field(default_factory=dict)
    failureReason: str | None = None
    screenshotPath: str | None = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def evidence_to_dict(payload: RawEvidencePayload) -> dict[str, Any]:
    data = asdict(payload)
    data["collectedAt"] = now_iso()
    return data


def emit(payload: RawEvidencePayload) -> None:
    print(json.dumps(evidence_to_dict(payload), ensure_ascii=False))


def cache_key(url: str) -> str:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
    return digest


def cache_path(cache_dir: Path, url: str) -> Path:
    return cache_dir / f"{cache_key(url)}.json"


def checkpoint_path(cache_dir: Path, key: str) -> Path:
    safe_key = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in key)
    return cache_dir / f"checkpoint-{safe_key}.json"


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        return None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def body_text(page: Any) -> str:
    body_lines = page.css("body *::text").getall()
    return "\n".join([str(line).strip() for line in body_lines if str(line).strip()])[:12000]


def first_text(page: Any, css: str) -> str:
    values = page.css(css).getall()
    cleaned = [str(value).strip() for value in values if str(value).strip()]
    return "\n".join(cleaned)


def extract_fields(page: Any, selectors: list[FieldSelector]) -> tuple[dict[str, Any], list[str]]:
    parsed: dict[str, Any] = {}
    missing: list[str] = []
    for selector in selectors:
        value = first_text(page, selector.css)
        if value:
            parsed[selector.field_name] = value
        elif selector.required:
            missing.append(selector.field_name)
    return parsed, missing


def from_cache(url: str, cache_dir: Path, reason: str) -> RawEvidencePayload | None:
    cached = read_json(cache_path(cache_dir, url))
    if not cached:
        return None
    raw_payload = dict(cached.get("rawPayload") or {})
    raw_payload.update({"fromCache": True, "cacheFallbackReason": reason})
    return RawEvidencePayload(
        source="scrapling",
        pageName=cached.get("pageName") or "公开页面缓存",
        targetUrl=url,
        status="pending_verification",
        confidence=0.55,
        rawText=cached.get("rawText"),
        rawPayload=raw_payload,
        parsedFields=cached.get("parsedFields") or {},
        failureReason=f"实时采集失败，已使用缓存：{reason}"
    )


def fetch_public_page(
    url: str,
    selectors: list[FieldSelector],
    cache_dir: Path = DEFAULT_CACHE_DIR,
    use_cache: bool = True
) -> RawEvidencePayload:
    try:
        from scrapling.fetchers.requests import Fetcher

        page = Fetcher.get(url)
        title = first_text(page, "title::text")
        parsed_fields, missing_fields = extract_fields(page, selectors)
        raw_text = body_text(page)
        confidence = 0.82 if not missing_fields else 0.72
        status = "pending_verification"
        payload = RawEvidencePayload(
            source="scrapling",
            pageName=title or "公开页面",
            targetUrl=url,
            status=status,
            confidence=confidence,
            rawText=raw_text,
            rawPayload={
                "title": title,
                "selectors": [asdict(selector) for selector in selectors],
                "missingFields": missing_fields,
                "structureFingerprint": cache_key(raw_text[:4000] or url),
                "fromCache": False
            },
            parsedFields=parsed_fields
        )
        if use_cache:
            write_json(cache_path(cache_dir, url), evidence_to_dict(payload))
        return payload
    except Exception as exc:  # noqa: BLE001 - collector must fail closed into calibration.
        reason = str(exc)
        if use_cache:
            cached = from_cache(url, cache_dir, reason)
            if cached:
                return cached
        return RawEvidencePayload(
            source="scrapling",
            pageName="公开页面",
            targetUrl=url,
            status="failed",
            confidence=0,
            failureReason=reason,
            parsedFields={}
        )


def parse_selector(value: str) -> FieldSelector:
    required = value.startswith("!")
    raw = value[1:] if required else value
    if "=" not in raw:
        raise argparse.ArgumentTypeError("selector must be FIELD=CSS or !FIELD=CSS")
    field_name, css = raw.split("=", 1)
    if not field_name.strip() or not css.strip():
        raise argparse.ArgumentTypeError("selector field and css cannot be empty")
    return FieldSelector(field_name=field_name.strip(), css=css.strip(), required=required)


def run_spider(args: argparse.Namespace) -> int:
    cache_dir = Path(args.cache_dir)
    start_index = 0
    checkpoint_file = checkpoint_path(cache_dir, args.checkpoint_key)
    if args.resume:
        checkpoint = read_json(checkpoint_file)
        if checkpoint:
            start_index = int(checkpoint.get("nextIndex") or 0)

    exit_code = 0
    for index, url in enumerate(args.urls[start_index:], start=start_index):
        payload = fetch_public_page(
            url,
            selectors=args.selector,
            cache_dir=cache_dir,
            use_cache=not args.no_cache
        )
        emit(payload)
        write_json(
            checkpoint_file,
            {
                "checkpointKey": args.checkpoint_key,
                "lastUrl": url,
                "lastStatus": payload.status,
                "nextIndex": index + 1,
                "updatedAt": now_iso()
            }
        )
        if payload.status == "failed":
            exit_code = 1
    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect public pages into RawEvidence JSONL.")
    parser.add_argument("urls", nargs="+", help="One or more public URLs to collect.")
    parser.add_argument(
        "--selector",
        action="append",
        type=parse_selector,
        default=[],
        help="CSS field selector. Use FIELD=CSS or !FIELD=CSS for required fields. Can repeat."
    )
    parser.add_argument("--cache-dir", default=str(DEFAULT_CACHE_DIR), help="Cache/checkpoint directory.")
    parser.add_argument("--no-cache", action="store_true", help="Disable cache read/write.")
    parser.add_argument("--checkpoint-key", default="default", help="Checkpoint key for resume.")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint.")
    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv[1:])
    return run_spider(args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

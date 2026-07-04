from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import requests
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


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


def local_live_date() -> str:
    return datetime.now(timezone(timedelta(hours=8))).date().isoformat()


def emit(payload: RawEvidencePayload) -> None:
    data = asdict(payload)
    data["collectedAt"] = now_iso()
    print(json.dumps(data, ensure_ascii=False))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def safe_name(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in value)[:80] or "artifact"


def parse_selector(value: str) -> FieldSelector:
    required = value.startswith("!")
    raw = value[1:] if required else value
    if "=" not in raw:
        raise argparse.ArgumentTypeError("selector must be FIELD=CSS or !FIELD=CSS")
    field_name, css = raw.split("=", 1)
    if not field_name.strip() or not css.strip():
        raise argparse.ArgumentTypeError("selector field and css cannot be empty")
    return FieldSelector(field_name=field_name.strip(), css=css.strip(), required=required)


def browser_channel() -> str | None:
    value = os.environ.get("COLLECTOR_BROWSER_CHANNEL", "chrome").strip()
    return value or None


def launch_persistent_context(playwright: Any, user_data_dir: Path, headless: bool) -> Any:
    kwargs: dict[str, Any] = {
        "user_data_dir": str(user_data_dir),
        "headless": headless,
        "viewport": {"width": 1440, "height": 960},
        "args": ["--disable-blink-features=AutomationControlled"]
    }
    channel = browser_channel()
    if channel:
        kwargs["channel"] = channel
    try:
        return playwright.chromium.launch_persistent_context(**kwargs)
    except Exception:
        kwargs.pop("channel", None)
        return playwright.chromium.launch_persistent_context(**kwargs)


def launch_browser(playwright: Any, headless: bool) -> Any:
    kwargs: dict[str, Any] = {"headless": headless}
    channel = browser_channel()
    if channel:
        kwargs["channel"] = channel
    try:
        return playwright.chromium.launch(**kwargs)
    except Exception:
        kwargs.pop("channel", None)
        return playwright.chromium.launch(**kwargs)


def prepare_login(args: argparse.Namespace) -> int:
    from playwright.sync_api import sync_playwright

    user_data_dir = Path(args.user_data_dir)
    confirm_file = Path(args.confirm_file)
    state_file = Path(args.state_file)
    done_file = Path(args.done_file)
    error_file = Path(args.error_file)
    for path in (confirm_file, done_file, error_file):
        try:
            path.unlink()
        except FileNotFoundError:
            pass

    try:
        with sync_playwright() as playwright:
            context = launch_persistent_context(playwright, user_data_dir=user_data_dir, headless=False)
            page = context.pages[0] if context.pages else context.new_page()
            page.goto(args.url, wait_until="domcontentloaded", timeout=args.timeout_ms)
            while not confirm_file.exists():
                time.sleep(0.5)
            context.storage_state(path=str(state_file))
            context.close()
        write_json(done_file, {"status": "confirmed", "stateFile": str(state_file), "updatedAt": now_iso()})
        return 0
    except Exception as exc:  # noqa: BLE001
        write_json(error_file, {"status": "failed", "reason": str(exc), "updatedAt": now_iso()})
        return 1


def page_text(page: Any) -> str:
    try:
        return page.locator("body").inner_text(timeout=5000).strip()
    except Exception:
        return ""


def selector_text(page: Any, selector: FieldSelector) -> str:
    try:
        values = page.locator(selector.css).all_inner_texts()
        return "\n".join([value.strip() for value in values if value.strip()])
    except Exception:
        return ""


def screenshot_page(page: Any, artifact_dir: Path, account_id: str) -> str | None:
    try:
        artifact_dir.mkdir(parents=True, exist_ok=True)
        path = artifact_dir / f"{safe_name(account_id)}-dashboard-{int(time.time() * 1000)}.png"
        page.screenshot(path=str(path), full_page=True)
        return str(path)
    except Exception:
        return None


def capture_live_visual_frames(page: Any, artifact_dir: Path, account_id: str) -> list[dict[str, Any]]:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    frames: list[dict[str, Any]] = []
    selectors = [
        "video",
        "canvas",
        "[class*='player' i]",
        "[class*='video' i]",
        "[class*='live' i]",
        "[class*='preview' i]"
    ]
    seen: set[str] = set()
    for selector in selectors:
        try:
            locator = page.locator(selector)
            count = min(locator.count(), 4)
        except Exception:
            continue
        for index in range(count):
            item = locator.nth(index)
            try:
                box = item.bounding_box(timeout=1500)
            except Exception:
                box = None
            if not box or box["width"] < 120 or box["height"] < 90:
                continue
            key = f"{round(box['x'])}:{round(box['y'])}:{round(box['width'])}:{round(box['height'])}"
            if key in seen:
                continue
            seen.add(key)
            path = artifact_dir / f"{safe_name(account_id)}-live-frame-{len(frames) + 1}-{int(time.time() * 1000)}.png"
            try:
                item.screenshot(path=str(path), timeout=5000)
            except Exception:
                continue
            frames.append(
                {
                    "selector": selector,
                    "index": index,
                    "path": str(path),
                    "box": {
                        "x": round(box["x"], 2),
                        "y": round(box["y"], 2),
                        "width": round(box["width"], 2),
                        "height": round(box["height"], 2)
                    }
                }
            )
    return frames


def ocr_image(image_path: str) -> dict[str, Any]:
    endpoint = os.environ.get("COLLECTOR_OCR_ENDPOINT") or os.environ.get("LOCAL_OCR_ENDPOINT")
    if not endpoint:
        return {"configured": False, "text": "", "confidence": None, "raw": None}
    try:
        response = requests.post(endpoint, json={"screenshotPath": image_path}, timeout=12)
        response.raise_for_status()
        result = response.json()
        return {
            "configured": True,
            "text": result.get("text") or result.get("rawText") or "",
            "confidence": result.get("confidence"),
            "raw": result
        }
    except Exception as exc:  # noqa: BLE001
        return {"configured": True, "text": "", "confidence": 0, "raw": {"error": str(exc)}}


def find_visual_risk_keywords(text: str) -> list[str]:
    keywords = [
        "全网最低",
        "绝对",
        "保证",
        "包治",
        "免费送",
        "最后一天",
        "仅此一次",
        "违规",
        "投诉",
        "退款",
        "差评",
        "虚假",
        "夸大"
    ]
    return [keyword for keyword in keywords if keyword in text]


def build_visual_recognition(
    page_screenshot: str | None,
    frames: list[dict[str, Any]],
    ocr_results: list[dict[str, Any]]
) -> dict[str, Any]:
    ocr_text = "\n".join([str(result.get("text") or "").strip() for result in ocr_results if result.get("text")]).strip()
    configured = any(bool(result.get("configured")) for result in ocr_results)
    risk_keywords = find_visual_risk_keywords(ocr_text)
    return {
        "status": "recognized" if ocr_text else ("captured_pending_ocr" if frames or page_screenshot else "not_found"),
        "frameCount": len(frames),
        "primaryFramePath": frames[0]["path"] if frames else page_screenshot,
        "pageScreenshotPath": page_screenshot,
        "frames": frames,
        "ocrConfigured": configured,
        "ocrText": ocr_text,
        "ocrResults": ocr_results,
        "riskKeywords": risk_keywords,
        "requiresManualVerification": not ocr_text or bool(risk_keywords)
    }


def number_from_text(value: str) -> float | None:
    cleaned = value.replace(",", "").replace("，", "").strip()
    match = re.search(r"(-?\d+(?:\.\d+)?)\s*(万|w|W|%)?", cleaned)
    if not match:
        return None
    number = float(match.group(1))
    unit = match.group(2)
    if unit and unit.lower() == "w" or unit == "万":
        number *= 10000
    return number


def metric_after_label(text: str, labels: list[str]) -> float | None:
    compact = re.sub(r"\s+", " ", text)
    for label in labels:
        pattern = re.compile(re.escape(label) + r"\s*[:：]?\s*([\-0-9,.，]+)\s*(万|w|W|%)?", re.IGNORECASE)
        match = pattern.search(compact)
        if match:
            return number_from_text("".join([match.group(1), match.group(2) or ""]))
    return None


def first_text_after_label(text: str, labels: list[str]) -> str | None:
    compact = re.sub(r"\s+", " ", text)
    for label in labels:
        pattern = re.compile(re.escape(label) + r"\s*[:：]?\s*([^｜|，,。;；\n]{2,40})")
        match = pattern.search(compact)
        if match:
            return match.group(1).strip()
    return None


def infer_live_status(text: str) -> str:
    active_words = ["直播中", "正在直播", "开播中", "实时直播", "本场直播", "在线人数", "看播"]
    ended_words = ["已结束", "直播结束", "已下播", "下播", "回放", "本场已结束"]
    waiting_words = ["未开播", "待开播", "暂无直播", "未开始", "预约开播"]
    if any(word in text for word in active_words):
        return "active"
    if any(word in text for word in ended_words):
        return "ended"
    if any(word in text for word in waiting_words):
        return "not_started"
    return "unknown"


def infer_live_runtime(text: str, title: str, url: str, account_id: str, live_room_name: str) -> dict[str, Any]:
    live_date = local_live_date()
    live_status = infer_live_status(text)
    started_at_text = first_text_after_label(text, ["开播时间", "开始时间", "直播开始", "本场开始"])
    ended_at_text = first_text_after_label(text, ["下播时间", "结束时间", "直播结束", "本场结束"])
    signature_parts = [
        account_id,
        live_date,
        live_room_name,
        started_at_text or "",
        url,
        "dashboard"
    ]
    session_fingerprint = hashlib.sha256("|".join(signature_parts).encode("utf-8")).hexdigest()[:16]
    return {
        "liveDate": live_date,
        "liveStatus": live_status,
        "liveRoomName": live_room_name,
        "startedAtText": started_at_text,
        "endedAtText": ended_at_text,
        "sessionFingerprint": session_fingerprint,
        "observedAt": now_iso(),
        "loginReused": True,
        "recognitionBasis": {
            "hasExplicitStartTime": bool(started_at_text),
            "url": url,
            "title": title
        }
    }


def infer_live_fields(text: str, title: str, url: str, account_id: str, selector_fields: dict[str, Any]) -> dict[str, Any]:
    live_room_name = (
        selector_fields.get("liveRoomName")
        or selector_fields.get("liveTitle")
        or title.replace("抖音", "").strip()
        or "直播大屏"
    )
    live_runtime = infer_live_runtime(text, title, url, account_id, live_room_name)
    return {
        "pageType": "live_dashboard",
        "dataDomain": "douyin_live_dashboard",
        "liveRoomName": live_room_name,
        "targetUrl": url,
        "liveRuntime": live_runtime,
        "liveMetrics": {
            "liveGmv": metric_after_label(text, ["直播间成交金额", "直播GMV", "成交金额", "支付GMV", "支付金额"]),
            "payRoi": metric_after_label(text, ["支付ROI", "支付 ROI"]),
            "verifyRoi": metric_after_label(text, ["核销ROI", "核销 ROI"]),
            "totalWatchUsers": metric_after_label(text, ["累计看播人数", "整场累计看播", "累计看播"]),
            "payOrders": metric_after_label(text, ["成交订单数", "支付订单数", "支付订单"])
        },
        **selector_fields
    }


def is_login_page(text: str, url: str) -> bool:
    login_words = ["登录", "验证码", "扫码登录", "手机号", "密码"]
    live_words = ["直播", "成交", "看播", "流量", "商品", "ROI"]
    login_score = sum(1 for word in login_words if word in text or word in url)
    live_score = sum(1 for word in live_words if word in text)
    return login_score >= 2 and live_score == 0


def collect_live_dashboard(args: argparse.Namespace) -> int:
    from playwright.sync_api import sync_playwright

    state_file = Path(args.state_file)
    if not state_file.exists():
        emit(
            RawEvidencePayload(
                source="playwright_live_dashboard",
                pageName=args.page_name,
                targetUrl=args.url,
                status="failed",
                confidence=0,
                parsedFields={},
                failureReason="账号登录态不存在或未确认，请先完成该账号的直播大屏登录确认"
            )
        )
        return 1

    try:
        with sync_playwright() as playwright:
            browser = launch_browser(playwright, headless=not args.show_browser)
            context = browser.new_context(
                storage_state=str(state_file),
                viewport={"width": 1440, "height": 960}
            )
            page = context.new_page()
            page.goto(args.url, wait_until="domcontentloaded", timeout=args.timeout_ms)
            try:
                page.wait_for_load_state("networkidle", timeout=12000)
            except Exception:
                pass
            text = page_text(page)
            title = page.title()
            current_url = page.url
            artifact_dir = Path(args.artifact_dir)
            page_screenshot = screenshot_page(page, artifact_dir, args.account_id)
            visual_frames = capture_live_visual_frames(page, artifact_dir, args.account_id)
            ocr_targets = [frame["path"] for frame in visual_frames[:3]]
            if not ocr_targets and page_screenshot:
                ocr_targets = [page_screenshot]
            ocr_results = [ocr_image(target) for target in ocr_targets]
            visual_recognition = build_visual_recognition(page_screenshot, visual_frames, ocr_results)

            selector_fields: dict[str, Any] = {}
            missing_fields: list[str] = []
            for selector in args.selector:
                value = selector_text(page, selector)
                if value:
                    selector_fields[selector.field_name] = value
                elif selector.required:
                    missing_fields.append(selector.field_name)

            context.close()
            browser.close()

        if is_login_page(text, current_url):
            status = "failed"
            confidence = 0
            failure_reason = "账号登录态已失效或仍停留在登录页，请重新确认登录"
            parsed_fields: dict[str, Any] = {}
        else:
            parsed_fields = infer_live_fields(text, title, current_url, args.account_id, selector_fields)
            parsed_fields["liveVisualRecognition"] = visual_recognition
            parsed_fields["hostScriptRisk"] = bool(visual_recognition.get("riskKeywords"))
            parsed_fields["dataQuality"] = {
                "confidence": 0.86 if not missing_fields else 0.76,
                "requiresManualVerification": bool(missing_fields) or bool(visual_recognition.get("requiresManualVerification")),
                "missingFields": [
                    *missing_fields,
                    *(["直播画面OCR文本"] if visual_recognition.get("status") == "captured_pending_ocr" else [])
                ]
            }
            status = "pending_verification"
            confidence = 0.86 if not missing_fields else 0.76
            failure_reason = None

        emit(
            RawEvidencePayload(
                source="playwright_live_dashboard",
                pageName=args.page_name or title or "直播大屏后台",
                targetUrl=current_url,
                status=status,
                confidence=confidence,
                rawText=text[:20000],
                rawPayload={
                    "title": title,
                    "currentUrl": current_url,
                    "selectors": [asdict(selector) for selector in args.selector],
                    "missingFields": missing_fields,
                    "accountId": args.account_id,
                    "visualArtifacts": {
                        "pageScreenshotPath": page_screenshot,
                        "frames": visual_frames,
                        "ocrConfigured": visual_recognition.get("ocrConfigured")
                    }
                },
                parsedFields=parsed_fields,
                failureReason=failure_reason,
                screenshotPath=visual_recognition.get("primaryFramePath") if isinstance(visual_recognition, dict) else None
            )
        )
        return 1 if status == "failed" else 0
    except Exception as exc:  # noqa: BLE001
        emit(
            RawEvidencePayload(
                source="playwright_live_dashboard",
                pageName=args.page_name or "直播大屏后台",
                targetUrl=args.url,
                status="failed",
                confidence=0,
                parsedFields={},
                failureReason=str(exc)
            )
        )
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Collect live dashboard pages with per-account Playwright state.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    login = subparsers.add_parser("prepare-login", help="Open a visible browser for account login confirmation.")
    login.add_argument("--account-id", required=True)
    login.add_argument("--url", required=True)
    login.add_argument("--user-data-dir", required=True)
    login.add_argument("--state-file", required=True)
    login.add_argument("--confirm-file", required=True)
    login.add_argument("--done-file", required=True)
    login.add_argument("--error-file", required=True)
    login.add_argument("--timeout-ms", type=int, default=60000)

    collect = subparsers.add_parser("collect", help="Collect a logged-in live dashboard page.")
    collect.add_argument("--account-id", required=True)
    collect.add_argument("--url", required=True)
    collect.add_argument("--state-file", required=True)
    collect.add_argument("--artifact-dir", required=True)
    collect.add_argument("--page-name", default="直播大屏后台")
    collect.add_argument("--selector", action="append", type=parse_selector, default=[])
    collect.add_argument("--show-browser", action="store_true")
    collect.add_argument("--timeout-ms", type=int, default=45000)
    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv[1:])
    if args.command == "prepare-login":
        return prepare_login(args)
    if args.command == "collect":
        return collect_live_dashboard(args)
    raise AssertionError(args.command)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

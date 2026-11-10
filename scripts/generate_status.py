#!/usr/bin/env python3
"""Живой статус сервисов витрины ssrjkk.github.io.

Каждый запуск (Actions, раз в 15 минут) опрашивает все публичные сайты,
перечисленные в хабе, и пишет status.json:
  - текущее состояние (ok / код / время ответа);
  - скользящая история последних проверок и uptime % по каждой цели.

Только стандартная библиотека. Автор: ssrjkk.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections import deque
from datetime import UTC, datetime
from http.client import IncompleteRead
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATUS_FILE = ROOT / "status.json"
HISTORY_LIMIT = 60  # ~15 часов непрерывной истории при cron */15

# (id, человекочитаемое имя, URL) — ровно то, что показано на витрине.
TARGETS = [
    ("hub", "Хаб", "https://ssrjkk.github.io/", None),
    ("shopwatch", "Shopwatch", "https://ssrjkk.github.io/shopwatch/", None),
    ("bothive", "Bothive", "https://ssrjkk.github.io/bothive/", None),
    ("raven", "Raven", "https://ssrjkk.github.io/raven/", None),
    ("agent-skills", "Agent Skills", "https://ssrjkk.github.io/agent-skills/", None),
    ("drafter", "Drafter", "https://ssrjkk.github.io/drafter/", None),
    ("ezzoffer", "EZZoffer", "https://ssrjkk.github.io/ezzoffer/", None),
    ("harvest", "Harvest", "https://ssrjkk.github.io/harvest/", None),
    ("shroud", "Shroud", "https://ssrjkk.github.io/shroud/", None),
    ("wake", "Wake · сайт", "https://wake-7k6.pages.dev/", None),
    (
        "wake-api", "Wake · API",
        "https://wake-backend-production-3483.up.railway.app/ready", "ready",
    ),
    ("tippy", "Tippy on Base", "https://tippy-egi.pages.dev/", None),
    ("volley", "Volley", "https://ssrjkk.github.io/volley/", None),
    ("mobius", "Mobius", "https://ssrjkk.github.io/mobius/", None),
    ("noema", "Noema", "https://ssrjkk.github.io/noema/", None),
    ("qa-arsenal", "QA Arsenal", "https://ssrjkk.github.io/qa-arsenal/", None),
    ("qualix", "Qualix", "https://ssrjkk.github.io/qualix/", None),
    ("b2w", "B2W Crypto", "https://ssrjkk.github.io/b2w-crypto-tg-bot/", None),
    ("tt-bot", "TT Bot", "https://ssrjkk.github.io/tt_bot/", None),
    ("twinby", "Twinby", "https://ssrjkk.github.io/twinby-swipe-bot/", None),
]
PROBE_METHOD = "complete-response-readiness-v1"


def probe(
    url: str, timeout: float = 10.0, attempts: int = 2, expected_status: str | None = None,
) -> tuple[bool, int, int]:
    """Вернёт (ok, http_code, мс) после чтения полного ответа и проверки готовности."""
    last_code = 0
    for i in range(attempts):
        start = time.monotonic()
        req = urllib.request.Request(
            url, headers={"User-Agent": "ssrjkk-hub-status/1.0", "Cache-Control": "no-cache"}
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                code = resp.status
                body = resp.read(2_000_001)
                length = resp.headers.get("Content-Length")
                complete = length is None or (length.isdecimal() and int(length) == len(body))
                ok = 200 <= code < 400 and len(body) <= 2_000_000 and complete
        except urllib.error.HTTPError as error:
            code = error.code
            ok = False
        except (OSError, IncompleteRead):
            code = 0
            ok = False
        if ok and expected_status is not None:
            try:
                data = json.loads(body)
            except (json.JSONDecodeError, UnicodeDecodeError):
                ok = False
            else:
                ok = isinstance(data, dict) and data.get("status") == expected_status
        ms = int((time.monotonic() - start) * 1000)
        if ok:
            return True, code, ms
        last_code = code
        if i + 1 < attempts:
            time.sleep(3)
    return False, last_code, ms


def main() -> None:
    previous: dict = {}
    if STATUS_FILE.exists():
        try:
            previous = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            previous = {}
    old_targets = (
        {t.get("id"): t for t in previous.get("targets", [])}
        if previous.get("probe_method") == PROBE_METHOD else {}
    )

    targets = []
    for tid, name, url, expected_status in TARGETS:
        ok, code, ms = probe(url, expected_status=expected_status)
        hist = deque(old_targets.get(tid, {}).get("history", []), maxlen=HISTORY_LIMIT)
        hist.append(1 if ok else 0)
        history = list(hist)
        uptime = round(100.0 * sum(history) / len(history), 1) if history else None
        targets.append(
            {
                "id": tid,
                "name": name,
                "url": url,
                "ok": ok,
                "code": code,
                "ms": ms,
                "uptime": uptime,
                "history": history,
            }
        )
        print(f"{'UP  ' if ok else 'DOWN'} {code or '---':>3} {ms:>5}ms  {tid}")

    payload = {
        "probe_method": PROBE_METHOD,
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "targets": targets,
        "summary": {
            "total": len(targets),
            "up": sum(1 for t in targets if t["ok"]),
            "down": sum(1 for t in targets if not t["ok"]),
        },
    }
    STATUS_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(
        f"written: {STATUS_FILE.name} "
        f"({payload['summary']['up']}/{payload['summary']['total']} up)"
    )


if __name__ == "__main__":
    main()

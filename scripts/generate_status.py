#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Живой статус сервисов витрины ssrjkk.github.io.

Каждый запуск (Actions, раз в 15 минут) опрашивает все публичные сайты,
перечисленные в хабе, и пишет status.json:
  - текущее состояние (ok / код / время ответа);
  - скользящая история последних проверок и uptime % по каждой цели.

Только стандартная библиотека. Автор: ssrjkk.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATUS_FILE = ROOT / "status.json"
HISTORY_LIMIT = 60  # ~15 часов непрерывной истории при cron */15

# (id, человекочитаемое имя, URL) — ровно то, что показано на витрине.
TARGETS = [
    ("hub", "Хаб", "https://ssrjkk.github.io/"),
    ("shopwatch", "Shopwatch", "https://ssrjkk.github.io/shopwatch/"),
    ("bothive", "Bothive", "https://ssrjkk.github.io/bothive/"),
    ("raven", "Raven", "https://ssrjkk.github.io/raven/"),
    ("agent-skills", "Agent Skills", "https://ssrjkk.github.io/agent-skills/"),
    ("drafter", "Drafter", "https://ssrjkk.github.io/drafter/"),
    ("ezzoffer", "EZZoffer", "https://ssrjkk.github.io/ezzoffer/"),
    ("harvest", "Harvest", "https://ssrjkk.github.io/harvest/"),
    ("shroud", "Shroud", "https://ssrjkk.github.io/shroud/"),
    ("wake", "Wake", "https://wake-7k6.pages.dev/"),
    ("tippy", "Tippy on Base", "https://tippy-egi.pages.dev/"),
]


def probe(url: str, timeout: float = 10.0, attempts: int = 2) -> tuple[bool, int, int]:
    """Вернёт (ok, http_code, мс). Туннели иногда делают первый рывок — даём ретрай."""
    last_code = 0
    for i in range(attempts):
        start = time.monotonic()
        req = urllib.request.Request(
            url, headers={"User-Agent": "ssrjkk-hub-status/1.0", "Cache-Control": "no-cache"}
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                code = resp.status
                ok = 200 <= code < 400
        except Exception:  # noqa: BLE001 — любой сбой сети = недоступность
            code = 0
            ok = False
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
    old_targets = {t.get("id"): t for t in previous.get("targets", [])}

    targets = []
    for tid, name, url in TARGETS:
        ok, code, ms = probe(url)
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
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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
    print(f"written: {STATUS_FILE.name} ({payload['summary']['up']}/{payload['summary']['total']} up)")


if __name__ == "__main__":
    main()

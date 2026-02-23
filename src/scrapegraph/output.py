"""Writes scan results to JSON files in the platform output directory."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone


def _build_envelope(
    scan_id: str,
    mode: str,
    target_url: str | None,
    timestamp: str,
    status: str,
    result: dict | None,
    error: str | None,
) -> dict:
    return {
        "scan_id": scan_id,
        "tool": "scrapegraph",
        "mode": mode,
        "target_url": target_url,
        "timestamp": timestamp,
        "status": status,
        "result": result,
        "error": error,
    }


def save_result(
    scan_id: str,
    mode: str,
    target_url: str | None,
    result: dict,
    output_dir: str,
) -> str:
    """Write a successful scan result envelope and return the output file path."""
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    safe_ts = timestamp.replace(":", "-").replace("+", "").split(".")[0]
    filename = f"scrapegraph_{mode}_{safe_ts}.json"
    filepath = os.path.join(output_dir, filename)

    envelope = _build_envelope(
        scan_id=scan_id,
        mode=mode,
        target_url=target_url,
        timestamp=timestamp,
        status="success",
        result=result,
        error=None,
    )
    with open(filepath, "w") as f:
        json.dump(envelope, f, indent=2, default=str)
    return filepath


def save_error_result(
    scan_id: str,
    mode: str,
    target_url: str | None,
    error: str,
    output_dir: str,
) -> str:
    """Write a failed scan result envelope and return the output file path."""
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    safe_ts = timestamp.replace(":", "-").replace("+", "").split(".")[0]
    filename = f"scrapegraph_{mode}_{safe_ts}_error.json"
    filepath = os.path.join(output_dir, filename)

    envelope = _build_envelope(
        scan_id=scan_id,
        mode=mode,
        target_url=target_url,
        timestamp=timestamp,
        status="failed",
        result=None,
        error=error,
    )
    with open(filepath, "w") as f:
        json.dump(envelope, f, indent=2, default=str)
    return filepath

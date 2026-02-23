"""Configuration reader for ScrapeGraphAI — reads config.yaml and builds graph_config."""

from __future__ import annotations

import os
import yaml

# Default paths relative to the NewFolder project root
_DEFAULT_CONFIG_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "config", "config.yaml"
)
_DEFAULT_OUTPUT_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "scans"
)
_DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
_DEFAULT_MODEL = "ollama/llama3.1:8b"
_DEFAULT_EMBEDDINGS_MODEL = "nomic-embed-text"


def _load_yaml(config_path: str | None = None) -> dict:
    path = config_path or _DEFAULT_CONFIG_PATH
    path = os.path.abspath(path)
    if not os.path.exists(path):
        return {}
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def _strip_api_path(url: str) -> str:
    """Remove /api/generate (or any trailing path) to get the Ollama base URL."""
    for suffix in ("/api/generate", "/api/chat", "/api/"):
        if url.endswith(suffix):
            return url[: -len(suffix)]
    # Strip any path component beyond host:port
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def build_graph_config(config_path: str | None = None) -> dict:
    """Build the graph_config dict expected by ScrapeGraphAI."""
    cfg = _load_yaml(config_path)
    analyzer = cfg.get("analyzer", {})

    raw_url = analyzer.get("llama_api_url", _DEFAULT_OLLAMA_BASE_URL)
    base_url = _strip_api_path(raw_url)

    raw_model = analyzer.get("model", "")
    if raw_model and not raw_model.startswith("ollama/"):
        model = f"ollama/{raw_model}"
    elif raw_model:
        model = raw_model
    else:
        model = _DEFAULT_MODEL

    return {
        "llm": {
            "model": model,
            "base_url": base_url,
            "model_tokens": 8192,
        },
        "embeddings": {
            "model": f"ollama/{_DEFAULT_EMBEDDINGS_MODEL}",
            "base_url": base_url,
        },
        "verbose": False,
        "headless": True,
    }


def get_output_dir(config_path: str | None = None) -> str:
    """Return the absolute path to the scan output directory."""
    cfg = _load_yaml(config_path)
    scanner = cfg.get("scanner", {})
    output_dir = scanner.get("output_dir", "data/scans")

    if os.path.isabs(output_dir):
        return output_dir

    # Resolve relative to project root (two levels up from this file)
    project_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )
    return os.path.join(project_root, output_dir)

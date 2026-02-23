"""Core ScrapeGraphAI runner — four scraping modes backed by local Ollama."""

from __future__ import annotations

import logging
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from .config import build_graph_config, get_output_dir
from .output import save_result, save_error_result
from .prompts import (
    SENSITIVE_EXTRACTION_PROMPT,
    STRUCTURED_EXTRACTION_PROMPT,
    CRAWL_EXTRACTION_PROMPT,
    RESEARCH_PROMPT_TEMPLATE,
)

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_scan_id() -> str:
    return str(uuid.uuid4())


class ScrapeGraphRunner:
    """Runs ScrapeGraphAI scraping operations against a local Ollama instance."""

    def __init__(self, config_path: str | None = None):
        self.graph_config = build_graph_config(config_path)
        self.output_dir = get_output_dir(config_path)
        logger.debug("ScrapeGraphRunner initialized with config: %s", self.graph_config)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _make_result(
        self,
        scan_id: str,
        mode: str,
        target_url: str | None,
        status: str,
        result: dict | None,
        output_file: str | None,
        error: str | None,
    ) -> dict:
        return {
            "scan_id": scan_id,
            "tool": "scrapegraph",
            "mode": mode,
            "target_url": target_url,
            "timestamp": _now_iso(),
            "status": status,
            "result": result,
            "output_file": output_file,
            "error": error,
        }

    def _scrape_single(self, url: str, prompt: str) -> Any:
        """Run SmartScraperGraph on a single URL."""
        from scrapegraphai.graphs import SmartScraperGraph  # noqa: PLC0415

        graph = SmartScraperGraph(
            prompt=prompt,
            source=url,
            config=self.graph_config,
        )
        return graph.run()

    # ------------------------------------------------------------------
    # Public scraping modes
    # ------------------------------------------------------------------

    def run_sensitive(self, url: str, save: bool = True) -> dict:
        """Extract sensitive information (API keys, credentials, PII) from a URL."""
        scan_id = _make_scan_id()
        mode = "sensitive"
        logger.info("[%s] Starting sensitive extraction on %s", scan_id, url)

        try:
            raw = self._scrape_single(url, SENSITIVE_EXTRACTION_PROMPT)

            findings = raw.get("findings", []) if isinstance(raw, dict) else []
            severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for f in findings:
                sev = f.get("severity", "low")
                if sev in severity_counts:
                    severity_counts[sev] += 1

            base = raw if isinstance(raw, dict) else {"raw": raw}
            result = {
                **base,
                "_severity_counts": severity_counts,
                "_total_findings": len(findings),
            }

            output_file = None
            if save:
                output_file = save_result(scan_id, mode, url, result, self.output_dir)
                logger.info("[%s] Result saved to %s", scan_id, output_file)

            return self._make_result(scan_id, mode, url, "success", result, output_file, None)

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.error("[%s] Sensitive extraction failed: %s", scan_id, error_msg)
            logger.debug(traceback.format_exc())
            output_file = None
            if save:
                output_file = save_error_result(scan_id, mode, url, error_msg, self.output_dir)
            return self._make_result(scan_id, mode, url, "failed", None, output_file, error_msg)

    def run_structured(self, url: str, save: bool = True) -> dict:
        """Extract structured recon data (endpoints, forms, tech stack) from a URL."""
        scan_id = _make_scan_id()
        mode = "structured"
        logger.info("[%s] Starting structured extraction on %s", scan_id, url)

        try:
            raw = self._scrape_single(url, STRUCTURED_EXTRACTION_PROMPT)
            result = raw if isinstance(raw, dict) else {"raw": raw}

            output_file = None
            if save:
                output_file = save_result(scan_id, mode, url, result, self.output_dir)
                logger.info("[%s] Result saved to %s", scan_id, output_file)

            return self._make_result(scan_id, mode, url, "success", result, output_file, None)

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.error("[%s] Structured extraction failed: %s", scan_id, error_msg)
            logger.debug(traceback.format_exc())
            output_file = None
            if save:
                output_file = save_error_result(scan_id, mode, url, error_msg, self.output_dir)
            return self._make_result(scan_id, mode, url, "failed", None, output_file, error_msg)

    def run_crawl(
        self,
        url: str,
        max_pages: int = 10,
        additional_urls: list[str] | None = None,
        save: bool = True,
    ) -> dict:
        """
        Multi-page crawl using two phases:
        1. SmartScraperGraph discovers internal links from the seed URL.
        2. SmartScraperMultiGraph runs CRAWL prompt against all collected pages.
        """
        from scrapegraphai.graphs import SmartScraperGraph, SmartScraperMultiGraph  # noqa: PLC0415

        scan_id = _make_scan_id()
        mode = "crawl"
        logger.info("[%s] Starting multi-page crawl on %s (max_pages=%d)", scan_id, url, max_pages)

        try:
            # Phase 1: discover internal links from seed
            link_discovery_prompt = (
                "Extract all internal links (same domain) from this page. "
                "Return JSON: {\"internal_links\": [\"url1\", \"url2\", ...]}"
            )
            discovery_raw = self._scrape_single(url, link_discovery_prompt)

            discovered = []
            if isinstance(discovery_raw, dict):
                discovered = discovery_raw.get("internal_links", [])
            elif isinstance(discovery_raw, list):
                discovered = discovery_raw

            # Merge seed + discovered + additional, deduplicate, cap at max_pages
            all_urls = [url]
            for u in (additional_urls or []) + discovered:
                if u and u not in all_urls:
                    all_urls.append(u)
            all_urls = all_urls[:max_pages]

            logger.info("[%s] Crawling %d URLs", scan_id, len(all_urls))

            # Phase 2: multi-page extraction
            multi_graph = SmartScraperMultiGraph(
                prompt=CRAWL_EXTRACTION_PROMPT,
                source=all_urls,
                config=self.graph_config,
            )
            raw = multi_graph.run()

            result = raw if isinstance(raw, dict) else {"raw": raw}
            result["_crawl_meta"] = {
                "seed_url": url,
                "urls_crawled": all_urls,
                "pages_count": len(all_urls),
                "max_pages": max_pages,
            }

            output_file = None
            if save:
                output_file = save_result(scan_id, mode, url, result, self.output_dir)
                logger.info("[%s] Result saved to %s", scan_id, output_file)

            return self._make_result(scan_id, mode, url, "success", result, output_file, None)

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.error("[%s] Crawl failed: %s", scan_id, error_msg)
            logger.debug(traceback.format_exc())
            output_file = None
            if save:
                output_file = save_error_result(scan_id, mode, url, error_msg, self.output_dir)
            return self._make_result(scan_id, mode, url, "failed", None, output_file, error_msg)

    def run_research(
        self,
        query: str,
        context_url: str | None = None,
        save: bool = True,
    ) -> dict:
        """
        OSINT research using SearchGraph for web search.
        Optionally enriches results with a specific page via SmartScraperGraph.
        """
        from scrapegraphai.graphs import SearchGraph  # noqa: PLC0415

        scan_id = _make_scan_id()
        mode = "research"
        target = context_url or query
        logger.info("[%s] Starting OSINT research: %s", scan_id, query)

        try:
            # Optional: enrich with a specific context URL first
            context_data = None
            if context_url:
                logger.info("[%s] Fetching context from %s", scan_id, context_url)
                ctx_prompt = (
                    f"Summarize the security-relevant content of this page "
                    f"in relation to: {query}"
                )
                try:
                    context_data = self._scrape_single(context_url, ctx_prompt)
                except Exception as ctx_exc:
                    logger.warning("[%s] Context URL fetch failed: %s", scan_id, ctx_exc)

            # Build final prompt
            research_prompt = RESEARCH_PROMPT_TEMPLATE.format(query=query)

            # SearchGraph for web-wide research
            search_graph = SearchGraph(
                prompt=research_prompt,
                config=self.graph_config,
            )
            raw = search_graph.run()

            result = raw if isinstance(raw, dict) else {"raw": raw}
            if context_data is not None:
                result["_context_page_data"] = (
                    context_data if isinstance(context_data, dict) else {"raw": context_data}
                )

            output_file = None
            if save:
                output_file = save_result(scan_id, mode, target, result, self.output_dir)
                logger.info("[%s] Result saved to %s", scan_id, output_file)

            return self._make_result(scan_id, mode, target, "success", result, output_file, None)

        except Exception as exc:
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.error("[%s] Research failed: %s", scan_id, error_msg)
            logger.debug(traceback.format_exc())
            output_file = None
            if save:
                output_file = save_error_result(scan_id, mode, target, error_msg, self.output_dir)
            return self._make_result(scan_id, mode, target, "failed", None, output_file, error_msg)

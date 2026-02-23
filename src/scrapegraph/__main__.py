"""CLI entry point: python -m src.scrapegraph

Usage examples:
  python -m src.scrapegraph --url https://example.com --mode sensitive
  python -m src.scrapegraph --url https://example.com --mode structured --no-save
  python -m src.scrapegraph --url https://example.com --mode crawl --max-pages 15
  python -m src.scrapegraph --query "CVE-2024-1234" --mode research
"""

import argparse
import json
import logging
import sys


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m src.scrapegraph",
        description="ScrapeGraphAI-powered web scraping and OSINT research for Spectra",
    )

    parser.add_argument(
        "--url", "-u",
        metavar="URL",
        help="Target URL to scrape (required for sensitive, structured, crawl modes)",
    )
    parser.add_argument(
        "--query", "-q",
        metavar="QUERY",
        help="Research query string (required for research mode)",
    )
    parser.add_argument(
        "--mode", "-m",
        required=True,
        choices=["sensitive", "structured", "crawl", "research"],
        help="Scraping mode to run",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=10,
        metavar="N",
        help="Maximum pages to crawl in crawl mode (default: 10)",
    )
    parser.add_argument(
        "--extra-urls",
        nargs="+",
        metavar="URL",
        default=None,
        help="Additional URLs to include in crawl mode",
    )
    parser.add_argument(
        "--config",
        metavar="PATH",
        default=None,
        help="Path to config.yaml (defaults to project config/config.yaml)",
    )
    parser.add_argument(
        "--no-save",
        action="store_true",
        help="Print JSON result to stdout instead of saving to file",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable debug logging",
    )

    return parser.parse_args()


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main() -> None:
    args = _parse_args()
    _setup_logging(args.verbose)

    # Validate required arguments per mode
    if args.mode in ("sensitive", "structured", "crawl") and not args.url:
        print(f"error: --url is required for mode '{args.mode}'", file=sys.stderr)
        sys.exit(1)

    if args.mode == "research" and not args.query:
        print("error: --query is required for research mode", file=sys.stderr)
        sys.exit(1)

    save = not args.no_save

    try:
        from .scraper import ScrapeGraphRunner  # noqa: PLC0415
        runner = ScrapeGraphRunner(config_path=args.config)
    except ImportError as e:
        print(
            f"error: Failed to import ScrapeGraphAI — is it installed?\n"
            f"  Run: pip install scrapegraphai\n  Details: {e}",
            file=sys.stderr,
        )
        sys.exit(1)

    result: dict
    if args.mode == "sensitive":
        result = runner.run_sensitive(args.url, save=save)
    elif args.mode == "structured":
        result = runner.run_structured(args.url, save=save)
    elif args.mode == "crawl":
        result = runner.run_crawl(
            args.url,
            max_pages=args.max_pages,
            additional_urls=args.extra_urls,
            save=save,
        )
    elif args.mode == "research":
        result = runner.run_research(
            args.query,
            context_url=args.url,
            save=save,
        )

    print(json.dumps(result, indent=2, default=str))

    if result.get("status") == "failed":
        sys.exit(1)


if __name__ == "__main__":
    main()

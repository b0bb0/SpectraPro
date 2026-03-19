#!/usr/bin/env python3
"""
Enhanced Vulnerability Analysis CLI with Ollama - Phase 2
Analyzes Nuclei/Spectra scan results with local LLM
Features: Progress tracking, filtering, multi-format output, caching
"""

import json
import sys
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

from ollama_vulnerability_analyzer import (
    OllamaVulnerabilityAnalyzer,
    OllamaConfig,
)
from report_generator import ReportGenerator
from cache_manager import get_cache_manager
from progress_utils import (
    ProgressBar, AnalysisProgress, print_progress_step,
    print_completed, print_warning, format_time
)
from parallel_processor import (
    ParallelProcessor, BatchParallelAnalyzer, get_optimal_worker_count,
    print_parallel_stats
)


def load_vulnerabilities(file_path: str) -> List[Dict]:
    """Load vulnerabilities from JSONL file"""
    vulnerabilities = []
    try:
        with open(file_path, 'r') as f:
            for line in f:
                if line.strip():
                    try:
                        vulnerabilities.append(json.loads(line))
                    except json.JSONDecodeError as e:
                        print(f"⚠️  Skipping invalid JSON line: {e}")
                        continue
        return vulnerabilities
    except FileNotFoundError:
        print(f"✗ File not found: {file_path}")
        return []
    except Exception as e:
        print(f"✗ Error reading file: {e}")
        return []


def filter_vulnerabilities(
    vulnerabilities: List[Dict],
    severity: Optional[str] = None,
    vuln_type: Optional[str] = None,
    include_patterns: Optional[List[str]] = None,
    exclude_patterns: Optional[List[str]] = None
) -> List[Dict]:
    """Filter vulnerabilities by criteria"""
    filtered = vulnerabilities

    if severity:
        severity_list = [s.strip().lower() for s in severity.split(',')]
        filtered = [
            v for v in filtered
            if v.get('info', {}).get('severity', 'info').lower() in severity_list
        ]

    if vuln_type:
        type_list = [t.strip().lower() for t in vuln_type.split(',')]
        filtered = [v for v in filtered if v.get('type', '').lower() in type_list]

    if include_patterns:
        filtered = [
            v for v in filtered
            if any(
                pattern.lower() in v.get('info', {}).get('name', '').lower()
                for pattern in include_patterns
            )
        ]

    if exclude_patterns:
        filtered = [
            v for v in filtered
            if not any(
                pattern.lower() in v.get('info', {}).get('name', '').lower()
                for pattern in exclude_patterns
            )
        ]

    return filtered


def print_summary(results: Dict, filtered_count: int = 0, cache_stats: Dict = None) -> None:
    """Print analysis summary to console"""
    print("\n" + "=" * 80)
    print("VULNERABILITY ANALYSIS SUMMARY")
    print("=" * 80)

    metadata = results.get('metadata', {})
    if metadata:
        print(f"\nMetadata:")
        print(f"  Total Loaded: {metadata.get('vulnerability_count', 0)}")
        if filtered_count > 0:
            print(f"  After Filtering: {filtered_count}")
        print(f"  Analyzed: {metadata.get('analyzed_count', 0)}")
        print(f"  Model: {metadata.get('model', 'N/A')}")
        print(f"  Analysis Type: {metadata.get('analysis_type', 'N/A')}")

    # Show cache stats if available
    if cache_stats:
        print(f"\nCache Statistics:")
        print(f"  Cache Hits: {cache_stats.get('cache_hits', 0)}")
        print(f"  Cache Misses: {cache_stats.get('cache_misses', 0)}")
        print(f"  Hit Rate: {cache_stats.get('hit_rate', 0):.1f}%")
        print(f"  Time Saved: {cache_stats.get('time_saved_seconds', 0):.1f}s")

    if 'risk_assessment' in results:
        assessment = results['risk_assessment']
        print(f"\n📊 Risk Assessment:")
        print("-" * 80)
        assessment_text = assessment.get('assessment', 'N/A')
        print(assessment_text[:500] + "..." if len(assessment_text) > 500 else assessment_text)

    if 'attack_vectors' in results:
        vectors = results['attack_vectors']
        print(f"\n🎯 Attack Vectors:")
        print("-" * 80)
        vectors_text = vectors.get('vectors', 'N/A')
        print(vectors_text[:500] + "..." if len(vectors_text) > 500 else vectors_text)

    if 'batch_analysis' in results:
        analyses = results['batch_analysis']
        print(f"\n📋 Detailed Analyses: {len(analyses)} vulnerabilities analyzed")

    print("\n" + "=" * 80)


def print_examples() -> None:
    """Print usage examples"""
    examples = """
EXAMPLES - PHASE 2 (with caching and progress):

1. Basic analysis with progress bar:
   python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl

2. Enable caching (50-80% faster on re-runs):
   python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --use-cache

3. Clear cache before analysis (fresh run):
   python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --clear-cache

4. View cache statistics:
   python3 analyze_vulnerabilities_with_ollama.py --cache-stats

5. Analyze only CRITICAL and HIGH severity issues:
   python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --severity critical,high

6. Analyze specific vulnerability types:
   python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --type http,dns

7. Generate report in CSV format:
   python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --format csv -o report.csv

8. Generate HTML report with caching:
   python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --format html -o report.html --use-cache

9. Analyze top 5 vulnerabilities with progress:
   python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl -t 5

10. Include only certain patterns:
    python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --include-patterns "sql,injection,xss"

11. Exclude patterns:
    python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --exclude-patterns "info"

12. Preview what will be analyzed (dry-run):
    python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --dry-run

13. Comprehensive analysis with caching and progress:
    python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --all-analysis --use-cache

14. Risk assessment only in plain text:
    python3 analyze_vulnerabilities_with_ollama.py scan_results.jsonl --risk-only --format txt -o assessment.txt

15. Export cache statistics to JSON:
    python3 analyze_vulnerabilities_with_ollama.py --cache-stats --export-stats cache_stats.json
"""
    print(examples)


def main():
    parser = argparse.ArgumentParser(
        description='Enhanced vulnerability analysis with local Ollama LLM - Phase 2',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='Use --examples for usage examples. Use --cache-stats for cache information.'
    )

    # Positional arguments
    parser.add_argument(
        'scan_file',
        nargs='?',
        help='Path to Nuclei JSONL scan results'
    )

    # Model selection
    parser.add_argument(
        '-m', '--model',
        default='hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16',
        help='Ollama model to use (default: hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated:BF16)'
    )

    # Output options
    parser.add_argument(
        '-o', '--output',
        help='Output file for analysis results (default: auto-generated)'
    )
    parser.add_argument(
        '--format',
        choices=['json', 'csv', 'html', 'txt'],
        default='json',
        help='Output format (default: json)'
    )

    # Analysis modes
    parser.add_argument(
        '-a', '--all-analysis',
        action='store_true',
        help='Run all available analyses (slower, more comprehensive)'
    )
    parser.add_argument(
        '--risk-only',
        action='store_true',
        help='Run risk assessment only'
    )
    parser.add_argument(
        '--remediation-only',
        action='store_true',
        help='Run remediation recommendations only'
    )

    # Filtering options
    parser.add_argument(
        '--severity',
        help='Filter by severity (critical,high,medium,low,info). Use comma-separated values'
    )
    parser.add_argument(
        '--type',
        dest='vuln_type',
        help='Filter by vulnerability type (http,dns,network). Use comma-separated values'
    )
    parser.add_argument(
        '--include-patterns',
        help='Include only vulnerabilities with these patterns in name. Comma-separated'
    )
    parser.add_argument(
        '--exclude-patterns',
        help='Exclude vulnerabilities with these patterns in name. Comma-separated'
    )

    # Caching options
    parser.add_argument(
        '--use-cache',
        action='store_true',
        help='Enable caching of Ollama responses for faster re-runs'
    )
    parser.add_argument(
        '--clear-cache',
        action='store_true',
        help='Clear cache before analysis (fresh run)'
    )
    parser.add_argument(
        '--cache-dir',
        default='.cache/ollama_analysis',
        help='Cache directory'
    )
    parser.add_argument(
        '--cache-stats',
        action='store_true',
        help='Show cache statistics'
    )
    parser.add_argument(
        '--export-stats',
        help='Export cache statistics to JSON file'
    )

    # Parallel processing options
    parser.add_argument(
        '--workers',
        type=int,
        default=None,
        help='Number of worker threads for parallel processing (default: auto-detect)'
    )
    parser.add_argument(
        '--no-parallel',
        action='store_true',
        help='Disable parallel processing'
    )

    # Advanced options
    parser.add_argument(
        '-t', '--top',
        type=int,
        default=10,
        help='Number of top vulnerabilities to analyze (default: 10)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview what will be analyzed without running full analysis'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Verbose output with detailed logging'
    )
    parser.add_argument(
        '--examples',
        action='store_true',
        help='Show usage examples'
    )

    args = parser.parse_args()

    # Handle cache stats request
    if args.cache_stats:
        cache = get_cache_manager(args.cache_dir)
        stats = cache.get_stats()
        if stats:
            print("\n" + "=" * 80)
            print("CACHE STATISTICS")
            print("=" * 80)
            print(f"\nCache Location: {cache.cache_dir}")
            print(f"Total Entries: {stats.get('total_entries', 0)}")
            print(f"Total Hits: {stats.get('total_hits', 0)}")
            print(f"Hit Rate: {cache.get_hit_rate():.1f}%")
            print(f"Unique Models: {', '.join(stats.get('unique_models', []))}")
            print(f"Cache Size: {stats.get('cache_size_mb', 0)} MB")
            if stats.get('oldest_entry'):
                print(f"Oldest Entry: {stats.get('oldest_entry')}")
            if stats.get('newest_entry'):
                print(f"Newest Entry: {stats.get('newest_entry')}")
            print("=" * 80 + "\n")

        # Export if requested
        if args.export_stats:
            if cache.export_stats(args.export_stats):
                print(f"✓ Cache stats exported to {args.export_stats}")
            else:
                print(f"✗ Failed to export cache stats")

        sys.exit(0)

    # Handle examples request
    if args.examples:
        print_examples()
        sys.exit(0)

    # Verify scan file provided
    if not args.scan_file:
        parser.print_help()
        sys.exit(1)

    # Verify file exists
    if not Path(args.scan_file).exists():
        print(f"✗ File not found: {args.scan_file}")
        sys.exit(1)

    # Load vulnerabilities
    print(f"[*] Loading vulnerabilities from {args.scan_file}...")
    vulnerabilities = load_vulnerabilities(args.scan_file)

    if not vulnerabilities:
        print("✗ No vulnerabilities loaded")
        sys.exit(1)

    print(f"✓ Loaded {len(vulnerabilities)} vulnerabilities")

    # Parse filter patterns
    include_patterns = None
    exclude_patterns = None
    if args.include_patterns:
        include_patterns = [p.strip() for p in args.include_patterns.split(',')]
    if args.exclude_patterns:
        exclude_patterns = [p.strip() for p in args.exclude_patterns.split(',')]

    # Apply filters
    filtered_vulns = filter_vulnerabilities(
        vulnerabilities,
        severity=args.severity,
        vuln_type=args.vuln_type,
        include_patterns=include_patterns,
        exclude_patterns=exclude_patterns
    )

    print(f"✓ After filtering: {len(filtered_vulns)} vulnerabilities")

    # Handle dry-run
    if args.dry_run:
        print("\n" + "=" * 80)
        print("DRY-RUN: Would analyze the following vulnerabilities:")
        print("=" * 80)
        for i, vuln in enumerate(filtered_vulns[:args.top], 1):
            info = vuln.get('info', {})
            print(f"{i}. [{info.get('severity', 'unknown').upper()}] {info.get('name', 'Unknown')}")
        print("=" * 80)
        print(f"\nTo run full analysis, remove --dry-run flag")
        sys.exit(0)

    # Select vulnerabilities to analyze
    to_analyze = filtered_vulns[:args.top]

    # Initialize cache if enabled
    cache = None
    cache_stats = {
        'cache_hits': 0,
        'cache_misses': 0,
        'hit_rate': 0.0,
        'time_saved_seconds': 0.0
    }

    if args.use_cache:
        cache = get_cache_manager(args.cache_dir)
        if args.clear_cache:
            deleted = cache.clear()
            print(f"✓ Cleared {deleted} cache entries")

    # Initialize analyzer
    print(f"[*] Initializing Ollama analyzer with model: {args.model}")
    config = OllamaConfig(model=args.model)
    analyzer = OllamaVulnerabilityAnalyzer(config)

    # Prepare results
    results = {
        'metadata': {
            'scan_file': str(args.scan_file),
            'scan_date': datetime.now().isoformat(),
            'vulnerability_count': len(vulnerabilities),
            'filtered_count': len(filtered_vulns),
            'analyzed_count': len(to_analyze),
            'model': args.model,
            'analysis_type': 'comprehensive' if args.all_analysis else 'standard',
            'cache_enabled': args.use_cache
        }
    }

    # Run analyses based on arguments
    try:
        # Initialize progress tracking
        analysis_progress = AnalysisProgress(
            len(to_analyze),
            analysis_type='all-analysis' if args.all_analysis else
                         'risk-only' if args.risk_only else
                         'remediation-only' if args.remediation_only else
                         'standard'
        )

        if args.all_analysis or (not args.risk_only and not args.remediation_only):
            # Standard analysis with parallel processing
            print("\n[*] Running batch vulnerability analysis...")
            pbar = analysis_progress.start_stage("Batch Analysis")

            # Determine if parallel processing should be used
            use_parallel = not args.no_parallel and len(to_analyze) > 4

            if use_parallel:
                # Parallel processing
                optimal_workers = args.workers or get_optimal_worker_count(len(to_analyze))
                print(f"[*] Using parallel processing with {optimal_workers} workers")

                parallel_analyzer = BatchParallelAnalyzer(
                    analyzer,
                    cache_manager=cache,
                    workers=optimal_workers
                )

                batch_results = parallel_analyzer.analyze_vulnerabilities_parallel(
                    to_analyze,
                    show_progress=True
                )

                # Update cache stats from parallel analyzer
                parallel_stats = parallel_analyzer.get_cache_stats()
                cache_stats['cache_hits'] = parallel_stats['cache_hits']
                cache_stats['cache_misses'] = parallel_stats['cache_misses']
            else:
                # Sequential processing (for small batches)
                batch_results = []
                for vuln in to_analyze:
                    # Check cache first
                    cached_response = None
                    if cache:
                        cached_response = cache.get(vuln, args.model, 'single')
                        if cached_response:
                            cache_stats['cache_hits'] += 1
                        else:
                            cache_stats['cache_misses'] += 1

                    if cached_response:
                        # Use cached analysis
                        analysis = {
                            'vulnerability_id': vuln.get('template-id'),
                            'name': vuln.get('info', {}).get('name'),
                            'severity': vuln.get('info', {}).get('severity'),
                            'analysis': cached_response,
                            'timestamp': datetime.now().isoformat(),
                            'from_cache': True
                        }
                    else:
                        # Perform new analysis
                        analysis = analyzer.analyze_vulnerability(vuln)
                        analysis['from_cache'] = False

                        # Cache the result
                        if cache:
                            cache.set(vuln, args.model, 'single', analysis.get('analysis', ''))

                    batch_results.append(analysis)
                    pbar.update(1)

            pbar.close()
            results['batch_analysis'] = batch_results
            analysis_progress.finish_stage()

            # Risk Assessment
            print("[*] Generating risk assessment...")
            pbar = analysis_progress.start_stage("Risk Assessment")
            results['risk_assessment'] = analyzer.generate_risk_assessment(filtered_vulns)
            pbar.update(1)
            pbar.close()
            analysis_progress.finish_stage()

            # Attack Vectors
            print("[*] Analyzing attack vectors...")
            pbar = analysis_progress.start_stage("Attack Vectors")
            results['attack_vectors'] = analyzer.detect_attack_vectors(to_analyze)
            pbar.update(1)
            pbar.close()
            analysis_progress.finish_stage()

            # Severity Analysis
            print("[*] Analyzing severity levels...")
            pbar = analysis_progress.start_stage("Severity Analysis")
            results['severity_analysis'] = analyzer.compare_severity(filtered_vulns)
            pbar.update(1)
            pbar.close()
            analysis_progress.finish_stage()

        if args.all_analysis:
            # Extended analysis - Remediation
            print("[*] Generating remediation recommendations...")
            remediation_count = min(5, len(filtered_vulns))
            results['remediation'] = []

            pbar = analysis_progress.start_stage(f"Remediation (Top {remediation_count})")
            for v in filtered_vulns[:remediation_count]:
                results['remediation'].append(analyzer.recommend_remediation(v))
                pbar.update(1)
            pbar.close()
            analysis_progress.finish_stage()

        elif args.risk_only:
            print("[*] Generating risk assessment...")
            pbar = analysis_progress.start_stage("Risk Assessment")
            results['risk_assessment'] = analyzer.generate_risk_assessment(filtered_vulns)
            pbar.update(1)
            pbar.close()
            analysis_progress.finish_stage()

        elif args.remediation_only:
            print("[*] Generating remediation recommendations...")
            remediation_count = min(5, len(filtered_vulns))
            results['remediation'] = []

            pbar = analysis_progress.start_stage(f"Remediation (Top {remediation_count})")
            for v in filtered_vulns[:remediation_count]:
                results['remediation'].append(analyzer.recommend_remediation(v))
                pbar.update(1)
            pbar.close()
            analysis_progress.finish_stage()

        # Generate output file name if not provided
        if not args.output:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            args.output = f"ollama_analysis_{timestamp}.{args.format}"

        # Save results in specified format
        print(f"\n[*] Generating {args.format.upper()} report...")
        report = ReportGenerator(results)
        if report.save(args.output, args.format):
            print(f"✓ Results saved to: {args.output}")
        else:
            print(f"✗ Failed to save results")
            sys.exit(1)

        # Print summary with cache stats
        print_summary(results, len(filtered_vulns), cache_stats if args.use_cache else None)

        print(f"\n✓ Analysis complete!")
        print(f"📄 Output file: {args.output}")

        # Show cache stats if enabled
        if args.use_cache and cache:
            stats = cache.get_stats()
            if stats:
                print(f"\n✓ Cache Info:")
                print(f"  Total Cached Entries: {stats.get('total_entries', 0)}")
                print(f"  Hit Rate: {cache.get_hit_rate():.1f}%")
                print(f"  Cache Size: {stats.get('cache_size_mb', 0)} MB")

    except KeyboardInterrupt:
        print("\n\n[!] Analysis interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Analysis failed: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()

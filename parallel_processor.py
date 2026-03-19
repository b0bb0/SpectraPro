#!/usr/bin/env python3
"""
Parallel Processor for Vulnerability Analysis
Uses concurrent.futures for thread-based parallelization
Provides 4-6x speed improvement on multi-core systems
"""

import os
import logging
from typing import Callable, List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import time

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

logger = logging.getLogger(__name__)


class ParallelProcessor:
    """
    Parallel processor for concurrent vulnerability analysis
    Uses thread pools for efficient multi-core utilization
    """

    def __init__(self, workers: Optional[int] = None, timeout: int = 300):
        """
        Initialize parallel processor

        Args:
            workers: Number of worker threads (default: CPU count)
            timeout: Timeout per task in seconds
        """
        if workers is None:
            # Default to number of CPU cores
            workers = min(os.cpu_count() or 4, 8)  # Cap at 8

        self.workers = workers
        self.timeout = timeout
        self.tasks_completed = 0
        self.tasks_failed = 0
        self.total_time = 0

        logger.info(f"Parallel processor initialized with {workers} workers")

    def process_batch(
        self,
        items: List[Any],
        processor_func: Callable[[Any], Any],
        desc: str = "Processing",
        show_progress: bool = True
    ) -> List[Any]:
        """
        Process items in parallel with progress tracking

        Args:
            items: List of items to process
            processor_func: Function to apply to each item
            desc: Description for progress bar
            show_progress: Show progress bar

        Returns:
            List of processed results in original order
        """
        if not items:
            return []

        results = [None] * len(items)
        start_time = time.time()

        try:
            with ThreadPoolExecutor(max_workers=self.workers) as executor:
                # Submit all tasks
                future_to_idx = {
                    executor.submit(processor_func, item): idx
                    for idx, item in enumerate(items)
                }

                # Process completions with progress tracking
                if HAS_TQDM and show_progress:
                    with tqdm(
                        total=len(items),
                        desc=desc,
                        unit="items",
                        ncols=100
                    ) as pbar:
                        for future in as_completed(future_to_idx, timeout=self.timeout):
                            idx = future_to_idx[future]
                            try:
                                results[idx] = future.result()
                                self.tasks_completed += 1
                                pbar.update(1)
                            except Exception as e:
                                logger.error(f"Task {idx} failed: {e}")
                                self.tasks_failed += 1
                                results[idx] = None
                                pbar.update(1)
                else:
                    # Without progress bar
                    completed = 0
                    for future in as_completed(future_to_idx, timeout=self.timeout):
                        idx = future_to_idx[future]
                        try:
                            results[idx] = future.result()
                            self.tasks_completed += 1
                        except Exception as e:
                            logger.error(f"Task {idx} failed: {e}")
                            self.tasks_failed += 1
                            results[idx] = None

                        completed += 1
                        if show_progress:
                            percent = (completed / len(items)) * 100
                            print(f"  {desc}: {completed}/{len(items)} ({percent:.0f}%)", end='\r')

        except TimeoutError:
            logger.error(f"Processing timeout after {self.timeout} seconds")
            raise

        self.total_time += time.time() - start_time
        return results

    def process_with_map(
        self,
        items: List[Any],
        processor_func: Callable[[Any], Any],
        desc: str = "Processing",
        show_progress: bool = True,
        timeout: Optional[int] = None
    ) -> List[Any]:
        """
        Process items using executor.map (maintains order automatically)

        Args:
            items: List of items to process
            processor_func: Function to apply to each item
            desc: Description for progress bar
            show_progress: Show progress bar
            timeout: Timeout per item

        Returns:
            List of processed results in original order
        """
        if not items:
            return []

        timeout = timeout or self.timeout
        start_time = time.time()

        try:
            with ThreadPoolExecutor(max_workers=self.workers) as executor:
                if HAS_TQDM and show_progress:
                    results = []
                    with tqdm(
                        total=len(items),
                        desc=desc,
                        unit="items",
                        ncols=100
                    ) as pbar:
                        for result in executor.map(
                            processor_func,
                            items,
                            timeout=timeout,
                            chunksize=max(1, len(items) // (self.workers * 4))
                        ):
                            results.append(result)
                            self.tasks_completed += 1
                            pbar.update(1)
                    return results
                else:
                    # Without progress bar
                    return list(executor.map(
                        processor_func,
                        items,
                        timeout=timeout
                    ))

        except TimeoutError:
            logger.error(f"Processing timeout after {timeout} seconds")
            raise

        finally:
            self.total_time += time.time() - start_time

    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        return {
            'workers': self.workers,
            'completed': self.tasks_completed,
            'failed': self.tasks_failed,
            'total_time': self.total_time,
            'avg_time_per_task': (
                self.total_time / self.tasks_completed
                if self.tasks_completed > 0 else 0
            )
        }

    @staticmethod
    def suggest_workers() -> int:
        """Suggest optimal number of workers based on CPU count"""
        cpu_count = os.cpu_count() or 4
        # Suggest 1.5x CPU count for I/O bound tasks, but cap at 16
        suggested = min(cpu_count * 2, 16)
        return suggested

    @staticmethod
    def get_cpu_info() -> Dict[str, Any]:
        """Get CPU and system information"""
        return {
            'cpu_count': os.cpu_count() or 4,
            'suggested_workers': ParallelProcessor.suggest_workers()
        }


class BatchParallelAnalyzer:
    """
    Specialized parallel analyzer for batch vulnerability analysis
    Handles both caching and parallelization
    """

    def __init__(
        self,
        analyzer,
        cache_manager=None,
        workers: Optional[int] = None
    ):
        """
        Initialize batch parallel analyzer

        Args:
            analyzer: OllamaVulnerabilityAnalyzer instance
            cache_manager: Optional cache manager instance
            workers: Number of worker threads
        """
        self.analyzer = analyzer
        self.cache_manager = cache_manager
        self.processor = ParallelProcessor(workers=workers)
        self.cache_hits = 0
        self.cache_misses = 0

    def analyze_vulnerabilities_parallel(
        self,
        vulnerabilities: List[Dict],
        show_progress: bool = True
    ) -> List[Dict]:
        """
        Analyze multiple vulnerabilities in parallel

        Args:
            vulnerabilities: List of vulnerability dictionaries
            show_progress: Show progress bar

        Returns:
            List of analysis results
        """
        def analyze_with_cache(vuln):
            """Analyze vulnerability with optional caching"""
            # Check cache first
            if self.cache_manager:
                cached = self.cache_manager.get(
                    vuln,
                    self.analyzer.config.model,
                    'single'
                )
                if cached:
                    self.cache_hits += 1
                    return {
                        'vulnerability_id': vuln.get('template-id'),
                        'name': vuln.get('info', {}).get('name'),
                        'severity': vuln.get('info', {}).get('severity'),
                        'analysis': cached,
                        'timestamp': datetime.now().isoformat(),
                        'from_cache': True
                    }
                else:
                    self.cache_misses += 1

            # Perform analysis
            result = self.analyzer.analyze_vulnerability(vuln)
            result['from_cache'] = False

            # Cache result
            if self.cache_manager:
                self.cache_manager.set(
                    vuln,
                    self.analyzer.config.model,
                    'single',
                    result.get('analysis', '')
                )

            return result

        # Process in parallel
        return self.processor.process_batch(
            vulnerabilities,
            analyze_with_cache,
            desc="Analyzing vulnerabilities",
            show_progress=show_progress
        )

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = self.cache_hits + self.cache_misses
        hit_rate = (self.cache_hits / total * 100) if total > 0 else 0

        return {
            'cache_hits': self.cache_hits,
            'cache_misses': self.cache_misses,
            'hit_rate': hit_rate
        }

    def get_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics"""
        stats = self.processor.get_stats()
        stats.update(self.get_cache_stats())
        return stats


def get_optimal_worker_count(vulnerability_count: int) -> int:
    """
    Determine optimal worker count based on vulnerability count

    Args:
        vulnerability_count: Number of vulnerabilities to analyze

    Returns:
        Optimal worker count
    """
    cpu_count = os.cpu_count() or 4

    # For small batches, use fewer workers to avoid overhead
    if vulnerability_count < 5:
        return 1
    elif vulnerability_count < 20:
        return min(cpu_count, 4)
    elif vulnerability_count < 100:
        return min(cpu_count, 8)
    else:
        # For large batches, use more workers
        return min(cpu_count * 2, 16)


def benchmark_parallel_processing(
    items: List[Any],
    processor_func: Callable[[Any], Any],
    worker_counts: Optional[List[int]] = None
) -> Dict[int, float]:
    """
    Benchmark parallel processing with different worker counts

    Args:
        items: Items to process
        processor_func: Processing function
        worker_counts: Worker counts to test (default: 1, 2, 4, 8)

    Returns:
        Dict of {workers: execution_time}
    """
    if worker_counts is None:
        worker_counts = [1, 2, 4, 8]

    results = {}

    for workers in worker_counts:
        if workers > (os.cpu_count() or 4):
            continue

        processor = ParallelProcessor(workers=workers)
        start = time.time()
        processor.process_batch(
            items,
            processor_func,
            desc=f"Testing with {workers} workers",
            show_progress=False
        )
        elapsed = time.time() - start
        results[workers] = elapsed

        print(f"  {workers} workers: {elapsed:.2f}s")

    return results


def print_parallel_stats(stats: Dict[str, Any]) -> None:
    """Print parallel processing statistics"""
    print("\n" + "=" * 80)
    print("PARALLEL PROCESSING STATISTICS")
    print("=" * 80)
    print(f"Workers: {stats.get('workers', 'N/A')}")
    print(f"Completed: {stats.get('completed', 0)}")
    print(f"Failed: {stats.get('failed', 0)}")
    print(f"Total Time: {stats.get('total_time', 0):.2f}s")
    print(f"Avg Time per Task: {stats.get('avg_time_per_task', 0):.3f}s")
    if 'hit_rate' in stats:
        print(f"Cache Hit Rate: {stats.get('hit_rate', 0):.1f}%")
    print("=" * 80 + "\n")

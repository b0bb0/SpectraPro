#!/usr/bin/env python3
"""
Progress Bar Utilities for Vulnerability Analysis
Provides consistent progress tracking across all operations
"""

import sys
from typing import Optional, Iterable, Any

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False


class ProgressBar:
    """
    Wrapper for progress bar functionality
    Works with or without tqdm installed
    Provides consistent interface for all progress tracking
    """

    def __init__(self, total: int, desc: str = "", unit: str = "", disable: bool = False):
        """
        Initialize progress bar

        Args:
            total: Total number of items
            desc: Description/label for progress bar
            unit: Unit name (e.g., "vulns", "files")
            disable: Disable progress bar (useful for batch mode)
        """
        self.total = total
        self.desc = desc
        self.unit = unit
        self.disable = disable or not HAS_TQDM
        self.current = 0
        self.pbar = None

        if HAS_TQDM and not self.disable:
            self.pbar = tqdm(
                total=total,
                desc=desc,
                unit=unit,
                bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]',
                ncols=100
            )

    def update(self, amount: int = 1) -> None:
        """Update progress bar"""
        self.current += amount
        if self.pbar:
            self.pbar.update(amount)
        else:
            # Simple text-based progress without tqdm
            percent = (self.current / self.total) * 100
            print(f"  {self.desc}: {self.current}/{self.total} ({percent:.0f}%)", end='\r')

    def close(self) -> None:
        """Close progress bar"""
        if self.pbar:
            self.pbar.close()
            print()  # New line after progress bar

    def __enter__(self):
        """Context manager support"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager cleanup"""
        self.close()


class MultiProgress:
    """
    Manage multiple progress bars in sequence
    Useful for multi-stage analysis operations
    """

    def __init__(self, stages: dict, overall: bool = True):
        """
        Initialize multi-progress tracker

        Args:
            stages: Dict of {stage_name: total_items}
            overall: Show overall progress across all stages
        """
        self.stages = stages
        self.overall = overall
        self.current_stage = None
        self.current_pbar = None
        self.completed_stages = 0
        self.total_stages = len(stages)
        self.stage_order = list(stages.keys())

    def start_stage(self, stage_name: str) -> ProgressBar:
        """Start a new progress stage"""
        if self.current_pbar:
            self.current_pbar.close()

        self.current_stage = stage_name
        total = self.stages[stage_name]

        # Show overall progress
        if self.overall:
            overall_desc = f"[{self.completed_stages + 1}/{self.total_stages}] {stage_name}"
        else:
            overall_desc = stage_name

        self.current_pbar = ProgressBar(total, desc=overall_desc, unit="items")
        return self.current_pbar

    def finish_stage(self) -> None:
        """Finish current stage"""
        if self.current_pbar:
            self.current_pbar.close()
            self.completed_stages += 1

    def close(self) -> None:
        """Close all progress bars"""
        if self.current_pbar:
            self.current_pbar.close()


def create_progress_iterator(
    iterable: Iterable,
    desc: str = "",
    total: Optional[int] = None,
    unit: str = "items"
) -> Iterable:
    """
    Create a progress-tracked iterator
    Works with or without tqdm

    Args:
        iterable: The iterable to track
        desc: Description
        total: Total count (optional)
        unit: Unit name

    Returns:
        Iterable with progress tracking
    """
    if HAS_TQDM:
        return tqdm(iterable, desc=desc, total=total, unit=unit, ncols=100)
    else:
        # Without tqdm, just return the iterable
        if total:
            print(f"[*] {desc} (0/{total})", end='\r')
        return iterable


def print_progress_step(step: int, total: int, message: str) -> None:
    """
    Print a simple progress step message
    Useful for non-iterative operations

    Args:
        step: Current step number
        total: Total steps
        message: Message to display
    """
    percent = (step / total) * 100
    status = f"[{step}/{total}] {percent:3.0f}% - {message}"
    print(f"[*] {status}")


def print_section(title: str, width: int = 80) -> None:
    """
    Print a formatted section header for progress output

    Args:
        title: Section title
        width: Line width
    """
    print(f"\n{'=' * width}")
    print(f" {title}")
    print(f"{'=' * width}")


def print_progress_item(item: str, status: str = "Processing", level: int = 0) -> None:
    """
    Print a single progress item with indentation

    Args:
        item: Item description
        status: Status indicator
        level: Indentation level
    """
    indent = "  " * level
    print(f"{indent}[*] {status}: {item}")


def print_completed(message: str) -> None:
    """Print completion message"""
    print(f"\n✓ {message}")


def print_warning(message: str) -> None:
    """Print warning message"""
    print(f"\n⚠️  {message}")


def print_error(message: str) -> None:
    """Print error message"""
    print(f"\n✗ {message}")


class AnalysisProgress:
    """
    Complete progress tracking for vulnerability analysis
    Tracks all stages of analysis with detailed progress
    """

    def __init__(self, total_vulns: int, analysis_type: str = "standard"):
        """
        Initialize analysis progress tracker

        Args:
            total_vulns: Total vulnerabilities to analyze
            analysis_type: Type of analysis (standard, all-analysis, etc.)
        """
        self.total_vulns = total_vulns
        self.analysis_type = analysis_type
        self.start_time = None
        self.stages = {}

        # Define stages based on analysis type
        if analysis_type == "all-analysis":
            self.stages = {
                "Batch Analysis": total_vulns,
                "Risk Assessment": 1,
                "Attack Vectors": 1,
                "Severity Analysis": 1,
                "Remediation (Top 5)": min(5, total_vulns)
            }
        elif analysis_type == "risk-only":
            self.stages = {
                "Risk Assessment": 1
            }
        elif analysis_type == "remediation-only":
            self.stages = {
                "Remediation (Top 5)": min(5, total_vulns)
            }
        else:  # standard
            self.stages = {
                "Batch Analysis": total_vulns,
                "Risk Assessment": 1,
                "Attack Vectors": 1,
                "Severity Analysis": 1
            }

        self.multi_progress = MultiProgress(self.stages, overall=True)

    def start_stage(self, stage_name: str) -> ProgressBar:
        """Start a new analysis stage"""
        print(f"\n[*] Starting {stage_name}...")
        return self.multi_progress.start_stage(stage_name)

    def finish_stage(self) -> None:
        """Finish current stage"""
        self.multi_progress.finish_stage()

    def finish_analysis(self) -> None:
        """Mark analysis as complete"""
        self.multi_progress.close()
        print_completed("Analysis complete!")


def format_time(seconds: float) -> str:
    """
    Format time duration

    Args:
        seconds: Time in seconds

    Returns:
        Formatted time string
    """
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f}m"
    else:
        hours = seconds / 3600
        return f"{hours:.1f}h"


def print_timing_summary(start_time, end_time, item_count: int) -> None:
    """
    Print analysis timing summary

    Args:
        start_time: Start datetime
        end_time: End datetime
        item_count: Number of items analyzed
    """
    duration = (end_time - start_time).total_seconds()
    per_item = duration / item_count if item_count > 0 else 0

    print(f"\n{'=' * 80}")
    print(f"TIMING SUMMARY")
    print(f"{'=' * 80}")
    print(f"Total Time: {format_time(duration)}")
    print(f"Items Analyzed: {item_count}")
    print(f"Time per Item: {format_time(per_item)}")
    print(f"{'=' * 80}\n")

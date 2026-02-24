"""Scanner module for nuclei and secret scanning integration"""
from .nuclei_scanner import NucleiScanner

__all__ = ['NucleiScanner']


def get_js_secret_scanner():
    """Lazy import of JSSecretScanner to avoid hard dependency on bs4/trufflehog"""
    from .js_secret_scanner import JSSecretScanner
    return JSSecretScanner

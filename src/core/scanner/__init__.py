"""Scanner module for nuclei and secret scanning integration"""
from .nuclei_scanner import NucleiScanner
from .js_secret_scanner import JSSecretScanner

__all__ = ['NucleiScanner', 'JSSecretScanner']

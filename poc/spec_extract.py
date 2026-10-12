"""PoC 相容層：擷取規則已移至 pipeline/extract.py。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.extract import *  # noqa: E402,F401,F403

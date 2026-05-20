"""Runtime config — reads env, falls back to sane defaults."""
from __future__ import annotations
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = Path(os.getenv("NEXCOLLAB_DB", DATA_DIR / "nexcollab.sqlite3"))

# Hermes gateway (OpenAI-compatible)
LLM_BASE_URL = os.getenv("NEXCOLLAB_LLM_BASE", "http://127.0.0.1:1430/v1")
LLM_API_KEY = os.getenv(
    "NEXCOLLAB_LLM_KEY",
    "enx-99758b6c349c05e5baeda243107a091e2fa03cb75be0d7374f852fc7c41e4b7e",
)
LLM_MODEL = os.getenv("NEXCOLLAB_LLM_MODEL", "kiro/claude-sonnet-4.6")

# Session signing
SESSION_SECRET = os.getenv(
    "NEXCOLLAB_SECRET",
    "dev-secret-change-me-please-this-is-not-production-grade-key",
)

HOST = os.getenv("NEXCOLLAB_HOST", "127.0.0.1")
PORT = int(os.getenv("NEXCOLLAB_PORT", "8091"))

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.getenv("DATABASE_PATH", str(BASE_DIR / "opspilot.db"))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

API_V1_STR = "/api/v1"
PROJECT_NAME = "OpsPilot API"
VERSION = "1.0.0-rc1"

# CORS Allowlist configuration
DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,https://kveigas.github.io"
CORS_ORIGINS_RAW = os.getenv("CORS_ORIGINS")
if not CORS_ORIGINS_RAW or not CORS_ORIGINS_RAW.strip():
    CORS_ORIGINS_RAW = DEFAULT_CORS_ORIGINS
CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS_RAW.split(",") if origin.strip()]

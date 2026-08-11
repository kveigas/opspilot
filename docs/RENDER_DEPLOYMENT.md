# OpsPilot Render Deployment Guide

**Target Web Service**: `opspilot-api`  
**Environment**: Render Free Web Service (Python 3.12 / 3.13)

---

## 🛠️ Render Web Service Configuration

| Setting | Value |
| :--- | :--- |
| **Service Type** | Web Service |
| **Name** | `opspilot-api` |
| **Environment** | `Python 3` |
| **Region** | Oregon (US West) or Frankfurt (EU Central) |
| **Branch** | `main` |
| **Build Command** | `pip install -r <(python -c "import tomllib; [print(d) for d in tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']]")` |
| **Start Command** | `uvicorn app.main:create_app --factory --host 0.0.0.0 --port $PORT` |
| **Health Check Path** | `/api/v1/health` |

---

## 🔑 Environment Variables

| Variable | Recommended Value | Purpose |
| :--- | :--- | :--- |
| `PYTHON_VERSION` | `3.12.4` | Specifies Python version |
| `CORS_ORIGINS` | `https://kveigas.github.io,http://localhost:5173` | Allowed CORS origins |
| `DATABASE_PATH` | `/tmp/opspilot.db` | Ephemeral SQLite database path |

---

## ⚠️ Ephemeral Storage & Cold Start Behavior Note

Render free-tier web services spin down after 15 minutes of inactivity:
- **Cold Start Delay**: Initial API response may take 20–40 seconds while container boots up.
- **Ephemeral Storage**: Free-tier filesystems reset upon redeployment or cold restarts.
- **Resilience Design**: OpsPilot handles ephemeral state by providing the idempotent `POST /api/v1/demo/bootstrap` endpoint. Any user can re-seed the public demo scenario instantaneously.
